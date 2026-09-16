import { LiveCompileError, TranspilerLoadError } from './errors';
import { normalizeProjectPath } from './project';
import type { TransformResult, TranspileOptions } from './types';

type SucraseModule = typeof import('sucrase');

let transpilerPromise: Promise<SucraseModule> | null = null;

/**
 * Loads Sucrase on first use.
 *
 * The *promise* is cached rather than the resolved module, so concurrent
 * callers share one chunk fetch; a rejected load clears the cache so a
 * transient network failure can be retried.
 */
export function loadTranspiler(): Promise<SucraseModule> {
  if (transpilerPromise === null) {
    transpilerPromise = import('sucrase').catch((cause: unknown) => {
      transpilerPromise = null;
      throw new TranspilerLoadError(cause);
    });
  }
  return transpilerPromise;
}

/**
 * Starts fetching the transpiler chunk ahead of time. Worth calling on idle or
 * on route prefetch so the first compile is not gated on a network round trip.
 */
export function preloadTranspiler(): void {
  void loadTranspiler().catch(() => {
    // Preloading is best-effort; the real compile reports the failure.
  });
}

/**
 * Replaces the loaded transpiler. Intended for tests and custom backends.
 * @experimental Not covered by semver. May change in minor releases.
 */
export function setTranspiler(module: typeof import('sucrase') | null): void {
  transpilerPromise = module === null ? null : Promise.resolve(module);
}

export const defaultTranspileOptions: Required<TranspileOptions> = {
  filePath: 'LiveCode.tsx',
  production: true,
  jsxRuntime: 'automatic',
  jsxImportSource: 'react',
};

