import { describe, expect, it } from 'vitest';
import { editLineIndent, insertNewline, leadingWhitespace } from '../../src/editor/text-edit';

describe('leadingWhitespace', () => {
  it('returns spaces and tabs at line start', () => {
    expect(leadingWhitespace('  foo')).toBe('  ');
  });
});

describe('insertNewline', () => {
  it('preserves indent on the new line', () => {
    const result = insertNewline('  foo', 5, 5, true);
    expect(result.next).toBe('  foo\n  ');
    expect(result.selectionStart).toBe(8);
  });

  it('handles start at offset 0', () => {
    const result = insertNewline('foo', 0, 0, true);
    expect(result.next).toBe('\nfoo');
  });
});

describe('editLineIndent', () => {
  it('indents selected lines', () => {
    const value = 'a\nb\nc';
    const result = editLineIndent(value, 0, 3, '  ', true);
    expect(result.next).toBe('  a\n  b\nc');
  });

  it('handles start at offset 0', () => {
    const result = editLineIndent('hello', 0, 5, '  ', true);
    expect(result.next).toBe('  hello');
    expect(result.selectionStart).toBeGreaterThanOrEqual(0);
  });

  it('excludes trailing line when selection ends at line start', () => {
    const value = 'line1\nline2';
    const end = value.indexOf('\n') + 1;
    const result = editLineIndent(value, 0, end, '  ', true);
    expect(result.next).toBe('  line1\nline2');
  });

  it('preserves block selection range after indent', () => {
    const value = 'a\nb\nc';
    const result = editLineIndent(value, 0, 3, '  ', true);
    expect(result.selectionEnd).toBeGreaterThan(result.selectionStart);
  });

  it('handles CRLF line endings', () => {
    const value = 'a\r\nb';
    const result = editLineIndent(value, 0, 1, '  ', true);
    expect(result.next.startsWith('  a')).toBe(true);
  });

  it('indents at column 0 of line 2 without corrupting text', () => {
    const value = 'a\nb';
    const caret = value.indexOf('b');
    const result = editLineIndent(value, caret, caret, '  ', true);
    expect(result.next).toBe('a\n  b');
    expect(result.selectionStart).toBe(caret + 2);
    expect(result.selectionEnd).toBe(caret + 2);
  });

  it('no-op outdent leaves value unchanged', () => {
    const value = 'a\nb';
    const caret = value.indexOf('b');
    const result = editLineIndent(value, caret, caret, '  ', false);
    expect(result.next).toBe(value);
  });

  it('preserves exact selection after block outdent', () => {
    const value = '  a\n  b';
    const result = editLineIndent(value, 2, 7, '  ', false);
    expect(result.next).toBe('a\nb');
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(3);
  });

  it('outdent with tabSize 4 removes up to four spaces', () => {
    const value = '    x';
    const result = editLineIndent(value, 0, 5, '    ', false);
    expect(result.next).toBe('x');
  });

  it('clamps selection start to line start on outdent', () => {
    const value = '    x';
    const result = editLineIndent(value, 4, 5, '  ', false);
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(3);
  });
});
