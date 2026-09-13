export interface FormatContext {
  language: string;
  cursorOffset: number;
}

export type FormatResult =
  | string
  | { code: string; cursorOffset?: number }
  | Promise<string | { code: string; cursorOffset?: number }>;

export type FormatFn = (code: string, ctx: FormatContext) => FormatResult;

export function normalizeFormatResult(
  result: string | { code: string; cursorOffset?: number },
  fallbackOffset: number,
): { code: string; cursorOffset: number } {
  if (typeof result === 'string') {
    return { code: result, cursorOffset: fallbackOffset };
  }
  return {
    code: result.code,
    cursorOffset: result.cursorOffset ?? fallbackOffset,
  };
}
