// @vitest-environment jsdom
/**
 * Scenario: a host that cancels work, and changes options while it runs.
 *
 * `signal` and `resolveSubpaths` are accepted by `<LiveProvider>`,
 * `useLiveRunner` and `useLiveModule`. Before 1.2 a host's `signal` replaced
 * the one the scheduler uses to cancel stale compiles (so recompiling or
 * unmounting no longer cancelled anything), an abort surfaced as an error, and
 * toggling `resolveSubpaths` did not recompile at all. These tests pin down the
 * behaviour the docs now promise.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { LiveError } from '../../src/components/LiveError';
import { defineLoader } from '../../src/core/resolver';
import { useCompileTask } from '../../src/hooks/useCompileTask';
import type { CompileFilesInput, CompileInput } from '../../src/core/compile';
import type { UseLiveRunnerOptions } from '../../src/core/types';

afterEach(cleanup);

type Input = CompileInput | CompileFilesInput;

/**
 * A `run` whose compiles finish only when the test says so, and reject the way
 * the engine does when their signal aborts.
 */
function controllableRun() {
  const calls: { input: Input; resolve: (value: string) => void; reject: (error: unknown) => void }[] = [];
  const run = vi.fn(
    (input: Input) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ input, resolve, reject });
        input.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true },
        );
      }),
  );
  return { run, calls };
}

type TaskOptions = Omit<UseLiveRunnerOptions, 'maxRendersPerSecond'>;

function renderTask(initial: TaskOptions, run: (input: Input) => Promise<string>) {
  return renderHook((options: TaskOptions) => useCompileTask(options, run), { initialProps: initial });
}

describe('scenario: the host passes a signal and never aborts it', () => {
  it('compiles normally, with a signal of its own that is not aborted', async () => {
    const host = new AbortController();
    const { run, calls } = controllableRun();
    const { result } = renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const signal = calls[0]?.input.signal;
    // Its own, so the scheduler can cancel it without touching the host's.
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal).not.toBe(host.signal);
    expect(signal?.aborted).toBe(false);

    await act(async () => calls[0]?.resolve('A'));
    expect(result.current.result).toBe('A');
    expect(result.current.error).toBeNull();
  });

  it('still cancels a stale compile when the code changes (the 1.1 regression)', async () => {
    const host = new AbortController();
    const { run, calls } = controllableRun();
    const { rerender } = renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    rerender({ code: 'b', debounce: 0, signal: host.signal });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));

    expect(calls[0]?.input.signal?.aborted).toBe(true);
    expect(calls[1]?.input.signal?.aborted).toBe(false);
    expect(host.signal.aborted).toBe(false);
  });

  it('still cancels the in-flight compile on unmount', async () => {
    const host = new AbortController();
    const { run, calls } = controllableRun();
    const { unmount } = renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    unmount();
    expect(calls[0]?.input.signal?.aborted).toBe(true);
    expect(host.signal.aborted).toBe(false);
  });

  it('still reports a real compile failure', async () => {
    const host = new AbortController();
    const { run, calls } = controllableRun();
    const { result } = renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    const failure = new SyntaxError('Unexpected token');
    await act(async () => calls[0]?.reject(failure));
    expect(result.current.error).toBe(failure);
  });

  it('does not pile up abort listeners on the host signal across recompiles', async () => {
    const host = new AbortController();
    const added = vi.spyOn(host.signal, 'addEventListener');
    const removed = vi.spyOn(host.signal, 'removeEventListener');
    const { run } = controllableRun();
    const { rerender, unmount } = renderTask({ code: 'v0', debounce: 0, signal: host.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    for (let i = 1; i <= 5; i++) {
      rerender({ code: `v${i}`, debounce: 0, signal: host.signal });
      await waitFor(() => expect(run).toHaveBeenCalledTimes(i + 1));
    }
    unmount();

    const count = (spy: typeof added) => spy.mock.calls.filter(([type]) => type === 'abort').length;
    expect(count(added)).toBe(6);
    expect(count(removed)).toBe(6);
  });
});

