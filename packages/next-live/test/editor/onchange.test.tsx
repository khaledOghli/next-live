// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveEditor } from '../../src/components/LiveEditor';
import { replaceRange } from '../../src/editor/text-edit';

afterEach(cleanup);

function textarea(root: HTMLElement): HTMLTextAreaElement {
  const el = root.querySelector('textarea');
  if (!el) throw new Error('textarea not found');
  return el;
}

describe('replaceRange', () => {
  it('does not double-insert when execCommand returns false after mutating value', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'ab';
    document.body.appendChild(textarea);
    textarea.focus();

    const originalExecCommand = document.execCommand;
    const execCommand = vi.fn(() => {
      textarea.value = 'xy';
      return false;
    });
    document.execCommand = execCommand as typeof document.execCommand;

    try {
      replaceRange(textarea, 0, 2, 'xy');
      expect(textarea.value).toBe('xy');
    } finally {
      document.execCommand = originalExecCommand;
      textarea.remove();
    }
  });

  it('uses shadow-root activeElement for focus detection', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const textarea = document.createElement('textarea');
    textarea.value = 'ab';
    shadow.appendChild(textarea);
    document.body.appendChild(host);
    textarea.focus();

    replaceRange(textarea, 0, 2, 'xy');
    expect(textarea.value).toBe('xy');
    host.remove();
  });
});

describe('LiveEditor onChange count', () => {
  it('fires once per typed character', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="a" onChange={onChange} />);
    const el = textarea(container);
    el.focus();
    el.setSelectionRange(1, 1);
    fireEvent.input(el, { target: { value: 'ab' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ab');
  });

  it('fires once on Tab indent', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="ab" onChange={onChange} tabSize={2} />);
    const el = textarea(container);
    el.focus();
    el.setSelectionRange(1, 1);
    fireEvent.keyDown(el, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires once on Enter auto-indent', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code={'  foo'} onChange={onChange} />);
    const el = textarea(container);
    el.focus();
    el.setSelectionRange(5, 5);
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires once on Mod+] block indent', () => {
    const onChange = vi.fn();
    const { container } = render(<LiveEditor code="a\nb" onChange={onChange} tabSize={2} />);
    const el = textarea(container);
    el.focus();
    el.setSelectionRange(0, 3);
    fireEvent.keyDown(el, { key: ']', ctrlKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires once on insertText via handle', () => {
    const onChange = vi.fn();
    const ref = { current: null as import('../../src/components/LiveEditor').LiveEditorHandle | null };
    const { container } = render(
      <LiveEditor ref={ref} code="hi" onChange={onChange} />,
    );
    textarea(container).focus();
    ref.current?.insertText('!');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
