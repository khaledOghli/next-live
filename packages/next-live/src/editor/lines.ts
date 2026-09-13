/** Parse `1,3-5` or `[1,3,5]` into a 1-based line set. */
export function parseLineRanges(input: string | number | readonly number[]): Set<number> {
  if (typeof input === 'number') return new Set([input]);
  if (Array.isArray(input)) return new Set(input);

  const lines = new Set<number>();
  for (const part of (input as string).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
    if (range?.[1] && range[2]) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let i = from; i <= to; i++) lines.add(i);
    } else {
      const n = Number(trimmed);
      if (Number.isFinite(n) && n >= 1) lines.add(n);
    }
  }
  return lines;
}

/** 1-based line number at a character offset. */
export function lineAtOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** 1-based column at offset (start of line = 1). */
export function columnAtOffset(text: string, offset: number): number {
  if (offset <= 0) return 1;
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return offset - lineStart + 1;
}