describe('scenario: the host aborts', () => {
  it('abandons the in-flight compile, keeps the last result, and reports no error', async () => {
    const host = new AbortController();
    const { run, calls } = controllableRun();
    const { result, rerender } = renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await act(async () => calls[0]?.resolve('A'));

    rerender({ code: 'b', debounce: 0, signal: host.signal });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));

    await act(async () => host.abort());

    expect(calls[1]?.input.signal?.aborted).toBe(true);
    expect(result.current.result).toBe('A');
    expect(result.current.error).toBeNull();
    expect(result.current.isCompiling).toBe(false);
  });

  it('passes the host abort reason on to the compile', async () => {
    const host = new AbortController();
    const { run, calls } = controllableRun();
    renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    const reason = new Error('navigated away');
    await act(async () => host.abort(reason));
    expect(calls[0]?.input.signal?.reason).toBe(reason);
  });

  it('starts no new compile afterwards, even when the code changes', async () => {
    const host = new AbortController();
    const { run, calls } = controllableRun();
    const { rerender } = renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await act(async () => calls[0]?.resolve('A'));

    await act(async () => host.abort());
    rerender({ code: 'b', debounce: 0, signal: host.signal });
    rerender({ code: 'c', debounce: 0, signal: host.signal });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never compiles with a signal that was aborted before mount', async () => {
    const host = new AbortController();
    host.abort();
    const { run } = controllableRun();
    const { result } = renderTask({ code: 'a', debounce: 0, signal: host.signal }, run);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(run).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ result: null, error: null, isCompiling: false, compileId: 0 });
  });

  it('cancels a compile still waiting out its debounce', async () => {
    const host = new AbortController();
    const { run } = controllableRun();
    const { result } = renderTask({ code: 'a', debounce: 40, signal: host.signal }, run);

    await act(async () => host.abort());
    await new Promise((resolve) => setTimeout(resolve, 260));

    expect(run).not.toHaveBeenCalled();
    expect(result.current.isCompiling).toBe(false);
  });

  it('compiles again when the host hands over a fresh signal', async () => {
    const first = new AbortController();
    const { run, calls } = controllableRun();
    const { result, rerender } = renderTask({ code: 'a', debounce: 0, signal: first.signal }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await act(async () => first.abort());

    const second = new AbortController();
    rerender({ code: 'a', debounce: 0, signal: second.signal });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await act(async () => calls[1]?.resolve('A'));
    expect(result.current.result).toBe('A');
  });
});

describe('scenario: resolveSubpaths reaches every compile', () => {
  it('is passed to the compile only when set, so default inputs keep their shape', async () => {
    const { run, calls } = controllableRun();
    const { rerender } = renderTask({ code: 'a', debounce: 0 }, run);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(calls[0]?.input).not.toHaveProperty('resolveSubpaths');

    rerender({ code: 'a', debounce: 0, resolveSubpaths: true });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(calls[1]?.input).toMatchObject({ resolveSubpaths: true });
  });

  it('recompiles when it is switched on, on a live provider', async () => {
    const code = `import Button from 'kit/Button';\nexport default () => <Button/>;`;
    const modules = { kit: { Button: () => <b data-testid="out">sub</b> } };
    const view = (resolveSubpaths: boolean) => (
      <LiveProvider code={code} modules={modules} resolveSubpaths={resolveSubpaths} debounce={0}>
        <LivePreview />
        <LiveError />
      </LiveProvider>
    );

    const { rerender } = render(view(false));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/kit\/Button/));

    rerender(view(true));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('sub'), { timeout: 4000 });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('scenario: a provider whose host aborts mid-compile', () => {
  it('keeps the last good preview and shows no error', async () => {
    let releaseSlow: (value: unknown) => void = () => {};
    const modules = {
      slow: defineLoader(() => new Promise((resolve) => (releaseSlow = resolve))),
    };
    const host = new AbortController();
    const view = (code: string) => (
      <LiveProvider code={code} modules={modules} signal={host.signal} debounce={0}>
        <LivePreview />
        <LiveError />
      </LiveProvider>
    );

    const { rerender } = render(view(`export default () => <b data-testid="out">ok</b>;`));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('ok'), { timeout: 4000 });

    rerender(view(`import value from 'slow';\nexport default () => <b data-testid="out">{String(value)}</b>;`));
    // Give the compile time to reach the loader, then abort and let it finish.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await act(async () => {
      host.abort();
      releaseSlow({ default: 'late' });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByTestId('out').textContent).toBe('ok');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
