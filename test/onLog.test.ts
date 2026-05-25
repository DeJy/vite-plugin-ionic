import { describe, it, expect, vi } from 'vitest';
import ionicPlugin from '../src/index.js';
import type { Plugin } from 'vite';

// Helper: call the config() hook and return the customLogger
function getLogger(plugin: Plugin, existingLogger?: object) {
  const userConfig = existingLogger ? { customLogger: existingLogger } : {};
  const cfg = typeof plugin.config === 'function'
    ? (plugin.config as Function)(userConfig, { mode: 'development', command: 'serve' })
    : undefined;
  return cfg?.customLogger as { warn: (msg: string) => void } | undefined;
}

describe('customLogger — LightningCSS :host-context suppression', () => {
  it('suppresses :host-context warnings by default', () => {
    const plugin = ionicPlugin();
    const logger = getLogger(plugin)!;
    // Should not throw — the call is simply swallowed.
    expect(() => logger.warn('[lightningcss] :host-context() not supported')).not.toThrow();
  });

  it('does not call the upstream warn for :host-context messages', () => {
    const plugin   = ionicPlugin();
    const upstream = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
    const logger   = getLogger(plugin, upstream)!;

    logger.warn(':host-context warning');
    expect(upstream.warn).not.toHaveBeenCalled();
  });

  it('passes non-host-context warnings through to the upstream logger', () => {
    const plugin   = ionicPlugin();
    const upstream = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
    const logger   = getLogger(plugin, upstream)!;

    logger.warn('Some other warning');
    expect(upstream.warn).toHaveBeenCalledOnce();
    expect(upstream.warn).toHaveBeenCalledWith('Some other warning', undefined);
  });

  it('does not inject customLogger when suppressHostContextWarning is false', () => {
    const plugin = ionicPlugin({ suppressHostContextWarning: false });
    const cfg = typeof plugin.config === 'function'
      ? (plugin.config as Function)({}, { mode: 'development', command: 'serve' })
      : undefined;
    expect(cfg?.customLogger).toBeUndefined();
  });

  it('wraps an existing customLogger without replacing it entirely', () => {
    const plugin   = ionicPlugin();
    const upstream = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), warnOnce: vi.fn() };
    const logger   = getLogger(plugin, upstream)!;

    // Non-host-context warning passes through
    logger.warn('unrelated warning');
    expect(upstream.warn).toHaveBeenCalledTimes(1);

    // :host-context warning is suppressed
    logger.warn(':host-context selector');
    expect(upstream.warn).toHaveBeenCalledTimes(1); // still 1, not 2
  });
});
