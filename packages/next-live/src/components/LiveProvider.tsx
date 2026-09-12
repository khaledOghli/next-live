'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LiveContext } from '../context/LiveContext';
import { useLiveRunner } from '../hooks/useLiveRunner';
import type { UseLiveRunnerOptions } from '../core/types';

export interface LiveProviderProps extends Omit<UseLiveRunnerOptions, 'code'> {
  /**
   * The snippet to run. Treated as controlled: when it changes - because a new
   * app was fetched from an API, say, the preview follows.
   */
  code: string;
  /** Props forwarded into the rendered component. Passed by reference. */
  props?: Record<string, unknown>;
  /** Language hint for `<LiveEditor>` highlighting. Default 'tsx'. */
  language?: string;
  /** Notified on every compile and runtime error. */
  onError?: (error: Error) => void;
  /** Rendered by `<LivePreview>` until the first compile finishes. */
  fallback?: ReactNode;
  children?: ReactNode;
}

/** Stable identity so an omitted `props` never invalidates the context. */
const EMPTY_PROPS: Record<string, unknown> = {};

/**
 * Provides a compiled snippet to `<LiveEditor>`, `<LivePreview>`, and
 * `<LiveError>`.
 *
 * Safe to render from a Server Component: nothing is compiled during the
 * server pass, and the first client render matches the server output exactly.
 */
export function LiveProvider(props: LiveProviderProps): ReactNode {
  const {
    code,
    props: componentProps,
    language = 'tsx',
    onError,
    fallback = null,
    children,
    ...runnerOptions
  } = props;

  const runner = useLiveRunner({ code, ...runnerOptions });

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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const forwardedProps = componentProps ?? EMPTY_PROPS;

  const value = useMemo(
    () => ({
      ...runner,
      error: runner.error ?? activeRuntimeError,
      props: forwardedProps,
      language,
      fallback,
      reportRuntimeError,
    }),
    [runner, activeRuntimeError, forwardedProps, language, fallback, reportRuntimeError],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
