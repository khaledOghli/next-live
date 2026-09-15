import {
  LiveCompileError,
  LiveError,
  LiveRuntimeError,
  LiveSandboxError,
  ModuleNotFoundError,
  NoComponentError,
  RenderLoopError,
  TranspilerLoadError,
} from './errors';
import type { LiveErrorCode, LiveSandboxErrorReason } from './errors';

/**
 * An error flattened for `postMessage`.
 *
 * `instanceof` does not survive a realm boundary, so errors raised inside the
 * sandbox travel as plain data and are rebuilt as real next-live error classes
 * on the host, where `<LiveError>` and `error.code` checks expect them.
 */
export interface SerializedError {
  code: LiveErrorCode;
  message: string;
  line?: number;
  column?: number;
  file?: string;
  stack?: string;
  specifier?: string;
  available?: string[];
  importer?: string;
  reason?: LiveSandboxErrorReason;
}

const MAX_MESSAGE = 8_192;
const MAX_STACK = 16_384;
const MAX_SHORT = 512;
const MAX_AVAILABLE = 500;

const CODES = new Set<string>([
  'COMPILE',
  'RUNTIME',
  'MODULE_NOT_FOUND',
  'NO_COMPONENT',
  'RENDER_LOOP',
  'TRANSPILER_LOAD',
  'SANDBOX',
]);

const REASONS = new Set<string>([
  'handshake-timeout',
  'load-failed',
  'unresponsive',
  'protocol-mismatch',
  'origin-rejected',
  'same-origin-refused',
  'props-not-cloneable',
  'restart-limit',
  'invalid-config',
]);

/** Flattens any thrown value into {@link SerializedError}. Never throws. */
export function serializeError(error: unknown): SerializedError {
  try {
    if (typeof error !== 'object' || error === null) {
      return { code: 'RUNTIME', message: clip(String(error), MAX_MESSAGE) };
    }

    const source = error as Partial<Record<keyof SerializedError, unknown>>;
    const code =
      error instanceof LiveError && CODES.has(error.code) ? error.code : ('RUNTIME' as const);

    const out: SerializedError = { code, message: clip(String(source.message ?? ''), MAX_MESSAGE) };
    const line = positiveInt(source.line);
    const column = positiveInt(source.column);
    if (line !== undefined) out.line = line;
    if (column !== undefined) out.column = column;
    if (typeof source.file === 'string') out.file = clip(source.file, MAX_SHORT);
    if (typeof source.stack === 'string') out.stack = clip(source.stack, MAX_STACK);
    if (typeof source.specifier === 'string') out.specifier = clip(source.specifier, MAX_SHORT);
    if (typeof source.importer === 'string') out.importer = clip(source.importer, MAX_SHORT);
    if (Array.isArray(source.available)) out.available = stringList(source.available);
    if (typeof source.reason === 'string' && REASONS.has(source.reason)) {
      out.reason = source.reason as LiveSandboxErrorReason;
    }
    return out;
  } catch {
    return { code: 'RUNTIME', message: 'An error was thrown that could not be read.' };
  }
}

/**
 * Rebuilds a real next-live error from data that crossed a realm boundary.
 *
 * The input is treated as untrusted: every field is type-checked and clipped,
 * `name` is never read (the class decides it), and `cause` never crosses.
 */
export function rehydrateError(data: unknown): LiveError {
  if (typeof data !== 'object' || data === null) {
    return new LiveRuntimeError('The sandbox reported an unreadable error.');
  }

  const input = data as Partial<Record<keyof SerializedError, unknown>>;
  const code = typeof input.code === 'string' && CODES.has(input.code) ? input.code : 'RUNTIME';
  const message = typeof input.message === 'string' ? clip(input.message, MAX_MESSAGE) : '';
  const line = positiveInt(input.line);
  const column = positiveInt(input.column);
  const file = typeof input.file === 'string' ? clip(input.file, MAX_SHORT) : undefined;

  let error: LiveError;
  switch (code) {
    case 'COMPILE':
      error = new LiveCompileError(message, {
        ...(line !== undefined ? { line } : {}),
        ...(column !== undefined ? { column } : {}),
        ...(file !== undefined ? { file } : {}),
      });
      break;
    case 'MODULE_NOT_FOUND':
      error =
        typeof input.specifier === 'string'
          ? new ModuleNotFoundError(
              clip(input.specifier, MAX_SHORT),
              Array.isArray(input.available) ? stringList(input.available) : [],
              typeof input.importer === 'string' ? clip(input.importer, MAX_SHORT) : undefined,
            )
          : new LiveRuntimeError(message);
      break;
    case 'NO_COMPONENT':
      error = new NoComponentError(message);
      break;
    case 'RENDER_LOOP':
      error = new RenderLoopError(message);
      break;
    case 'TRANSPILER_LOAD':
      error = new TranspilerLoadError(undefined);
      break;
    case 'SANDBOX':
      error = new LiveSandboxError(
        typeof input.reason === 'string' && REASONS.has(input.reason)
          ? (input.reason as LiveSandboxErrorReason)
          : 'load-failed',
        message,
      );
      break;
    default:
      error = new LiveRuntimeError(message);
  }

  // The sandbox composed the text with its own context (registered modules,
  // project files), so its message wins over the one the constructor built.
  if (message) error.message = message;
  if (code !== 'COMPILE') {
    if (line !== undefined) Object.defineProperty(error, 'line', { value: line, enumerable: true });
    if (column !== undefined) {
      Object.defineProperty(error, 'column', { value: column, enumerable: true });
    }
    if (file !== undefined) Object.defineProperty(error, 'file', { value: file, enumerable: true });
  }
  error.stack = typeof input.stack === 'string' ? clip(input.stack, MAX_STACK) : '';
  return error;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function stringList(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (out.length >= MAX_AVAILABLE) break;
    if (typeof value === 'string') out.push(clip(value, MAX_SHORT));
  }
  return out;
}
