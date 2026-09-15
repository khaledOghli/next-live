import { compile } from '../../core/compile';
import { createRenderBudget } from '../../core/guards';
import { serializeError } from '../../core/serialize-error';
import { serializeValues } from '../../core/serialize-value';
import type { ConsoleEntry, LiveRenderable, LiveScope, ModuleRegistry, TransformFn } from '../../core/types';
import { envelope, PROTOCOL_VERSION, RUNTIME_VERSION } from '../protocol/messages';
import type { FatalReason, SandboxConsoleEntry, SandboxPortMessage, UpdateMessage } from '../protocol/messages';
import { normalizeAllowedOrigins, parseHostMessage, parseHostWindowMessage } from '../protocol/validate';

export interface SandboxRuntimeOptions {
  /**
   * The modules snippets may import, exactly as on `<LiveProvider modules>`.
   * They live here, inside the sandbox; the host page never sends any.
   */
  modules?: ModuleRegistry;
  /** Free variables for snippets, as on `<LiveProvider scope>`. */
  scope?: LiveScope;
  /** A custom transpile step, as on `<LiveProvider transform>`. */
  transform?: TransformFn;
  /**
   * Origins of the pages allowed to embed this sandbox and send it code, e.g.
   * `['https://app.example.com']`. Required: without it any website could
   * frame this page and run code in it. `'*'` accepts every origin and logs a
   * warning each time.
   */
  allowedOrigins: readonly string[] | '*';
  /**
   * Run even when the embedding page has the same origin as this one and did
   * not sandbox the frame, which means snippets could reach the host page.
   * Only for local debugging.
   */
  dangerouslyAllowSameOriginHost?: boolean;
  /** Largest snippet accepted, in characters, summed across files. Default 1 000 000. */
  maxCodeChars?: number;
  /** Most files accepted in one multi-file snippet. Default 200. */
  maxFiles?: number;
  /** Called each time a host page connects. */
  onConnect?: (info: { origin: string; hostVersion: string }) => void;
  /** The window the runtime lives in. For tests. */
  window?: Window;
}

export interface SandboxSnapshot {
  renderable: LiveRenderable | null;
  props: Record<string, unknown>;
  /** Changes whenever a new compile lands, which remounts and resets the error boundary. */
  mountKey: number;
  /** Shown instead of snippet output when the runtime cannot run at all. */
  notice: string | null;
}

export interface SandboxRuntime {
  start(): void;
  dispose(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): SandboxSnapshot;
  /** For the error boundary: an error thrown while rendering the snippet. */
  reportRenderError(error: unknown): void;
}

const ANNOUNCE_INTERVAL_MS = 250;
const ANNOUNCE_FOR_MS = 30_000;
const CONSOLE_FLUSH_MS = 50;
const CONSOLE_FLUSH_SIZE = 100;
const EMPTY_PROPS: Record<string, unknown> = {};

const isDev = () => process.env.NODE_ENV !== 'production';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The part of the sandbox that talks to the host and compiles what it sends.
 *
 * React-free on purpose: `mountSandbox` and `<LiveSandboxRoot>` both render
 * its snapshot, and the protocol logic can be tested without a DOM.
 */
