import { LiveSandboxError } from '../../core/errors';
import type { LiveSandboxErrorReason } from '../../core/errors';
import { envelope, PROTOCOL_VERSION, RUNTIME_VERSION } from '../protocol/messages';
import type { HostPortMessage, SandboxPortMessage } from '../protocol/messages';
import { parseReadyMessage, parseSandboxMessage } from '../protocol/validate';
import type { FrameAttributes } from './attrs';

export type BridgeStatus = 'ready' | 'unresponsive' | 'failed';

/** Messages the bridge hands on; the handshake and heartbeat ones it handles itself. */
export type ForwardedMessage = Exclude<SandboxPortMessage, { type: 'connected' | 'pong' | 'fatal' }>;

export interface HostBridgeOptions {
  iframe: Pick<HTMLIFrameElement, 'contentWindow'>;
  attributes: Pick<FrameAttributes, 'expectedOrigin' | 'src'>;
  /** The host page's window. For tests. */
  hostWindow?: Pick<Window, 'addEventListener' | 'removeEventListener'> & { location?: { origin: string } };
  handshakeTimeoutMs: number;
  pingIntervalMs: number;
  pongTimeoutMs: number;
  maxHeight: number;
  onMessage: (message: ForwardedMessage) => void;
  /**
   * `ready` once connected (again, after a sandbox reload). `unresponsive` and
   * `failed` are final: the bridge has shut down, and a new iframe with a new
   * bridge is needed.
   */
  onStatus: (status: BridgeStatus, error?: LiveSandboxError) => void;
}

export interface HostBridge {
  /**
   * Sends a message to the sandbox. Returns false while not connected. Throws
   * the browser's `DataCloneError` for values that cannot be cloned.
   */
  post(message: HostPortMessage): boolean;
  readonly connected: boolean;
  /** Asks a sandbox that may already be running to announce itself again. */
  probe(): void;
  dispose(): void;
}

const randomId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/**
 * The host side of the connection to one sandbox iframe.
 *
 * Handshake: the sandbox posts `ready` on the window; the bridge checks it came
 * from *this* iframe and from the expected origin, then transfers one end of a
 * fresh `MessageChannel` in `init`. The sandbox confirms with `connected`
 * carrying the same random session id. From then on everything uses the port.
 */
