// @vitest-environment jsdom
/**
 * Scenario: `<LiveProvider sandbox>` as a host page uses it, with the test
 * playing the sandbox iframe over a real MessageChannel.
 *
 * The first promise of sandbox mode is negative: the host page never compiles
 * or evaluates a snippet. `compile` is mocked to fail loudly if it is ever called.
 */
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { LiveError } from '../../src/components/LiveError';
import { LiveEditor } from '../../src/components/LiveEditor';
import { LiveConsole } from '../../src/console/LiveConsole';
import { compile, compileModule } from '../../src/core/compile';
import { LiveSandboxError } from '../../src/core/errors';
import { PROTOCOL_NS } from '../../src/sandbox/protocol/messages';

vi.mock('../../src/core/compile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/compile')>();
  const refuse = () => {
    throw new Error('The host page compiled a snippet in sandbox mode.');
  };
  return { ...actual, compile: vi.fn(refuse), compileModule: vi.fn(refuse) };
});

type Wire = { type: string; [key: string]: unknown };

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanup();
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.restoreAllMocks();
});

const CODE = `export default function App() { return <b>hi</b>; }`;
const SANDBOX = { src: '/sandbox' };

/** Waits for the iframe, then answers the bridge's handshake the way mountSandbox would. */
async function connectSandbox() {
  const iframe = await waitFor(
    () => {
      const element = document.querySelector('iframe');
      if (!element) throw new Error('no iframe yet');
      return element;
    },
    { timeout: 4000 },
  );
  const frameWindow = iframe.contentWindow as Window;
  const posts: Array<{ data: Wire; ports: MessagePort[] }> = [];
  vi.spyOn(frameWindow, 'postMessage').mockImplementation(((data: Wire, _origin: string, transfer?: MessagePort[]) => {
    posts.push({ data, ports: transfer ?? [] });
  }) as never);

  window.dispatchEvent(
    new MessageEvent('message', {
      data: { ns: PROTOCOL_NS, v: 1, type: 'ready', runtime: '1.1.0' },
      origin: 'null',
      source: frameWindow,
    }),
  );

  const init = await waitFor(() => {
    const found = posts.find((post) => post.data.type === 'init');
    if (!found) throw new Error('no init yet');
    return found;
  });

  const port = init.ports[0] as MessagePort;
  const received: Wire[] = [];
  let answerPings = true;
  port.onmessage = (event: MessageEvent<Wire>) => {
    received.push(event.data);
    if (answerPings && event.data.type === 'ping') {
      port.postMessage({ ns: PROTOCOL_NS, v: 1, type: 'pong', seq: event.data['seq'] });
    }
  };
  cleanups.push(() => port.close());
  port.postMessage({ ns: PROTOCOL_NS, v: 1, type: 'connected', runtime: '1.1.0', session: init.data['session'] });

  const send = (type: string, body: Record<string, unknown> = {}) =>
    port.postMessage({ ns: PROTOCOL_NS, v: 1, type, ...body });
  const updates = () => received.filter((message) => message.type === 'update');

  return {
    iframe,
    received,
    send,
    updates,
    stopAnsweringPings: () => {
      answerPings = false;
    },
  };
}

describe('sandbox mode: the host page never runs snippets', () => {
  it('sends the code to the iframe and shows the fallback until it compiled there', async () => {
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0} fallback={<span data-testid="fallback">loading</span>}>
        <LivePreview />
      </LiveProvider>,
    );

    const sandbox = await connectSandbox();
    await waitFor(() => expect(sandbox.updates()).toHaveLength(1));
    expect(sandbox.updates()[0]).toMatchObject({
      revision: 1,
      source: { kind: 'code', code: CODE },
      options: { keepLastGood: true, captureConsole: false, maxRendersPerSecond: 1000 },
    });
    expect(screen.getByTestId('fallback')).toBeTruthy();

    sandbox.send('compiled', { revision: 1, imports: ['react/jsx-runtime'], via: 'export default', durationMs: 3 });
    await waitFor(() => expect(screen.queryByTestId('fallback')).toBeNull());

    expect(compile).not.toHaveBeenCalled();
    expect(compileModule).not.toHaveBeenCalled();
  });

  it('renders a locked-down iframe', async () => {
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX}>
        <LivePreview title="Snippet preview" />
      </LiveProvider>,
    );
    const { iframe } = await connectSandbox();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('title')).toBe('Snippet preview');
    expect(iframe.getAttribute('allow')).toContain("camera 'none'");
    expect(iframe.getAttribute('src')).toBe(new URL('/sandbox', window.location.href).href);
  });

  it('renders no iframe on the server', () => {
    const html = renderToString(
      <LiveProvider code={CODE} sandbox={SANDBOX}>
        <LivePreview fallback={<span>fallback</span>} />
      </LiveProvider>,
    );
    expect(html).not.toContain('<iframe');
  });
});

