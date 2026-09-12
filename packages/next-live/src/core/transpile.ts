import { LiveCompileError, TranspilerLoadError } from './errors';
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

/** Replaces the loaded transpiler. Intended for tests and custom backends. */
export function setTranspiler(module: SucraseModule | null): void {
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

/** A call to the injected `render()` helper (react-live's "noInline" style). */
const RENDER_CALL_RE = /(^|[^.\w$])render\s*\(/m;

/**
 * Transpiles a snippet to CommonJS that `new Function` can evaluate.
 *
 * Three authoring styles are supported, resolved without ever asking the user
 * which one they used:
 *
 * 1. A real module — `export default function App() {}`.
 * 2. A bare expression — `<div/>` or `() => <div/>`.
 * 3. Bare statements with no export — `function App() {}`, or `render(<App/>)`.
 *
 * Styles 1 and 3 are compiled as-is; the component is recovered after
 * evaluation (see `evaluate.ts`). Style 2 is not a valid module body on its
 * own, so it is wrapped in `export default (...)`.
 */
export async function transpile(
  source: string,
  options: TranspileOptions = {},
  transform?: import('./types').TransformFn,
): Promise<TransformResult> {
  const resolved = { ...defaultTranspileOptions, ...options };

  if (transform) return transform(source, resolved);

  const { transform: sucraseTransform } = await loadTranspiler();

  const run = (input: string): string =>
    sucraseTransform(input, {
      transforms: ['jsx', 'typescript', 'imports'],
      jsxRuntime: resolved.jsxRuntime,
      jsxImportSource: resolved.jsxImportSource,
      production: resolved.production,
      filePath: resolved.filePath,
      // Leaving native `import()` intact would resolve against the *page* URL
      // and 404 on './utils'; routing it through our shim is the only sane
      // behaviour inside an evaluated snippet.
      preserveDynamicImport: false,
    }).code;

  // A snippet with imports or exports is unambiguously a module.
  // A `render(...)` call is a statement, so it is one too.
  const isModule = MODULE_SYNTAX_RE.test(source) || RENDER_CALL_RE.test(source);

  if (!isModule) {
    // Try the expression form first. The newlines matter: they shift the
    // user's code down exactly one line, which `linePrefixOffset` corrects,
    // whereas inlining would destroy line mapping for the whole snippet.
    try {
      return {
        code: run(`export default (\n${source}\n)`),
        linePrefixOffset: 1,
        expression: true,
      };
    } catch {
      // Multi-statement code with no exports — fall through to module mode.
    }
  }

  try {
    return { code: run(source), linePrefixOffset: 0, expression: false };
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
 * Anchored at column zero because Sucrase leaves top-level declarations
 * unindented. A false positive from inside a template literal is harmless —
 * the generated epilogue guards every name with `typeof`.
 */
export function scanTopLevelDeclarations(code: string): string[] {
  const names: string[] = [];
  const patterns = [
    /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
    /^class\s+([A-Za-z_$][\w$]*)/gm,
    /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
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
