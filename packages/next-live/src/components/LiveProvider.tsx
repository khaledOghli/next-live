'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LiveConsoleContext } from '../context/LiveConsoleContext';
import { LiveContext } from '../context/LiveContext';
import { rehydrateError } from '../core/serialize-error';
import { useCompileTask } from '../hooks/useCompileTask';
import { useLiveRunner } from '../hooks/useLiveRunner';
import type { ConsoleEntry, FormatErrorFn, LiveSandboxConfig, UseLiveRunnerOptions } from '../core/types';

export interface LiveProviderProps extends Omit<UseLiveRunnerOptions, 'code'> {
  /**
   * The snippet to run. Treated as controlled: when it changes - because a new
   * app was fetched from an API, say, the preview follows.
   *
   * Pass `files` instead for a snippet made of several files.
   */
  code?: string;
  /** Props forwarded into the rendered component. Passed by reference. */
  props?: Record<string, unknown>;
  /** Language hint for `<LiveEditor>` highlighting. Default 'tsx'. */
  language?: string;
  /** Notified on every compile and runtime error. */
  onError?: (error: Error) => void;
  /** Customises the message shown in `<LiveError>` and the editor live region. */
  formatError?: FormatErrorFn;
  /** Rendered by `<LivePreview>` until the first compile finishes. */
  fallback?: ReactNode;
  /**
   * Run snippets in a sandboxed iframe instead of this page, for code you do
   * not trust. `src` is a page you host that calls `mountSandbox` from
   * `next-live/sandbox`. See the sandbox guide before using it.
   *
   * In this mode `modules`, `scope` and `transform` are ignored (they belong
   * on the sandbox page), and `props` must be plain, cloneable data.
   */
  sandbox?: LiveSandboxConfig;
  children?: ReactNode;
}

/** Stable identity so an omitted `props` never invalidates the context. */
const EMPTY_PROPS: Record<string, unknown> = {};

/**
 * The sandbox host, loaded only by providers that use it.
 *
 * The specifier is the package's own internal export, kept external when this
 * entry is built, so the app's bundler splits it into a separate chunk. Pages
 * that never pass `sandbox` never download it.
 */
const loadSandboxHost = () => import('next-live/internal/sandbox-host');

const LazySandboxProvider = lazy(async () => {
  const host = await loadSandboxHost();
  return {
    default: host.createSandboxProvider({ LiveContext, LiveConsoleContext, useCompileTask, rehydrateError }),
  };
});

/**
 * Starts downloading the sandbox host ahead of time, for example when the user
 * hovers a link to a page that uses `<LiveProvider sandbox>`.
 */
export function preloadSandboxHost(): void {
  void loadSandboxHost().catch(() => {
    // Best effort; the provider reports a real load failure.
  });
}

/**
 * Provides a compiled snippet to `<LiveEditor>`, `<LivePreview>`, and
 * `<LiveError>`.
 *
 * Safe to render from a Server Component: nothing is compiled during the
 * server pass, and the first client render matches the server output exactly.
 */
export function LiveProvider(props: LiveProviderProps): ReactNode {
  const sandboxed = props.sandbox !== undefined;

  // Switching modes swaps the component type below, so React remounts the
  // provider instead of mixing two sets of hooks. That is safe, but it throws
  // away unsaved edits, which deserves a word in development.
  const initialMode = useRef(sandboxed);
  useEffect(() => {
    if (initialMode.current === sandboxed) return;
    initialMode.current = sandboxed;
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[next-live] <LiveProvider> switched between sandbox and in-page mode. It remounted and unsaved edits ' +
          'were lost. Give it a `key` that changes with the mode to make this explicit.',
      );
    }
  }, [sandboxed]);

  if (sandboxed) {
    return (
      <Suspense fallback={null}>
        <LazySandboxProvider {...props} />
      </Suspense>
    );
  }
  return <InPageLiveProvider {...props} />;
}

