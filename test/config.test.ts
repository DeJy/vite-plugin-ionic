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

  it('returns a valid plugin name', () => {
    const plugin = ionicPlugin();
    expect(plugin.name).toBe('vite-plugin-ionic');
  });
});
