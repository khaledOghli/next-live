// @vitest-environment jsdom
/**
 * Compatibility: what a 1.0.0 host can observe must not change in 1.1.
 *
 * 1.1 adds console capture, multi-file snippets and sandbox mode, all opt-in.
 * These tests pin the shapes a host that uses none of them can see: the keys on
 * the context and runner state, the own properties of errors, and the
 * behaviour of the single-result helpers.
 */
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { compile, compileModule } from '../../src/core/compile';
import {
  LiveCompileError,
  LiveRuntimeError,
  ModuleNotFoundError,
  NoComponentError,
} from '../../src/core/errors';
import { errorPosition } from '../../src/core/positions';
import { precompiledTransform } from '../../src/core/transpile';
import type { LiveContextValue } from '../../src/core/types';
import { useLiveContext } from '../../src/hooks/useLiveContext';
import { useLiveRunner } from '../../src/hooks/useLiveRunner';

afterEach(cleanup);

const sortedKeys = (value: object) => Object.keys(value).sort();

describe('1.0 compatibility: React state', () => {
  it('exposes exactly the 1.0 context keys for a single snippet', async () => {
    let context: LiveContextValue | null = null;
    function Probe() {
      context = useLiveContext();
      return null;
    }
    render(
      <LiveProvider code={`export default () => <b data-testid="out">ok</b>;`} debounce={0}>
        <LivePreview />
        <Probe />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('ok'));

    expect(sortedKeys(context as unknown as object)).toEqual(
      [
        'code',
        'setCode',
        'Component',
        'element',
        'error',
        'isCompiling',
        'compileId',
        'props',
        'language',
        'fallback',
        'formatError',
        'reportRuntimeError',
      ].sort(),
    );
  });

  it('exposes exactly the 1.0 runner state keys for a single snippet', () => {
    const { result } = renderHook(() => useLiveRunner({ code: '<b/>' }));
    expect(sortedKeys(result.current)).toEqual(
      ['code', 'setCode', 'Component', 'element', 'error', 'isCompiling', 'compileId'].sort(),
    );
  });
});

describe('1.0 compatibility: errors', () => {
  it('keeps the own properties of every error class', () => {
    expect(sortedKeys(new LiveCompileError('x', { line: 1, column: 2 }))).toEqual(['code', 'column', 'line', 'name']);
    expect(sortedKeys(new ModuleNotFoundError('pkg', ['react']))).toEqual(['available', 'code', 'name', 'specifier']);
    expect(sortedKeys(new LiveRuntimeError('x'))).toEqual(['code', 'name']);
    expect(sortedKeys(new NoComponentError('x'))).toEqual(['code', 'name']);
  });

  it('keeps the error position shape', () => {
    expect(errorPosition(new LiveCompileError('x', { line: 3, column: 1 }))).toEqual({ line: 3, column: 1 });
  });

  it('adds no file to single-snippet runtime errors', async () => {
    const error = await compile({ code: 'const a: any = null;\na.b;\nexport default () => null;' }).catch(
      (caught: unknown) => caught as Error,
    );
    expect(error).toMatchObject({ code: 'RUNTIME', line: 2 });
    expect('file' in (error as object)).toBe(false);
  });
});

describe('1.0 compatibility: engine', () => {
  it('returns the 1.0 result keys for a single snippet', async () => {
    expect(sortedKeys(await compile({ code: '<b/>' }))).toEqual(['code', 'imports', 'renderable', 'via']);
    expect(sortedKeys(await compileModule({ code: 'export const x = 1;' }))).toEqual(['code', 'exports', 'imports']);
  });

  it('keeps precompiledTransform for a single result', () => {
    const result = { code: 'exports.default = 1;', linePrefixOffset: 0, expression: false };
    const transform = precompiledTransform(result);
    expect(transform()).toBe(result);
  });

  it('still reports an unregistered relative import as a missing module', async () => {
    await expect(compile({ code: `import x from './x';\nexport default () => x;` })).rejects.toBeInstanceOf(
      ModuleNotFoundError,
    );
  });

  it('still lets scope.console shadow the global console when nothing captures', async () => {
    const calls: unknown[] = [];
    await compileModule({
      code: `console.log('shadowed'); export default 1;`,
      scope: { console: { log: (...args: unknown[]) => calls.push(args) } },
    });
    expect(calls).toEqual([['shadowed']]);
  });
});

describe('1.0 compatibility: rendering', () => {
  it('renders a single snippet in the page with live props by reference', async () => {
    const store = { count: 1 };
    render(
      <LiveProvider
        code={`export default ({ store }) => <b data-testid="out">{store === window.__store ? 'same' : 'copy'}</b>;`}
        props={{ store }}
        debounce={0}
      >
        <LivePreview />
      </LiveProvider>,
    );
    (window as unknown as { __store: unknown }).__store = store;
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('same'));
    expect(document.querySelector('iframe')).toBeNull();
  });
});
