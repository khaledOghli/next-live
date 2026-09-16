import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineLoader } from '../../src/core/resolver';
import { PROTOCOL_NS, RUNTIME_VERSION } from '../../src/sandbox/protocol/messages';
import { createSandboxRuntime } from '../../src/sandbox/runtime/core';
import type { SandboxRuntimeOptions } from '../../src/sandbox/runtime/core';

type Wire = { type: string; [key: string]: unknown };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.restoreAllMocks();
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, timeoutMs = 3000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await wait(5);
  }
}

/** A fake framed window for the runtime to live in, and helpers that play the host. */
function start(
  runtimeOptions: Partial<SandboxRuntimeOptions> = {},
  frame: { origin?: string; locationOrigin?: string; framed?: boolean } = {},
) {
  const parentPosts: Array<{ data: Wire; target: string }> = [];
  const parent = {
    postMessage: (data: Wire, target: string) => {
      parentPosts.push({ data, target });
    },
  };
  const win = Object.assign(new EventTarget(), {
    origin: frame.origin ?? 'null',
    location: { origin: frame.locationOrigin ?? 'https://sandbox.test' },
  }) as EventTarget & { parent: unknown };
  win.parent = frame.framed === false ? win : parent;

  const runtime = createSandboxRuntime({
    allowedOrigins: ['https://app.test'],
    window: win as unknown as Window,
    ...runtimeOptions,
  });
  runtime.start();
  cleanups.push(() => runtime.dispose());

  const connect = (fields: Record<string, unknown> = {}, origin = 'https://app.test') => {
    const channel = new MessageChannel();
    const received: Wire[] = [];
    channel.port1.onmessage = (event: MessageEvent<Wire>) => received.push(event.data);
    cleanups.push(() => channel.port1.close());
    win.dispatchEvent(
      Object.assign(new Event('message'), {
        data: { ns: PROTOCOL_NS, v: 1, type: 'init', session: 'session-1', host: '1.1.0', ...fields },
        origin,
        source: parent,
        ports: [channel.port2],
      }),
    );
    const send = (type: string, body: Record<string, unknown> = {}) =>
      channel.port1.postMessage({ ns: PROTOCOL_NS, v: 1, type, ...body });
    const of = (type: string) => received.filter((message) => message.type === type);
    return { received, send, of };
  };

  return { runtime, parentPosts, connect };
}

const update = (
  revision: number,
  code: string,
  options: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
) => ({ revision, source: { kind: 'code', code }, props, options });

describe('sandbox runtime: setup', () => {
  it('refuses to start without allowedOrigins', () => {
    expect(() => createSandboxRuntime({ allowedOrigins: [] })).toThrow(/needs `allowedOrigins`/);
  });

  it('announces itself to the single allowed origin', () => {
    const t = start();
    expect(t.parentPosts[0]).toEqual({
      data: { ns: PROTOCOL_NS, v: 1, type: 'ready', runtime: RUNTIME_VERSION },
      target: 'https://app.test',
    });
  });

  it('announces to any parent when several origins are allowed, since it cannot know which', () => {
    const t = start({ allowedOrigins: ['https://app.test', 'https://staging.app.test'] });
    expect(t.parentPosts[0]?.target).toBe('*');
  });

  it('explains itself instead of running when opened outside an iframe', () => {
    const t = start({}, { framed: false });
    expect(t.runtime.getSnapshot().notice).toMatch(/next-live sandbox/);
    expect(t.parentPosts).toHaveLength(0);
  });
});

describe('sandbox runtime: connecting', () => {
  it('ignores hosts that are not allowed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = start();
    const host = t.connect({}, 'https://evil.test');
    await wait(30);
    expect(host.received).toEqual([]);
  });

  it('confirms an allowed host with its session id', async () => {
    const onConnect = vi.fn();
    const t = start({ onConnect });
    const host = t.connect();
    await until(() => host.of('connected').length > 0);
    expect(host.of('connected')[0]).toMatchObject({ session: 'session-1', runtime: RUNTIME_VERSION });
    expect(onConnect).toHaveBeenCalledWith({ origin: 'https://app.test', hostVersion: '1.1.0' });
  });

  it('explains a protocol mismatch over the port', async () => {
    const t = start();
    const host = t.connect({ v: 2, host: '2.0.0' });
    await until(() => host.of('fatal').length > 0);
    expect(host.of('fatal')[0]).toMatchObject({ reason: 'protocol-mismatch', supported: [1] });
  });

  it('refuses a same-origin host when the frame is not sandboxed', async () => {
    const t = start({}, { origin: 'https://app.test', locationOrigin: 'https://app.test' });
    const host = t.connect({}, 'https://app.test');
    await until(() => host.of('fatal').length > 0);
    expect(host.of('fatal')[0]).toMatchObject({ reason: 'same-origin-refused' });
    expect(t.runtime.getSnapshot().notice).toMatch(/not isolated/);
  });

  it('allows that same-origin host only when explicitly told to', async () => {
    const t = start(
      { dangerouslyAllowSameOriginHost: true },
      { origin: 'https://app.test', locationOrigin: 'https://app.test' },
    );
    const host = t.connect({}, 'https://app.test');
    await until(() => host.of('connected').length > 0);
  });
});

