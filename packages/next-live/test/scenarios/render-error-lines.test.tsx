// @vitest-environment jsdom
/**
 * Scenario: a snippet that throws while *rendering* (not while evaluating),
 * and a host that wants the line it threw on.
 *
 * Evaluation errors have always carried `line`, `column` and `file`. Render
 * errors reach `<LivePreview>`'s boundary after the compile has finished, so the
 * provider keeps the line mapping of the compile it is showing and applies it
 * there. These tests hold that mapping to the compile actually on screen.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { LiveProvider } from '../../src/components/LiveProvider';
import { LivePreview } from '../../src/components/LivePreview';
import { LiveError } from '../../src/components/LiveError';
import { LiveRuntimeError } from '../../src/core/errors';
import { defineLoader } from '../../src/core/resolver';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

// Throws on line 3, only while rendering.
const BROKEN = `export default function Broken() {
  const items = null;
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}`;

describe('scenario: a render-time error in a single snippet', () => {
  it('shows the line it threw on in <LiveError>', async () => {
    quiet();
    render(
      <LiveProvider code={BROKEN} filePath="Broken.tsx">
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/^Line 3(:\d+)? - Cannot read properties of null/), {
      timeout: 4000,
    });
  });

  it('hands onError a LiveRuntimeError with the position, keeping the original as cause', async () => {
    quiet();
    const onError = vi.fn();
    render(
      <LiveProvider code={BROKEN} filePath="Broken.tsx" onError={onError}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(onError).toHaveBeenCalled(), { timeout: 4000 });

    const error = onError.mock.calls[0]?.[0] as LiveRuntimeError;
    expect(error).toBeInstanceOf(LiveRuntimeError);
    expect(error.line).toBe(3);
    expect(error.message).toMatch(/reading 'map'/);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('reports one error per compile, not one per render attempt', async () => {
    quiet();
    const onError = vi.fn();
    render(
      <LiveProvider code={BROKEN} filePath="Broken.tsx" onError={onError}>
        <LivePreview />
      </LiveProvider>,
    );
    await waitFor(() => expect(onError).toHaveBeenCalled(), { timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('scenario: a render-time error in a multi-file snippet', () => {
  it('names the file and the line within it', async () => {
    quiet();
    const onError = vi.fn();
    render(
      <LiveProvider
        files={{
          'App.tsx': `import { List } from './List';\nexport default function App() {\n  return <List />;\n}`,
          'List.tsx': `export function List() {\n  const items = null;\n  return <ul>{items.map((i) => <li>{i}</li>)}</ul>;\n}`,
        }}
        entry="App.tsx"
        onError={onError}
      >
        <LivePreview />
        <LiveError />
      </LiveProvider>,
    );
    await waitFor(() => expect(onError).toHaveBeenCalled(), { timeout: 4000 });

    const error = onError.mock.calls[0]?.[0] as LiveRuntimeError;
    expect(error.file).toBe('List.tsx');
    expect(error.line).toBe(3);
  });
});

describe('scenario: a slow compile that finishes after it was replaced', () => {
  it('keeps the line mapping of the compile on screen', async () => {
    quiet();
    let release: (value: unknown) => void = () => {};
    const modules = { slow: defineLoader(() => new Promise((resolve) => (release = resolve))) };
    const onError = vi.fn();

    // Two lines: its mapping cannot place anything on line 7.
    const slow = `import value from 'slow';\nexport default () => <b>{String(value)}</b>;`;
    // Renders fine until `boom` is passed, then throws on line 7.
    const current = [
      'export default function Current({ boom }) {',
      '  const a = 1;',
      '  const b = 2;',
      '  const c = 3;',
      '  const d = 4;',
      '  if (!boom) return <b data-testid="out">ok</b>;',
      '  throw new Error("line seven");',
      '}',
    ].join('\n');

    const view = (code: string, boom: boolean) => (
      <LiveProvider code={code} modules={modules} onError={onError} debounce={0}>
        <LivePreview props={{ boom }} />
        <LiveError />
      </LiveProvider>
    );

    const { rerender } = render(view(slow, false));
    await new Promise((resolve) => setTimeout(resolve, 50));

    rerender(view(current, false));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('ok'), { timeout: 4000 });

    // The replaced compile finishes now, after the current one is on screen.
    // Whatever stops it (the engine's abort checks, or the runner's own), its
    // mapping must not replace the one for the component being shown.
    await act(async () => {
      release({ default: 'late' });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    rerender(view(current, true));
    await waitFor(() => expect(onError).toHaveBeenCalled(), { timeout: 4000 });
    expect((onError.mock.calls[0]?.[0] as LiveRuntimeError).line).toBe(7);
  });
});
