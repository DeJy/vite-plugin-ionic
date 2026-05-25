import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ionicPlugin from '../src/index.js';
import type { Plugin, ResolvedConfig } from 'vite';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeFixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'ionic-build-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function resolvePlugin(plugin: Plugin, root: string, outDir = 'dist') {
  (plugin.configResolved as Function)({
    root,
    build: { outDir },
  } satisfies Partial<ResolvedConfig> as ResolvedConfig);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('writeBundle() hook — build copy', () => {
  let cleanup: () => void;

  afterEach(() => cleanup?.());

  it('copies all Ionic files to outDir', async () => {
    const { root, cleanup: c } = makeFixture({
      'node_modules/@ionic/core/dist/ionic/ionic.esm.js': '// esm',
      'node_modules/@ionic/core/dist/ionic/ionic.css':    '/* css */',
      'node_modules/@ionic/core/dist/ionic/svg/add.svg':  '<svg/>',
    });
    cleanup = c;

    const plugin = ionicPlugin();
    resolvePlugin(plugin, root, 'firebase/dist');

    await (plugin.writeBundle as Function).call({ warn: vi.fn() });

    expect(existsSync(path.join(root, 'firebase/dist/ionic.esm.js'))).toBe(true);
    expect(existsSync(path.join(root, 'firebase/dist/ionic.css'))).toBe(true);
    expect(existsSync(path.join(root, 'firebase/dist/svg/add.svg'))).toBe(true);
  });

  it('preserves file contents during copy', async () => {
    const { root, cleanup: c } = makeFixture({
      'node_modules/@ionic/core/dist/ionic/ionic.esm.js': '// ionic runtime v7',
    });
    cleanup = c;

    const plugin = ionicPlugin();
    resolvePlugin(plugin, root, 'dist');

    await (plugin.writeBundle as Function).call({ warn: vi.fn() });

    const content = readFileSync(path.join(root, 'dist/ionic.esm.js'), 'utf-8');
    expect(content).toBe('// ionic runtime v7');
  });

  it('copies nested directory structure recursively', async () => {
    const { root, cleanup: c } = makeFixture({
      'node_modules/@ionic/core/dist/ionic/a/b/deep.js': '// deep',
    });
    cleanup = c;

    const plugin = ionicPlugin();
    resolvePlugin(plugin, root, 'dist');

    await (plugin.writeBundle as Function).call({ warn: vi.fn() });

    expect(existsSync(path.join(root, 'dist/a/b/deep.js'))).toBe(true);
  });

  it('emits a warning when @ionic/core is not installed', async () => {
    const { root, cleanup: c } = makeFixture({}); // no node_modules
    cleanup = c;

    const plugin = ionicPlugin();
    resolvePlugin(plugin, root, 'dist');

    const warn = vi.fn();
    await (plugin.writeBundle as Function).call({ warn });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('@ionic/core');
  });

  it('respects a custom ionicPackage path', async () => {
    const { root, cleanup: c } = makeFixture({
      'node_modules/@my-fork/ionic-core/dist/ionic/ionic.esm.js': '// fork',
    });
    cleanup = c;

    const plugin = ionicPlugin({ ionicPackage: '@my-fork/ionic-core' });
    resolvePlugin(plugin, root, 'dist');

    await (plugin.writeBundle as Function).call({ warn: vi.fn() });

    expect(existsSync(path.join(root, 'dist/ionic.esm.js'))).toBe(true);
  });
});
