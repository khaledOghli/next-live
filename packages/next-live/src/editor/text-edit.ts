export type ReplaceRangeSelection = number | { select: [number, number] };

function resolveSelection(
  start: number,
  end: number,
  text: string,
  selection?: ReplaceRangeSelection,
): [number, number] {
  if (typeof selection === 'number') return [selection, selection];
  if (selection?.select) return selection.select;
  const caret = start + text.length;
  return [caret, caret];
}

function dispatchInput(textarea: HTMLTextAreaElement, data: string): void {
  textarea.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data }),
  );
}

function setValueAndDispatch(
  textarea: HTMLTextAreaElement,
  value: string,
  data: string,
): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  dispatchInput(textarea, data);
}

/**
 * Insert text into a textarea while preserving the browser undo stack when
 * possible. Falls back to native value setter + input event when unfocused.
 */
export function replaceRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  selection?: ReplaceRangeSelection,
): void {
  const [selStart, selEnd] = resolveSelection(start, end, text, selection);
  const next = textarea.value.slice(0, start) + text + textarea.value.slice(end);

  if (next === textarea.value) {
    textarea.setSelectionRange(selStart, selEnd);
    return;
  }

  const root = textarea.getRootNode() as Document | ShadowRoot;
  const focused = root.activeElement === textarea;

  if (focused && typeof document.execCommand === 'function') {
    textarea.setSelectionRange(start, end);
    const applied = document.execCommand('insertText', false, text);
    if (!applied && textarea.value !== next) setValueAndDispatch(textarea, next, text);
  } else {
    setValueAndDispatch(textarea, next, text);
  }

  textarea.setSelectionRange(selStart, selEnd);
}

/** Leading whitespace on a single line (spaces and tabs only). */
export function leadingWhitespace(line: string): string {
  const match = /^[ \t]*/.exec(line);
  return match?.[0] ?? '';
}

export interface LineEditResult {
  next: string;
  selectionStart: number;
  selectionEnd: number;
  blockStart: number;
  blockEnd: number;
  replacement: string;
}

function lineBlockBounds(value: string, start: number, end: number): { lineStart: number; lineEnd: number } {
  const lineStart = start <= 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  let effectiveEnd = end;
  if (end > start && end > 0 && value.charCodeAt(end - 1) === 10) {
    effectiveEnd = end - 1;
  }
  const lineEndRaw = value.indexOf('\n', Math.max(0, effectiveEnd));
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  return { lineStart, lineEnd };
}

/** Indent or outdent every line touched by [start, end). */
export function editLineIndent(
  value: string,
  start: number,
  end: number,
  indent: string,
  add: boolean,
): LineEditResult {
  const { lineStart, lineEnd } = lineBlockBounds(value, start, end);
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');

  const tabSize = indent.length;
  const spacePattern = new RegExp(`^ {1,${tabSize}}`);

  const edited = lines.map((line) => {
    if (add) return indent + line;
    if (line.startsWith(indent)) return line.slice(indent.length);
    if (line.startsWith('\t')) return line.slice(1);
    return line.replace(spacePattern, '');
  });

  const nextBlock = edited.join('\n');
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
  const delta = nextBlock.length - block.length;

  const removedFromFirst = lines[0]!.length - edited[0]!.length;
  const selectionStart = add
    ? Math.max(lineStart, start + indent.length)
    : Math.max(lineStart, start - Math.min(removedFromFirst, start - lineStart));
  const selectionEnd = Math.max(lineStart, end + delta);

  return {
    next,
    selectionStart,
    selectionEnd,
    blockStart: lineStart,
    blockEnd: lineEnd,
    replacement: nextBlock,
  };
}

/** Insert a newline after the current line, preserving leading indent. */
export function insertNewline(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  autoIndent: boolean,
): LineEditResult & { replacement: string; blockStart: number; blockEnd: number } {
  const lineStart = selectionStart <= 0 ? 0 : value.lastIndexOf('\n', selectionStart - 1) + 1;
  const currentLine = value.slice(lineStart, selectionStart);
  const prefix = autoIndent ? leadingWhitespace(currentLine) : '';
  const replacement = '\n' + prefix;
  const next = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
  const caret = selectionStart + replacement.length;
  return {
    next,
    selectionStart: caret,
    selectionEnd: caret,
    replacement,
    blockStart: selectionStart,
    blockEnd: selectionEnd,
  };
}