export function createSandboxRuntime(options: SandboxRuntimeOptions): SandboxRuntime {
  const allowed = normalizeAllowedOrigins(options.allowedOrigins);

  let win: Window | undefined;
  let started = false;
  let disposed = false;

  let snapshot: SandboxSnapshot = { renderable: null, props: EMPTY_PROPS, mountKey: 0, notice: null };
  const listeners = new Set<() => void>();
  const setSnapshot = (patch: Partial<SandboxSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  let port: MessagePort | null = null;
  let latestRevision = -1;
  let renderedRevision = -1;
  let currentProps: Record<string, unknown> = EMPTY_PROPS;
  let controller: AbortController | null = null;

  let announceTimer: ReturnType<typeof setInterval> | undefined;
  let announceStop: ReturnType<typeof setTimeout> | undefined;
  let consoleQueue: SandboxConsoleEntry[] = [];
  let consoleTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let measurePending = false;
  let lastHeight = -1;

  const send = (message: SandboxPortMessage) => {
    if (!port) return;
    try {
      port.postMessage(message);
    } catch (error) {
      if (isDev()) console.warn('[next-live] The sandbox could not send a message to the host page:', error);
    }
  };

  const refuse = (target: MessagePort | undefined, reason: FatalReason, message: string) => {
    try {
      target?.postMessage({ ...envelope('fatal'), reason, message, supported: [PROTOCOL_VERSION] });
      target?.close();
    } catch {
      // Nothing more can be said to a host we cannot reach.
    }
  };

  const stopAnnouncing = () => {
    clearInterval(announceTimer);
    clearTimeout(announceStop);
    announceTimer = undefined;
  };

  // The runtime cannot know the parent's origin up front (the frame loads with
  // no referrer), so it announces itself. `ready` carries nothing sensitive;
  // with a single allowed origin it is addressed to that origin only.
  const announce = () => {
    const target = allowed !== '*' && allowed.length === 1 ? (allowed[0] as string) : '*';
    const post = () => {
      try {
        win?.parent.postMessage({ ...envelope('ready'), runtime: RUNTIME_VERSION }, target);
      } catch {
        // A parent on another origin than `target` simply does not receive it.
      }
    };
    post();
    announceTimer = setInterval(post, ANNOUNCE_INTERVAL_MS);
    announceStop = setTimeout(stopAnnouncing, ANNOUNCE_FOR_MS);
  };

  const flushConsole = () => {
    clearTimeout(consoleTimer);
    consoleTimer = undefined;
    if (consoleQueue.length === 0) return;
    const entries = consoleQueue;
    consoleQueue = [];
    send({ ...envelope('console'), entries });
  };

  // Arguments are serialized at the moment of the call: they have to be
  // cloneable to cross anyway, and this records what was logged rather than
  // what the object looks like by the time the batch is sent.
  const consoleForwarder = (revision: number) => (entry: ConsoleEntry) => {
    consoleQueue.push({
      revision,
      level: entry.level,
      method: entry.method,
      serialized: serializeValues(entry.args),
      timestamp: entry.timestamp,
      depth: entry.depth,
      ...(entry.file !== undefined ? { file: entry.file } : {}),
      ...(entry.line !== undefined ? { line: entry.line } : {}),
      ...(entry.column !== undefined ? { column: entry.column } : {}),
    });
    if (consoleQueue.length >= CONSOLE_FLUSH_SIZE) flushConsole();
    else if (consoleTimer === undefined) consoleTimer = setTimeout(flushConsole, CONSOLE_FLUSH_MS);
  };

  const measure = () => {
    const doc = win?.document;
    if (!doc || !port || disposed) return;
    const height = Math.ceil(doc.documentElement.scrollHeight);
    if (Math.abs(height - lastHeight) < 1) return;
    lastHeight = height;
    send({ ...envelope('resize'), height });
  };

  const scheduleMeasure = () => {
    if (measurePending) return;
    measurePending = true;
    const run = () => {
      measurePending = false;
      measure();
    };
    if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(run);
    else setTimeout(run, 16);
  };

  const reportRuntime = (error: unknown) => {
    send({
      ...envelope('error'),
      revision: Math.max(0, renderedRevision),
      phase: 'runtime',
      error: serializeError(error),
    });
  };

  const runUpdate = (message: UpdateMessage) => {
    const { revision, source, options: compileOptions } = message;
    latestRevision = revision;
    currentProps = message.props;

    // Only the newest code matters; anything still compiling is abandoned.
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const startedAt = now();

    const common = {
      signal: current.signal,
      ...(options.modules ? { modules: options.modules } : {}),
      ...(options.scope ? { scope: options.scope } : {}),
      ...(options.transform ? { transform: options.transform } : {}),
      onRender: createRenderBudget({ maxRenders: compileOptions.maxRendersPerSecond }),
      ...(compileOptions.filePath !== undefined ? { filePath: compileOptions.filePath } : {}),
      ...(compileOptions.production !== undefined ? { production: compileOptions.production } : {}),
      ...(compileOptions.jsxRuntime !== undefined ? { jsxRuntime: compileOptions.jsxRuntime } : {}),
      ...(compileOptions.jsxImportSource !== undefined ? { jsxImportSource: compileOptions.jsxImportSource } : {}),
      ...(compileOptions.resolveSubpaths !== undefined ? { resolveSubpaths: compileOptions.resolveSubpaths } : {}),
      ...(compileOptions.captureConsole
        ? { onConsole: consoleForwarder(revision), forwardConsole: compileOptions.forwardConsole }
        : {}),
    };

    const input =
      source.kind === 'code'
        ? { ...common, code: source.code }
        : { ...common, files: source.files, ...(source.entry !== undefined ? { entry: source.entry } : {}) };

    compile(input).then(
      (result) => {
        if (current.signal.aborted || revision !== latestRevision || disposed) return;
        renderedRevision = revision;
        setSnapshot({ renderable: result.renderable, props: currentProps, mountKey: snapshot.mountKey + 1 });
        send({
          ...envelope('compiled'),
          revision,
          imports: [...result.imports],
          via: result.via,
          durationMs: now() - startedAt,
          ...(result.entry !== undefined ? { entry: result.entry } : {}),
          ...(result.files !== undefined ? { files: [...result.files] } : {}),
        });
      },
      (error: unknown) => {
        if (current.signal.aborted || revision !== latestRevision || disposed) return;
        if (!compileOptions.keepLastGood) {
          renderedRevision = revision;
          setSnapshot({ renderable: null, mountKey: snapshot.mountKey + 1 });
        }
        send({ ...envelope('error'), revision, phase: 'compile', error: serializeError(error) });
      },
    );
  };

  const onPortMessage = (data: unknown) => {
    const message = parseHostMessage(data, {
      ...(options.maxCodeChars !== undefined ? { maxCodeChars: options.maxCodeChars } : {}),
      ...(options.maxFiles !== undefined ? { maxFiles: options.maxFiles } : {}),
    });
    if (!message) return;

    switch (message.type) {
      case 'ping':
        send({ ...envelope('pong'), seq: message.seq });
        return;
      case 'props':
        currentProps = message.props;
        if (message.revision >= renderedRevision) setSnapshot({ props: message.props });
        return;
      case 'reset':
        controller?.abort();
        renderedRevision = -1;
        currentProps = EMPTY_PROPS;
        setSnapshot({ renderable: null, props: EMPTY_PROPS, mountKey: snapshot.mountKey + 1 });
        return;
      case 'update':
        runUpdate(message);
        return;
    }
  };

  const connect = (next: MessagePort, session: string, origin: string, hostVersion: string) => {
    // A second host connection (a remount, hot reload, StrictMode) replaces the first.
    if (port) {
      port.onmessage = null;
      port.close();
    }
    controller?.abort();
    port = next;
    stopAnnouncing();
    port.onmessage = (event: MessageEvent) => onPortMessage(event.data);
    send({ ...envelope('connected'), runtime: RUNTIME_VERSION, session });
    lastHeight = -1;
    scheduleMeasure();
    try {
      options.onConnect?.({ origin, hostVersion });
    } catch {
      // The page's own callback is not the protocol's concern.
    }
  };

  const onWindowMessage = (event: MessageEvent) => {
    const current = win;
    if (!current || event.source !== current.parent) return;
    const message = parseHostWindowMessage(event.data);
    if (!message) return;

    if (allowed !== '*' && !allowed.includes(event.origin)) {
      if (isDev()) {
        console.warn(`[next-live] The sandbox ignored a connection from ${event.origin}, which is not in allowedOrigins.`);
      }
      return;
    }

    if (message.type === 'probe') {
      try {
        current.parent.postMessage({ ...envelope('ready'), runtime: RUNTIME_VERSION }, event.origin);
      } catch {
        // See announce().
      }
      return;
    }

    const incoming = event.ports?.[0];
    if (message.v !== PROTOCOL_VERSION) {
      refuse(
        incoming,
        'protocol-mismatch',
        `This sandbox runs next-live ${RUNTIME_VERSION} (protocol ${PROTOCOL_VERSION}), but the host page speaks protocol ${message.v} (next-live ${message.host}). Deploy the same next-live version to both pages.`,
      );
      return;
    }
    if (!incoming || event.ports.length !== 1) return;

    // An opaque origin ('null') means the frame is sandboxed. A real origin
    // equal to the host's means it is not, and a snippet could reach the host.
    if (!options.dangerouslyAllowSameOriginHost && current.origin !== 'null' && event.origin === current.location.origin) {
      refuse(
        incoming,
        'same-origin-refused',
        'The sandbox page has the same origin as the page embedding it and is not sandboxed, so snippets could reach the host page. Load it through <LiveProvider sandbox>, which adds the sandbox attribute, or serve it from another origin.',
      );
      setSnapshot({
        notice: 'next-live: this sandbox refused to run snippets because it is not isolated from the page embedding it.',
      });
      return;
    }

    connect(incoming, message.session, event.origin, message.host);
  };

  const onWindowError = (event: ErrorEvent) => reportRuntime(event.error ?? event.message);
  const onUnhandledRejection = (event: PromiseRejectionEvent) => reportRuntime(event.reason);

  return {
    start() {
      if (started || disposed) return;
      started = true;
      win = options.window ?? (typeof window !== 'undefined' ? window : undefined);
      if (!win) return;

      if (allowed === '*' && isDev()) {
        console.warn("[next-live] mountSandbox is accepting code from any website (allowedOrigins: '*'). List your own origins instead.");
      }

      if (win.parent === win) {
        setSnapshot({
          notice:
            'This page is a next-live sandbox. It runs code sent by the page that embeds it, so opened on its own it has nothing to show.',
        });
        return;
      }

      win.addEventListener('message', onWindowMessage);
      win.addEventListener('error', onWindowError);
      win.addEventListener('unhandledrejection', onUnhandledRejection);

      if (typeof ResizeObserver !== 'undefined' && win.document) {
        resizeObserver = new ResizeObserver(scheduleMeasure);
        resizeObserver.observe(win.document.documentElement);
      }

      announce();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stopAnnouncing();
      clearTimeout(consoleTimer);
      controller?.abort();
      resizeObserver?.disconnect();
      win?.removeEventListener('message', onWindowMessage);
      win?.removeEventListener('error', onWindowError);
      win?.removeEventListener('unhandledrejection', onUnhandledRejection);
      if (port) {
        port.onmessage = null;
        port.close();
        port = null;
      }
      listeners.clear();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return snapshot;
    },

    reportRenderError(error) {
      reportRuntime(error);
    },
  };
}
