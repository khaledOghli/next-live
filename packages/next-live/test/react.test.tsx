// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveProvider } from '../src/components/LiveProvider';
import { LivePreview } from '../src/components/LivePreview';
import { LiveError } from '../src/components/LiveError';
import { useLiveModule } from '../src/hooks/useLiveModule';

afterEach(cleanup);

const COUNTER = `import { useState } from 'react';
export default function App() {
  const [n] = useState(1);
  return <b data-testid="out">count {n}</b>;
}
`;

describe('server rendering', () => {
  /**
   * The regression this guards: `react-live` compiles during the server pass,
   * so the server and client produce different trees and React reports
   * hydration errors #418/#425. Rendering the fallback on both passes is what
   * makes a mismatch impossible.
   */
  it('renders only the fallback on the server, never the compiled output', () => {
    const html = renderToStaticMarkup(
      <LiveProvider code={COUNTER} fallback={<span>loading</span>}>
        <LivePreview />
      </LiveProvider>,
    );

    expect(html).toContain('loading');
    expect(html).not.toContain('count');
  });

  it('produces the same first client render as the server render', () => {
    const server = renderToStaticMarkup(
      <LiveProvider code={COUNTER} fallback={<span>loading</span>}>
        <LivePreview />
      </LiveProvider>,
    );

    const { container } = render(
      <LiveProvider code={COUNTER} fallback={<span>loading</span>}>
        <LivePreview />
      </LiveProvider>,
    );

    // Compilation starts in an effect, so the very first paint still matches.
    expect(container.innerHTML).toBe(server);
  });
});

describe('compiling in the browser', () => {
  it('renders the compiled component after mount', async () => {
    render(
      <LiveProvider code={COUNTER}>
        <LivePreview />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('count 1'), {
      timeout: 4000,
    });
  });

  it('passes props into the component by reference', async () => {
    const store = { hits: 0 };
    render(
      <LiveProvider
        code={`export default ({ store }) => { store.hits++; return <b data-testid="out">{store.hits}</b>; };`}
        props={{ store }}
      >
        <LivePreview />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('out')).toBeTruthy(), { timeout: 4000 });
    // The snippet mutated the host's own object, not a clone.
    expect(store.hits).toBeGreaterThan(0);
  });
});

describe('error handling', () => {
  it('surfaces a compile error through <LiveError>', async () => {
    render(
      <LiveProvider code={`export default () => <div>`}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
  });

  it('keeps the last working component mounted when a recompile fails', async () => {
    const { rerender } = render(
      <LiveProvider code={COUNTER}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('out')).toBeTruthy(), { timeout: 4000 });

    rerender(
      <LiveProvider code={`export default () => <div>`}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    // The error appears, but the previously good output is still on screen —
    // otherwise a live editor would blank out on every half-typed keystroke.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByTestId('out')).toBeTruthy();
  });

  it('contains a throwing snippet instead of unmounting the host tree', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <span data-testid="host">host survives</span>
        <LiveProvider code={`export default function Boom() { throw new Error('kaboom'); }`}>
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByTestId('host').textContent).toBe('host survives');
    expect(screen.getByRole('alert').textContent).toContain('kaboom');
  });

  it('recovers when the snippet is fixed', async () => {
    const { rerender } = render(
      <LiveProvider code={`export default () => <div>`} keepLastGood={false}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });

    rerender(
      <LiveProvider code={COUNTER} keepLastGood={false}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('out')).toBeTruthy(), { timeout: 4000 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stops a runaway effect loop and keeps the page alive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <span data-testid="host">host survives</span>
        <LiveProvider
          // React's own "Maximum update depth" guard does not catch this shape:
          // the updates are not nested during render, they are one per commit.
          code={`import { useState, useEffect } from 'react';
export default function Loop() {
  const [n, setN] = useState(0);
  useEffect(() => { setN((v) => v + 1); });
  return <b>{n}</b>;
}`}
          maxRendersPerSecond={40}
        >
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </div>,
    );

    await waitFor(
      () => expect(screen.getByRole('alert').textContent).toMatch(/rendered more than/),
      { timeout: 8000 },
    );
    expect(screen.getByTestId('host').textContent).toBe('host survives');
  });
});

describe('useLiveModule', () => {
  function Probe({ code }: { code: string }) {
    const { exports, error } = useLiveModule({ code });
    if (error) return <span data-testid="err">{error.message}</span>;
    if (!exports) return <span data-testid="pending">pending</span>;
    const validate = exports['validate'] as ((n: number) => boolean) | undefined;
    return <span data-testid="out">{String(validate?.(5))}</span>;
  }

  it('returns exports for a snippet that is not a component', async () => {
    render(<Probe code={`export function validate(n) { return n > 0; }`} />);
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('true'), {
      timeout: 4000,
    });
  });

  it('renders nothing on the server pass, like the component hook', () => {
    const html = renderToStaticMarkup(
      <Probe code={`export function validate(n) { return n > 0; }`} />,
    );
    // Same hydration guarantee: no evaluation during the server render.
    expect(html).toContain('pending');
  });

  it('surfaces errors instead of throwing', async () => {
    render(<Probe code={`export function validate(n) { return n > 0 }` + '\n@@@'} />);
    await waitFor(() => expect(screen.getByTestId('err')).toBeTruthy(), { timeout: 4000 });
  });
});
