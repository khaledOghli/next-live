'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Context, CSSProperties, ReactNode } from 'react';
import type { LiveProviderProps } from '../../components/LiveProvider';
import type { CompileFilesInput, CompileInput } from '../../core/compile';
import type { LiveConsoleContextValue } from '../../context/LiveConsoleContext';
import { LiveSandboxError } from '../../core/errors';
import type { LiveError } from '../../core/errors';
import { serializeError } from '../../core/serialize-error';
import type {
  ConsoleEntry,
  ExtractionSource,
  FormatErrorFn,
  LiveContextValue,
  LiveSandboxConfig,
  SandboxFrameProps,
  SandboxHandle,
  SandboxStatus,
  UseLiveRunnerOptions,
} from '../../core/types';
import type { CompileTaskState } from '../../hooks/useCompileTask';
import { envelope } from '../protocol/messages';
import type { UpdateMessage } from '../protocol/messages';
import { resolveFrameAttributes } from './attrs';
import type { FrameAttributes } from './attrs';
import { createHostBridge } from './bridge';
import type { BridgeStatus, ForwardedMessage, HostBridge } from './bridge';

/**
 * The host side of `<LiveProvider sandbox>`.
 *
 * Built as its own bundle and loaded on demand, so pages that never use a
 * sandbox never download it. Anything that must be the *same instance* as the
 * main entry (the contexts, the scheduler, the error classes users check with
 * `instanceof`) is passed in rather than imported.
 */
export interface SandboxProviderDeps {
  LiveContext: Context<LiveContextValue | null>;
  LiveConsoleContext: Context<LiveConsoleContextValue | null>;
  useCompileTask: <T>(
    options: Omit<UseLiveRunnerOptions, 'maxRendersPerSecond'>,
    run: (input: CompileInput | CompileFilesInput) => Promise<T>,
  ) => CompileTaskState<T>;
  rehydrateError: (data: unknown) => LiveError;
}

interface SandboxCompileResult {
  imports: readonly string[];
  via?: ExtractionSource;
  entry?: string;
  files?: readonly string[];
}

interface FrameControl {
  attributes: FrameAttributes | null;
  attributesKey: string;
  restartKey: number;
  status: SandboxStatus;
  height: number | null;
  hasCompiled: boolean;
  attach: (iframe: HTMLIFrameElement, attributes: FrameAttributes) => () => void;
  setProps: (props: Record<string, unknown>) => void;
}

const FrameControlContext = createContext<FrameControl | null>(null);

const EMPTY_PROPS: Record<string, unknown> = {};
const IGNORE_CONSOLE = (): void => {};
const RESTART_WINDOW_MS = 60_000;

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key) => Object.is(a[key], b[key]));
}

function cloneError(cause: unknown): LiveSandboxError {
  const detail = cause instanceof Error ? ` (${cause.message})` : '';
  return new LiveSandboxError(
    'props-not-cloneable',
    'Props for a sandboxed preview are copied into the iframe, so they must be plain data: objects, arrays, ' +
      'strings, numbers, booleans, dates, maps and sets. Functions, class instances, DOM nodes and React ' +
      `elements cannot cross.${detail}`,
    { cause },
  );
}

