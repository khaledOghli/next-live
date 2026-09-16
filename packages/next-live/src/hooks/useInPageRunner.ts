'use client';

import { useCallback, type RefObject } from 'react';
import { compileWithPosition } from '../core/compile';
import type { CompileFilesInput, CompileInput } from '../core/compile';
import type { CompileResult } from '../core/types';
import { createRenderBudget } from '../core/guards';
import type { PositionContext } from '../core/runtime-error-map';
import { useCompileTask } from './useCompileTask';
import type { LiveRunnerState, UseLiveRunnerOptions } from '../core/types';

/**
 * The implementation behind {@link useLiveRunner}, with one addition for
 * `<LiveProvider>`: it records the line mapping of the compile it shows, so an
 * error thrown later while *rendering* that component can be given a line.
 *
 * Kept off `useLiveRunner`'s public signature. Pass `null` to skip recording.
 */
export function useInPageRunner(
  options: UseLiveRunnerOptions,
  positionContextRef: RefObject<PositionContext | null> | null,
): LiveRunnerState {
  const { maxRendersPerSecond = 1000, ...taskOptions } = options;

  const run = useCallback(
    async (input: CompileInput | CompileFilesInput): Promise<CompileResult> => {
      const { result, positionContext } = await compileWithPosition({
        ...input,
        // A fresh budget per compile, so fixing a snippet clears a tripped
        // breaker without the user having to reload the page.
        onRender: createRenderBudget({ maxRenders: maxRendersPerSecond }),
      });
      // Only a compile whose result will be shown may replace the mapping. The
      // engine already rejects most abandoned compiles, this covers the rest.
      if (positionContextRef && !input.signal?.aborted) positionContextRef.current = positionContext;
      return result;
    },
    [maxRendersPerSecond, positionContextRef],
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