/** Top-level `import`/`export`, ignoring matches that are not line-initial. */
const MODULE_SYNTAX_RE = /^[ \t]*(?:export\b|import\s*[({'"*]|import\s+[A-Za-z_$])/m;

/** A call to the injected `render()` helper (inline snippet style). */
const RENDER_CALL_RE = /(^|[^.\w$])render\s*\(/m;

/**
 * Whether a snippet is a module body rather than a bare expression.
 *
 * Imports and exports are unambiguous; a `render(...)` call is a statement, so
 * it is one too. Anything else may be a lone expression like `<div/>`, which is
 * not a valid module body and has to be wrapped.
 */
export function isModuleSource(source: string): boolean {
  return MODULE_SYNTAX_RE.test(source) || RENDER_CALL_RE.test(source);
}

/**
 * Whether a snippet carries no code at all - empty, whitespace, or only
 * comments.
 *
 * Such a snippet must not go down the bare-expression path: wrapping it
 * produces `export default ( )`, which Sucrase happily emits because it is a
 * token-based transform rather than a validating parser. The invalid code then
 * survives all the way to `new Function`, where the author sees a bare
 * `Unexpected token ')'` instead of being told the snippet is empty. Routing it
 * through module mode yields an empty module, and the normal "did not produce a
 * component" message.
 *
 * Only line-initial `//` is treated as a comment, so a URL inside a string on a
 * line of real code cannot make that line look blank. The check errs towards
 * "has content", which is the safe direction: it only ever restores the
 * previous behaviour.
 */
export function isBlankSource(source: string): boolean {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
  return withoutComments.trim() === '';
}

/** The Sucrase options every entry point uses, so they cannot drift apart. */
export function sucraseOptions(options: Required<TranspileOptions>) {
  return {
    transforms: ['jsx', 'typescript', 'imports'] as Array<'jsx' | 'typescript' | 'imports'>,
    jsxRuntime: options.jsxRuntime,
    jsxImportSource: options.jsxImportSource,
    production: options.production,
    filePath: options.filePath,
    // Leaving native `import()` intact would resolve against the *page* URL
    // and 404 on './utils'; routing it through our shim is the only sane
    // behaviour inside an evaluated snippet.
    preserveDynamicImport: false,
  };
}

/**
 * Applies the transpile pass, wrapping a bare expression so it becomes a valid
 * module body. Shared by the async browser path and the sync server path.
 */
/**
 * `'auto'` allows the bare-expression wrap; `'module'` never applies it. Files
 * other than a project's entry are always modules: `<div/>` alone in
 * `Button.tsx` is a mistake to report, not a default export to invent.
 */
export type TranspileMode = 'auto' | 'module';

export function runTranspile(
  transformFn: (input: string, opts: ReturnType<typeof sucraseOptions>) => { code: string },
  source: string,
  options: Required<TranspileOptions>,
  mode: TranspileMode = 'auto',
): TransformResult {
  const opts = sucraseOptions(options);

  if (mode === 'auto' && !isModuleSource(source) && !isBlankSource(source)) {
    // The newlines matter: they shift the user's code down exactly one line,
    // which `linePrefixOffset` corrects, whereas inlining would destroy line
    // mapping for the whole snippet.
    try {
      return {
        code: transformFn(`export default (\n${source}\n)`, opts).code,
        linePrefixOffset: 1,
        expression: true,
      };
    } catch {
      // Multi-statement code with no exports - fall through to module mode.
    }
  }

  return { code: transformFn(source, opts).code, linePrefixOffset: 0, expression: false };
}

/**
 * Transpiles a snippet to CommonJS that `new Function` can evaluate.
 *
 * Three authoring styles are supported, resolved without ever asking the user
 * which one they used:
 *
 * 1. A real module - `export default function App() {}`.
 * 2. A bare expression, `<div/>` or `() => <div/>`.
 * 3. Bare statements with no export, `function App() {}`, or `render(<App/>)`.
 *
 * Styles 1 and 3 are compiled as-is; the component is recovered after
 * evaluation (see `evaluate.ts`). Style 2 is not a valid module body on its
 * own, so it is wrapped in `export default (...)`.
 */
export function transpile(
  source: string,
  options: TranspileOptions = {},
  transform?: import('./types').TransformFn,
): Promise<TransformResult> {
  return transpileSource(source, options, transform, 'auto');
}

/**
 * `transpile` plus the mode switch multi-file projects need: a non-entry file
 * is always a module, never a bare expression.
 *
 * Kept off the public signature on purpose. `TranspileMode` is not exported,
 * so a parameter typed with it would be one callers can see but cannot name.
 */
export async function transpileSource(
  source: string,
  options: TranspileOptions,
  transform: import('./types').TransformFn | undefined,
  mode: TranspileMode,
): Promise<TransformResult> {
  const resolved = { ...defaultTranspileOptions, ...options };

  // A custom transform decides for itself; it receives `filePath`, which is
  // enough to tell a project's entry from the rest.
  if (transform) return transform(source, resolved);

  const { transform: sucraseTransform } = await loadTranspiler();

  try {
    return runTranspile(sucraseTransform, source, resolved, mode);
  } catch (cause) {
    throw toCompileError(cause);
  }
}

/** Sucrase parse errors carry a `(line:column)` suffix worth surfacing. */
function toCompileError(cause: unknown): LiveCompileError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const match = /\((\d+):(\d+)\)\s*$/.exec(message);
  if (!match) return new LiveCompileError(message, undefined, cause);

  return new LiveCompileError(
    message.slice(0, match.index).trim(),
    { line: Number(match[1]), column: Number(match[2]) },
    cause,
  );
}

/**
 * Names declared at the top level of compiled output, used to recover a
 * component from a snippet that never exported one.
 *
 * Matched at the start of a line *or* just after a `;`. Column zero alone is
 * not enough: Sucrase prepends its own preamble - `"use strict";var _jsxruntime
 * = require(...)` - to line 1, so a component declared on the snippet's first
 * line no longer sits at column zero and was silently skipped. The snippet
 * below then exported `y`, and the author was told the default export was a
 * number:
 *
 * ```js
 * const App = () => <b/>;   // invisible: shares line 1 with the preamble
 * const y = 2;              // found, and wrongly chosen
 * ```
 *
 * Matching after `;` also admits declarations nested inside a function body,
 * which is harmless by the same reasoning as any other false positive: the
 * generated epilogue guards every name with `typeof`, and a block-scoped name
 * is `undefined` at module level, so it is skipped.
 */
export function scanTopLevelDeclarations(code: string): string[] {
  const names: string[] = [];
  const patterns = [
    /(?:^|;)\s*(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
    /(?:^|;)\s*class\s+([A-Za-z_$][\w$]*)/gm,
    /(?:^|;)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1];
      if (name !== undefined && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * Wraps an already-compiled result as a `transform` function, so the client
 * skips loading Sucrase entirely:
 *
 * ```tsx
 * <LiveProvider code={source} transform={precompiledTransform(compiled)} />
 * ```
 *
 * Lives here rather than next-live/server on purpose. It is a pure closure over
 * a value and needs no transpiler - but importing it from the server entry
 * would pull Sucrase statically into the page bundle, which is the exact cost
 * precompiling exists to avoid.
 */
export function precompiledTransform(result: TransformResult): () => TransformResult;
/**
 * The multi-file form: one result per project file, as `precompileFiles`
 * returns them, looked up by the `filePath` each file is compiled under.
 */
export function precompiledTransform(
  results: Readonly<Record<string, TransformResult>>,
): import('./types').TransformFn;
export function precompiledTransform(
  input: TransformResult | Readonly<Record<string, TransformResult>>,
): import('./types').TransformFn {
  if (typeof (input as TransformResult).code === 'string') {
    const result = input as TransformResult;
    return () => result;
  }

  const results = input as Readonly<Record<string, TransformResult>>;
  return (_source, options) => {
    const target = normalizeProjectPath(options.filePath);
    const hit =
      results[options.filePath] ??
      Object.entries(results).find(([key]) => normalizeProjectPath(key) === target)?.[1];
    if (!hit) {
      throw new LiveCompileError(
        `No precompiled output for '${options.filePath}'. Precompile every project file, e.g. with precompileFiles().`,
        { file: options.filePath },
      );
    }
    return hit;
  };
}