/** The iframe. Rendered by `<LivePreview>` through the context's sandbox handle. */
function SandboxFrame(props: SandboxFrameProps): ReactNode {
  const control = useContext(FrameControlContext);
  const {
    as: Wrapper = 'div',
    className,
    style,
    props: frameProps = EMPTY_PROPS,
    fallback = null,
    title = 'Live preview',
    height = 'auto',
    loading = 'eager',
    frameClassName,
    frameStyle,
  } = props;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The iframe only exists on the client, after hydration. The server and the
  // first client render both produce the wrapper and the fallback, nothing
  // else, so there is nothing for hydration to disagree about.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const setProps = control?.setProps;
  useEffect(() => {
    setProps?.(frameProps);
  }, [setProps, frameProps]);

  const attach = control?.attach;
  const attributes = control?.attributes ?? null;
  const restartKey = control?.restartKey ?? 0;
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!mounted || !iframe || !attributes || !attach) return;
    return attach(iframe, attributes);
  }, [mounted, attach, attributes, restartKey]);

  if (!control) {
    throw new Error('[next-live] A sandbox frame was rendered outside <LiveProvider sandbox>.');
  }

  const showIframe = mounted && attributes !== null;
  const showFallback = !control.hasCompiled;
  const frameHeight = height === 'auto' ? (control.height ?? undefined) : height;
  const credentialless: Record<string, string> = attributes?.credentialless ? { credentialless: '' } : {};

  const iframeStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    border: 0,
    ...(frameHeight !== undefined ? { height: frameHeight } : {}),
    ...(showFallback ? { visibility: 'hidden' } : {}),
    ...frameStyle,
  };

  return (
    <Wrapper className={className} style={{ position: 'relative', ...style }} data-next-live-sandbox={control.status}>
      {showIframe ? (
        <iframe
          key={`${restartKey}:${control.attributesKey}`}
          ref={iframeRef}
          src={attributes.src}
          sandbox={attributes.sandbox}
          allow={attributes.allow}
          referrerPolicy={attributes.referrerPolicy}
          title={title}
          loading={loading}
          className={frameClassName}
          style={iframeStyle}
          {...credentialless}
        />
      ) : null}
      {showFallback ? (
        <div style={showIframe ? { position: 'absolute', inset: 0 } : undefined}>{fallback}</div>
      ) : null}
    </Wrapper>
  );
}

