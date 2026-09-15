import type { ComponentType, CSSProperties, ElementType, ReactElement, ReactNode } from 'react';
import type { SerializedValue } from './serialize-value';

/** The severity a console call is filed under, for filtering and styling. */
export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** The console method a snippet actually called. */
export type ConsoleMethod =
  | 'log'
  | 'info'
  | 'warn'
  | 'error'
  | 'debug'
  | 'trace'
  | 'table'
  | 'dir'
  | 'dirxml'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'time'
  | 'timeLog'
  | 'timeEnd'
  | 'count'
  | 'countReset'
  | 'assert'
  | 'clear';

/** One captured `console.*` call from snippet code. */
export interface ConsoleEntry {
  /** Unique within the page. */
  readonly id: number;
  readonly level: ConsoleLevel;
  readonly method: ConsoleMethod;
  /**
   * The values passed, by reference. Empty when the entry crossed a realm
   * boundary; read `serialized` then.
   */
  readonly args: readonly unknown[];
  /** Clone-safe copies of `args`, set for entries that came from a sandbox. */
  readonly serialized?: readonly SerializedValue[];
  /** `Date.now()` at the time of the call. */
  readonly timestamp: number;
  /** `console.group` nesting at the time of the call. */
  readonly depth: number;
  /** The compile that produced the code which logged. Set by the React layer. */
  readonly compileId?: number;
  /** The project file that logged. Present only for multi-file snippets. */
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * A value registered under an import specifier.
 *
 * The idiomatic value is a real module namespace - `import * as ui from
 * 'my-ui-kit'` - but any object, function, or primitive works. See
 * {@link normalizeModule} for how each shape maps onto `default` and named
 * imports.
 */
export type ModuleValue = unknown;

/**
 * A lazily-loaded module, awaited before user code is evaluated.
 *
 * Receives the specifier that was imported. Exact-match entries can ignore it;
 * prefix entries (a key ending in `/`) need it, since one loader serves the
 * whole subtree.
 */
export type ModuleLoader = (specifier: string) => ModuleValue | Promise<ModuleValue>;

/**
 * Maps import specifiers to values:
 *
 * ```ts
 * { 'react': React, '@app/ui': ui, '@app/store': { useAppStore } }
 * ```
 */
export interface ModuleRegistry {
  [specifier: string]: ModuleValue | ModuleLoader;
}

/**
 * Free variables injected directly into the snippet's scope without an import.
 * Prefer `modules` + real `import` statements; use scope for values that read
 * better unqualified.
 */
export interface LiveScope {
  [identifier: string]: unknown;
}

/** A module record shaped so Sucrase's interop helpers become no-ops. */
export interface NormalizedModule {
  readonly __esModule: true;
  readonly default: unknown;
  readonly [name: string]: unknown;
}

/** What the snippet ultimately produced. */
export type LiveRenderable =
  | { kind: 'component'; component: ComponentType<Record<string, unknown>> }
  | { kind: 'element'; element: ReactElement };

/** How the renderable was found - surfaced in error messages. */
export type ExtractionSource =
  | 'render()'
  | 'export default'
  | 'module.exports'
  | 'named export'
  | 'declaration';

export interface TranspileOptions {
  /**
   * Logical filename. Drives the `sourceURL` so stack frames and DevTools
   * agree on one name. Use a stable per-app identity, e.g. `app-42.tsx`.
   */
  filePath?: string;
  /** `false` selects `react/jsx-dev-runtime`, giving richer component stacks. */
  production?: boolean;
  jsxRuntime?: 'automatic' | 'classic';
  jsxImportSource?: string;
}

export interface TransformResult {
  code: string;
  /** Lines inserted above the user's line 1. Added back during error mapping. */
  linePrefixOffset: number;
  /** True when the snippet was compiled as a bare expression. */
  expression: boolean;
}

/**
 * Replaces the built-in Sucrase pass - for server-precompiled output, or a
 * different transpiler entirely.
 */
export type TransformFn = (
  source: string,
  options: Required<TranspileOptions>,
) => TransformResult | Promise<TransformResult>;

export interface CompileOptions extends TranspileOptions {
  modules?: ModuleRegistry;
  scope?: LiveScope;
  transform?: TransformFn;
  /**
   * Resolve `pkg/Sub` against a registered `pkg` by walking the remaining
   * segments as property accesses. Correct for barrel-shaped packages, wrong
   * for those whose subpaths are not re-exported - so it is opt-in rather than
   * a silent guess. Default false.
   */
  resolveSubpaths?: boolean;
  /** Aborts a compile whose result is no longer wanted. */
  signal?: AbortSignal;
  /**
   * Captures `console.*` calls made by snippet code. Capture is off unless
   * this is set: without it the snippet sees the real `console`, exactly as
   * before. Calls from registered modules and `window.console` are not
   * captured.
   */
  onConsole?: (entry: ConsoleEntry) => void;
  /**
   * While capturing, still pass each call on to the real console (or to
   * `scope.console`, if one is supplied). Default true.
   */
  forwardConsole?: boolean;
}

export interface CompileResult {
  renderable: LiveRenderable;
  via: ExtractionSource;
  /** The transpiled JavaScript (the entry file's, for a project). */
  code: string;
  /**
   * Every module specifier the registry had to supply, sorted. Imports that
   * resolved to another project file are not listed.
   */
  imports: readonly string[];
  /** The entry file's key. Present only for multi-file snippets. */
  entry?: string;
  /** Keys of the project files that ran, in the order they first ran. */
  files?: readonly string[];
}

export interface CompileModuleResult {
  /** Everything the snippet exported (the entry file's, for a project). */
  exports: Record<string, unknown>;
  /** The transpiled JavaScript. */
  code: string;
  /** Every module specifier the registry had to supply, sorted. */
  imports: readonly string[];
  /** The entry file's key. Present only for multi-file snippets. */
  entry?: string;
  /** Keys of the project files that ran, in the order they first ran. */
  files?: readonly string[];
}

export interface CompileSuccessInfo {
  compileId: number;
  imports: readonly string[];
  via?: ExtractionSource;
  durationMs: number;
  /** The entry file's key. Present only for multi-file snippets. */
  entry?: string;
  /** Keys of the project files that ran. Present only for multi-file snippets. */
  files?: readonly string[];
}

/**
 * The multi-file state a runner exposes. Every field is absent for a single
 * `code` snippet, so hosts that never use `files` see exactly the 1.0 shape.
 */
export interface LiveProjectState {
  /** Every file's current source, including unsaved edits. */
  files?: Readonly<Record<string, string>>;
  /** The key of the file whose exports are rendered. */
  entry?: string;
  /** The key of the file the editor is showing. */
  activeFile?: string;
  /** Shows another file in the editor. Does not recompile. */
  setActiveFile?: (file: string) => void;
  /** Replaces one file's source (or adds a file) and recompiles. */
  setFile?: (file: string, code: string) => void;
  /** Replaces every file at once and recompiles. */
  setFiles?: (files: Readonly<Record<string, string>>) => void;
}

export interface UseLiveRunnerOptions extends CompileOptions {
  /** The snippet to run. Use `files` instead for a snippet made of several files. */
  code?: string;
  /**
   * A snippet made of several files that import each other by relative path,
   * e.g. `{ 'App.tsx': app, 'components/Button.tsx': button }`. Takes
   * precedence over `code` when both are given.
   */
  files?: Readonly<Record<string, string>>;
  /** The file whose exports are rendered. Default: the first key of `files`. */
  entry?: string;
  /**
   * The file the editor shows. Leave it out to let `<LiveFileTabs>` or
   * `setActiveFile` manage it; pass it to control it yourself.
   */
  activeFile?: string;
  /** Called when the active file changes from inside. */
  onActiveFileChange?: (file: string) => void;
  /**
   * Called when a file is edited from inside, with every file's current
   * source and the key of the one that changed (undefined after `setFiles`).
   * The multi-file counterpart of `onCodeChange`, which is not called for a
   * multi-file snippet.
   */
  onFilesChange?: (files: Readonly<Record<string, string>>, changedFile: string | undefined) => void;
  /**
   * Called when the code is edited from inside, by `<LiveEditor>`, or via
   * `setCode`. Not called when the `code` prop changes from outside, which
   * would otherwise echo your own updates back at you.
   *
   * This is what a control panel needs to persist an author's edits.
   */
  onCodeChange?: (code: string) => void;
  /** Called after every successful compile. Not called on failure or abort. */
  onCompileSuccess?: (info: CompileSuccessInfo) => void;
  /** Milliseconds to wait after a change before recompiling. Default 150. */
  debounce?: number;
  /**
   * Keep the last working component mounted when a recompile fails, instead
   * of blanking the preview on every half-typed keystroke. Default true.
   */
  keepLastGood?: boolean;
  /** Renders per second before the loop breaker trips. Default 1000. */
  maxRendersPerSecond?: number;
}

export interface LiveRunnerState extends LiveProjectState {
  /** The snippet, or the active file's source for a multi-file snippet. */
  code: string;
  /** Edits the snippet, or the active file for a multi-file snippet. */
  setCode: (code: string) => void;
  /** Null until the first successful compile - including during SSR. */
  Component: ComponentType<Record<string, unknown>> | null;
  element: ReactElement | null;
  error: Error | null;
  isCompiling: boolean;
  /** Changes on every successful compile; use as a remount `key`. */
  compileId: number;
}

/** Extra capabilities a sandbox iframe may be granted. `allow-scripts` is always on. */
export type SandboxPermission =
  | 'allow-forms'
  | 'allow-modals'
  | 'allow-popups'
  | 'allow-popups-to-escape-sandbox'
  | 'allow-pointer-lock'
  | 'allow-downloads';

/**
 * Runs snippets inside a sandboxed iframe instead of the host page.
 *
 * The iframe loads `src`, a page you host that calls `mountSandbox` from
 * `next-live/sandbox`. Everything here is plain data, so a Server Component
 * can pass it straight through.
 */
export interface LiveSandboxConfig {
  /** URL of the sandbox page. A relative URL resolves against the host page. */
  src: string;
  /** Extra iframe sandbox tokens, e.g. `['allow-forms']`. */
  permissions?: readonly SandboxPermission[];
  /**
   * Give the frame its real origin (cookies, storage) instead of an opaque
   * one. Only safe when `src` is on a different origin from the host page, and
   * refused when it is not. Default false.
   */
  allowSameOrigin?: boolean;
  /**
   * Permissions Policy for the frame. Default denies camera, microphone,
   * geolocation, USB, payment, clipboard reading, screen capture, serial and HID.
   */
  allow?: string;
  /** Load the frame without cookies or storage, where the browser supports it. Default true. */
  credentialless?: boolean;
  /** How long to wait for the sandbox page to answer before reporting it unreachable. Default 10000. */
  handshakeTimeoutMs?: number;
  /** How often to check the sandbox is still responsive. Default 2000. */
  pingIntervalMs?: number;
  /** An unanswered check after this long means the snippet froze the frame. Default 5000. */
  pongTimeoutMs?: number;
  /** The tallest the frame grows with `height="auto"`, in pixels. Default 10000. */
  maxHeight?: number;
  /** Automatic restarts allowed within a minute before giving up. Default 3. */
  maxRestarts?: number;
}

/** Where the connection to the sandbox iframe stands. */
export type SandboxStatus = 'connecting' | 'ready' | 'unresponsive' | 'failed';

/** What `<LivePreview>` hands to the sandbox iframe it renders. */
export interface SandboxFrameProps {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** Props for the snippet's component. They are copied into the iframe, so they must be cloneable. */
  props?: Record<string, unknown>;
  fallback?: ReactNode;
  title?: string;
  height?: number | 'auto';
  loading?: 'eager' | 'lazy';
  frameClassName?: string;
  frameStyle?: CSSProperties;
}

/** Present on the context only under `<LiveProvider sandbox>`. */
export interface SandboxHandle {
  status: SandboxStatus;
  /** The iframe, as `<LivePreview>` renders it. */
  Frame: ComponentType<SandboxFrameProps>;
  /** Replaces the iframe with a fresh one, for example after it froze too often. */
  reload: () => void;
}

export interface FormatErrorPosition {
  line?: number;
  column?: number;
  /** The project file the position refers to. Present only for multi-file snippets. */
  file?: string;
}

/** Customises error text for `<LiveError>` and the editor live region. */
export type FormatErrorFn = (error: Error, position?: FormatErrorPosition) => string;

export interface LiveContextValue extends LiveRunnerState {
  /** Props forwarded into the rendered component. */
  props: Record<string, unknown>;
  language: string;
  /** Called by the error boundary when rendering the snippet throws. */
  reportRuntimeError: (error: Error) => void;
  fallback: ReactNode;
  formatError?: FormatErrorFn;
  /**
   * Set only under `<LiveProvider sandbox>`: snippets run in an iframe, so
   * `Component` and `element` stay null and `<LivePreview>` renders this.
   */
  sandbox?: SandboxHandle;
}
