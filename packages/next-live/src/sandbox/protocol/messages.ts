import type { SerializedError } from '../../core/serialize-error';
import type { SerializedValue } from '../../core/serialize-value';
import type { ConsoleLevel, ConsoleMethod, ExtractionSource } from '../../core/types';

/**
 * The wire protocol between `<LiveProvider sandbox>` (the host) and
 * `mountSandbox` (the runtime inside the iframe).
 *
 * Two channels:
 * - `window.postMessage`, used only for the handshake (`ready`, `init`,
 *   `probe`). Anyone can post to a window, so these carry nothing sensitive.
 * - A `MessageChannel` port, handed over in `init`. Everything else travels
 *   there, where no other frame can listen in.
 *
 * Both sides treat every incoming message as untrusted and validate it (see
 * `validate.ts`) before acting on it.
 */
export const PROTOCOL_NS = 'next-live';

/** Bumped only for incompatible changes. Host and sandbox must agree exactly. */
export const PROTOCOL_VERSION = 1;

/** The package version, sent in the handshake so mismatches can be explained. */
export const RUNTIME_VERSION = '1.1.0';

export const LIMITS = {
  maxMessageChars: 8_192,
  maxStackChars: 16_384,
  maxShortChars: 256,
  maxImports: 500,
  maxConsoleBatch: 200,
  maxConsoleNodes: 1_000,
  maxHeight: 10_000,
  maxCodeChars: 1_000_000,
  maxFiles: 200,
} as const;

export interface Envelope<T extends string> {
  ns: typeof PROTOCOL_NS;
  v: number;
  type: T;
}

export type SandboxSource =
  | { kind: 'code'; code: string }
  | { kind: 'files'; files: Record<string, string>; entry?: string };

/** The compile options that make sense to send across. Registry and scope live in the sandbox. */
export interface SandboxCompileOptions {
  filePath?: string;
  production?: boolean;
  jsxRuntime?: 'automatic' | 'classic';
  jsxImportSource?: string;
  resolveSubpaths?: boolean;
  keepLastGood: boolean;
  maxRendersPerSecond: number;
  captureConsole: boolean;
  forwardConsole: boolean;
}

// Host to sandbox, over window.postMessage.

export interface InitMessage extends Envelope<'init'> {
  session: string;
  host: string;
}

export type ProbeMessage = Envelope<'probe'>;

// Host to sandbox, over the port.

export interface UpdateMessage extends Envelope<'update'> {
  revision: number;
  source: SandboxSource;
  props: Record<string, unknown>;
  options: SandboxCompileOptions;
}

/** New props for the component already on screen. No recompile. */
export interface PropsMessage extends Envelope<'props'> {
  revision: number;
  props: Record<string, unknown>;
}

export interface PingMessage extends Envelope<'ping'> {
  seq: number;
}

/** Unmount and forget the last good component. */
export type ResetMessage = Envelope<'reset'>;

export type HostWindowMessage = InitMessage | ProbeMessage;
export type HostPortMessage = UpdateMessage | PropsMessage | PingMessage | ResetMessage;

// Sandbox to host.

/** Over window.postMessage: "a runtime is here, send me a port". */
export interface ReadyMessage extends Envelope<'ready'> {
  runtime: string;
}

export interface ConnectedMessage extends Envelope<'connected'> {
  runtime: string;
  session: string;
}

export interface CompiledMessage extends Envelope<'compiled'> {
  revision: number;
  imports: string[];
  via?: ExtractionSource;
  durationMs: number;
  entry?: string;
  files?: string[];
}

export interface ErrorMessage extends Envelope<'error'> {
  revision: number;
  /** `compile` rejects the pending compile; `runtime` happened while rendering or later. */
  phase: 'compile' | 'runtime';
  error: SerializedError;
}

/** A console entry that crossed the boundary: arguments are already serialized. */
export interface SandboxConsoleEntry {
  revision: number;
  level: ConsoleLevel;
  method: ConsoleMethod;
  serialized: SerializedValue[];
  timestamp: number;
  depth: number;
  file?: string;
  line?: number;
  column?: number;
}

export interface ConsoleMessage extends Envelope<'console'> {
  entries: SandboxConsoleEntry[];
}

export interface ResizeMessage extends Envelope<'resize'> {
  height: number;
}

export interface PongMessage extends Envelope<'pong'> {
  seq: number;
}

export type FatalReason = 'protocol-mismatch' | 'origin-rejected' | 'same-origin-refused';

/** The sandbox refuses to work with this host at all. */
export interface FatalMessage extends Envelope<'fatal'> {
  reason: FatalReason;
  message: string;
  supported?: number[];
}

export type SandboxPortMessage =
  | ConnectedMessage
  | CompiledMessage
  | ErrorMessage
  | ConsoleMessage
  | ResizeMessage
  | PongMessage
  | FatalMessage;

export function envelope<T extends string>(type: T): Envelope<T> {
  return { ns: PROTOCOL_NS, v: PROTOCOL_VERSION, type };
}
