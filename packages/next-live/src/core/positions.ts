export interface PositionedError extends Error {
  line?: number;
  column?: number;
}

/**
 * Reads a 1-based line/column from a compile or runtime error, if present.
 *
 * Accepts a nullish value and returns null for it. The state this is meant to
 * be fed from - `LiveRunnerState.error` and `LiveContextValue.error` - is
 * `Error | null`, so `errorPosition(error)` is the natural thing to write in a
 * custom editor. TypeScript rejects that, but a JavaScript host would have hit
 * a TypeError instead of the "no position" answer the name promises.
 */
export function errorPosition(error: Error | null | undefined): { line: number; column?: number } | null {
  if (error === null || error === undefined) return null;
  const positioned = error as PositionedError;
  if (positioned.line === undefined || positioned.line < 1) return null;
  return {
    line: positioned.line,
    ...(positioned.column !== undefined ? { column: positioned.column } : {}),
  };
}
