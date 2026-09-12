'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompileInput, CompileModuleResult } from '../core/compile';
import type { CompileResult, CompileSuccessInfo, UseLiveRunnerOptions } from '../core/types';

/** Separator that cannot appear in an import specifier or identifier. */
const KEY_SEP = '\0';

export interface CompileTaskState<T> {
  code: string;
  setCode: (code: string) => void;
  result: T | null;
  error: Error | null;
  isCompiling: boolean;
  compileId: number;
}

interface InternalState<T> {
  result: T | null;
  error: Error | null;
  compileId: number;
}

function compileSuccessInfo(result: unknown, compileId: number, durationMs: number): CompileSuccessInfo | null {
  if (!result || typeof result !== 'object' || !('imports' in result)) return null;
  const typed = result as CompileResult | CompileModuleResult;
  return {
    compileId,
    imports: typed.imports,
    ...('via' in typed && typed.via !== undefined ? { via: typed.via } : {}),
    durationMs,
  };
}

/**
 * The scheduling shared by every live hook: debounce, cancellation, spinner
 * delay, and keep-last-good.
 */
export function useCompileTask<T>(
  options: Omit<UseLiveRunnerOptions, 'maxRendersPerSecond'>,
  run: (input: CompileInput) => Promise<T>,
): CompileTaskState<T> {
  const {
    code: initialCode,
    debounce = 150,
    keepLastGood = true,
    onCodeChange,
    onCompileSuccess,
    modules,
    scope,
    transform,
    ...transpileOptions
  } = options;

  const [code, setCode] = useState(initialCode);
  const [state, setState] = useState<InternalState<T>>({
    result: null,
    error: null,
    compileId: 0,
  });
  const [isCompiling, setIsCompiling] = useState(false);
  const compileIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const modulesKey = useMemo(
    () => Object.keys(modules ?? {}).sort().join(KEY_SEP),
    [modules],
  );
  const scopeKey = useMemo(
    () => Object.keys(scope ?? {}).sort().join(KEY_SEP),
    [scope],
  );

  const latest = useRef({
    modules,
    scope,
    transform,
    transpileOptions,
    run,
    onCodeChange,
    onCompileSuccess,
  });
  latest.current = {
    modules,
    scope,
    transform,
    transpileOptions,
    run,
    onCodeChange,
    onCompileSuccess,
  };

  const { filePath, production, jsxRuntime, jsxImportSource } = transpileOptions;
  const prevFilePath = useRef(filePath);

  // Tab switches often change filePath before code catches up. Dropping the
  // stale renderable immediately avoids mounting the previous snippet's
  // component while the next one compiles.
  useEffect(() => {
    if (filePath === prevFilePath.current) return;
    prevFilePath.current = filePath;
    compileIdRef.current += 1;
    if (!mountedRef.current) return;
    setState({ result: null, error: null, compileId: compileIdRef.current });
  }, [filePath]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const spinnerTimer = setTimeout(() => {
      if (!cancelled && mountedRef.current) setIsCompiling(true);
    }, 200);

    const timer = setTimeout(() => {
      const current = latest.current;
      const startedAt = performance.now();

      current
        .run({
          code,
          signal: controller.signal,
          ...current.transpileOptions,
          ...(current.modules ? { modules: current.modules } : {}),
          ...(current.scope ? { scope: current.scope } : {}),
          ...(current.transform ? { transform: current.transform } : {}),
        })
        .then((result) => {
          if (cancelled || !mountedRef.current) return;
          const nextCompileId = compileIdRef.current + 1;
          compileIdRef.current = nextCompileId;
          setState({
            result,
            error: null,
            compileId: nextCompileId,
          });

          const info = compileSuccessInfo(result, nextCompileId, performance.now() - startedAt);
          if (info && current.onCompileSuccess) {
            try {
              current.onCompileSuccess(info);
            } catch {
              // A throwing host callback must not become a compile error.
            }
          }
        })
        .catch((error: unknown) => {
          if (cancelled || !mountedRef.current) return;
          const asError = error instanceof Error ? error : new Error(String(error));
          if (keepLastGood) {
            setState((previous) => ({ ...previous, error: asError }));
          } else {
            const nextCompileId = compileIdRef.current + 1;
            compileIdRef.current = nextCompileId;
            setState({ result: null, error: asError, compileId: nextCompileId });
          }
        })
        .finally(() => {
          if (cancelled || !mountedRef.current) return;
          clearTimeout(spinnerTimer);
          setIsCompiling(false);
        });
    }, debounce);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(spinnerTimer);
    };
  }, [
    code,
    debounce,
    keepLastGood,
    modulesKey,
    scopeKey,
    filePath,
    production,
    jsxRuntime,
    jsxImportSource,
    transform,
  ]);

  const setCodeStable = useCallback((next: string) => {
    setCode(next);
    latest.current.onCodeChange?.(next);
  }, []);

  return {
    code,
    setCode: setCodeStable,
    result: state.result,
    error: state.error,
    isCompiling,
    compileId: state.compileId,
  };
}