describe('sandbox runtime: compiling', () => {
  it('compiles an update, reports it, and applies new props without remounting', async () => {
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);

    host.send('update', update(1, `export default (props: { label: string }) => props.label;`, {}, { label: 'a' }));
    await until(() => host.of('compiled').length > 0);
    expect(host.of('compiled')[0]).toMatchObject({ revision: 1, via: 'export default' });

    const first = t.runtime.getSnapshot();
    expect(first.renderable?.kind).toBe('component');
    expect(first.props).toEqual({ label: 'a' });

    host.send('props', { revision: 1, props: { label: 'b' } });
    await until(() => t.runtime.getSnapshot().props['label'] === 'b');
    expect(t.runtime.getSnapshot().mountKey).toBe(first.mountKey);
  });

  it('compiles a multi-file update', async () => {
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);
    host.send('update', {
      revision: 1,
      source: {
        kind: 'files',
        files: { 'App.tsx': `import { x } from './x';\nexport default () => x;`, 'x.ts': `export const x = 1;` },
      },
      props: {},
      options: {},
    });
    await until(() => host.of('compiled').length > 0);
    expect(host.of('compiled')[0]).toMatchObject({ entry: 'App.tsx', files: ['App.tsx', 'x.ts'] });
  });

  it('reports a compile error with its position', async () => {
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);
    host.send('update', update(1, `\nexport default () => (`));
    await until(() => host.of('error').length > 0);
    expect(host.of('error')[0]).toMatchObject({ revision: 1, phase: 'compile', error: { code: 'COMPILE' } });
  });

  it('reports only the newest revision when updates overlap', async () => {
    let release: () => void = () => {};
    const slow = defineLoader(() => new Promise((resolve) => { release = () => resolve({ value: 'slow' }); }));
    const t = start({ modules: { slow } });
    const host = t.connect();
    await until(() => host.of('connected').length > 0);

    host.send('update', update(1, `import { value } from 'slow';\nexport default () => value;`));
    host.send('update', update(2, `export default () => 'fast';`));
    await until(() => host.of('compiled').length > 0);
    release();
    await wait(30);
    expect(host.of('compiled').map((message) => message.revision)).toEqual([2]);
  });

  it('blanks the preview on a failed compile only when keepLastGood is off', async () => {
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);
    host.send('update', update(1, `export default () => 'ok';`));
    await until(() => host.of('compiled').length > 0);

    host.send('update', update(2, `export default (`, { keepLastGood: true }));
    await until(() => host.of('error').length > 0);
    expect(t.runtime.getSnapshot().renderable).not.toBeNull();

    host.send('update', update(3, `export default (`, { keepLastGood: false }));
    await until(() => host.of('error').length > 1);
    expect(t.runtime.getSnapshot().renderable).toBeNull();
  });

  it('forwards console output only when asked to', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);

    host.send('update', update(1, `console.log('quiet'); export default () => null;`));
    await until(() => host.of('compiled').length > 0);
    await wait(80);
    expect(host.of('console')).toEqual([]);

    host.send('update', update(2, `console.log('hi', { n: 1 }); export default () => null;`, { captureConsole: true, forwardConsole: false }));
    await until(() => host.of('console').length > 0);
    expect(host.of('console')[0]).toMatchObject({
      entries: [
        {
          revision: 2,
          method: 'log',
          serialized: [{ t: 'string', v: 'hi' }, { t: 'object', entries: [['n', { t: 'number', v: 1 }]] }],
        },
      ],
    });
  });

  it('answers pings, and reports render errors against the rendered revision', async () => {
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);

    host.send('ping', { seq: 7 });
    await until(() => host.of('pong').length > 0);
    expect(host.of('pong')[0]).toMatchObject({ seq: 7 });

    host.send('update', update(4, `export default () => null;`));
    await until(() => host.of('compiled').length > 0);
    t.runtime.reportRenderError(new TypeError('boom'));
    await until(() => host.of('error').length > 0);
    expect(host.of('error')[0]).toMatchObject({ revision: 4, phase: 'runtime', error: { code: 'RUNTIME', message: 'boom' } });
  });

  it('gives a render error the line it threw on, using the compile on screen', async () => {
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);

    const code = ['export default function App() {', '  const items = null;', '  return items.length;', '}'].join('\n');
    host.send('update', update(5, code));
    await until(() => host.of('compiled').length > 0);

    // A render error as the boundary would catch it: its stack names the
    // snippet's generated line, which the compile's own mapping turns back into
    // line 3 of what the author wrote.
    let thrown: unknown;
    try {
      const App = (t.runtime.getSnapshot().renderable as { kind: 'component'; component: () => unknown }).component;
      App();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);

    t.runtime.reportRenderError(thrown as Error);
    await until(() => host.of('error').length > 0);
    expect(host.of('error')[0]).toMatchObject({ revision: 5, phase: 'runtime', error: { code: 'RUNTIME', line: 3 } });
  });

  it('forgets everything on reset', async () => {
    const t = start();
    const host = t.connect();
    await until(() => host.of('connected').length > 0);
    host.send('update', update(1, `export default () => null;`));
    await until(() => host.of('compiled').length > 0);
    host.send('reset');
    await until(() => t.runtime.getSnapshot().renderable === null);
  });

  it('stops answering once disposed', async () => {
    const t = start();
    t.runtime.dispose();
    const host = t.connect();
    await wait(30);
    expect(host.received).toEqual([]);
  });
});
