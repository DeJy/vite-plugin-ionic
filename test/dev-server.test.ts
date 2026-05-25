import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import ionicPlugin from '../src/index.js';
import type { Plugin, ResolvedConfig } from 'vite';

// ── Fixture setup ─────────────────────────────────────────────────────────────

function makeIonicFixture(): { root: string; cleanup: () => void } {
  const root      = mkdtempSync(path.join(tmpdir(), 'ionic-plugin-dev-'));
  const ionicDist = path.join(root, 'node_modules', '@ionic', 'core', 'dist', 'ionic');
  mkdirSync(ionicDist, { recursive: true });

  writeFileSync(path.join(ionicDist, 'ionic.esm.js'), '// ionic esm');
  writeFileSync(path.join(ionicDist, 'ionic.css'),    '/* ionic css */');
  mkdirSync(path.join(ionicDist, 'svg'), { recursive: true });
  writeFileSync(path.join(ionicDist, 'svg', 'add.svg'), '<svg/>');

  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePlugin(plugin: Plugin, root: string, outDir = 'dist') {
  (plugin.configResolved as Function)({
    root,
    build: { outDir },
  } satisfies Partial<ResolvedConfig> as ResolvedConfig);
}

type RequestResult = { headers: Record<string, string>; body: string; next: boolean };

/**
 * Simulates a single HTTP request through a Connect-style middleware stack.
 *
 * The plugin's middleware either:
 *   A) serves a file by calling `createReadStream(file).pipe(res)` and returning, OR
 *   B) forwards the request by calling `next()`.
 *
 * We use a PassThrough stream as `res` so `.pipe()` works natively.
 * The promise resolves when the stream ends (case A) or `next()` is called (case B).
 */
function makeRequest(
  handlers: Function[],
  url: string,
): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const through = new PassThrough();
    let body = '';

    through.on('data',  (c) => { body += c.toString(); });
    through.on('end',   () => resolve({ headers, body, next: false }));
    through.on('error', reject);

    // Augment the PassThrough with the http.ServerResponse-like API.
    const res = Object.assign(through, {
      setHeader: (k: string, v: string) => { headers[k] = v; },
    });

    // Only one handler in our case, but keep it generic.
    const runHandler = (index: number) => {
      if (index >= handlers.length) {
        // All handlers called next() → no middleware handled the request.
        through.destroy();
        resolve({ headers, body, next: true });
        return;
      }
      handlers[index]({ url }, res, () => runHandler(index + 1));
    };

    runHandler(0);
  });
}

function makeServer() {
  const handlers: Function[] = [];
  return {
    middlewares: { use: (fn: Function) => handlers.push(fn) },
    request: (url: string) => makeRequest(handlers, url),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('configureServer() hook — dev middleware', () => {
  let fixture: ReturnType<typeof makeIonicFixture>;

  beforeEach(() => { fixture = makeIonicFixture(); });
  afterEach(() => fixture.cleanup());

  it('serves ionic.esm.js with correct Content-Type', async () => {
    const plugin = ionicPlugin();
    resolvePlugin(plugin, fixture.root);

    const server = makeServer();
    (plugin.configureServer as Function)(server);

    const res = await server.request('/ionic.esm.js');
    expect(res.next).toBe(false);
    expect(res.headers['Content-Type']).toBe('application/javascript');
    expect(res.body).toContain('// ionic esm');
  });

  it('serves ionic.css with correct Content-Type', async () => {
    const plugin = ionicPlugin();
    resolvePlugin(plugin, fixture.root);

    const server = makeServer();
    (plugin.configureServer as Function)(server);

    const res = await server.request('/ionic.css');
    expect(res.next).toBe(false);
    expect(res.headers['Content-Type']).toBe('text/css');
    expect(res.body).toContain('/* ionic css */');
  });

  it('serves nested SVG files', async () => {
    const plugin = ionicPlugin();
    resolvePlugin(plugin, fixture.root);

    const server = makeServer();
    (plugin.configureServer as Function)(server);

    const res = await server.request('/svg/add.svg');
    expect(res.next).toBe(false);
    expect(res.headers['Content-Type']).toBe('image/svg+xml');
    expect(res.body).toContain('<svg/>');
  });

  it('strips query string from URL before resolving', async () => {
    const plugin = ionicPlugin();
    resolvePlugin(plugin, fixture.root);

    const server = makeServer();
    (plugin.configureServer as Function)(server);

    const res = await server.request('/ionic.esm.js?v=123');
    expect(res.next).toBe(false);
    expect(res.body).toContain('// ionic esm');
  });

  it('calls next() for unknown files', async () => {
    const plugin = ionicPlugin();
    resolvePlugin(plugin, fixture.root);

    const server = makeServer();
    (plugin.configureServer as Function)(server);

    const res = await server.request('/does-not-exist.js');
    expect(res.next).toBe(true);
  });

  it('calls next() for directory paths', async () => {
    const plugin = ionicPlugin();
    resolvePlugin(plugin, fixture.root);

    const server = makeServer();
    (plugin.configureServer as Function)(server);

    const res = await server.request('/svg');
    expect(res.next).toBe(true);
  });
});
