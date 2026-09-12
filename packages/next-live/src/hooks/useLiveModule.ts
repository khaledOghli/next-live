'use client';

import { useCallback } from 'react';
import { compileModule } from '../core/compile';
import type { CompileInput, CompileModuleResult } from '../core/compile';
import { useCompileTask } from './useCompileTask';
import type { UseLiveRunnerOptions } from '../core/types';

export interface UseLiveModuleOptions
  extends Omit<UseLiveRunnerOptions, 'maxRendersPerSecond'> {}

export interface LiveModuleState<T extends Record<string, unknown> = Record<string, unknown>> {
  code: string;
  setCode: (code: string) => void;
  /** Everything the snippet exported. Null until the first successful run. */
  exports: T | null;
  /** Shorthand for `exports?.default`. */
  value: unknown;
  error: Error | null;
  isCompiling: boolean;
  /** Increments on every successful run. */
  compileId: number;
}

/**
 * Runs a snippet and returns its exports, without requiring a React component.
 *
 * Use it for stored code that is not UI — a validator, a data transformer, a
 * calculated field, a config builder:
 *
 * ```ts
 * const { exports } = useLiveModule({ code: rule.source, modules });
 * const isValid = exports?.validate?.(input);
 * ```
 *
 * Shares its scheduling with `useLiveRunner`, so the SSR, debounce, and
 * keep-last-good behaviour is identical: nothing runs during the server pass,
 * and a failed recompile leaves the previous exports in place.
 *
 * The same caveat applies as everywhere else in this library — the snippet runs
 * with your page's full authority, so its author must be someone you trust.
 */
export function useLiveModule<T extends Record<string, unknown> = Record<string, unknown>>(
  options: UseLiveModuleOptions,
): LiveModuleState<T> {
  const run = useCallback(
    (input: CompileInput): Promise<CompileModuleResult> => compileModule(input),
    [],
  );

  const task = useCompileTask(options, run);
  const exports = (task.result?.exports as T | undefined) ?? null;

  return {
    code: task.code,
    setCode: task.setCode,
    exports,
    value: exports?.['default'],
    error: task.error,
    isCompiling: task.isCompiling,
    compileId: task.compileId,
  };
}
