import { afterEach, describe, expect, it } from 'vitest';
import type { LiveSandboxError } from '../../src/core/errors';
import { createHostBridge } from '../../src/sandbox/host/bridge';
import type { BridgeStatus, HostBridgeOptions } from '../../src/sandbox/host/bridge';
import { PROTOCOL_NS, RUNTIME_VERSION } from '../../src/sandbox/protocol/messages';

type Wire = { type: string; [key: string]: unknown };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, timeoutMs = 1500) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await wait(5);
  }
}

/** A host window, a fake iframe, and helpers that play the sandbox's side. */
function setup(overrides: Partial<HostBridgeOptions> = {}) {
  const hostWindow = Object.assign(new EventTarget(), { location: { origin: 'https://app.test' } });
  const posted: Array<{ data: Wire; origin: string; ports: MessagePort[] }> = [];
  const frameWindow = {
    postMessage: (data: Wire, origin: string, transfer: MessagePort[] = []) => {
      posted.push({ data, origin, ports: transfer });
    },
  };
  const statuses: Array<[BridgeStatus, LiveSandboxError | undefined]> = [];
  const messages: Wire[] = [];

  const bridge = createHostBridge({
    iframe: { contentWindow: frameWindow as unknown as Window },
    attributes: { expectedOrigin: 'null', src: 'https://app.test/sandbox' },
    hostWindow: hostWindow as never,
    handshakeTimeoutMs: 1000,
    pingIntervalMs: 20,
    pongTimeoutMs: 80,
    maxHeight: 1000,
    onMessage: (message) => messages.push(message as unknown as Wire),
    onStatus: (status, error) => statuses.push([status, error]),
    ...overrides,
  });
  cleanups.push(() => bridge.dispose());

  const dispatchReady = (fields: Record<string, unknown> = {}, from: { origin?: string; source?: unknown } = {}) =>
    hostWindow.dispatchEvent(
      Object.assign(new Event('message'), {
        data: { ns: PROTOCOL_NS, v: 1, type: 'ready', runtime: '1.1.0', ...fields },
        origin: from.origin ?? 'null',
        source: 'source' in from ? from.source : frameWindow,
      }),
    );

  const acceptInit = (options: { session?: string } = {}) => {
    const init = posted.find((entry) => entry.data.type === 'init');
    if (!init) throw new Error('The bridge never posted init');
    const port = init.ports[0] as MessagePort;
    const received: Wire[] = [];
    let answerPings = true;
    port.onmessage = (event: MessageEvent<Wire>) => {
      received.push(event.data);
      if (answerPings && event.data.type === 'ping') {
        port.postMessage({ ns: PROTOCOL_NS, v: 1, type: 'pong', seq: event.data['seq'] });
      }
    };
    port.postMessage({
      ns: PROTOCOL_NS,
      v: 1,
      type: 'connected',
      runtime: '1.1.0',
      session: options.session ?? init.data['session'],
    });
    cleanups.push(() => port.close());
    return {
      port,
      received,
      stopAnsweringPings: () => {
        answerPings = false;
      },
    };
  };

  return { bridge, posted, statuses, messages, dispatchReady, acceptInit };
}

