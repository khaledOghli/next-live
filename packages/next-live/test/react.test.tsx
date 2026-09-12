// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveProvider } from '../src/components/LiveProvider';
import { LivePreview } from '../src/components/LivePreview';
import { LiveError } from '../src/components/LiveError';
import { useLiveModule } from '../src/hooks/useLiveModule';
import { useLiveRunner } from '../src/hooks/useLiveRunner';
import { LiveEditor, type LiveEditorRenderProps } from '../src/components/LiveEditor';
import type { CompileSuccessInfo } from '../src/core/types';

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

    // The error appears, but the previously good output is still on screen -
    // otherwise a live editor would blank out on every half-typed keystroke.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByTestId('out')).toBeTruthy();
  });

  it('drops the previous preview when filePath changes (tab switch)', async () => {
    const snippetA = `export default function A() { return <b data-testid="a">A</b>; }`;
    const snippetB = `export default function B() { return <b data-testid="b">B</b>; }`;

    const { rerender } = render(
      <LiveProvider code={snippetA} filePath="a.tsx">
        <LivePreview fallback={<span data-testid="loading">loading</span>} />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('a')).toBeTruthy(), { timeout: 4000 });

    rerender(
      <LiveProvider code={snippetB} filePath="b.tsx">
        <LivePreview fallback={<span data-testid="loading">loading</span>} />
      </LiveProvider>,
    );

    expect(screen.queryByTestId('a')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('b')).toBeTruthy(), { timeout: 4000 });
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

  it('does not report the same runtime error twice for one compile', async () => {
    const onError = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <LiveProvider
        code={`export default function Boom() { throw new Error('kaboom'); }`}
        onError={onError}
      >
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(onError).toHaveBeenCalledTimes(1);

    rerender(
      <LiveProvider
        code={`export default function Boom() { throw new Error('kaboom'); }`}
        onError={onError}
      >
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(onError).toHaveBeenCalledTimes(1);
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

  it(
    'stops a runaway effect loop and keeps the page alive',
    async () => {
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
    },
    10_000,
  );
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

describe('onCodeChange', () => {
  it('fires when the code is edited from inside', async () => {
    const seen: string[] = [];

    function Harness() {
      const { setCode } = useLiveRunner({
        code: 'export default () => <b>a</b>;',
        onCodeChange: (next) => seen.push(next),
      });
      return <button onClick={() => setCode('export default () => <b>b</b>;')}>edit</button>;
    }

    render(<Harness />);
    screen.getByText('edit').click();

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toContain('<b>b</b>');
  });

  it('does not fire when the code prop changes from outside', async () => {
    const seen: string[] = [];
    const Harness = ({ code }: { code: string }) => {
      useLiveRunner({ code, onCodeChange: (next) => seen.push(next) });
      return null;
    };

    const { rerender } = render(<Harness code="export default () => <b>a</b>;" />);
    rerender(<Harness code="export default () => <b>b</b>;" />);

    // Echoing the host's own update back at it would make a save loop.
    await waitFor(() => expect(seen).toEqual([]));
  });
});

describe('onCompileSuccess', () => {
  it('fires once with imports and durationMs after a successful compile', async () => {
    const seen: CompileSuccessInfo[] = [];

    render(
      <LiveProvider
        code={`import { useState } from 'react';\nexport default function App() { useState(0); return <b data-testid="ok">ok</b>; }`}
        onCompileSuccess={(info) => seen.push(info)}
        debounce={0}
      >
        <LivePreview />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('ok')).toBeTruthy(), { timeout: 4000 });
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]?.imports).toContain('react');
    expect(seen[0]?.durationMs).toBeTypeOf('number');
    expect(seen[0]?.compileId).toBeGreaterThan(0);
  });

  it('does not fire on a syntax error', async () => {
    const seen: CompileSuccessInfo[] = [];

    render(
      <LiveProvider
        code={`export default () => <div>`}
        onCompileSuccess={(info) => seen.push(info)}
        debounce={0}
      >
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(seen).toEqual([]);
  });

  it('still fires when keepLastGood preserves the previous result', async () => {
    const seen: CompileSuccessInfo[] = [];

    const { rerender } = render(
      <LiveProvider
        code={`export default () => <b data-testid="ok">ok</b>;`}
        onCompileSuccess={(info) => seen.push(info)}
        debounce={0}
      >
        <LivePreview />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('ok')).toBeTruthy(), { timeout: 4000 });
    const firstCount = seen.length;

    rerender(
      <LiveProvider
        code={`export default () => <div>`}
        onCompileSuccess={(info) => seen.push(info)}
        debounce={0}
      >
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(seen.length).toBe(firstCount);
  });

  it('survives a throwing callback', async () => {
    render(
      <LiveProvider
        code={`export default () => <b data-testid="ok">ok</b>;`}
        onCompileSuccess={() => {
          throw new Error('host blew up');
        }}
        debounce={0}
      >
        <LivePreview />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('ok')).toBeTruthy(), { timeout: 4000 });
  });

  it('fires for useLiveModule', async () => {
    const seen: CompileSuccessInfo[] = [];

    function Harness() {
      useLiveModule({
        code: `export const answer = 42;`,
        onCompileSuccess: (info) => seen.push(info),
        debounce: 0,
      });
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 4000 });
  });
});

