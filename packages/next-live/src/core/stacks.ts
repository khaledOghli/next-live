let cachedOffset: number | null = null;

/**
 * How many lines the engine inserts above a `new Function` body.
 *
 * V8 reports 2, but this is engine-specific, so it is measured once rather
 * than assumed: throw from body line 1 and see what line the stack claims.
 */
export function getFunctionLineOffset(): number {
  if (cachedOffset !== null) return cachedOffset;

  cachedOffset = 2; // V8's value, used if the probe cannot read a line.
  try {
    new Function('throw new Error("next-live-probe")')();
  } catch (error) {
    const line = firstFrameLine(error);
    if (line !== null) cachedOffset = line - 1;
  }
  return cachedOffset;
}

const FRAME_PATTERNS = [
  /(?::|@)(\d+):(\d+)\)?\s*$/, // V8 "at x (file:LINE:COL)" and SpiderMonkey "x@file:LINE:COL"
];

function firstFrameLine(error: unknown): number | null {
  const stack = error instanceof Error ? error.stack : undefined;
  if (!stack) return null;
  for (const raw of stack.split('\n').slice(1)) {
    for (const pattern of FRAME_PATTERNS) {
      const match = pattern.exec(raw.trim());
      if (match?.[1]) return Number(match[1]);
    }
  }
  return null;
}

export interface MappedPosition {
  line: number;
  column?: number;
}

/**
 * Maps a position inside evaluated code back to the snippet the user wrote.
 *
 * No source map is consulted, because none is needed: Sucrase does not move
 * code between lines - a multi-line import collapses onto line 1 but leaves
 * the intervening lines blank - so generated line N is source line N. The only
 * adjustments are the engine's `new Function` offset and, for a snippet
 * compiled as a bare expression, the one line the wrapper added.
 *
 * `sourceLineCount` is a safety net: if a custom `transform` backend *did*
 * change the line count, the mapping is untrustworthy and is dropped rather
 * than reported wrongly.
 */
export function mapPosition(
  position: MappedPosition,
  meta: { linePrefixOffset: number; generatedLineCount: number; sourceLineCount: number },
): MappedPosition | null {
  if (meta.generatedLineCount !== meta.sourceLineCount + meta.linePrefixOffset * 2) {
    return null;
  }

  const line = position.line - getFunctionLineOffset() - meta.linePrefixOffset;
  if (line < 1 || line > meta.sourceLineCount) return null;

  // Line 1 holds Sucrase's entire prologue, so a column there is meaningless.
  return line === 1 ? { line } : { line, column: position.column };
}

/** Identifies stack frames that came from evaluated snippet code. */
export const SOURCE_URL_PREFIX = 'next-live:///';

/**
 * Drops host and React frames from a stack, leaving only the snippet's own.
 * Returns undefined when nothing in the stack came from user code.
 */
export function filterUserFrames(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split('\n')
    .filter((line) => line.includes(SOURCE_URL_PREFIX));
  return frames.length > 0 ? frames.join('\n') : undefined;
}
