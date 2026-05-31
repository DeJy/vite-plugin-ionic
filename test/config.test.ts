import { describe, it, expect } from 'vitest';
import ionicPlugin from '../src/index.js';
import type { Plugin } from 'vite';

// Helper: call the config() hook and return the result
function getConfig(plugin: Plugin) {
  return typeof plugin.config === 'function'
    ? plugin.config({} as never, { mode: 'development', command: 'serve' } as never)
    : undefined;
}

describe('config() hook', () => {
  it('returns optimizeDeps.exclude with @ionic/core', () => {
    const plugin = ionicPlugin();
    const cfg = getConfig(plugin) as ReturnType<typeof getConfig> & {
      optimizeDeps: { exclude: string[] };
    };
    expect(cfg?.optimizeDeps?.exclude).toContain('@ionic/core');
  });

  it('respects a custom ionicPackage name', () => {
    const plugin = ionicPlugin({ ionicPackage: '@my-fork/ionic-core' });
    const cfg = getConfig(plugin) as ReturnType<typeof getConfig> & {
      optimizeDeps: { exclude: string[] };
    };
    expect(cfg?.optimizeDeps?.exclude).toContain('@my-fork/ionic-core');
    expect(cfg?.optimizeDeps?.exclude).not.toContain('@ionic/core');
  });

  it('marks /ionic.esm.js as external in rollupOptions', () => {
    const plugin = ionicPlugin();
    const cfg = getConfig(plugin) as ReturnType<typeof getConfig> & {
      build: { rollupOptions: { external: string[] } };
    };
    expect(cfg?.build?.rollupOptions?.external).toContain('/ionic.esm.js');
  });

  it('marks /{subdir}/ionic.esm.js as external when subdir is set', () => {
    const plugin = ionicPlugin({ subdir: 'vendor' });
    const cfg = getConfig(plugin) as ReturnType<typeof getConfig> & {
      build: { rollupOptions: { external: string[] } };
    };
    expect(cfg?.build?.rollupOptions?.external).toContain('/vendor/ionic.esm.js');
    expect(cfg?.build?.rollupOptions?.external).not.toContain('/ionic.esm.js');
  });

  it('returns a valid plugin name', () => {
    const plugin = ionicPlugin();
    expect(plugin.name).toBe('vite-plugin-ionic');
  });
});

describe('resolveId() hook', () => {
  it('marks /ionic.esm.js as external', () => {
    const plugin = ionicPlugin();
    const result = (plugin.resolveId as Function)('/ionic.esm.js');
    expect(result).toEqual({ id: '/ionic.esm.js', external: true });
  });

  it('returns undefined for other ids', () => {
    const plugin = ionicPlugin();
    const result = (plugin.resolveId as Function)('/some-other-file.js');
    expect(result).toBeUndefined();
  });

  it('marks /{subdir}/ionic.esm.js as external when subdir is set', () => {
    const plugin = ionicPlugin({ subdir: 'vendor' });
    const result = (plugin.resolveId as Function)('/vendor/ionic.esm.js');
    expect(result).toEqual({ id: '/vendor/ionic.esm.js', external: true });
  });

  it('returns undefined for /ionic.esm.js when subdir is set', () => {
    const plugin = ionicPlugin({ subdir: 'vendor' });
    const result = (plugin.resolveId as Function)('/ionic.esm.js');
    expect(result).toBeUndefined();
  });
});
