// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveEditor } from '../../src/components/LiveEditor';

afterEach(cleanup);

function textarea(root: HTMLElement): HTMLTextAreaElement {
  const el = root.querySelector('textarea');
  if (!el) throw new Error('textarea not found');
  return el;
}

describe('LiveEditor format safety', () => {
  it('drops stale format results when value changed', async () => {
    let resolveFormat!: (v: { code: string; cursorOffset: number }) => void;
    const format = vi.fn(
      () =>
        new Promise<{ code: string; cursorOffset: number }>((resolve) => {
          resolveFormat = resolve;
        }),
    );
    const onChange = vi.fn();
    const { container, rerender } = render(
      <LiveEditor code="old" onChange={onChange} format={format} />,
    );
    const el = textarea(container);
    el.focus();
    fireEvent.keyDown(el, { code: 'KeyF', key: 'F', shiftKey: true, altKey: true });

    rerender(<LiveEditor code="changed" onChange={onChange} format={format} />);
    await act(async () => {
      resolveFormat({ code: 'formatted', cursorOffset: 9 });
    });

    await waitFor(() => expect(format).toHaveBeenCalled());
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
    expect(el.value).toBe('changed');
  });

  it('does not write when formatted equals snapshot', async () => {
    const format = vi.fn(async (code: string) => ({ code, cursorOffset: 0 }));
    const onChange = vi.fn();
    const { container } = render(
      <LiveEditor code="same" onChange={onChange} format={format} />,
    );
    const el = textarea(container);
    el.focus();
    fireEvent.keyDown(el, { code: 'KeyF', key: 'F', shiftKey: true, altKey: true });
    await waitFor(() => expect(format).toHaveBeenCalled());
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
  });

  it('formatOnBlur does not steal focus from external button', async () => {
    const format = vi.fn(async (code: string) => ({ code: code.trim(), cursorOffset: code.trim().length }));
    const onChange = vi.fn();
    const { container } = render(
      <div>
        <LiveEditor code="  x  " onChange={onChange} format={format} formatOnBlur />
        <button type="button">outside</button>
      </div>,
    );
    const el = textarea(container);
    const btn = container.querySelector('button')!;
    el.focus();
    btn.focus();
    await waitFor(() => expect(format).toHaveBeenCalled());
    expect(document.activeElement).toBe(btn);
    expect(document.activeElement).not.toBe(el);
  });

  it('applies only the latest format when two run in quick succession', async () => {
    let resolveFirst!: (v: { code: string; cursorOffset: number }) => void;
    let resolveSecond!: (v: { code: string; cursorOffset: number }) => void;
    let call = 0;
    const format = vi.fn(
      () =>
        new Promise<{ code: string; cursorOffset: number }>((resolve) => {
          if (call++ === 0) resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
    );
    const onChange = vi.fn();
    const { container } = render(
      <LiveEditor code="x" onChange={onChange} format={format} />,
    );
    const el = textarea(container);
    el.focus();
    fireEvent.keyDown(el, { code: 'KeyF', key: 'F', shiftKey: true, altKey: true });
    fireEvent.keyDown(el, { code: 'KeyF', key: 'F', shiftKey: true, altKey: true });

    await act(async () => {
      resolveSecond({ code: 'second', cursorOffset: 6 });
      resolveFirst({ code: 'first', cursorOffset: 5 });
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('second'));
    expect(onChange).not.toHaveBeenCalledWith('first');
  });
});