export function createSandboxProvider(deps: SandboxProviderDeps): (props: LiveProviderProps) => ReactNode {
  const { LiveContext, LiveConsoleContext, useCompileTask, rehydrateError } = deps;

  // This bundle has its own copy of the error classes. Rebuilding every error
  // through the main entry's `rehydrateError` means `error instanceof
  // LiveSandboxError`, imported from 'next-live', still holds for the host.
  const toHostError = (error: unknown): LiveError => rehydrateError(serializeError(error));

  return function SandboxLiveProvider(props: LiveProviderProps): ReactNode {
    const {
      sandbox,
      code,
      props: componentProps,
      language = 'tsx',
      onError,
      formatError,
      fallback = null,
      onConsole,
      children,
      modules,
      scope,
      transform,
      maxRendersPerSecond = 1000,
      ...taskOptions
    } = props;
    const config = sandbox as LiveSandboxConfig;

    const mountedRef = useRef(true);
    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    const ignored = [modules && 'modules', scope && 'scope', transform && 'transform'].filter(Boolean).join(', ');
    useEffect(() => {
      if (!ignored || process.env.NODE_ENV === 'production') return;
      console.warn(
        `[next-live] <LiveProvider sandbox> ignores ${ignored}: snippets run inside the sandbox page, so register ` +
          'them there, with mountSandbox({ modules }) or <LiveSandboxRoot modules>.',
      );
    }, [ignored]);

    // Console: the same hub as the in-page provider, fed from the iframe.
    const onConsoleRef = useRef(onConsole);
    onConsoleRef.current = onConsole;
    const consoleListeners = useRef(new Set<(entry: ConsoleEntry) => void>());
    const [consoleAttached, setConsoleAttached] = useState(false);
    const captureConsole = onConsole !== undefined || consoleAttached;

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

    const [status, setStatus] = useState<SandboxStatus>('connecting');
    const [connectionError, setConnectionError] = useState<LiveError | null>(null);
    const [propsError, setPropsError] = useState<LiveError | null>(null);
    const [restartKey, setRestartKey] = useState(0);
    const [height, setHeight] = useState<number | null>(null);
    const [hasCompiled, setHasCompiled] = useState(false);
    const [frame, setFrame] = useState<{ attributes: FrameAttributes | null; key: string }>({
      attributes: null,
      key: '',
    });

    const configRef = useRef(config);
    configRef.current = config;
    const keepLastGoodRef = useRef(taskOptions.keepLastGood ?? true);
    keepLastGoodRef.current = taskOptions.keepLastGood ?? true;
    const maxRendersRef = useRef(maxRendersPerSecond);
    maxRendersRef.current = maxRendersPerSecond;

    const bridgeRef = useRef<HostBridge | null>(null);
    const revisionRef = useRef(0);
    const resolvedRevisionRef = useRef(-1);
    const latestUpdateRef = useRef<UpdateMessage | null>(null);
    const pendingRef = useRef(
      new Map<number, { resolve: (result: SandboxCompileResult) => void; reject: (error: Error) => void }>(),
    );
    const propsRef = useRef<Record<string, unknown>>(EMPTY_PROPS);
    const restartsRef = useRef<number[]>([]);
    const restartLimitedRef = useRef(false);
    const consoleIdRef = useRef(0);
    const compileIdByRevision = useRef(new Map<number, number>());

    // Resolved in an effect, not during render: it needs `window`, and an
    // error here must not appear on the client's first render when it could
    // not have appeared on the server's.
    const permissionsKey = (config.permissions ?? []).join(' ');
    useEffect(() => {
      try {
        const attributes = resolveFrameAttributes(
          configRef.current,
          window.location,
          typeof HTMLIFrameElement !== 'undefined' && 'credentialless' in HTMLIFrameElement.prototype,
        );
        setFrame({ attributes, key: JSON.stringify(attributes) });
        setConnectionError(null);
      } catch (error) {
        setFrame({ attributes: null, key: '' });
        setStatus('failed');
        setConnectionError(toHostError(error));
      }
    }, [config.src, permissionsKey, config.allowSameOrigin, config.allow, config.credentialless]);

    // Errors raised while rendering inside the iframe, tracked against the
    // compile they belong to, exactly as the in-page provider does.
    const [runtimeError, setRuntimeError] = useState<{ error: Error; compileId: number } | null>(null);
    const lastRuntimeReport = useRef<{ compileId: number; message: string } | null>(null);

    const postUpdate = (message: UpdateMessage) => {
      const bridge = bridgeRef.current;
      if (!bridge?.connected) return;
      try {
        bridge.post({ ...message, props: propsRef.current });
      } catch (error) {
        const pending = pendingRef.current.get(message.revision);
        pendingRef.current.delete(message.revision);
        pending?.reject(toHostError(cloneError(error)));
      }
    };

    const run = useCallback((input: CompileInput | CompileFilesInput): Promise<SandboxCompileResult> => {
      if (restartLimitedRef.current) {
        // New code deserves a fresh attempt after the sandbox gave up.
        restartLimitedRef.current = false;
        restartsRef.current = [];
        setConnectionError(null);
        setStatus('connecting');
        setHasCompiled(false);
        setRestartKey((key) => key + 1);
      }

      const revision = ++revisionRef.current;
      const files = (input as Partial<CompileFilesInput>).files;
      const entry = (input as Partial<CompileFilesInput>).entry;
      const message: UpdateMessage = {
        ...envelope('update'),
        revision,
        source:
          files !== undefined
            ? { kind: 'files', files: { ...files }, ...(entry !== undefined ? { entry } : {}) }
            : { kind: 'code', code: (input as CompileInput).code },
        props: propsRef.current,
        options: {
          ...(input.filePath !== undefined ? { filePath: input.filePath } : {}),
          ...(input.production !== undefined ? { production: input.production } : {}),
          ...(input.jsxRuntime !== undefined ? { jsxRuntime: input.jsxRuntime } : {}),
          ...(input.jsxImportSource !== undefined ? { jsxImportSource: input.jsxImportSource } : {}),
          ...(input.resolveSubpaths !== undefined ? { resolveSubpaths: input.resolveSubpaths } : {}),
          keepLastGood: keepLastGoodRef.current,
          maxRendersPerSecond: maxRendersRef.current,
          captureConsole: input.onConsole !== undefined,
          forwardConsole: input.forwardConsole ?? true,
        },
      };
      latestUpdateRef.current = message;

      return new Promise<SandboxCompileResult>((resolve, reject) => {
        pendingRef.current.set(revision, { resolve, reject });
        input.signal?.addEventListener('abort', () => pendingRef.current.delete(revision), { once: true });
        handlers.current.postUpdate(message);
      });
    }, []);

    const task = useCompileTask<SandboxCompileResult>(
      {
        ...taskOptions,
        ...(code !== undefined ? { code } : {}),
        // The scheduler recompiles when capture turns on; the entries
        // themselves arrive from the iframe, not from this callback.
        ...(captureConsole ? { onConsole: IGNORE_CONSOLE } : {}),
      },
      run,
    );

    const compileIdRef = useRef(task.compileId);
    compileIdRef.current = task.compileId;

    // Tagged with the compile the error belongs to. An error from the iframe can
    // arrive right behind its `compiled` message, before this component has
    // re-rendered with the new compile id, so the id is looked up by revision.
    const recordRuntimeError = useCallback(
      (error: Error, compileId: number) => {
        if (!mountedRef.current) return;
        const last = lastRuntimeReport.current;
        if (last !== null && last.compileId === compileId && last.message === error.message) return;
        lastRuntimeReport.current = { compileId, message: error.message };
        setRuntimeError({ error, compileId });
        onError?.(error);
      },
      [onError],
    );

    const reportRuntimeError = useCallback(
      (error: Error) => recordRuntimeError(error, compileIdRef.current),
      [recordRuntimeError],
    );

    const onMessage = (message: ForwardedMessage) => {
      if (!mountedRef.current) return;
      switch (message.type) {
        case 'compiled': {
          if (message.revision !== revisionRef.current) return;
          resolvedRevisionRef.current = message.revision;
          compileIdByRevision.current.set(message.revision, compileIdRef.current + 1);
          compileIdByRevision.current.delete(message.revision - 50);
          const pending = pendingRef.current.get(message.revision);
          pendingRef.current.delete(message.revision);
          setHasCompiled(true);
          pending?.resolve({
            imports: message.imports,
            ...(message.via !== undefined ? { via: message.via } : {}),
            ...(message.entry !== undefined ? { entry: message.entry } : {}),
            ...(message.files !== undefined ? { files: message.files } : {}),
          });
          return;
        }
        case 'error': {
          const error = rehydrateError(message.error);
          if (message.phase === 'compile') {
            if (message.revision !== revisionRef.current) return;
            const pending = pendingRef.current.get(message.revision);
            pendingRef.current.delete(message.revision);
            pending?.reject(error);
            return;
          }
          if (message.revision === resolvedRevisionRef.current) {
            recordRuntimeError(error, compileIdByRevision.current.get(message.revision) ?? compileIdRef.current);
          }
          return;
        }
        case 'console':
          for (const entry of message.entries) {
            dispatchConsole({
              id: ++consoleIdRef.current,
              level: entry.level,
              method: entry.method,
              args: [],
              serialized: entry.serialized,
              timestamp: entry.timestamp,
              depth: entry.depth,
              compileId: compileIdByRevision.current.get(entry.revision) ?? compileIdRef.current + 1,
              ...(entry.file !== undefined ? { file: entry.file } : {}),
              ...(entry.line !== undefined ? { line: entry.line } : {}),
              ...(entry.column !== undefined ? { column: entry.column } : {}),
            });
          }
          return;
        case 'resize':
          setHeight(message.height);
          return;
      }
    };

    const onStatus = (next: BridgeStatus, error?: LiveSandboxError) => {
      if (!mountedRef.current) return;

      if (next === 'ready') {
        setStatus('ready');
        setConnectionError(null);
        // Whatever was compiled while connecting, or before a restart, goes now.
        const latest = latestUpdateRef.current;
        if (latest) postUpdate(latest);
        return;
      }

      if (next === 'unresponsive') {
        const time = Date.now();
        const recent = restartsRef.current.filter((at) => time - at < RESTART_WINDOW_MS);
        if (recent.length >= (configRef.current.maxRestarts ?? 3)) {
          restartLimitedRef.current = true;
          setStatus('failed');
          setConnectionError(
            toHostError(
              new LiveSandboxError(
                'restart-limit',
                `The sandbox froze ${recent.length + 1} times within a minute, so it is not being restarted again. ` +
                  'Change the code, or call reload() on the sandbox handle, to try again.',
              ),
            ),
          );
          return;
        }
        restartsRef.current = [...recent, time];
        setStatus('unresponsive');
        setConnectionError(error ? toHostError(error) : null);
        setHasCompiled(false);
        setRestartKey((key) => key + 1);
        return;
      }

      setStatus('failed');
      setConnectionError(error ? toHostError(error) : null);
    };

    const handlers = useRef({ postUpdate, onMessage, onStatus });
    handlers.current = { postUpdate, onMessage, onStatus };

    const attach = useCallback((iframe: HTMLIFrameElement, attributes: FrameAttributes) => {
      const current = configRef.current;
      setStatus('connecting');
      const bridge = createHostBridge({
        iframe,
        attributes,
        handshakeTimeoutMs: current.handshakeTimeoutMs ?? 10_000,
        pingIntervalMs: current.pingIntervalMs ?? 2_000,
        pongTimeoutMs: current.pongTimeoutMs ?? 5_000,
        maxHeight: current.maxHeight ?? 10_000,
        onMessage: (message) => handlers.current.onMessage(message),
        onStatus: (next, error) => handlers.current.onStatus(next, error),
      });
      bridgeRef.current = bridge;
      // A sandbox that finished loading before this effect ran has already
      // announced itself; ask again.
      bridge.probe();
      return () => {
        bridge.dispose();
        if (bridgeRef.current === bridge) bridgeRef.current = null;
      };
    }, []);

    const setProps = useCallback((next: Record<string, unknown>) => {
      if (shallowEqual(propsRef.current, next)) return;
      propsRef.current = next;
      const bridge = bridgeRef.current;
      if (!bridge?.connected || resolvedRevisionRef.current < 0) return;
      try {
        bridge.post({ ...envelope('props'), revision: resolvedRevisionRef.current, props: next });
        setPropsError(null);
      } catch (error) {
        setPropsError(toHostError(cloneError(error)));
      }
    }, []);

    const reload = useCallback(() => {
      restartLimitedRef.current = false;
      restartsRef.current = [];
      setConnectionError(null);
      setStatus('connecting');
      setHasCompiled(false);
      setRestartKey((key) => key + 1);
    }, []);

    const formatErrorRef = useRef(formatError);
    formatErrorRef.current = formatError;
    const stableFormatError = useCallback<FormatErrorFn>((error, position) => {
      const fn = formatErrorRef.current;
      if (!fn) return error.message;
      try {
        return fn(error, position);
      } catch (cause) {
        if (process.env.NODE_ENV !== 'production') console.warn('[next-live] formatError threw:', cause);
        return error.message;
      }
    }, []);
    const hasFormatError = formatError !== undefined;

    const activeRuntimeError =
      runtimeError !== null && runtimeError.compileId === task.compileId ? runtimeError.error : null;
    const error = connectionError ?? propsError ?? task.error ?? activeRuntimeError;

    const compileError = task.error;
    useEffect(() => {
      if (compileError) onError?.(compileError);
    }, [compileError, onError]);
    useEffect(() => {
      if (connectionError) onError?.(connectionError);
    }, [connectionError, onError]);

    const handle = useMemo<SandboxHandle>(() => ({ status, Frame: SandboxFrame, reload }), [status, reload]);
    const forwardedProps = componentProps ?? EMPTY_PROPS;

    const value = useMemo<LiveContextValue>(
      () => ({
        code: task.code,
        setCode: task.setCode,
        Component: null,
        element: null,
        error,
        isCompiling: task.isCompiling,
        compileId: task.compileId,
        ...(task.project ?? {}),
        props: forwardedProps,
        language,
        fallback,
        formatError: hasFormatError ? stableFormatError : undefined,
        reportRuntimeError,
        sandbox: handle,
      }),
      [
        task.code,
        task.setCode,
        error,
        task.isCompiling,
        task.compileId,
        task.project,
        forwardedProps,
        language,
        fallback,
        hasFormatError,
        stableFormatError,
        reportRuntimeError,
        handle,
      ],
    );

    const consoleValue = useMemo(
      () => ({ attach: attachConsole, compileId: task.compileId }),
      [attachConsole, task.compileId],
    );

    const control = useMemo<FrameControl>(
      () => ({
        attributes: frame.attributes,
        attributesKey: frame.key,
        restartKey,
        status,
        height,
        hasCompiled,
        attach,
        setProps,
      }),
      [frame, restartKey, status, height, hasCompiled, attach, setProps],
    );

    return (
      <LiveContext.Provider value={value}>
        <LiveConsoleContext.Provider value={consoleValue}>
          <FrameControlContext.Provider value={control}>{children}</FrameControlContext.Provider>
        </LiveConsoleContext.Provider>
      </LiveContext.Provider>
    );
  };
}