describe('LiveEditor error highlight', () => {
  it('highlights the syntax error line', async () => {
    const broken = `const a = 1;\nexport default () => <div>`;

    const { container } = render(
      <LiveProvider code={broken} debounce={0}>
        <LiveEditor />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });

    const lines = container.querySelectorAll('pre[aria-hidden="true"] > div');
    expect(lines[1]?.getAttribute('style')).toContain('179, 38, 30');
    expect(lines[0]?.getAttribute('style') ?? '').not.toContain('179, 38, 30');
  });

  it('passes error position to renderEditor', async () => {
    const broken = `const a = 1;\nexport default () => <div>`;
    let props: LiveEditorRenderProps | null = null;

    render(
      <LiveProvider code={broken} debounce={0}>
        <LiveEditor
          renderEditor={(renderProps) => {
            props = renderProps;
            return null;
          }}
        />
      </LiveProvider>,
    );

    await waitFor(() => expect(props?.errorLine).toBe(2), { timeout: 4000 });
    expect(props?.error).toBeTruthy();
  });

  it('opts out with errorLineStyle={null}', async () => {
    const broken = `export default () => <div>`;

    const { container } = render(
      <LiveProvider code={broken} debounce={0}>
        <LiveEditor errorLineStyle={null} />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
    expect(container.querySelector('pre[aria-hidden="true"] [style*="179, 38, 30"]')).toBeNull();
  });

  it('does not highlight line 1 for errors without a position', async () => {
    render(
      <LiveProvider
        code={`export default () => { throw new Error('boom'); };`}
        debounce={0}
      >
        <LiveEditor />
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 4000 });
  });
});

/**
 * WCAG 2.1.2 (No Keyboard Trap, Level A) and 2.4.7 (Focus Visible, Level AA).
 *
 * These guard a real regression: the editor used to swallow Tab with a comment
 * claiming Escape released it, and no Escape handler existed. A keyboard-only
 * user who entered the editor could not leave it.
 */