/** Runs the snippet in this page, sharing its React and its live objects. The 1.0 behaviour. */
function InPageLiveProvider(props: LiveProviderProps): ReactNode {
  const {
    code,
    props: componentProps,
    language = 'tsx',
    onError,
    formatError,
    fallback = null,
    onConsole,
    children,
    ...runnerOptions
  } = props;

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const hasCode = code !== undefined;
  const hasFiles = runnerOptions.files !== undefined;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (!hasCode && !hasFiles) {
      console.warn('[next-live] <LiveProvider> needs a `code` or a `files` prop; there is nothing to run.');
    } else if (hasCode && hasFiles) {
      console.warn('[next-live] <LiveProvider> received both `code` and `files`; `files` is used and `code` is ignored.');
    }
  }, [hasCode, hasFiles]);

  // Console capture is switched on by whoever wants the output: an `onConsole`
  // prop, or a `<LiveConsole>` attaching through context. Attachment is sticky
  // for the provider's lifetime - switching capture back off would recompile,
  // and remount the preview, just because a console panel was closed.
  const onConsoleRef = useRef(onConsole);
  onConsoleRef.current = onConsole;
  const consoleListeners = useRef(new Set<(entry: ConsoleEntry) => void>());
  const [consoleAttached, setConsoleAttached] = useState(false);

  const dispatchConsole = useCallback((entry: ConsoleEntry) => {
    if (!mountedRef.current) return;
    try {
      onConsoleRef.current?.(entry);
    } catch {
      // A throwing host callback must not starve the console panels.
    }
    for (const listener of consoleListeners.current) {
      try {
        listener(entry);
      } catch {
        // One broken panel must not starve the rest.
      }
    }
  }, []);

  const attachConsole = useCallback((listener: (entry: ConsoleEntry) => void) => {
    consoleListeners.current.add(listener);
    setConsoleAttached(true);
    return () => {
      consoleListeners.current.delete(listener);
    };
  }, []);

  const runner = useLiveRunner({
    code,
    ...runnerOptions,
    ...(onConsole !== undefined || consoleAttached ? { onConsole: dispatchConsole } : {}),
  });

  // Errors thrown while *rendering* the snippet arrive from the error boundary
  // rather than the compiler, so they are tracked here and merged below. That
  // keeps <LiveError> a single place to look regardless of which phase failed.
  //
  // The error is tagged with the compile it belongs to rather than cleared by
  // an effect: `componentDidCatch` fires during commit and passive effects run
  // after it, so an effect keyed on `compileId` would wipe the very error the
  // boundary had just reported. Comparing ids makes staleness a render-time
  // question instead, with no ordering to get wrong.
  const [runtimeError, setRuntimeError] = useState<{
    error: Error;
    compileId: number;
  } | null>(null);

  const compileIdRef = useRef(runner.compileId);
  compileIdRef.current = runner.compileId;
  const formatErrorRef = useRef(formatError);
  formatErrorRef.current = formatError;

  const lastRuntimeReport = useRef<{ compileId: number; message: string } | null>(null);

  const reportRuntimeError = useCallback(
    (error: Error) => {
      if (!mountedRef.current) return;
      const compileId = compileIdRef.current;
      const last = lastRuntimeReport.current;
      if (last !== null && last.compileId === compileId && last.message === error.message) {
        return;
      }
      lastRuntimeReport.current = { compileId, message: error.message };
      setRuntimeError({ error, compileId });
      onError?.(error);
    },
    [onError],
  );

  const activeRuntimeError =
    runtimeError !== null && runtimeError.compileId === runner.compileId
      ? runtimeError.error
      : null;

  const compileError = runner.error;
  useEffect(() => {
    if (compileError) onError?.(compileError);
  }, [compileError, onError]);

  const stableFormatError = useCallback<FormatErrorFn>((error, position) => {
    const fn = formatErrorRef.current;
    if (!fn) return error.message;
    try {
      return fn(error, position);
    } catch (cause) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[next-live] formatError threw:', cause);
      }
      return error.message;
    }
  }, []);

  const forwardedProps = componentProps ?? EMPTY_PROPS;
  const hasFormatError = formatError !== undefined;

  const value = useMemo(
    () => ({
      ...runner,
      error: runner.error ?? activeRuntimeError,
      props: forwardedProps,
      language,
      fallback,
      formatError: hasFormatError ? stableFormatError : undefined,
      reportRuntimeError,
    }),
    [
      runner,
      activeRuntimeError,
      forwardedProps,
      language,
      fallback,
      hasFormatError,
      stableFormatError,
      reportRuntimeError,
    ],
  );

  const consoleValue = useMemo(
    () => ({ attach: attachConsole, compileId: runner.compileId }),
    [attachConsole, runner.compileId],
  );

  return (
    <LiveContext.Provider value={value}>
      <LiveConsoleContext.Provider value={consoleValue}>{children}</LiveConsoleContext.Provider>
    </LiveContext.Provider>
  );
}
