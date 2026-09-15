// @vitest-environment jsdom
/**
 * Scenario: console capture through the provider, as a host wires it up.
 *
 * The contract being defended is mostly about what does *not* happen: no
 * capture until something asks, one compile rather than two when a panel mounts
 * alongside the provider, and no React warnings from a snippet that logs while
 * rendering.
 */
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { LiveConsole } from '../../src/console/LiveConsole';
import type { ConsoleEntry } from '../../src/core/types';

afterEach(cleanup);

beforeEach(() => {
  // Capture forwards to the real console by default; keep test output clean.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const settled = (text: string) =>
  waitFor(() => expect(screen.getByTestId('out').textContent).toBe(text), { timeout: 4000 });

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IDENTITY = `export default function App() {
  return <b data-testid="out">{String(console === globalThis.console)}</b>;
}`;

const LOGS = `console.log('module');
export default function App() { return <b data-testid="out">ok</b>; }`;

describe('scenario: console capture is opt-in', () => {
  it('gives the snippet the real console when nothing asks for output', async () => {
    render(
      <LiveProvider code={IDENTITY} debounce={0}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('true');
  });

  it('swaps the console in once a <LiveConsole> is mounted', async () => {
    render(
      <LiveProvider code={IDENTITY} debounce={0}>
        <LivePreview />
        <LiveConsole />
      </LiveProvider>,
    );
    await settled('false');
  });
});

describe('scenario: onConsole', () => {
  it('delivers entries tagged with the compile that produced them', async () => {
    const entries: ConsoleEntry[] = [];
    render(
      <LiveProvider code={LOGS} debounce={0} onConsole={(entry) => entries.push(entry)}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('ok');
    await waitFor(() => expect(entries).toHaveLength(1));
    expect(entries[0]).toMatchObject({ method: 'log', args: ['module'], compileId: 1, line: 1 });
  });

  it('does not recompile when the onConsole callback identity changes', async () => {
    const onCompileSuccess = vi.fn();
    const { rerender } = render(
      <LiveProvider code={LOGS} debounce={0} onConsole={() => {}} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('ok');
    rerender(
      <LiveProvider code={LOGS} debounce={0} onConsole={() => {}} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
      </LiveProvider>,
    );
    await pause(50);
    expect(onCompileSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('scenario: <LiveConsole>', () => {
  it('compiles exactly once when mounted together with the provider', async () => {
    const onCompileSuccess = vi.fn();
    render(
      <LiveProvider code={LOGS} debounce={0} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
        <LiveConsole />
      </LiveProvider>,
    );
    await settled('ok');
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('module'));
    await pause(50);
    expect(onCompileSuccess).toHaveBeenCalledTimes(1);
  });

  it('recompiles once for a late mount, and not again when it unmounts', async () => {
    const onCompileSuccess = vi.fn();
    const tree = (withConsole: boolean) => (
      <LiveProvider code={LOGS} debounce={0} onCompileSuccess={onCompileSuccess}>
        <LivePreview />
        {withConsole ? <LiveConsole /> : null}
      </LiveProvider>
    );

    const { rerender } = render(tree(false));
    await settled('ok');
    expect(onCompileSuccess).toHaveBeenCalledTimes(1);

    rerender(tree(true));
    await waitFor(() => expect(onCompileSuccess).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('module'));

    rerender(tree(false));
    await pause(50);
    expect(onCompileSuccess).toHaveBeenCalledTimes(2);
  });

  it('shows output logged during render without React warnings', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <LiveProvider
        code={`export default function App() { console.log('rendering'); return <b data-testid="out">ok</b>; }`}
        debounce={0}
      >
        <LivePreview />
        <LiveConsole />
      </LiveProvider>,
    );
    await settled('ok');
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('rendering'));
    const warnings = errors.mock.calls.map((call) => String(call[0]));
    expect(warnings.filter((text) => /Cannot update a component/.test(text))).toEqual([]);
  });

  it('formats substitutions and values', async () => {
    render(
      <LiveProvider
        code={`console.log('%s has %d items', 'cart', 3, { a: 1 });
export default function App() { return <b data-testid="out">ok</b>; }`}
        debounce={0}
      >
        <LivePreview />
        <LiveConsole />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('log').textContent).toBe('cart has 3 items {a: 1}'));
  });

  it('marks late output from replaced code as stale instead of dropping it', async () => {
    const V1 = `setTimeout(() => console.log('late'), 150);
export default function App() { return <b data-testid="out">v1</b>; }`;
    const V2 = `export default function App() { return <b data-testid="out">v2</b>; }`;
    const tree = (code: string) => (
      <LiveProvider code={code} debounce={0}>
        <LivePreview />
        <LiveConsole />
      </LiveProvider>
    );

    const { rerender } = render(tree(V1));
    await settled('v1');
    rerender(tree(V2));
    await settled('v2');

    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('late'), { timeout: 2000 });
    const row = screen.getByRole('log').querySelector('[data-method="log"]');
    expect(row?.hasAttribute('data-stale')).toBe(true);
  });

  it('filters by level', async () => {
    render(
      <LiveProvider
        code={`console.info('info'); console.error('boom');
export default function App() { return <b data-testid="out">ok</b>; }`}
        debounce={0}
      >
        <LivePreview />
        <LiveConsole levels={['error']} />
      </LiveProvider>,
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await waitFor(() => expect(screen.getByRole('log').textContent).toBe('boom'));
  });

  it('clears on demand and shows the empty state', async () => {
    render(
      <LiveProvider code={LOGS} debounce={0}>
        <LivePreview />
        <LiveConsole emptyState={<span data-testid="empty">nothing yet</span>} />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('module'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear console' }));
    expect(screen.getByTestId('empty')).toBeTruthy();
  });

  it('is an accessible log region that stays quiet unless asked to announce', () => {
    render(
      <LiveProvider code={LOGS}>
        <LiveConsole aria-label="Snippet output" />
      </LiveProvider>,
    );
    const log = screen.getByRole('log', { name: 'Snippet output' });
    expect(log.getAttribute('aria-live')).toBe('off');
  });

  it('renders empty on the server without errors', () => {
    const html = renderToString(
      <LiveProvider code={LOGS}>
        <LiveConsole emptyState="empty" />
      </LiveProvider>,
    );
    expect(html).toContain('role="log"');
    expect(html).toContain('empty');
  });
});