describe('LiveEditor keyboard accessibility', () => {
  const area = (container: HTMLElement) =>
    container.querySelector('textarea') as HTMLTextAreaElement;

  it('inserts spaces on Tab by default', () => {
    const onChange = vi.fn();
    const { container } = render(
      <LiveEditor code="ab" onChange={onChange} tabSize={2} />,
    );
    const el = area(container);
    el.setSelectionRange(1, 1);

    fireEvent.keyDown(el, { key: 'Tab' });

    expect(onChange).toHaveBeenCalledWith('a  b');
  });

  it('releases Tab after Escape, so focus can leave', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} />);
    const el = area(container);

    fireEvent.keyDown(el, { key: 'Escape' });
    const tab = fireEvent.keyDown(el, { key: 'Tab' });

    // Not swallowed: the browser is free to move focus.
    expect(tab).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('releases Tab after Escape for Shift+Tab too, so focus can go backwards', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} />);
    const el = area(container);

    fireEvent.keyDown(el, { key: 'Escape' });
    // A real browser fires the modifier's own keydown first; it must not
    // disarm the exit.
    fireEvent.keyDown(el, { key: 'Shift', shiftKey: true });
    fireEvent.keyDown(el, { key: 'Tab', shiftKey: true });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('re-arms indentation once typing resumes after Escape', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} />);
    const el = area(container);
    el.setSelectionRange(2, 2);

    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyDown(el, { key: 'x' });
    fireEvent.keyDown(el, { key: 'Tab' });

    expect(onChange).toHaveBeenCalledWith('ab  ');
  });

  it('re-arms indentation after focus leaves and returns', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} />);
    const el = area(container);
    el.setSelectionRange(2, 2);

    act(() => el.focus());
    fireEvent.keyDown(el, { key: 'Escape' });
    act(() => el.blur());
    act(() => el.focus());
    fireEvent.keyDown(el, { key: 'Tab' });

    expect(onChange).toHaveBeenCalledWith('ab  ');
  });

  it('never swallows Tab when read-only, since there is nothing to indent', () => {
    const { container } = render(<LiveEditor code="ab" />);
    expect(fireEvent.keyDown(area(container), { key: 'Tab' })).toBe(true);
  });

  it('announces the escape hatch, which 2.1.2 requires when it is not obvious', () => {
    const { container } = render(<LiveEditor code="ab" onChange={() => {}} />);
    const el = area(container);
    const hintId = el.getAttribute('aria-describedby');

    expect(el.getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(hintId).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(hintId as string)}`)?.textContent)
      .toMatch(/Escape/);
  });

  it('does not advertise a Tab hint on a read-only editor', () => {
    const { container } = render(<LiveEditor code="ab" />);
    expect(area(container).getAttribute('aria-describedby')).toBeNull();
  });

  it('paints a focus ring on focus and drops it on blur', () => {
    const { container } = render(<LiveEditor code="ab" onChange={() => {}} />);
    const el = area(container);
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper.getAttribute('style') ?? '').not.toContain('outline: 2px');
    // A real focus(), not fireEvent.focus: the ring is gated on
    // `:focus-visible`, which only matches an element that genuinely holds
    // focus. Synthesising the event alone would test nothing.
    act(() => el.focus());
    expect(wrapper.getAttribute('style')).toContain('outline: 2px');
    act(() => el.blur());
    expect(wrapper.getAttribute('style') ?? '').not.toContain('outline: 2px');
  });

  it('opts out of the ring with focusRingStyle={null}', () => {
    const { container } = render(
      <LiveEditor code="ab" onChange={() => {}} focusRingStyle={null} />,
    );
    const el = area(container);
    act(() => el.focus());
    expect(
      (container.firstElementChild as HTMLElement).getAttribute('style') ?? '',
    ).not.toContain('outline: 2px');
  });
});

describe('LiveEditor standalone', () => {
  it('renders highlighted code with no provider above it', () => {
    const { container } = render(<LiveEditor code={'const x = 1;'} language="tsx" />);

    expect(container.querySelector('textarea')?.value).toBe('const x = 1;');
    // Highlighting actually ran, rather than falling back to plain text.
    expect(container.querySelectorAll('pre[aria-hidden="true"] span').length)
      .toBeGreaterThan(1);
  });

  it('is read-only without onChange, and editable with it', () => {
    const { container: ro } = render(<LiveEditor code="a" />);
    expect(ro.querySelector('textarea')?.readOnly).toBe(true);

    const onChange = vi.fn();
    const { container: rw } = render(<LiveEditor code="a" onChange={onChange} />);
    expect(rw.querySelector('textarea')?.readOnly).toBe(false);

    fireEvent.change(rw.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'ab' },
    });
    expect(onChange).toHaveBeenCalledWith('ab');
  });

  it('explains itself when given neither a provider nor code', () => {
    // React logs the thrown error; silence it so the run stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<LiveEditor />)).toThrow(/needs either a surrounding/);
    spy.mockRestore();
  });

  it('underlines a caller-supplied error, for hosts compiling elsewhere', () => {
    // errorPosition reads `line`/`column` off the error, not its stack.
    const error = Object.assign(new Error('bad'), { line: 2, column: 1 });
    const { container } = render(
      <LiveEditor code={'a\nb'} error={error} />,
    );

    const lines = container.querySelectorAll('pre[aria-hidden="true"] > div');
    expect(lines[1]?.getAttribute('style')).toContain('179, 38, 30');
  });

  it('still takes code and edits from the provider when used inside one', async () => {
    render(
      <LiveProvider code={COUNTER} debounce={0}>
        <LiveEditor />
      </LiveProvider>,
    );

    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain(
        'useState',
      ),
    );
  });
});
