import { describe, expect, it } from 'vitest';
import {
  LiveCompileError,
  LiveError,
  LiveSandboxError,
  ModuleNotFoundError,
} from '../src/core/errors';
import { errorPosition } from '../src/core/positions';
import { firstUserFrame } from '../src/core/stacks';

/**
 * `file` and `importer` are additive in 1.1. Hosts compare 1.0 errors with
 * `toEqual` and `Object.keys`, so single-snippet errors must not grow a key.
 */
describe('file-aware errors keep the 1.0 shape', () => {
  it('adds no file key to a compile error without one', () => {
    const error = new LiveCompileError('bad', { line: 1, column: 2 });
    expect(Object.keys(error)).not.toContain('file');
    expect('file' in error).toBe(false);
  });

  it('carries file when given', () => {
    const error = new LiveCompileError('bad', { line: 3, file: 'Button.tsx' });
    expect(error.file).toBe('Button.tsx');
    expect(errorPosition(error)).toEqual({ line: 3, file: 'Button.tsx' });
  });

  it('adds no importer key, and keeps the message, without an importer', () => {
    const error = new ModuleNotFoundError('./Button', ['react']);
    expect('importer' in error).toBe(false);
    expect(error.message.split('\n')[0]).toBe(
      "Module './Button' is not registered in the next-live scope.",
    );
  });

  it('names the importing file when given', () => {
    const error = new ModuleNotFoundError('./Buton', ['react'], 'App.tsx');
    expect(error.importer).toBe('App.tsx');
    expect(error.message).toContain("(imported from 'App.tsx')");
  });

  it('returns a position without file for a plain error', () => {
    const error = Object.assign(new Error('x'), { line: 2, column: 4 });
    expect(errorPosition(error)).toEqual({ line: 2, column: 4 });
  });
});

describe('LiveSandboxError', () => {
  it('is a LiveError with a stable code and reason', () => {
    const error = new LiveSandboxError('handshake-timeout', 'no answer');
    expect(error).toBeInstanceOf(LiveError);
    expect(error.code).toBe('SANDBOX');
    expect(error.reason).toBe('handshake-timeout');
    expect(error.name).toBe('LiveSandboxError');
  });
});

describe('firstUserFrame', () => {
  it('reads file, line and column from a V8 frame', () => {
    const stack = [
      'TypeError: boom',
      '    at helper (http://localhost/app.js:10:3)',
      '    at Button (next-live:///components/Button.tsx:7:11)',
      '    at App (next-live:///App.tsx:3:5)',
    ].join('\n');
    expect(firstUserFrame(stack)).toEqual({ file: 'components/Button.tsx', line: 7, column: 11 });
  });

  it('reads a SpiderMonkey / JavaScriptCore frame', () => {
    expect(firstUserFrame('Button@next-live:///Button.tsx:4:9')).toEqual({
      file: 'Button.tsx',
      line: 4,
      column: 9,
    });
  });

  it('falls back to a line without a file for an unusual frame', () => {
    const frame = '    at eval (eval at run (next-live:///App.tsx), <anonymous>:3:4)';
    expect(firstUserFrame(frame)).toEqual({ line: 3, column: 4 });
  });

  it('returns null when no frame came from snippet code', () => {
    expect(firstUserFrame('Error\n    at x (http://a/b.js:1:1)')).toBeNull();
    expect(firstUserFrame(undefined)).toBeNull();
  });
});
