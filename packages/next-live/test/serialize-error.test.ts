import { describe, expect, it } from 'vitest';
import {
  LiveCompileError,
  LiveRuntimeError,
  LiveSandboxError,
  ModuleNotFoundError,
  NoComponentError,
  RenderLoopError,
} from '../src/core/errors';
import { rehydrateError, serializeError } from '../src/core/serialize-error';

const roundTrip = (error: unknown) => rehydrateError(structuredClone(serializeError(error)));

describe('serializeError / rehydrateError', () => {
  it('round-trips a compile error with its position and file', () => {
    const error = roundTrip(new LiveCompileError('Unexpected token', { line: 3, column: 7, file: 'Button.tsx' }));
    expect(error).toBeInstanceOf(LiveCompileError);
    expect(error).toMatchObject({ code: 'COMPILE', line: 3, column: 7, file: 'Button.tsx' });
    expect(error.message).toBe('Unexpected token');
  });

  it('round-trips a missing module with its specifier and importer', () => {
    const original = new ModuleNotFoundError('./Buton', ['react', './Button'], 'App.tsx');
    const error = roundTrip(original);
    expect(error).toBeInstanceOf(ModuleNotFoundError);
    expect(error).toMatchObject({ specifier: './Buton', available: ['react', './Button'], importer: 'App.tsx' });
    expect(error.message).toBe(original.message);
  });

  it('keeps the class of render-loop and no-component errors', () => {
    const loop = roundTrip(new RenderLoopError('too many renders'));
    expect(loop).toBeInstanceOf(RenderLoopError);
    expect(loop).toBeInstanceOf(LiveRuntimeError);
    expect(loop.code).toBe('RENDER_LOOP');
    expect(roundTrip(new NoComponentError('nothing'))).toBeInstanceOf(NoComponentError);
  });

  it('turns a foreign error into a runtime error with its position', () => {
    const foreign = Object.assign(new TypeError('x is undefined'), { line: 4, column: 2, file: 'App.tsx' });
    const error = roundTrip(foreign);
    expect(error).toBeInstanceOf(LiveRuntimeError);
    expect(error).toMatchObject({ code: 'RUNTIME', message: 'x is undefined', line: 4, column: 2, file: 'App.tsx' });
  });

  it('handles thrown non-errors', () => {
    expect(roundTrip('just a string')).toMatchObject({ code: 'RUNTIME', message: 'just a string' });
  });

  it('keeps a sandbox reason, and falls back for an unknown one', () => {
    expect(roundTrip(new LiveSandboxError('unresponsive', 'stuck'))).toMatchObject({ reason: 'unresponsive' });
    expect(rehydrateError({ code: 'SANDBOX', message: 'x', reason: 'nonsense' })).toMatchObject({
      reason: 'load-failed',
    });
  });

  it('treats its input as untrusted', () => {
    expect(rehydrateError(null)).toBeInstanceOf(LiveRuntimeError);
    const hostile = rehydrateError({
      code: 'EVIL',
      name: 'TotallyTrusted',
      message: 'x'.repeat(20_000),
      line: -5,
      column: 1.5,
      file: 42,
      stack: { toString: () => 'boom' },
    });
    expect(hostile).toBeInstanceOf(LiveRuntimeError);
    expect(hostile.name).toBe('LiveRuntimeError');
    expect(hostile.message.length).toBeLessThan(8_300);
    expect('line' in hostile || 'file' in hostile).toBe(false);
    expect(hostile.stack).toBe('');
  });

  it('never throws while serializing', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(serializeError(proxy)).toMatchObject({ code: 'RUNTIME' });
  });
});
