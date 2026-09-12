export interface PositionedError extends Error {
  line?: number;
  column?: number;
}

/** Reads a 1-based line/column from a compile or runtime error, if present. */
export function errorPosition(error: Error): { line: number; column?: number } | null {
  const positioned = error as PositionedError;
  if (positioned.line === undefined || positioned.line < 1) return null;
  return {
    line: positioned.line,
    ...(positioned.column !== undefined ? { column: positioned.column } : {}),
  };
}
