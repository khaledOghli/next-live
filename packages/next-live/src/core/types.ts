import type { ComponentType, ReactElement, ReactNode } from 'react';

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
 * Free variables injected directly into the snippet's scope, the way
 * `react-live` does it. Prefer `modules` + real `import` statements; this
 * exists for compatibility and for values that read better unqualified.
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
}

export interface CompileResult {
  renderable: LiveRenderable;
  via: ExtractionSource;
  /** The transpiled JavaScript, for debugging and for the server cache. */
  code: string;
  /** Every module specifier the snippet imported, sorted. */
  imports: readonly string[];
}

export interface CompileModuleResult {
  /** Everything the snippet exported. */
  exports: Record<string, unknown>;
  /** The transpiled JavaScript. */
  code: string;
  /** Every module specifier the snippet imported, sorted. */
  imports: readonly string[];
}

export interface CompileSuccessInfo {
  compileId: number;
  imports: readonly string[];
  via?: ExtractionSource;
  durationMs: number;
}

export interface UseLiveRunnerOptions extends CompileOptions {
  code: string;
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

export interface LiveRunnerState {
  code: string;
  setCode: (code: string) => void;
  /** Null until the first successful compile - including during SSR. */
  Component: ComponentType<Record<string, unknown>> | null;
  element: ReactElement | null;
  error: Error | null;
  isCompiling: boolean;
  /** Changes on every successful compile; use as a remount `key`. */
  compileId: number;
}

export interface FormatErrorPosition {
  line?: number;
  column?: number;
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
}
