export interface PositionedError extends Error {
  line?: number;
  column?: number;
  /** The project file the position refers to. Present only for multi-file snippets. */
  file?: string;
}

/**
 * Reads a 1-based line/column from a compile or runtime error, if present.
 *
 * Accepts a nullish value and returns null for it. The state this is meant to
 * be fed from - `LiveRunnerState.error` and `LiveContextValue.error` - is
 * `Error | null`, so `errorPosition(error)` is the natural thing to write in a
 * custom editor. TypeScript rejects that, but a JavaScript host would have hit
 * a TypeError instead of the "no position" answer the name promises.
 *
 * `file` is included only when the error carries one, so single-snippet
 * positions keep exactly the shape they had in 1.0.
 */
export function errorPosition(
  error: Error | null | undefined,
): { line: number; column?: number; file?: string } | null {
  if (error === null || error === undefined) return null;
  const positioned = error as PositionedError;
  if (positioned.line === undefined || positioned.line < 1) return null;
  return {
    line: positioned.line,
    ...(positioned.column !== undefined ? { column: positioned.column } : {}),
    ...(typeof positioned.file === 'string' ? { file: positioned.file } : {}),
  };
}
