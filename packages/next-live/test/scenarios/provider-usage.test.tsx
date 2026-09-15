// @vitest-environment jsdom
/**
 * Scenario: everything a host can do with the components, in a browser.
 *
 * These are the paths a real integration takes - a control panel that edits and
 * saves, a read-only runner, a custom toolbar built on `useLiveContext` - rather
 * than individual units. Several options documented as public (the `as`
 * wrapper, `LivePreview`'s prop merge, `resolveSubpaths` on the provider,
 * `useLiveContext` outside a provider) had no coverage at all before this file.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { LiveError } from '../../src/components/LiveError';
import { LiveErrorBoundary } from '../../src/components/LiveErrorBoundary';
import { useLiveContext } from '../../src/hooks/useLiveContext';

afterEach(cleanup);

const OK = `export default function App() { return <b data-testid="out">ok</b>; }`;
// Valid JSX body ("oops") but missing the closing `}` so compile fails.
const BROKEN = `export default function App() { return <b data-testid="out">oops</b>;`;

/** Waits for the first compile to land, which never happens during render. */
const settled = (text: string) =>
  waitFor(() => expect(screen.getByTestId('out').textContent).toBe(text), { timeout: 4000 });

describe('scenario: a read-only runner', () => {
  it('shows the fallback first, then the compiled component', async () => {
    render(
      <LiveProvider code={OK} fallback={<span data-testid="fb">loading</span>}>
        <LivePreview />
      </LiveProvider>,
    );

    // Nothing compiles during render, so the fallback is what the first paint
    // shows - the same thing the server rendered.
    expect(screen.getByTestId('fb')).toBeTruthy();
    await settled('ok');
    expect(screen.queryByTestId('fb')).toBeNull();
  });

  it('lets LivePreview override the provider fallback', () => {
    render(
      <LiveProvider code={OK} fallback={<span data-testid="provider-fb" />}>
        <LivePreview fallback={<span data-testid="preview-fb" />} />
      </LiveProvider>,
    );
    expect(screen.getByTestId('preview-fb')).toBeTruthy();
    expect(screen.queryByTestId('provider-fb')).toBeNull();
  });

  it('honours the `as` wrapper on LivePreview', async () => {
    const { container } = render(
      <LiveProvider code={OK}>
        <LivePreview as="section" className="wrap" />
      </LiveProvider>,
    );
    await settled('ok');
    expect(container.querySelector('section.wrap')).not.toBeNull();
  });
});

describe('scenario: passing host data into a snippet', () => {
  const GREET = `export default function App({ user, plan }) {
  return <b data-testid="out">{user.name}:{plan}</b>;
}`;

  it('merges LivePreview props over the provider props', async () => {
    render(
      <LiveProvider code={GREET} props={{ user: { name: 'ada' }, plan: 'free' }}>
        <LivePreview props={{ plan: 'pro' }} />
      </LiveProvider>,
    );
    await settled('ada:pro');
  });

  it('passes live objects by reference, so a snippet can mutate host state', async () => {
    const store = { count: 0 };
    const MUTATE = `export default function App({ store }) {
  store.count += 5;
  return <b data-testid="out">{store.count}</b>;
}`;

    render(
      <LiveProvider code={MUTATE} props={{ store }}>
        <LivePreview />
      </LiveProvider>,
    );

    await settled('5');
    // The host's own object was updated - not a structured clone of it.
    expect(store.count).toBe(5);
  });
});