describe('sandbox mode: results from the iframe', () => {
  it('shows compile errors from the sandbox, with their position', async () => {
    const onError = vi.fn();
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0} onError={onError}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    const sandbox = await connectSandbox();
    await waitFor(() => expect(sandbox.updates()).toHaveLength(1));

    sandbox.send('error', {
      revision: 1,
      phase: 'compile',
      error: { code: 'COMPILE', message: 'Unexpected token', line: 2, column: 5 },
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Unexpected token'));
    expect(screen.getByRole('alert').textContent).toContain('2');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'COMPILE', line: 2 }));
  });

  it('shows runtime errors for the current compile and ignores stale ones', async () => {
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    const sandbox = await connectSandbox();
    await waitFor(() => expect(sandbox.updates()).toHaveLength(1));
    sandbox.send('compiled', { revision: 1, imports: [], durationMs: 1 });

    sandbox.send('error', { revision: 0, phase: 'runtime', error: { code: 'RUNTIME', message: 'old news' } });
    sandbox.send('error', { revision: 1, phase: 'runtime', error: { code: 'RUNTIME', message: 'x is undefined' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('x is undefined'));
    expect(screen.getByRole('alert').textContent).not.toContain('old news');
  });

  it('sends a new revision when the code is edited', async () => {
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0}>
        <LiveEditor />
        <LivePreview />
      </LiveProvider>,
    );
    const sandbox = await connectSandbox();
    await waitFor(() => expect(sandbox.updates()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Live code editor'), { target: { value: `export default () => 'edited';` } });
    await waitFor(() => expect(sandbox.updates()).toHaveLength(2));
    expect(sandbox.updates()[1]).toMatchObject({ revision: 2, source: { code: `export default () => 'edited';` } });
  });

  it('sends multi-file snippets as files', async () => {
    const files = { 'App.tsx': `import { x } from './x';\nexport default () => x;`, 'x.ts': `export const x = 1;` };
    render(
      <LiveProvider files={files} sandbox={SANDBOX} debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    const sandbox = await connectSandbox();
    await waitFor(() => expect(sandbox.updates()).toHaveLength(1));
    expect(sandbox.updates()[0]).toMatchObject({ source: { kind: 'files', files } });
  });

  it('turns console capture on for a mounted <LiveConsole> and shows what the sandbox logged', async () => {
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0}>
        <LivePreview />
        <LiveConsole />
      </LiveProvider>,
    );
    const sandbox = await connectSandbox();
    await waitFor(() => expect(sandbox.updates().at(-1)).toMatchObject({ options: { captureConsole: true } }));
    const revision = sandbox.updates().at(-1)?.['revision'];

    sandbox.send('console', {
      entries: [
        {
          revision,
          level: 'log',
          method: 'log',
          serialized: [{ t: 'string', v: 'hello from the iframe' }, { t: 'number', v: 42 }],
          timestamp: 1,
          depth: 0,
        },
      ],
    });
    await waitFor(() => expect(screen.getByRole('log').textContent).toBe('hello from the iframe 42'));
  });

  it('follows the content height the sandbox reports', async () => {
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    const sandbox = await connectSandbox();
    sandbox.send('resize', { height: 240 });
    await waitFor(() => expect(sandbox.iframe.style.height).toBe('240px'));
  });
});

describe('sandbox mode: props', () => {
  it('copies props into the update and sends changes without recompiling', async () => {
    const tree = (label: string) => (
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0}>
        <LivePreview props={{ label }} />
      </LiveProvider>
    );
    const { rerender } = render(tree('a'));
    const sandbox = await connectSandbox();
    await waitFor(() => expect(sandbox.updates()).toHaveLength(1));
    expect(sandbox.updates()[0]).toMatchObject({ props: { label: 'a' } });
    sandbox.send('compiled', { revision: 1, imports: [], durationMs: 1 });
    await waitFor(() => expect(document.querySelector('[data-next-live-sandbox]')).toBeTruthy());

    rerender(tree('b'));
    await waitFor(() =>
      expect(sandbox.received.filter((message) => message.type === 'props').at(-1)).toMatchObject({ props: { label: 'b' } }),
    );
    expect(sandbox.updates()).toHaveLength(1);
  });

  it('explains props that cannot cross into the iframe', async () => {
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} debounce={0}>
        <LivePreview props={{ onSave: () => {} }} />
        <LiveError />
      </LiveProvider>,
    );
    await connectSandbox();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cannot cross'));
  });
});

describe('sandbox mode: failures', () => {
  it('reports a sandbox page that never answers', async () => {
    const onError = vi.fn();
    render(
      <LiveProvider code={CODE} sandbox={{ src: '/sandbox', handshakeTimeoutMs: 50 }} onError={onError}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('did not answer'), { timeout: 4000 });
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(LiveSandboxError);
    expect(document.querySelector('[data-next-live-sandbox]')?.getAttribute('data-next-live-sandbox')).toBe('failed');
  });

  it('refuses allowSameOrigin for a same-origin sandbox, without rendering the iframe', async () => {
    render(
      <LiveProvider code={CODE} sandbox={{ src: '/sandbox', allowSameOrigin: true }}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('same origin'), { timeout: 4000 });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('replaces a frozen iframe with a fresh one', async () => {
    render(
      <LiveProvider code={CODE} sandbox={{ src: '/sandbox', pingIntervalMs: 20, pongTimeoutMs: 60 }} debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    const sandbox = await connectSandbox();
    sandbox.stopAnsweringPings();
    await waitFor(() => expect(document.querySelector('iframe')).not.toBe(sandbox.iframe), { timeout: 3000 });
  });

  it('warns that modules belong on the sandbox page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <LiveProvider code={CODE} sandbox={SANDBOX} modules={{ '@acme/ui': {} }}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignores modules')), { timeout: 4000 });
  });
});
