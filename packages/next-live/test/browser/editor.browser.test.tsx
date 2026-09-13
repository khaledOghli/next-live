/**
 * Real-browser LiveEditor checks.
 *
 * Manual release checklist (cannot fully automate paste in Firefox/WebKit):
 * - Firefox #375: Ctrl+A then paste in the playground editor must replace all content.
 * - #409: paste multi-line text 5× with caret at end; no duplication or cursor jump.
 */
import { cleanup, render } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveEditor, type LiveEditorHandle } from '../../src/components/LiveEditor';

afterEach(cleanup);

function textarea(root: HTMLElement): HTMLTextAreaElement {
  const el = root.querySelector('textarea');
  if (!el) throw new Error('textarea not found');
  return el;
}

function modKey(): 'Meta' | 'Control' {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) ? 'Meta' : 'Control';
}

function isChromium(): boolean {
  return /Chrom(e|ium)/i.test(navigator.userAgent);
}

async function pasteText(el: HTMLTextAreaElement, text: string): Promise<void> {
  if (isChromium()) {
    try {
      await navigator.clipboard.writeText(text);
      await userEvent.keyboard(`{${modKey()}>}v{/${modKey()}}`);
      return;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') throw error;
    }
  }

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  valueSetter?.call(el, next);
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      data: text,
      inputType: 'insertFromPaste',
    }),
  );
}

function StatefulEditor(
  props: Omit<ComponentProps<typeof LiveEditor>, 'code' | 'onChange'> & {
    initial: string;
    onChange?: (value: string) => void;
  },
) {
  const { initial, onChange, ...rest } = props;
  const [code, setCode] = useState(initial);
  return (
    <LiveEditor
      {...rest}
      code={code}
      onChange={(value) => {
        setCode(value);
        onChange?.(value);
      }}
    />
  );
}

describe('LiveEditor in a real browser', () => {
  it.skipIf(!isChromium(), 'native paste needs clipboard-write; ClipboardEvent does not insert in Firefox/WebKit')(
    'pastes multi-line text repeatedly with caret at end',
    async () => {
    const onChange = vi.fn();
    const { container } = render(<StatefulEditor initial="" onChange={onChange} />);
    const el = textarea(container);
    const chunk = 'line1\nline2\n';

    await userEvent.click(el);
    for (let i = 0; i < 5; i++) {
      await pasteText(el, chunk);
    }

    await vi.waitFor(() => expect(el.value).toBe(chunk.repeat(5)));
    expect(el.selectionStart).toBe(el.value.length);
  },
  );

  it.skipIf(!isChromium(), 'native paste needs clipboard-write; ClipboardEvent does not insert in Firefox/WebKit')(
    'select-all then paste replaces content',
    async () => {
    const { container } = render(<StatefulEditor initial="old" />);
    const el = textarea(container);
    await userEvent.click(el);
    const mod = modKey();
    await userEvent.keyboard(`{${mod}>}a{/${mod}}`);
    await pasteText(el, 'new');

    await vi.waitFor(() => expect(el.value).toBe('new'));
  },
  );

  it('tab then undo restores prior content', async () => {
    const seen: string[] = [];
    const { container } = render(
      <StatefulEditor initial="ab" onChange={(v) => seen.push(v)} tabSize={2} />,
    );
    const el = textarea(container);
    await userEvent.click(el);
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.keyboard('{Tab}');
    expect(seen.at(-1)).toBe('a  b');

    const mod = modKey();
    await userEvent.keyboard(`{${mod}>}z{/${mod}}`);
    await vi.waitFor(() => expect(el.value).toBe('ab'));
  });

  it('format then single undo restores pre-format value', async () => {
    const format = async (code: string) => ({ code: code.trim(), cursorOffset: code.trim().length });
    const { container } = render(
      <StatefulEditor initial="  x  " format={format} />,
    );
    const el = textarea(container);
    await userEvent.click(el);
    await userEvent.keyboard('{Shift>}{Alt>}f{/Alt}{/Shift}');
    await vi.waitFor(() => expect(el.value).toBe('x'));
    const mod = modKey();
    await userEvent.keyboard(`{${mod}>}z{/${mod}}`);
    await vi.waitFor(() => expect(el.value).toBe('  x  '));
  });

  it('blur after formatOnBlur keeps focus outside', async () => {
    const format = async (code: string) => ({ code: code.trim(), cursorOffset: code.trim().length });
    const { container } = render(
      <div>
        <StatefulEditor initial="  x  " format={format} formatOnBlur />
        <button type="button">outside</button>
      </div>,
    );
    const el = textarea(container);
    const btn = container.querySelector('button')!;
    await userEvent.click(el);
    await userEvent.click(btn);
    await vi.waitFor(() => expect(el.value).toBe('x'));
    expect(document.activeElement).not.toBe(el);
  });

  it('lineNumbers gutter is visible beside code', () => {
    const { container } = render(
      <StatefulEditor initial={'a\nb'} lineNumbers />,
    );
    const grid = container.firstElementChild as HTMLElement;
    const gutter = grid.querySelector('pre[aria-hidden="true"]') as HTMLElement;
    const codeArea = grid.querySelector('textarea') as HTMLElement;
    expect(gutter).toBeTruthy();
    expect(gutter.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(gutter.getBoundingClientRect().left).toBeLessThan(codeArea.getBoundingClientRect().left);
  });

  it('format handle works from ref', async () => {
    let handle: LiveEditorHandle | null = null;
    const format = async (code: string) => ({ code: code.trim(), cursorOffset: code.trim().length });
    const { container } = render(
      <StatefulEditor
        initial="  y  "
        format={format}
        ref={(h) => {
          handle = h;
        }}
      />,
    );
    textarea(container).focus();
    await handle!.format();
    await vi.waitFor(() => expect(textarea(container).value).toBe('y'));
  });
});
