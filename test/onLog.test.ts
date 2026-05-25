import { describe, it, expect, vi } from 'vitest';
import ionicPlugin from '../src/index.js';
import type { Plugin } from 'vite';

// Helper: call the onLog() hook directly
function callOnLog(
  plugin: Plugin,
  level: string,
  message: string,
  handler = vi.fn(),
) {
  if (typeof plugin.onLog !== 'function') throw new Error('onLog not defined');
  (plugin.onLog as Function)(level, { message }, handler);
  return handler;
}

describe('onLog() hook — LightningCSS :host-context suppression', () => {
  it('suppresses :host-context warnings by default', () => {
    const plugin   = ionicPlugin();
    const handler  = vi.fn();
    callOnLog(plugin, 'warn', 'lightningcss: :host-context() not supported', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not suppress non-host-context warnings', () => {
    const plugin  = ionicPlugin();
    const handler = vi.fn();
    callOnLog(plugin, 'warn', 'Some other warning', handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('warn', { message: 'Some other warning' });
  });

  it('does not suppress info-level messages containing :host-context', () => {
    const plugin  = ionicPlugin();
    const handler = vi.fn();
    callOnLog(plugin, 'info', 'info about :host-context', handler);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('passes through everything when suppressHostContextWarning is false', () => {
    const plugin  = ionicPlugin({ suppressHostContextWarning: false });
    const handler = vi.fn();
    callOnLog(plugin, 'warn', ':host-context warning', handler);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('passes through messages with no message property', () => {
    const plugin  = ionicPlugin();
    const handler = vi.fn();
    if (typeof plugin.onLog !== 'function') throw new Error('onLog not defined');
    (plugin.onLog as Function)('warn', {}, handler);
    expect(handler).toHaveBeenCalledOnce();
  });
});