describe('host bridge: handshake', () => {
  it('answers ready with init and a port, and is ready once the sandbox confirms', async () => {
    const t = setup();
    t.dispatchReady();

    expect(t.posted).toHaveLength(1);
    expect(t.posted[0]).toMatchObject({ origin: '*', data: { type: 'init', host: RUNTIME_VERSION } });
    expect(t.posted[0]?.ports).toHaveLength(1);

    t.acceptInit();
    await until(() => t.bridge.connected);
    expect(t.statuses.map(([status]) => status)).toEqual(['ready']);
  });

  it('addresses init to the exact origin when the frame keeps its real origin', () => {
    const t = setup({ attributes: { expectedOrigin: 'https://sandbox.test', src: 'https://sandbox.test/' } });
    t.dispatchReady({}, { origin: 'https://sandbox.test' });
    expect(t.posted[0]?.origin).toBe('https://sandbox.test');
  });

  it('ignores ready from another window or from an unexpected origin', () => {
    const t = setup();
    t.dispatchReady({}, { source: {} });
    t.dispatchReady({}, { source: null });
    t.dispatchReady({}, { origin: 'https://evil.test' });
    expect(t.posted).toHaveLength(0);
  });

  it('does not trust a connected message carrying another session id', async () => {
    const t = setup();
    t.dispatchReady();
    t.acceptInit({ session: 'forged' });
    await wait(40);
    expect(t.bridge.connected).toBe(false);
  });

  it('fails with a checklist when nothing answers in time', async () => {
    const t = setup({ handshakeTimeoutMs: 30 });
    await until(() => t.statuses.length > 0);
    const [status, error] = t.statuses[0] as [BridgeStatus, LiveSandboxError];
    expect(status).toBe('failed');
    expect(error).toMatchObject({ code: 'SANDBOX', reason: 'handshake-timeout' });
    expect(error.message).toContain('https://app.test/sandbox');
    expect(error.message).toContain('allowedOrigins include https://app.test');
  });

  it('fails when the sandbox runs another protocol version', () => {
    const t = setup();
    t.dispatchReady({ v: 2, runtime: '2.0.0' });
    expect(t.statuses[0]).toEqual(['failed', expect.objectContaining({ reason: 'protocol-mismatch' })]);
    expect(t.statuses[0]?.[1]?.message).toContain('2.0.0');
  });

  it('turns a fatal message from the sandbox into a failure', async () => {
    const t = setup();
    t.dispatchReady();
    const port = t.posted[0]?.ports[0] as MessagePort;
    cleanups.push(() => port.close());
    port.postMessage({ ns: PROTOCOL_NS, v: 1, type: 'fatal', reason: 'same-origin-refused', message: 'not isolated' });
    await until(() => t.statuses.length > 0);
    expect(t.statuses[0]).toEqual([
      'failed',
      expect.objectContaining({ reason: 'same-origin-refused', message: 'not isolated' }),
    ]);
  });

  it('probes the frame on request', () => {
    const t = setup();
    t.bridge.probe();
    expect(t.posted[0]).toMatchObject({ origin: '*', data: { type: 'probe' } });
  });
});

describe('host bridge: messaging', () => {
  it('refuses to post before the connection is confirmed', () => {
    const t = setup();
    t.dispatchReady();
    expect(t.bridge.post({ ns: PROTOCOL_NS, v: 1, type: 'reset' })).toBe(false);
  });

  it('delivers posts, and hands on only validated sandbox messages', async () => {
    const t = setup();
    t.dispatchReady();
    const sandbox = t.acceptInit();
    await until(() => t.bridge.connected);

    expect(t.bridge.post({ ns: PROTOCOL_NS, v: 1, type: 'reset' })).toBe(true);
    await until(() => sandbox.received.some((message) => message.type === 'reset'));

    sandbox.port.postMessage({ ns: PROTOCOL_NS, v: 1, type: 'compiled', revision: 1, imports: [], durationMs: 2 });
    sandbox.port.postMessage({ ns: PROTOCOL_NS, v: 1, type: 'compiled', revision: 'not a number' });
    sandbox.port.postMessage({ ns: PROTOCOL_NS, v: 1, type: 'resize', height: 5000 });
    await until(() => t.messages.length >= 2);

    expect(t.messages).toEqual([
      expect.objectContaining({ type: 'compiled', revision: 1 }),
      expect.objectContaining({ type: 'resize', height: 1000 }),
    ]);
  });

  it('lets a DataCloneError reach the caller for props that cannot be cloned', async () => {
    const t = setup();
    t.dispatchReady();
    t.acceptInit();
    await until(() => t.bridge.connected);
    expect(() =>
      t.bridge.post({ ns: PROTOCOL_NS, v: 1, type: 'props', revision: 1, props: { onClick: () => {} } }),
    ).toThrow(/clone/i);
  });
});

describe('host bridge: watchdog', () => {
  it('stays ready while the sandbox answers, and reports it unresponsive when it stops', async () => {
    const t = setup();
    t.dispatchReady();
    const sandbox = t.acceptInit();
    await until(() => t.bridge.connected);

    await wait(150);
    expect(t.statuses.map(([status]) => status)).toEqual(['ready']);
    expect(sandbox.received.some((message) => message.type === 'ping')).toBe(true);

    sandbox.stopAnsweringPings();
    await until(() => t.statuses.some(([status]) => status === 'unresponsive'), 2000);
    expect(t.statuses.at(-1)).toEqual(['unresponsive', expect.objectContaining({ reason: 'unresponsive' })]);
    expect(t.bridge.connected).toBe(false);
  });

  it('stops listening once disposed', () => {
    const t = setup();
    t.bridge.dispose();
    t.dispatchReady();
    expect(t.posted).toHaveLength(0);
  });
});
