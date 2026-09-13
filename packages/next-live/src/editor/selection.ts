import { columnAtOffset, lineAtOffset } from './lines';

export interface EditorSelection {
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
  line: number;
  column: number;
  text: string;
}

export function readSelection(textarea: HTMLTextAreaElement): EditorSelection {
  const { selectionStart, selectionEnd, selectionDirection, value } = textarea;
  const start = selectionStart;
  const end = selectionEnd;
  const direction =
    selectionDirection === 'backward'
      ? 'backward'
      : selectionDirection === 'forward'
        ? 'forward'
        : 'none';

  return {
    start,
    end,
    direction,
    line: lineAtOffset(value, start),
    column: columnAtOffset(value, start),
    text: value.slice(start, end),
  };
}

export function selectionsEqual(a: EditorSelection | null, b: EditorSelection): boolean {
  if (a === null) return false;
  return a.start === b.start && a.end === b.end && a.text === b.text;
}
