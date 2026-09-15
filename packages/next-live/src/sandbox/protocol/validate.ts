import { LiveSandboxError } from '../../core/errors';
import type { SerializedValue } from '../../core/serialize-value';
import type { ConsoleLevel, ConsoleMethod, ExtractionSource } from '../../core/types';
import { LIMITS, PROTOCOL_NS, PROTOCOL_VERSION } from './messages';
import type {
  CompiledMessage,
  ConnectedMessage,
  ConsoleMessage,
  ErrorMessage,
  FatalMessage,
  HostPortMessage,
  HostWindowMessage,
  PongMessage,
  ReadyMessage,
  ResizeMessage,
  SandboxCompileOptions,
  SandboxConsoleEntry,
  SandboxPortMessage,
  SandboxSource,
} from './messages';

/**
 * Validation for everything that crosses the iframe boundary.
 *
 * The rule is the same in both directions: a message is data from someone we
 * do not trust. Every parser here returns a freshly built object containing
 * only known fields of the right types, clipped to size limits, or null. The
 * original object is never passed on, so an unexpected property cannot sneak
 * through to React or to a host callback.
 */

type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clip = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max)}…` : value);

const str = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' ? clip(value, max) : undefined;

const int = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

const LEVELS = new Set<string>(['log', 'info', 'warn', 'error', 'debug']);
const METHODS = new Set<string>([
  'log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'dirxml', 'group',
  'groupCollapsed', 'groupEnd', 'time', 'timeLog', 'timeEnd', 'count', 'countReset', 'assert', 'clear',
]);
const VIA = new Set<string>(['render()', 'export default', 'module.exports', 'named export', 'declaration']);
const FATAL_REASONS = new Set<string>(['protocol-mismatch', 'origin-rejected', 'same-origin-refused']);

/** A message in our namespace, of any version. */
export function readEnvelope(data: unknown): (Loose & { type: string; v: number }) | null {
  if (!isRecord(data) || data['ns'] !== PROTOCOL_NS) return null;
  if (typeof data['type'] !== 'string' || typeof data['v'] !== 'number') return null;
  return data as Loose & { type: string; v: number };
}

const base = <T extends string>(type: T) => ({ ns: PROTOCOL_NS, v: PROTOCOL_VERSION, type }) as const;

// Sandbox to host.

/** Validates `ready`, the only message the host accepts on its window. */
export function parseReadyMessage(data: unknown): ReadyMessage | null {
  const message = readEnvelope(data);
  if (!message || message.type !== 'ready') return null;
  return { ...base('ready'), v: message.v, runtime: str(message['runtime'], 32) ?? 'unknown' };
}

/** Validates a message arriving on the host's port. */
export function parseSandboxMessage(
  data: unknown,
  options: { maxHeight?: number } = {},
): SandboxPortMessage | null {
  const message = readEnvelope(data);
  if (!message || message.v !== PROTOCOL_VERSION) {
    // A fatal from a newer runtime still has to be readable to be explained.
    if (message?.type === 'fatal') return parseFatal(message);
    return null;
  }

  switch (message.type) {
    case 'connected': {
      const session = str(message['session'], 128);
      if (session === undefined) return null;
      return { ...base('connected'), runtime: str(message['runtime'], 32) ?? 'unknown', session } satisfies ConnectedMessage;
    }
    case 'compiled': {
      const revision = int(message['revision']);
      const imports = stringList(message['imports'], LIMITS.maxImports);
      const durationMs = typeof message['durationMs'] === 'number' && Number.isFinite(message['durationMs'])
        ? Math.max(0, message['durationMs'])
        : undefined;
      if (revision === undefined || imports === undefined || durationMs === undefined) return null;
      const via = typeof message['via'] === 'string' && VIA.has(message['via']) ? (message['via'] as ExtractionSource) : undefined;
      const entry = str(message['entry'], LIMITS.maxShortChars);
      const files = stringList(message['files'], LIMITS.maxFiles);
      return {
        ...base('compiled'),
        revision,
        imports,
        durationMs,
        ...(via !== undefined ? { via } : {}),
        ...(entry !== undefined ? { entry } : {}),
        ...(files !== undefined ? { files } : {}),
      } satisfies CompiledMessage;
    }
    case 'error': {
      const revision = int(message['revision']);
      const phase = message['phase'];
      if (revision === undefined || (phase !== 'compile' && phase !== 'runtime')) return null;
      // `rehydrateError` does the field-by-field validation of the error itself.
      if (!isRecord(message['error'])) return null;
      return {
        ...base('error'),
        revision,
        phase,
        error: message['error'] as unknown as ErrorMessage['error'],
      } satisfies ErrorMessage;
    }
    case 'console': {
      if (!Array.isArray(message['entries'])) return null;
      const entries: SandboxConsoleEntry[] = [];
      for (const raw of message['entries'].slice(0, LIMITS.maxConsoleBatch)) {
        const entry = parseConsoleEntry(raw);
        if (entry) entries.push(entry);
      }
      return { ...base('console'), entries } satisfies ConsoleMessage;
    }
    case 'resize': {
      const height = message['height'];
      if (typeof height !== 'number' || !Number.isFinite(height)) return null;
      const max = options.maxHeight ?? LIMITS.maxHeight;
      return { ...base('resize'), height: Math.min(max, Math.max(0, Math.ceil(height))) } satisfies ResizeMessage;
    }
    case 'pong': {
      const seq = int(message['seq']);
      return seq === undefined ? null : ({ ...base('pong'), seq } satisfies PongMessage);
    }
    case 'fatal':
      return parseFatal(message);
    default:
      return null;
  }
}

function parseFatal(message: Loose): FatalMessage | null {
  const reason = message['reason'];
  if (typeof reason !== 'string' || !FATAL_REASONS.has(reason)) return null;
  const supported = Array.isArray(message['supported'])
    ? message['supported'].slice(0, 16).filter((v): v is number => int(v) !== undefined)
    : undefined;
  return {
    ...base('fatal'),
    reason: reason as FatalMessage['reason'],
    message: str(message['message'], LIMITS.maxMessageChars) ?? '',
    ...(supported ? { supported } : {}),
  };
}

function parseConsoleEntry(raw: unknown): SandboxConsoleEntry | null {
  if (!isRecord(raw)) return null;
  const revision = int(raw['revision']);
  const level = raw['level'];
  const method = raw['method'];
  const timestamp = raw['timestamp'];
  if (
    revision === undefined ||
    typeof level !== 'string' || !LEVELS.has(level) ||
    typeof method !== 'string' || !METHODS.has(method) ||
    typeof timestamp !== 'number' || !Number.isFinite(timestamp) ||
    !Array.isArray(raw['serialized'])
  ) {
    return null;
  }

  const budget = { nodes: LIMITS.maxConsoleNodes };
  const file = str(raw['file'], LIMITS.maxShortChars);
  const line = int(raw['line'], 1);
  const column = int(raw['column'], 0);
  return {
    revision,
    level: level as ConsoleLevel,
    method: method as ConsoleMethod,
    serialized: raw['serialized'].slice(0, 100).map((value) => sanitizeSerialized(value, budget)),
    timestamp,
    depth: int(raw['depth'], 0, 100) ?? 0,
    ...(file !== undefined ? { file } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
  };
}

function stringList(value: unknown, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= max) break;
    if (typeof item === 'string') out.push(clip(item, LIMITS.maxShortChars));
  }
  return out;
}

const SIMPLE_TAGS = new Set(['undefined', 'null', 'promise', 'circular', 'getter']);
const NUMBER_WORDS = new Set(['NaN', 'Infinity', '-Infinity', '-0']);
const FUNCTION_KINDS = new Set(['function', 'class', 'async', 'generator']);

/**
 * Rebuilds a serialized value from untrusted data, dropping anything that is
 * not a shape `formatConsoleValue` knows and bounding its size.
 */
export function sanitizeSerialized(
  value: unknown,
  budget: { nodes: number } = { nodes: LIMITS.maxConsoleNodes },
  depth = 0,
): SerializedValue {
  budget.nodes--;
  if (budget.nodes < 0 || depth > 12) return { t: 'depth' };
  if (!isRecord(value) || typeof value['t'] !== 'string') return { t: 'unserializable' };

  const t = value['t'];
  const child = (v: unknown) => sanitizeSerialized(v, budget, depth + 1);
  const short = (key: string) => str(value[key], LIMITS.maxShortChars);
  const optionalShort = (key: string) => {
    const s = short(key);
    return s !== undefined ? { [key]: s } : {};
  };

  if (SIMPLE_TAGS.has(t)) return { t } as SerializedValue;

  switch (t) {
    case 'boolean':
      return typeof value['v'] === 'boolean' ? { t, v: value['v'] } : { t: 'unserializable' };
    case 'number': {
      const v = value['v'];
      if (typeof v === 'number' && Number.isFinite(v)) return { t, v };
      if (typeof v === 'string' && NUMBER_WORDS.has(v)) return { t, v: v as 'NaN' };
      return { t: 'unserializable' };
    }
    case 'string': {
      const v = str(value['v'], 10_000);
      if (v === undefined) return { t: 'unserializable' };
      const truncated = int(value['truncated']);
      return truncated !== undefined ? { t, v, truncated } : { t, v };
    }
    case 'bigint':
    case 'symbol':
    case 'date':
    case 'regexp': {
      const v = str(value['v'], 1_000);
      return v !== undefined ? { t, v } : { t: 'unserializable' };
    }
    case 'function': {
      const kind = value['kind'];
      return {
        t,
        name: short('name') ?? '',
        kind: typeof kind === 'string' && FUNCTION_KINDS.has(kind) ? (kind as 'function') : 'function',
      };
    }
    case 'error': {
      const stack = str(value['stack'], LIMITS.maxStackChars);
      return {
        t,
        name: short('name') ?? 'Error',
        message: str(value['message'], LIMITS.maxMessageChars) ?? '',
        ...(stack !== undefined ? { stack } : {}),
        ...(value['cause'] !== undefined ? { cause: child(value['cause']) } : {}),
      };
    }
    case 'array':
      return {
        t,
        items: Array.isArray(value['items']) ? value['items'].slice(0, 100).map(child) : [],
        length: int(value['length']) ?? 0,
      };
    case 'object': {
      const entries: Array<[string, SerializedValue]> = [];
      if (Array.isArray(value['entries'])) {
        for (const pair of value['entries'].slice(0, 100)) {
          if (Array.isArray(pair) && typeof pair[0] === 'string') {
            entries.push([clip(pair[0], LIMITS.maxShortChars), child(pair[1])]);
          }
        }
      }
      const more = int(value['more']);
      return { t, entries, ...optionalShort('ctor'), ...(more !== undefined ? { more } : {}) };
    }
    case 'map': {
      const entries: Array<[SerializedValue, SerializedValue]> = [];
      if (Array.isArray(value['entries'])) {
        for (const pair of value['entries'].slice(0, 100)) {
          if (Array.isArray(pair)) entries.push([child(pair[0]), child(pair[1])]);
        }
      }
      return { t, size: int(value['size']) ?? entries.length, entries };
    }
    case 'set':
      return {
        t,
        size: int(value['size']) ?? 0,
        items: Array.isArray(value['items']) ? value['items'].slice(0, 100).map(child) : [],
      };
    case 'typed':
      return { t, ctor: short('ctor') ?? 'TypedArray', length: int(value['length']) ?? 0 };
    case 'weak':
      return { t, ctor: short('ctor') ?? 'WeakMap' };
    case 'dom': {
      const text = str(value['text'], 80);
      return {
        t,
        tag: str(value['tag'], 64) ?? 'element',
        ...optionalShort('id'),
        ...optionalShort('className'),
        ...(text !== undefined ? { text } : {}),
      };
    }
    case 'react':
      return {
        t,
        type: short('type') ?? 'Anonymous',
        key: typeof value['key'] === 'string' ? clip(value['key'], LIMITS.maxShortChars) : null,
        props: child(value['props']),
      };
    case 'depth':
    case 'unserializable':
      return { t, ...optionalShort('ctor') };
    default:
      return { t: 'unserializable' };
  }
}

// Host to sandbox.

/** Validates `init` or `probe`, the only messages the sandbox accepts on its window. */
export function parseHostWindowMessage(data: unknown): (HostWindowMessage & { v: number }) | null {
  const message = readEnvelope(data);
  if (!message) return null;
  if (message.type === 'probe') return { ...base('probe'), v: message.v };
  if (message.type !== 'init') return null;
  // Any version is accepted here, so a mismatch can be answered with an explanation.
  const session = str(message['session'], 128);
  if (session === undefined) return null;
  return { ...base('init'), v: message.v, session, host: str(message['host'], 32) ?? 'unknown' };
}

export interface HostMessageLimits {
  maxCodeChars?: number;
  maxFiles?: number;
}

/** Validates a message arriving on the sandbox's port. */
export function parseHostMessage(data: unknown, limits: HostMessageLimits = {}): HostPortMessage | null {
  const message = readEnvelope(data);
  if (!message || message.v !== PROTOCOL_VERSION) return null;

  switch (message.type) {
    case 'update': {
      const revision = int(message['revision']);
      const source = parseSource(message['source'], limits);
      const props = message['props'];
      if (revision === undefined || !source || !isRecord(props)) return null;
      return { ...base('update'), revision, source, props, options: parseOptions(message['options']) };
    }
    case 'props': {
      const revision = int(message['revision']);
      const props = message['props'];
      if (revision === undefined || !isRecord(props)) return null;
      return { ...base('props'), revision, props };
    }
    case 'ping': {
      const seq = int(message['seq']);
      return seq === undefined ? null : { ...base('ping'), seq };
    }
    case 'reset':
      return base('reset');
    default:
      return null;
  }
}

function parseSource(value: unknown, limits: HostMessageLimits): SandboxSource | null {
  if (!isRecord(value)) return null;
  const maxChars = limits.maxCodeChars ?? LIMITS.maxCodeChars;

  if (value['kind'] === 'code') {
    const code = value['code'];
    return typeof code === 'string' && code.length <= maxChars ? { kind: 'code', code } : null;
  }

  if (value['kind'] === 'files' && isRecord(value['files'])) {
    const entries = Object.entries(value['files']);
    if (entries.length > (limits.maxFiles ?? LIMITS.maxFiles)) return null;
    let total = 0;
    const files: Record<string, string> = {};
    for (const [key, source] of entries) {
      if (typeof source !== 'string' || key.length > LIMITS.maxShortChars) return null;
      total += source.length;
      if (total > maxChars) return null;
      files[key] = source;
    }
    const entry = str(value['entry'], LIMITS.maxShortChars);
    return { kind: 'files', files, ...(entry !== undefined ? { entry } : {}) };
  }

  return null;
}

function parseOptions(value: unknown): SandboxCompileOptions {
  const input = isRecord(value) ? value : {};
  const bool = (key: string, fallback: boolean) => (typeof input[key] === 'boolean' ? (input[key] as boolean) : fallback);
  const filePath = str(input['filePath'], LIMITS.maxShortChars);
  const jsxImportSource = str(input['jsxImportSource'], LIMITS.maxShortChars);
  const jsxRuntime = input['jsxRuntime'] === 'classic' || input['jsxRuntime'] === 'automatic' ? input['jsxRuntime'] : undefined;

  return {
    ...(filePath !== undefined ? { filePath } : {}),
    ...(typeof input['production'] === 'boolean' ? { production: input['production'] } : {}),
    ...(jsxRuntime !== undefined ? { jsxRuntime } : {}),
    ...(jsxImportSource !== undefined ? { jsxImportSource } : {}),
    ...(typeof input['resolveSubpaths'] === 'boolean' ? { resolveSubpaths: input['resolveSubpaths'] } : {}),
    keepLastGood: bool('keepLastGood', true),
    maxRendersPerSecond: int(input['maxRendersPerSecond'], 1, 1_000_000) ?? 1000,
    captureConsole: bool('captureConsole', false),
    forwardConsole: bool('forwardConsole', true),
  };
}

/**
 * Checks `allowedOrigins` for `mountSandbox`. Required, because a sandbox that
 * accepts any parent lets any site on the internet frame it and feed it code.
 */
export function normalizeAllowedOrigins(value: unknown): readonly string[] | '*' {
  if (value === '*') return '*';
  if (!Array.isArray(value) || value.length === 0) {
    throw new LiveSandboxError(
      'invalid-config',
      "mountSandbox needs `allowedOrigins`: the origins of the pages allowed to embed this sandbox, e.g. ['https://app.example.com'].",
    );
  }

  return value.map((origin) => {
    if (typeof origin !== 'string') {
      throw new LiveSandboxError('invalid-config', 'Every entry in `allowedOrigins` must be a string.');
    }
    let parsed: string;
    try {
      parsed = new URL(origin).origin;
    } catch {
      throw new LiveSandboxError('invalid-config', `'${origin}' in \`allowedOrigins\` is not a valid origin.`);
    }
    if (parsed !== origin) {
      throw new LiveSandboxError(
        'invalid-config',
        `'${origin}' in \`allowedOrigins\` is not an origin. Use scheme://host[:port] with no path or trailing slash: '${parsed}'.`,
      );
    }
    return origin;
  });
}