describe('scenario: an author edits, breaks, and fixes a snippet', () => {
  it('keeps the last good component mounted while the code is broken', async () => {
    const { rerender } = render(
      <LiveProvider code={OK}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await settled('ok');

    rerender(
      <LiveProvider code={BROKEN}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    // The preview survives; the error is reported alongside it.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByTestId('out').textContent).toBe('ok');
  });

  it('blanks the preview instead when keepLastGood is off', async () => {
    const { rerender } = render(
      <LiveProvider code={OK} keepLastGood={false}>
        <LivePreview />
      </LiveProvider>,
    );
    await settled('ok');

    rerender(
      <LiveProvider code={BROKEN} keepLastGood={false}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('out')).toBeNull());
  });

  it('recovers on its own once the code is valid again', async () => {
    const FIXED = `export default function App() { return <b data-testid="out">fixed</b>; }`;
    const { rerender } = render(
      <LiveProvider code={BROKEN}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    rerender(
      <LiveProvider code={FIXED}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await settled('fixed');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('scenario: a snippet that throws while rendering', () => {
  const THROWS = `export default function App() { throw new Error('render boom'); }`;

  it('is contained, and the host tree survives', async () => {
    render(
      <div>
        <span data-testid="host">host is alive</span>
        <LiveProvider code={THROWS}>
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/render boom/));
    expect(screen.getByTestId('host')).toBeTruthy();
  });

  it('reports the error through onError as well', async () => {
    const onError = vi.fn();
    render(
      <LiveProvider code={THROWS} onError={onError}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect((onError.mock.calls[0][0] as Error).message).toMatch(/render boom/);
  });
});

describe('scenario: a custom UI built on useLiveContext', () => {
  function Toolbar() {
    const { isCompiling, error, compileId, language } = useLiveContext();
    return (
      <span data-testid="toolbar">
        {error ? 'error' : isCompiling ? 'compiling' : `compiled:${compileId}:${language}`}
      </span>
    );
  }

  it('reads provider state from anywhere inside the tree', async () => {
    render(
      <LiveProvider code={OK} language="jsx">
        <Toolbar />
        <LivePreview />
      </LiveProvider>,
    );
    await settled('ok');
    expect(screen.getByTestId('toolbar').textContent).toMatch(/compiled:\d+:jsx/);
  });

  it('throws a clear error when used outside a provider', () => {
    // Rendering this must fail loudly rather than hand back an empty context
    // that fails mysteriously three components later.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Toolbar />)).toThrow(/LiveProvider/i);
    spy.mockRestore();
  });
});

describe('scenario: LiveError rendering is customisable', () => {
  it('renders nothing at all when the snippet is healthy', async () => {
    render(
      <LiveProvider code={OK}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await settled('ok');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts a render function for the error', async () => {
    render(
      <LiveProvider code={BROKEN}>
        <LiveError>{(error) => <div data-testid="custom">caught: {error.message}</div>}</LiveError>
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('custom')).toBeTruthy());
  });
});

describe('scenario: LiveErrorBoundary reused in a custom preview', () => {
  function Boom(): React.ReactNode {
    throw new Error('kaboom');
  }

  it('catches, reports, and resets when resetKey changes', async () => {
    const onError = vi.fn();
    const { rerender } = render(
      <LiveErrorBoundary onError={onError} resetKey={1} fallback={<span data-testid="fb" />}>
        <Boom />
      </LiveErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('fb')).toBeTruthy();

    rerender(
      <LiveErrorBoundary onError={onError} resetKey={2} fallback={<span data-testid="fb" />}>
        <span data-testid="ok">recovered</span>
      </LiveErrorBoundary>,
    );
    await waitFor(() => expect(screen.getByTestId('ok')).toBeTruthy());
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('scenario: provider-level compile options reach the engine', () => {
  it('resolves subpaths when resolveSubpaths is set on the provider', async () => {
    // This prop is documented on <LiveProvider>; it reaches `compile` only
    // because CompileOptions declares it.
    render(
      <LiveProvider
        code={`import Button from 'kit/Button';\nexport default () => <Button/>;`}
        modules={{ kit: { Button: () => <b data-testid="out">sub</b> } }}
        resolveSubpaths
      >
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await settled('sub');
  });

  it('fails without it, rather than guessing', async () => {
    render(
      <LiveProvider
        code={`import Button from 'kit/Button';\nexport default () => <Button/>;`}
        modules={{ kit: { Button: () => <b /> } }}
      >
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/kit\/Button/));
  });

  it('injects scope values as free variables', async () => {
    render(
      <LiveProvider code={`export default () => <b data-testid="out">{greeting}</b>;`} scope={{ greeting: 'hi' }}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await settled('hi');
  });
});

describe('scenario: bad useEffect cleanup does not break the preview', () => {
  const BAD = `export default function App() {
  React.useEffect(() => []);
  return <i data-testid="ok" />;
}`;

  it('contains cleanup error without crashing the host tree', async () => {
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
    const { rerender, unmount } = render(
      <div>
        <p data-testid="host">host</p>
        <LiveProvider code={BAD} onError={onError}>
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </div>,
    );

    await waitFor(() => expect(screen.getByTestId('ok')).toBeTruthy(), { timeout: 4000 });

    rerender(
      <div>
        <p data-testid="host">host</p>
        <LiveProvider code={`${BAD}\n// edited`} onError={onError}>
          <LivePreview />
          <LiveError />
        </LiveProvider>
      </div>,
    );

    await waitFor(
      () => {
        expect(onError.mock.calls.length).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );

    expect(screen.getByTestId('host')).toBeTruthy();
    const errors = onError.mock.calls.map(([err]) => String(err));
    expect(
      errors.some((msg) => /destroy is not a function|cleanup function/i.test(msg)),
    ).toBe(true);
    unmount();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('scenario: runaway snippets are stopped', () => {
  it('trips the render-loop breaker instead of freezing the page', async () => {
    const LOOP = `import { useState, useEffect } from 'react';
export default function App() {
  const [n, setN] = useState(0);
  useEffect(() => { setN((v) => v + 1); });
  return <b data-testid="out">{n}</b>;
}`;

    render(
      <LiveProvider code={LOOP} maxRendersPerSecond={20}>
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(
      () => expect(screen.getByRole('alert').textContent).toMatch(/rendered more than/i),
      { timeout: 4000 },
    );
  });
});
