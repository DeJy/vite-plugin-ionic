import fs from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer, LogLevel } from 'vite';
import type { RollupLog } from 'rollup';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IonicPluginOptions {
  /**
   * Package name for @ionic/core.
   * Override if you use a fork or a monorepo path.
   * @default '@ionic/core'
   */
  ionicPackage?: string;

  /**
   * Suppress the LightningCSS warning about `:host-context()`.
   * Ionic uses it for RTL support inside Shadow DOM — it is valid but
   * LightningCSS doesn't recognise it and emits a noisy warning.
   * Requires Vite 5.1+ (uses the `onLog` plugin hook).
   * @default true
   */
  suppressHostContextWarning?: boolean;
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
async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  await Promise.all(
    entries.map((entry) => {
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
 * - Suppresses the noisy LightningCSS `:host-context()` warning (Vite 5.1+).
 *
 * @example
 * // vite.config.js
 * import ionic from 'vite-plugin-ionic';
 * export default { plugins: [ionic()] };
 */
function ionicPlugin(options: IonicPluginOptions = {}): Plugin {
  const {
    ionicPackage              = '@ionic/core',
    suppressHostContextWarning = true,
  } = options;

  let ionicDist = '';
  let outDir    = '';

  const plugin: Plugin = {
    name: PLUGIN_NAME,

    // ── 1. Merge config ──────────────────────────────────────────────────────
    config() {
      return {
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
    },

    // ── 2. Capture resolved paths ────────────────────────────────────────────
    configResolved(config: ResolvedConfig) {
      ionicDist = resolveIonicDist(config.root, ionicPackage);
      outDir    = path.resolve(config.root, config.build.outDir);
    },

    // ── 3. Suppress LightningCSS :host-context() warning (Vite 5.1+) ────────
    // Rolldown (Vite 6+): onLog(level, log) → return false to suppress.
    // Rollup  (Vite 5.x): onLog(level, log, defaultHandler) → call defaultHandler
    //                      to pass through, or omit to suppress.
    // We handle both at runtime by checking for the 3rd argument.
    // The cast is needed because the installed Rolldown types omit defaultHandler.
    onLog: ((level: LogLevel, log: RollupLog, ...rest: unknown[]) => {
      if (
        suppressHostContextWarning
        && level === 'warn'
        && log.message?.includes(':host-context')
      ) {
        return false; // suppress — works on both Rollup and Rolldown
      }
      // Pass through: call defaultHandler if provided (Rollup/Vite 5),
      // or return undefined so Rolldown applies its default handling.
      const defaultHandler = rest[0] as ((l: string, lo: unknown) => void) | undefined;
      defaultHandler?.(level, log);
      return undefined;
    }) as Plugin['onLog'],

    // ── 4. Dev: serve Ionic files directly from node_modules ─────────────────
    configureServer(server: ViteDevServer) {
      if (!fs.existsSync(ionicDist)) {
        console.warn(
          `[${PLUGIN_NAME}] ${ionicPackage} not found at ${ionicDist}. ` +
          'Make sure it is installed.',
        );
        return;
      }

      server.middlewares.use((req, res, next) => {
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

      await copyDir(ionicDist, outDir);
    },
  };

  return plugin;
}

export { ionicPlugin };
export default ionicPlugin;
