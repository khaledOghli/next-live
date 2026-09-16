import { LiveError, LiveRuntimeError } from './errors';
import type { PositionedError } from './positions';
import { filterUserFrames, firstUserFrame, mapPosition } from './stacks';

export interface LineMeta {
  linePrefixOffset: number;
  generatedLineCount: number;
  sourceLineCount: number;
}

export interface ProjectFileMeta {
  key: string;
  meta: LineMeta;
}

export type PositionContext =
  | { kind: 'single'; meta: LineMeta }
  | { kind: 'project'; files: ReadonlyMap<string, ProjectFileMeta> };

/**
 * Attaches the snippet's own line number to an error thrown during evaluation
 * or render, and strips host/React frames so the stack shows only user code.
 */
export function enrichRuntimeError(cause: unknown, meta: LineMeta): Error {
  if (!(cause instanceof Error)) {
    return new LiveRuntimeError(String(cause), { cause });
  }

  // next-live's own errors already carry good messages and need no mapping.
  if (cause instanceof LiveError) return cause;

  const position = positionFromStack(cause.stack);
  const mapped = position ? mapPosition(position, meta) : null;

  const error = new LiveRuntimeError(cause.message, { cause });
  error.stack = filterUserFrames(cause.stack) ?? cause.stack;
  if (mapped) {
    Object.defineProperty(error, 'line', { value: mapped.line, enumerable: true });
    if (mapped.column !== undefined) {
      Object.defineProperty(error, 'column', { value: mapped.column, enumerable: true });
    }
  }
  return error;
}

/**
 * The multi-file counterpart of {@link enrichRuntimeError}: the innermost snippet
 * frame names the file, and that file's own line metadata maps the position.
 */
export function enrichProjectError(
  cause: unknown,
  files: ReadonlyMap<string, ProjectFileMeta>,
): Error {
  if (!(cause instanceof Error)) {
    return new LiveRuntimeError(String(cause), { cause });
  }

  const frame = firstUserFrame(cause.stack);
  const file = frame?.file !== undefined ? files.get(frame.file) : undefined;
  const mapped = frame && file ? mapPosition(frame, file.meta) : null;

  const define = (target: Error) => {
    if (file && (target as PositionedError).file === undefined) {
      Object.defineProperty(target, 'file', { value: file.key, enumerable: true, configurable: true });
    }
    if (mapped) {
      Object.defineProperty(target, 'line', { value: mapped.line, enumerable: true, configurable: true });
      if (mapped.column !== undefined) {
        Object.defineProperty(target, 'column', { value: mapped.column, enumerable: true, configurable: true });
      }
    }
  };

  // next-live's own errors keep their message; they only gain the position of
  // the file that raised them - a missing import names the line that asked.
  if (cause instanceof LiveError) {
    if ((cause as PositionedError).line === undefined) define(cause);
    return cause;
  }

  const error = new LiveRuntimeError(cause.message, { cause });
  error.stack = filterUserFrames(cause.stack) ?? cause.stack;
  define(error);
  return error;
}

/** Maps a render-time error caught by the preview boundary to snippet coordinates. */
export function enrichCaughtError(error: Error, context: PositionContext | null): Error {
  if (context === null) return error;

  const positioned = error as PositionedError;
  if (positioned.line !== undefined && positioned.line >= 1) return error;

  if (context.kind === 'single') {
    return enrichRuntimeError(error, context.meta);
  }
  return enrichProjectError(error, context.files);
}

function positionFromStack(stack: string | undefined): { line: number; column?: number } | null {
  const frame = firstUserFrame(stack);
  return frame ? { line: frame.line, column: frame.column } : null;
}
