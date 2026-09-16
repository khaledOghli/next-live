// @vitest-environment jsdom
/**
 * Scenario: an app in React Strict Mode, which is what `next dev` runs.
 *
 * In development Strict Mode mounts every component, unmounts it, and mounts it
 * again. Before 1.2 `<LiveErrorBoundary>` marked itself unmounted on the
 * simulated unmount and never marked itself mounted again, so it ignored every
 * error after that: a snippet that threw while rendering left a blank preview
 * and no message, on the very dev server people build docs with.
 */
import * as React from 'react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { LiveError } from '../../src/components/LiveError';
import { LiveErrorBoundary } from '../../src/components/LiveErrorBoundary';
import { LiveRuntimeError } from '../../src/core/errors';
import { errorPosition } from '../../src/core/positions';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// React logs every error a boundary catches; keep the run quiet.
const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

const BROKEN = `export default function Broken() {
  const items = null;
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}`;
const FIXED = `export default function Fixed() {
  return <ul data-testid="out"><li>fixed</li></ul>;
}`;

/** Renders fine, then throws once `boom` is set: an error that comes after mounting. */
function ThrowsLater({ boom }: { boom: boolean }): React.ReactNode {
  if (boom) throw new Error('render boom');
  return <span data-testid="healthy" />;
}

describe('scenario: <LiveErrorBoundary> under Strict Mode', () => {
  it('still reports an error thrown after the simulated remount', () => {
    silenceErrors();
    const onError = vi.fn();
    const view = (boom: boolean) => (
      <StrictMode>
        <LiveErrorBoundary onError={onError} resetKey={0} fallback={<span data-testid="fallback" />}>
          <ThrowsLater boom={boom} />
        </LiveErrorBoundary>
      </StrictMode>
    );

    const { rerender } = render(view(false));
    expect(screen.getByTestId('healthy')).toBeTruthy();

    rerender(view(true));
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: 'render boom' });
    expect(screen.getByTestId('fallback')).toBeTruthy();
  });

  it('leaves logging to React, so one caught error is logged once', () => {
    const logged = silenceErrors();
    const onError = vi.fn();
    const view = (boom: boolean) => (
      <LiveErrorBoundary onError={onError} resetKey={0}>
        <ThrowsLater boom={boom} />
      </LiveErrorBoundary>
    );

    const { rerender } = render(view(false));
    logged.mockClear();
    rerender(view(true));

    expect(onError).toHaveBeenCalledTimes(1);
    const ownLogs = logged.mock.calls.filter((args) => args.some((arg) => typeof arg === 'string' && arg.includes('next-live')));
    expect(ownLogs).toEqual([]);
  });

  it('stops reporting once it has really unmounted', () => {
    const onError = vi.fn();
    const boundary = new LiveErrorBoundary({ onError, resetKey: 0, children: null });
    boundary.componentDidMount();
    boundary.componentWillUnmount();

    boundary.componentDidCatch(new Error('late'));
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('scenario: a provider under Strict Mode', () => {
  it('shows a render-time error in <LiveError> instead of a blank preview', async () => {
    silenceErrors();
    const onError = vi.fn();
    render(
      <StrictMode>
        <LiveProvider code={BROKEN} filePath="Broken.tsx" onError={onError}>
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/reading 'map'/), { timeout: 4000 });
    await waitFor(() => expect(onError).toHaveBeenCalled(), { timeout: 4000 });

    const error = onError.mock.calls.at(-1)?.[0] as LiveRuntimeError;
    expect(error).toBeInstanceOf(LiveRuntimeError);
    expect(error.line).toBe(3);
    expect(errorPosition(error)).toEqual(expect.objectContaining({ line: 3 }));
    expect(screen.getByRole('alert').textContent).toMatch(/Line 3/);
  });

  it('maps a render-time error in a helper file', async () => {
    silenceErrors();
    const onError = vi.fn();
    render(
      <StrictMode>
        <LiveProvider
          files={{
            'App.tsx': `import { Broken } from './Card';\nexport default function App() { return <Broken />; }`,
            'Card.tsx': `export function Broken() {\n  const items = null;\n  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;\n}`,
          }}
          onError={onError}
        >
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(onError).toHaveBeenCalled(), { timeout: 4000 });
    const error = onError.mock.calls.at(-1)?.[0] as LiveRuntimeError;
    expect(error.file).toBe('Card.tsx');
    expect(error.line).toBe(3);
  });

  it('recovers when the snippet is fixed', async () => {
    silenceErrors();
    const view = (code: string) => (
      <StrictMode>
        <LiveProvider code={code} filePath="Demo.tsx">
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </StrictMode>
    );

    const { rerender } = render(view(BROKEN));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });

    rerender(view(FIXED));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('fixed'), { timeout: 4000 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a working snippet without a render loop', async () => {
    const renders = vi.fn();
    render(
      <StrictMode>
        <LiveProvider code={`export default function App() { onRender(); return <b data-testid="out">ok</b>; }`} scope={{ onRender: renders }}>
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('ok'), { timeout: 4000 });
    expect(screen.queryByRole('alert')).toBeNull();
    // Strict Mode renders twice in development; anything more would be a loop.
    expect(renders.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
