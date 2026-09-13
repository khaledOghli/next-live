// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveEditor } from '../../src/components/LiveEditor';

afterEach(cleanup);

function textarea(root: HTMLElement): HTMLTextAreaElement {
  const el = root.querySelector('textarea');
  if (!el) throw new Error('textarea not found');
  return el;
}

describe('LiveEditor keyboard', () => {
  it('does not intercept Cmd+Enter', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} />);
    const el = textarea(container);
    el.focus();
    const prevented = !fireEvent.keyDown(el, { key: 'Enter', metaKey: true });
    expect(prevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('AltGr [ does not indent (ctrl+alt+[)', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="[" onChange={onChange} tabSize={2} />);
    const el = textarea(container);
    el.focus();
    el.setSelectionRange(0, 0);
    fireEvent.keyDown(el, { key: '[', ctrlKey: true, altKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Shift+Alt+KeyF triggers format when format is set', async () => {
    const format = vi.fn(async (code: string) => ({ code: code.trim(), cursorOffset: 0 }));
    const { container } = render(
      <LiveEditor code="  x  " onChange={() => {}} format={format} />,
    );
    const el = textarea(container);
    el.focus();
    fireEvent.keyDown(el, { code: 'KeyF', key: 'F', shiftKey: true, altKey: true });
    await vi.waitFor(() => expect(format).toHaveBeenCalled());
  });

  it('advertises Escape-only shortcuts without format', () => {
    const { container } = render(<LiveEditor code="x" onChange={() => {}} />);
    expect(textarea(container).getAttribute('aria-keyshortcuts')).toBe('Escape');
  });

  it('Escape then Mod+] then Tab indents instead of leaving the editor', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="a\nb" onChange={onChange} tabSize={2} />);
    const el = textarea(container);
    el.focus();
    el.setSelectionRange(0, 2);

    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyDown(el, { key: ']', ctrlKey: true });
    fireEvent.keyDown(el, { key: 'Tab' });

    expect(document.activeElement).toBe(el);
    expect(onChange).toHaveBeenCalled();
  });

  it('Escape then Shift then Tab still exits instead of indenting', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} tabSize={2} />);
    const el = textarea(container);
    el.focus();
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyDown(el, { key: 'Shift', shiftKey: true });
    fireEvent.keyDown(el, { key: 'Tab', shiftKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape then Enter then Tab indents instead of leaving the editor', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} tabSize={2} />);
    const el = textarea(container);
    el.focus();
    el.setSelectionRange(2, 2);

    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: 'Tab' });

    expect(document.activeElement).toBe(el);
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('  ');
  });
});
