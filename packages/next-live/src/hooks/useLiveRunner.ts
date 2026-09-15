'use client';

import { useCallback } from 'react';
import { compile } from '../core/compile';
import type { CompileFilesInput, CompileInput } from '../core/compile';
import type { CompileResult } from '../core/types';
import { createRenderBudget } from '../core/guards';
import { useCompileTask } from './useCompileTask';
import type { LiveRunnerState, UseLiveRunnerOptions } from '../core/types';

/**
 * The headless engine behind `<LiveProvider>` - compiles a snippet and hands
 * back a component, for hosts building their own UI.
 *
 * Compilation never runs during render or on the server. The first client
 * render produces exactly what the server produced (no component, no error),
 * so there is nothing for React to find mismatched during hydration; the
 * compile starts afterwards, in an effect.
 *
 * For snippets that are not components, use {@link useLiveModule}.
 */
export function useLiveRunner(options: UseLiveRunnerOptions): LiveRunnerState {
  const { maxRendersPerSecond = 1000, ...taskOptions } = options;

  const run = useCallback(
    (input: CompileInput | CompileFilesInput): Promise<CompileResult> =>
      // A fresh budget per compile, so fixing a snippet clears a tripped
      // breaker without the user having to reload the page.
      compile({ ...input, onRender: createRenderBudget({ maxRenders: maxRendersPerSecond }) }),
    [maxRendersPerSecond],
  );

  const task = useCompileTask(taskOptions, run);
  const renderable = task.result?.renderable ?? null;

  return {
    code: task.code,
    setCode: task.setCode,
    Component: renderable?.kind === 'component' ? renderable.component : null,
    element: renderable?.kind === 'element' ? renderable.element : null,
    error: task.error,
    isCompiling: task.isCompiling,
    compileId: task.compileId,
    // Spread only for multi-file snippets, so a single snippet's state keeps
    // exactly the keys it had in 1.0.
    ...(task.project ?? {}),
  };
}
