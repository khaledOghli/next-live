'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompileFilesInput, CompileInput, CompileModuleResult } from '../core/compile';
import type {
  CompileResult,
  CompileSuccessInfo,
  ConsoleEntry,
  UseLiveRunnerOptions,
} from '../core/types';
import { useSourceState } from './useSourceState';
import type { ProjectState } from './useSourceState';

/** Separator that cannot appear in an import specifier or identifier. */
const KEY_SEP = '\0';

/**
 * Tags captured entries with a compile id and hands them on in one microtask.
 *
 * The deferral is not an optimisation. A snippet that logs while rendering
 * would otherwise call the host's `onConsole` in the middle of React's render,
 * where a `setState` triggers "Cannot update a component while rendering a
 * different component".
 */
function batchConsole(
  compileId: number,
  getSink: () => ((entry: ConsoleEntry) => void) | undefined,
): (entry: ConsoleEntry) => void {
  let queue: ConsoleEntry[] = [];
  return (entry) => {
    queue.push({ ...entry, compileId });
    if (queue.length > 1) return;
    queueMicrotask(() => {
      const batch = queue;
      queue = [];
      const sink = getSink();
      if (!sink) return;
      for (const item of batch) {
        try {
          sink(item);
        } catch {
          // A throwing host callback must not become a snippet error.
        }
      }
    });
  };
}

export interface CompileTaskState<T> {
  code: string;
  setCode: (code: string) => void;
  result: T | null;
  error: Error | null;
  isCompiling: boolean;
  compileId: number;
  /** Present only for multi-file snippets. */
  project?: ProjectState;
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
    ...(typed.entry !== undefined ? { entry: typed.entry } : {}),
    ...(typed.files !== undefined ? { files: typed.files } : {}),
  };
}

/**
 * The scheduling shared by every live hook: debounce, cancellation, spinner
 * delay, and keep-last-good.
 */
export function useCompileTask<T>(
  options: Omit<UseLiveRunnerOptions, 'maxRendersPerSecond'>,
  run: (input: CompileInput | CompileFilesInput) => Promise<T>,
): CompileTaskState<T> {
  const {
    code: initialCode,
    files,
    entry,
    activeFile,
    onActiveFileChange,
    onFilesChange,
    debounce = 150,
    keepLastGood = true,
    onCodeChange,
    onCompileSuccess,
    onConsole,
    forwardConsole = true,
    modules,
    scope,
    transform,
    resolveSubpaths,
    signal,
    ...transpileOptions
  } = options;

  // Whether capture is on is a compile input; which callback receives it is
  // not. Keying on identity would recompile on every render with an inline
  // `onConsole={(e) => ...}`.
  const consoleOn = onConsole !== undefined;

  const source = useSourceState({
    code: initialCode,
    files,
    entry,
    activeFile,
    onCodeChange,
    onFilesChange,
    onActiveFileChange,
  });

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
    onCompileSuccess,
    onConsole,
  });
  latest.current = {
    modules,
    scope,
    transform,
    transpileOptions,
    run,
    onCompileSuccess,
    onConsole,
  };

  const { filePath, production, jsxRuntime, jsxImportSource } = transpileOptions;

  // Only what the compiler reads. Switching the active file changes what the
  // editor shows, not what runs, so it never appears here.
  const compileCode = source.project ? undefined : source.code;
  const compileFiles = source.project?.files;

  // Tab switches often change filePath before code catches up. Dropping the
  // stale renderable immediately avoids mounting the previous snippet's
  // component while the next one compiles. Moving between `code` and `files`,
  // or to another entry file, is the same kind of switch.
  const resetKey = `${filePath ?? ''}${KEY_SEP}${source.project ? `files${KEY_SEP}${entry ?? ''}` : 'code'}`;
  const prevResetKey = useRef(resetKey);

  useEffect(() => {
    if (resetKey === prevResetKey.current) return;
    prevResetKey.current = resetKey;
    compileIdRef.current += 1;
    if (!mountedRef.current) return;
    setState({ result: null, error: null, compileId: compileIdRef.current });
  }, [resetKey]);

  useEffect(() => {
    // The host's signal says every result from here on is unwanted, so an
    // already-aborted one means there is nothing to start.
    if (signal?.aborted) return;

    // One controller per compile, aborted by either side: this effect's cleanup
    // (the inputs changed or the host unmounted) or the host's own signal.
    // Handing the compile only one of the two would let the other go unheard.
    const controller = new AbortController();
    const abortFromHost = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromHost, { once: true });
    let cancelled = false;

    const spinnerTimer = setTimeout(() => {
      if (!cancelled && mountedRef.current) setIsCompiling(true);
    }, 200);

    const timer = setTimeout(() => {
      // Aborted while debouncing: starting the compile would only reject.
      if (controller.signal.aborted) {
        clearTimeout(spinnerTimer);
        return;
      }
      const current = latest.current;
      const startedAt = performance.now();

      // Tagged with the id this compile receives if it succeeds: module-level
      // logs run before the id is bumped, and a panel that clears on compile
      // must not throw away the output of the very compile that just landed.
      const consoleSink = consoleOn
        ? batchConsole(compileIdRef.current + 1, () =>
            mountedRef.current ? latest.current.onConsole : undefined,
          )
        : undefined;

      const sourceInput =
        compileFiles !== undefined
          ? { files: compileFiles, ...(entry !== undefined ? { entry } : {}) }
          : { code: compileCode ?? '' };

      current
        .run({
          ...sourceInput,
          ...current.transpileOptions,
          signal: controller.signal,
          ...(resolveSubpaths !== undefined ? { resolveSubpaths } : {}),
          ...(current.modules ? { modules: current.modules } : {}),
          ...(current.scope ? { scope: current.scope } : {}),
          ...(current.transform ? { transform: current.transform } : {}),
          ...(consoleSink ? { onConsole: consoleSink, forwardConsole } : {}),
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
          // An aborted compile was abandoned on purpose, not broken: showing
          // its AbortError would replace a working preview with a non-error.
          if (cancelled || !mountedRef.current || controller.signal.aborted) return;
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
      signal?.removeEventListener('abort', abortFromHost);
      controller.abort();
      clearTimeout(timer);
      clearTimeout(spinnerTimer);
    };
  }, [
    compileCode,
    compileFiles,
    entry,
    debounce,
    keepLastGood,
    modulesKey,
    scopeKey,
    filePath,
    production,
    jsxRuntime,
    jsxImportSource,
    transform,
    consoleOn,
    forwardConsole,
    resolveSubpaths,
    signal,
  ]);

  return {
    code: source.code,
    setCode: source.setCode,
    result: state.result,
    error: state.error,
    isCompiling,
    compileId: state.compileId,
    ...(source.project ? { project: source.project } : {}),
  };
}
