// @vitest-environment jsdom
/**
 * Scenario: the scheduling behaviour a host tunes, and the engine helpers a
 * host calls directly.
 *
 * `debounce`, `preloadTranspiler`, `errorPosition` and `AbortSignal`
 * cancellation are all public and documented, and none of them had a test. The scheduling ones matter most: they are what stops a fast
 * typist from compiling on every keystroke.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { compile } from '../../src/core/compile';
import { errorPosition } from '../../src/core/positions';
import { preloadTranspiler } from '../../src/core/transpile';
import { createRenderBudget } from '../../src/core/guards';
import { RenderLoopError } from '../../src/core/errors';
import type { CompileSuccessInfo } from '../../src/core/types';

afterEach(cleanup);

const app = (label: string) =>
  `export default function App() { return <b data-testid="out">${label}</b>; }`;

describe('scenario: typing fast should not compile on every keystroke', () => {
  it('debounces rapid code changes into a single compile', async () => {
    const onCompileSuccess = vi.fn<(info: CompileSuccessInfo) => void>();

    const { rerender } = render(
      <LiveProvider code={app('a')} debounce={60} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(onCompileSuccess).toHaveBeenCalledTimes(1), { timeout: 4000 });

    // Five "keystrokes" in quick succession.
    for (const label of ['b', 'c', 'd', 'e', 'f']) {
      rerender(
        <LiveProvider code={app(label)} debounce={60} onCompileSuccess={onCompileSuccess}>
          <LivePreview />
        </LiveProvider>,
      );
    }

    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('f'), { timeout: 4000 });

    // The intermediate states were superseded before their timers fired, so
    // only the first compile and the final one produced a result.
    expect(onCompileSuccess).toHaveBeenCalledTimes(2);
  });

  it('increments compileId once per successful compile, for use as a remount key', async () => {
    const ids: number[] = [];
    const onCompileSuccess = (info: CompileSuccessInfo) => void ids.push(info.compileId);

    const { rerender } = render(
      <LiveProvider code={app('a')} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(ids.length).toBe(1), { timeout: 4000 });

    rerender(
      <LiveProvider code={app('b')} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(ids.length).toBe(2), { timeout: 4000 });

    expect(ids[1]).toBeGreaterThan(ids[0] as number);
  });

  it('reports the imports and a duration a host can log', async () => {
    const onCompileSuccess = vi.fn<(info: CompileSuccessInfo) => void>();
    render(
      <LiveProvider
        code={`import { useState } from 'react';
export default function App() {
  const [n] = useState(1);
  return <b data-testid="out">{n}</b>;
}`}
        onCompileSuccess={onCompileSuccess}
      >
        <LivePreview />
      </LiveProvider>,
    );

    await waitFor(() => expect(onCompileSuccess).toHaveBeenCalled(), { timeout: 4000 });
    const info = onCompileSuccess.mock.calls[0][0];
    expect(info.imports).toContain('react');
    expect(typeof info.durationMs).toBe('number');
    expect(info.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('scenario: a compile whose result is no longer wanted', () => {
  it('aborts via AbortSignal instead of resolving', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      compile({ code: app('x'), signal: controller.signal }),
    ).rejects.toThrow();
  });

  it('runs normally when the signal is not aborted', async () => {
    const controller = new AbortController();
    const result = await compile({ code: app('x'), signal: controller.signal });
    expect(result.renderable.kind).toBe('component');
  });
});

describe('scenario: warming the transpiler before it is needed', () => {
  it('preloadTranspiler resolves without throwing and does not break later compiles', async () => {
    expect(() => preloadTranspiler()).not.toThrow();
    const result = await compile({ code: app('warm') });
    expect(result.renderable.kind).toBe('component');
  });
});

describe('scenario: a custom editor highlighting the failing line', () => {
  it('errorPosition reads line and column off a compile error', async () => {
    const error = await compile({
      code: `export default function A() {\n  const x = ;\n}`,
    }).catch((e: unknown) => e);

    const position = errorPosition(error);
    expect(position?.line).toBe(2);
    expect(typeof position?.column).toBe('number');
  });

  it('returns null for an error with no position, rather than guessing', () => {
    expect(errorPosition(new Error('no position here'))).toBeNull();
  });

  it('is safe to call with the nullish error a runner hands back', () => {
    // `LiveRunnerState.error` is `Error | null`, so this is the natural call.
    expect(errorPosition(null)).toBeNull();
    expect(errorPosition(undefined)).toBeNull();
  });
});

describe('scenario: the render budget a host can tune', () => {
  it('allows renders under the threshold', () => {
    const tick = createRenderBudget({ maxRenders: 5 });
    expect(() => { for (let i = 0; i < 4; i++) tick(); }).not.toThrow();
  });

  it('throws RenderLoopError once the threshold is passed', () => {
    const tick = createRenderBudget({ maxRenders: 3 });
    expect(() => { for (let i = 0; i < 10; i++) tick(); }).toThrow(RenderLoopError);
  });

  it('stays tripped, so a retried render cannot slip through', () => {
    const tick = createRenderBudget({ maxRenders: 1 });
    try { tick(); tick(); tick(); } catch { /* expected */ }
    expect(() => tick()).toThrow(RenderLoopError);
  });

  it('names the threshold in the message, so the fix is obvious', () => {
    const tick = createRenderBudget({ maxRenders: 7 });
    let message = '';
    try { for (let i = 0; i < 20; i++) tick(); } catch (e) { message = (e as Error).message; }
    expect(message).toContain('7');
  });
});
