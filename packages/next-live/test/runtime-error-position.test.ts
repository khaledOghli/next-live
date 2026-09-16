import { describe, expect, it } from 'vitest';
import { compile } from '../src/core/compile';
import { LiveRuntimeError, NoComponentError, RenderLoopError } from '../src/core/errors';
import { errorPosition } from '../src/core/positions';
import { enrichCaughtError } from '../src/core/runtime-error-map';
import { rehydrateError, serializeError } from '../src/core/serialize-error';

/**
 * `LiveRuntimeError` has always carried `line`, `column` and `file` at runtime,
 * and the docs have always said so, but until 1.2 its type did not declare
 * them: `error.line` failed to compile for anyone following the docs.
 *
 * The fix is type-only (`declare` fields), so these tests hold the runtime to
 * exactly what it was: no new own keys on an error without a position, and the
 * same values where there is one. The type side is enforced by
 * `test/types/public-types.test.ts`.
 */

async function runtimeErrorFrom(input: Parameters<typeof compile>[0]): Promise<LiveRuntimeError> {
  const error = await compile(input).then(
    () => {
      throw new Error('expected the snippet to throw');
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LiveRuntimeError);
  return error as LiveRuntimeError;
}

describe('LiveRuntimeError position fields', () => {
  it('adds no own keys to an error without a position', () => {
    const error = new LiveRuntimeError('boom');
    for (const key of ['line', 'column', 'file']) {
      expect(Object.prototype.hasOwnProperty.call(error, key)).toBe(false);
      expect(key in error).toBe(false);
    }
    // The same own keys as an error class that never had position fields.
    expect(Object.keys(error).sort()).toEqual(Object.keys(new NoComponentError('boom')).sort());
  });

  it('keeps a subclass free of them too', () => {
    const error = new RenderLoopError('loop');
    expect('line' in error || 'column' in error || 'file' in error).toBe(false);
    expect(error).toBeInstanceOf(LiveRuntimeError);
    expect(error.code).toBe('RENDER_LOOP');
  });

  it('reads line and column from a snippet that throws while evaluating', async () => {
    const error = await runtimeErrorFrom({
      code: ['const ok = 1;', '', 'throw new Error("third line");', 'export default () => null;'].join('\n'),
    });

    expect(error.line).toBe(3);
    expect(typeof error.column).toBe('number');
    expect(error.file).toBeUndefined();
    expect(errorPosition(error)).toEqual({ line: 3, column: error.column });
  });

  it('keeps the position fields enumerable, as hosts that spread errors expect', async () => {
    const error = await runtimeErrorFrom({ code: 'throw new Error("x");\nexport default () => null;' });
    expect(Object.keys(error)).toEqual(expect.arrayContaining(['line']));
  });

  it('names the file in a multi-file snippet', async () => {
    const error = await runtimeErrorFrom({
      files: {
        'App.tsx': "import './boom';\nexport default () => null;",
        'boom.ts': 'export {};\n\nthrow new Error("from a helper");',
      },
      entry: 'App.tsx',
    });

    expect(error.file).toBe('boom.ts');
    expect(error.line).toBe(3);
  });

  it('keeps the fields across the sandbox boundary', () => {
    const original = Object.defineProperty(new LiveRuntimeError('remote'), 'line', { value: 7, enumerable: true });
    const copy = rehydrateError(serializeError(original));

    expect(copy).toBeInstanceOf(LiveRuntimeError);
    expect((copy as LiveRuntimeError).line).toBe(7);
    expect('column' in copy).toBe(false);
  });
});

describe('enrichCaughtError', () => {
  it('maps a render-time stack frame to the snippet line', () => {
    const error = new TypeError("Cannot read properties of null (reading 'map')");
    error.stack = [
      "TypeError: Cannot read properties of null (reading 'map')",
      '    at Broken (next-live:///Broken.tsx:5:14)',
    ].join('\n');

    const enriched = enrichCaughtError(error, {
      kind: 'single',
      meta: { linePrefixOffset: 0, generatedLineCount: 5, sourceLineCount: 5 },
    });

    expect(enriched).toBeInstanceOf(LiveRuntimeError);
    expect((enriched as LiveRuntimeError).line).toBe(3);
    expect(errorPosition(enriched)).toEqual(expect.objectContaining({ line: 3, column: 14 }));
  });

  it('names the file for a multi-file render-time error', () => {
    const error = new TypeError('boom');
    error.stack = [
      'TypeError: boom',
      '    at Card (next-live:///Card.tsx:4:9)',
    ].join('\n');

    const enriched = enrichCaughtError(error, {
      kind: 'project',
      files: new Map([
        ['Card.tsx', { key: 'Card.tsx', meta: { linePrefixOffset: 0, generatedLineCount: 4, sourceLineCount: 4 } }],
      ]),
    });

    expect((enriched as LiveRuntimeError).file).toBe('Card.tsx');
    expect((enriched as LiveRuntimeError).line).toBe(2);
  });

  it('returns the error unchanged when context is missing', () => {
    const error = new Error('plain');
    expect(enrichCaughtError(error, null)).toBe(error);
  });
});