export function createHostBridge(options: HostBridgeOptions): HostBridge {
  const { iframe, attributes, handshakeTimeoutMs, pingIntervalMs, pongTimeoutMs, maxHeight, onMessage, onStatus } =
    options;
  const hostWindow = options.hostWindow ?? window;
  const hostOrigin = hostWindow.location?.origin ?? 'this page';
  // An opaque frame's origin is 'null', which postMessage cannot target; the
  // port and session id are what keep the conversation private in that case.
  const targetOrigin = attributes.expectedOrigin === 'null' ? '*' : attributes.expectedOrigin;

  let port: MessagePort | null = null;
  let connected = false;
  let finished = false;
  let seq = 0;
  let waitingSince: number | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const closePort = () => {
    if (!port) return;
    port.onmessage = null;
    port.close();
    port = null;
  };

  const stop = () => {
    finished = true;
    connected = false;
    clearTimeout(handshakeTimer);
    clearInterval(heartbeat);
    hostWindow.removeEventListener('message', onWindowMessage as EventListener);
    closePort();
  };

  const fail = (reason: LiveSandboxErrorReason, message: string) => {
    if (finished) return;
    stop();
    onStatus('failed', new LiveSandboxError(reason, message));
  };

  const handshakeTimer = setTimeout(() => {
    if (connected) return;
    fail(
      'handshake-timeout',
      `The sandbox page at ${attributes.src} did not answer within ${handshakeTimeoutMs} ms. Check that:\n` +
        '- the page loads when you open it directly in a browser tab;\n' +
        '- it calls mountSandbox() or renders <LiveSandboxRoot>;\n' +
        `- its allowedOrigins include ${hostOrigin};\n` +
        '- its Content-Security-Policy frame-ancestors (or an X-Frame-Options header) allows this page to frame it;\n' +
        "- this page's Content-Security-Policy frame-src allows it.",
    );
  }, handshakeTimeoutMs);

  const post = (message: HostPortMessage): boolean => {
    if (!port || !connected || finished) return false;
    port.postMessage(message);
    return true;
  };

  const startHeartbeat = () => {
    clearInterval(heartbeat);
    waitingSince = null;
    heartbeat = setInterval(() => {
      if (!connected || finished) return;
      // Background tabs throttle timers; a late pong there is not a hang.
      if (typeof document !== 'undefined' && document.hidden) {
        waitingSince = null;
        return;
      }
      const time = Date.now();
      if (waitingSince !== null) {
        if (time - waitingSince >= pongTimeoutMs) {
          stop();
          onStatus(
            'unresponsive',
            new LiveSandboxError(
              'unresponsive',
              'The sandbox stopped responding, most likely because the snippet is stuck in an endless loop.',
            ),
          );
        }
        return;
      }
      waitingSince = time;
      seq += 1;
      try {
        post({ ...envelope('ping'), seq });
      } catch {
        // A ping is plain data; there is nothing it could fail to clone.
      }
    }, pingIntervalMs);
  };

  const onPortMessage = (data: unknown, session: string) => {
    if (finished) return;
    const message = parseSandboxMessage(data, { maxHeight });
    if (!message) return;

    switch (message.type) {
      case 'connected':
        if (message.session !== session) return;
        connected = true;
        clearTimeout(handshakeTimer);
        startHeartbeat();
        onStatus('ready');
        return;
      case 'pong':
        waitingSince = null;
        return;
      case 'fatal':
        fail(message.reason, message.message || 'The sandbox refused the connection.');
        return;
      default:
        if (connected) onMessage(message);
    }
  };

  const handshake = () => {
    const frame = iframe.contentWindow;
    if (!frame) return;
    closePort();
    connected = false;
    clearInterval(heartbeat);

    const channel = new MessageChannel();
    const session = randomId();
    port = channel.port1;
    port.onmessage = (event: MessageEvent) => onPortMessage(event.data, session);

    try {
      frame.postMessage({ ...envelope('init'), session, host: RUNTIME_VERSION }, targetOrigin, [channel.port2]);
    } catch (error) {
      fail('load-failed', `Could not reach the sandbox frame: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const onWindowMessage = (event: MessageEvent) => {
    if (finished) return;
    const frame = iframe.contentWindow;
    if (!frame || event.source !== frame) return;
    const ready = parseReadyMessage(event.data);
    if (!ready) return;

    if (event.origin !== attributes.expectedOrigin) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[next-live] Ignored a sandbox message from ${event.origin}; expected ${attributes.expectedOrigin}.`,
        );
      }
      return;
    }

    if (ready.v !== PROTOCOL_VERSION) {
      fail(
        'protocol-mismatch',
        `This page runs next-live ${RUNTIME_VERSION} (protocol ${PROTOCOL_VERSION}), but the sandbox page runs next-live ${ready.runtime} (protocol ${ready.v}). Deploy the same next-live version to both pages.`,
      );
      return;
    }

    // Also the path for a sandbox that reloaded itself: a fresh `ready` from
    // the same frame gets a fresh port.
    handshake();
  };

  hostWindow.addEventListener('message', onWindowMessage as EventListener);

  return {
    post,
    get connected() {
      return connected;
    },
    probe() {
      if (finished) return;
      try {
        iframe.contentWindow?.postMessage({ ...envelope('probe') }, targetOrigin);
      } catch {
        // The frame is not there yet; its own `ready` will arrive instead.
      }
    },
    dispose() {
      if (finished) return;
      stop();
    },
  };
}
