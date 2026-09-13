import { describe, expect, it } from 'vitest';
import { columnAtOffset, lineAtOffset, parseLineRanges } from '../../src/editor/lines';

describe('parseLineRanges', () => {
  it('parses a single line', () => {
    expect([...parseLineRanges(2)]).toEqual([2]);
  });

  it('parses comma and range syntax', () => {
    expect([...parseLineRanges('1,3-5')].sort((a, b) => a - b)).toEqual([1, 3, 4, 5]);
  });

  it('parses arrays', () => {
    expect([...parseLineRanges([1, 4])].sort((a, b) => a - b)).toEqual([1, 4]);
  });
});

describe('lineAtOffset', () => {
  it('maps offsets to 1-based lines', () => {
    expect(lineAtOffset('a\nb\nc', 0)).toBe(1);
    expect(lineAtOffset('a\nb\nc', 2)).toBe(2);
    expect(columnAtOffset('a\nb\nc', 2)).toBe(1);
  });

  it('returns column 1 at offset 0', () => {
    expect(columnAtOffset('\nx', 0)).toBe(1);
  });
});
