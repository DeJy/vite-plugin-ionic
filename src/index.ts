import fs from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { createLogger } from 'vite';
import type { Connect, Plugin, ResolvedConfig, ViteDevServer, UserConfig } from 'vite';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IonicPluginOptions {
  /**
   * Package name for @ionic/core.
   * Override if you use a fork or a monorepo path.
   * @default '@ionic/core'
   */
  ionicPackage?: string;

  /**
   * Copy the `svg/` icon directory to the build output.
   * Set to `false` when using a plugin like `vite-plugin-ionic-icons` that
   * handles icons separately — avoids duplicating all 1 300+ SVG files.
   * @default true
   */
  copyIcons?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.cjs':  'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.html': 'text/html',
};

/** Recursively copy a directory tree using Promise.all for parallelism. */
async function copyDir(src: string, dest: string, exclude: string[] = []): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  await Promise.all(
    entries
      .filter((entry) => !exclude.includes(entry.name))
      .map((entry) => {
        const srcPath  = path.join(src,  entry.name);
        const destPath = path.join(dest, entry.name);
        return entry.isDirectory()
          ? copyDir(srcPath, destPath)
          : copyFile(srcPath, destPath);
      }),
  );
}

/** Resolve `@ionic/core` dist directory from the project root. */
function resolveIonicDist(root: string, ionicPackage: string): string {
  return path.resolve(root, 'node_modules', ionicPackage, 'dist', 'ionic');
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const PLUGIN_NAME = 'vite-plugin-ionic';

/**
 * Vite plugin that integrates `@ionic/core` (Ionic web components) into any
 * Vite project, regardless of the framework or Vite version (4 → 7).
 *
 * What it does:
 * - Excludes `@ionic/core` from Vite's dependency pre-bundling.
 * - Marks `/ionic.esm.js` as external so the bundler doesn't try to inline it.
 * - Serves Ionic's runtime files from node_modules during **dev** (no copy needed).
 * - Copies all files from `@ionic/core/dist/ionic/` to the build output during **build**.
 *   Pass `copyIcons: false` when using `vite-plugin-ionic-icons` (or similar) to skip
 *   the 1 300+ SVG files in `svg/` that the icons plugin already handles.
 * - Suppresses the noisy LightningCSS `:host-context()` warning (Vite 5.1+).
 *
 * @example
 * // vite.config.js
 * import ionic from 'vite-plugin-ionic';
 * export default { plugins: [ionic()] };
 */
function ionicPlugin(options: IonicPluginOptions = {}): Plugin {
  const {
    ionicPackage = '@ionic/core',
    copyIcons    = true,
  } = options;

  let ionicDist = '';
  let outDir    = '';

  const plugin: Plugin = {
    name: PLUGIN_NAME,

    // ── 1. Merge config ──────────────────────────────────────────────────────
    // LightningCSS warnings come from Vite's internal CSS processing, which
    // calls config.logger.warn() directly — NOT via the Rollup/Rolldown onLog
    // hook. The only reliable way to suppress them is via customLogger.
    // We wrap whatever logger the user already has (or create a default one).
    config(userConfig: UserConfig) {
      const base = {
        optimizeDeps: {
          exclude: [ionicPackage],
        },
        build: {
          // rollupOptions works in Vite 4/5 (Rollup) and Vite 6/7 (Rolldown
          // honours the same external option for compatibility).
          rollupOptions: {
            external: ['/ionic.esm.js'],
          },
        },
      };

      const upstream = userConfig.customLogger ?? createLogger();
      const _warn    = upstream.warn.bind(upstream);

      return {
        ...base,
        customLogger: Object.assign(Object.create(upstream) as typeof upstream, {
          warn(msg: string, options?: Parameters<typeof upstream.warn>[1]) {
            if (msg.includes(':host-context')) return;
            _warn(msg, options);
          },
        }),
      };
    },

    // ── 2. Capture resolved paths ────────────────────────────────────────────
    configResolved(config: ResolvedConfig) {
      ionicDist = resolveIonicDist(config.root, ionicPackage);
      outDir    = path.resolve(config.root, config.build.outDir);
    },

    // ── 3. Dev: tell Vite's import-analysis to leave /ionic.esm.js alone ───────
    // build.rollupOptions.external only applies to Rollup/Rolldown during build.
    // Vite 6+ import-analysis runs in dev and rejects dynamic imports it can't
    // resolve in the module graph. Returning external:true here bypasses that.
    resolveId(id: string) {
      if (id === '/ionic.esm.js') return { id, external: true };
    },

    // ── 4. Dev: serve Ionic files directly from node_modules ─────────────────
    configureServer(server: ViteDevServer) {
      if (!fs.existsSync(ionicDist)) {
        console.warn(
          `[${PLUGIN_NAME}] ${ionicPackage} not found at ${ionicDist}. ` +
          'Make sure it is installed.',
        );
        return;
      }

      server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        const url  = req.url?.split('?')[0] ?? '';
        const file = path.join(ionicDist, url);

        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          return next();
        }

        const ext = path.extname(file);
        const mime = MIME[ext];
        if (mime) res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'no-cache');

        createReadStream(file).pipe(res);
      });
    },

    // ── 5. Build: copy all Ionic files to the output directory ───────────────
    async writeBundle() {
      if (!fs.existsSync(ionicDist)) {
        this.warn(
          `[${PLUGIN_NAME}] ${ionicPackage} not found at ${ionicDist}. ` +
          'Ionic files will not be copied to the output directory.',
        );
        return;
      }

      await copyDir(ionicDist, outDir, copyIcons ? [] : ['svg']);
    },
  };

  return plugin;
}

export { ionicPlugin };
export default ionicPlugin;
