import { builtinModules } from './builtins';
import { LiveCompileError, LiveError, LiveRuntimeError } from './errors';
import { evaluate, runModule } from './evaluate';
import { injectRenderBudgetTick } from './inject-render-budget';
import { createRequire, resolveModules, scanRequires } from './resolver';
import { filterUserFrames, mapPosition } from './stacks';
import { defaultTranspileOptions, transpile } from './transpile';
import type { CompileModuleResult, CompileOptions, CompileResult } from './types';

export interface CompileInput extends CompileOptions {
  code: string;
  /** Reports each render of the compiled component to the loop breaker. */
  onRender?: () => void;
  /** Opt in to resolving `pkg/sub` against a registered `pkg`. Default false. */
  resolveSubpaths?: boolean;
}

/**
 * Compiles and evaluates a snippet, returning something renderable.
 *
 * The stages run in a fixed order for one reason: Sucrase emits synchronous
 * `require()` calls, so every module - including any registered as an async
 * loader, must be resolved *before* evaluation begins.
 */
export async function compile(input: CompileInput): Promise<CompileResult> {
  const prepared = await prepare(input);
  try {
    const { renderable, via } = evaluate(prepared.evaluateOptions);
    return { renderable, via, code: prepared.code, imports: prepared.imports };
  } catch (cause) {
    throw enrichRuntimeError(cause, prepared.meta);
  }
}

/**
 * Everything up to evaluation: transpile, then resolve every specifier the
 * output requires.
 *
 * Resolution has to finish first because Sucrase emits synchronous `require()`
 * calls, which cannot await an async loader.
 */
async function prepare(input: CompileInput) {
  const {
    code: source,
    modules,
    scope = {},
    transform,
    signal,
    onRender,
    resolveSubpaths = false,
    ...transpileOptions
  } = input;

  const options = { ...defaultTranspileOptions, ...transpileOptions };

  const budgetedSource = onRender ? injectRenderBudgetTick(source) : source;
  const transformed = await transpile(budgetedSource, options, transform);
  signal?.throwIfAborted();

  // Host modules merge over the built-ins so React itself can be substituted,
  // while `react/jsx-runtime` stays available without anyone registering it.
  const registry = { ...builtinModules, ...modules };

  const imports = [...scanRequires(transformed.code)].sort();

  const resolved = await resolveModules({
    registry,
    specifiers: imports,
    resolveSubpaths,
    ...(signal ? { signal } : {}),
  });
  signal?.throwIfAborted();

  return {
    code: transformed.code,
    imports,
    evaluateOptions: {
      code: transformed.code,
      filePath: options.filePath,
      require: createRequire(resolved),
      scope,
      ...(onRender ? { liveTick: onRender } : {}),
    },
    meta: {
      linePrefixOffset: transformed.linePrefixOffset,
      generatedLineCount: countLines(transformed.code),
      sourceLineCount: countLines(source),
    },
  };
}

/**
 * Compiles and runs a snippet, returning its exports rather than a component.
 *
 * Use this for stored code that is not UI, a validator, a data transformer, a
 * calculated field. {@link compile} is the right call when you need something
 * to render; this one makes no such demand and will happily return
 * `{ validate, schema }`.
 */
export async function compileModule(input: CompileInput): Promise<CompileModuleResult> {
  const prepared = await prepare(input);
  try {
    const { exports } = runModule(prepared.evaluateOptions);
    return { exports, code: prepared.code, imports: prepared.imports };
  } catch (cause) {
    throw enrichRuntimeError(cause, prepared.meta);
  }
}

function countLines(text: string): number {
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

/**
 * Attaches the snippet's own line number to an error thrown during evaluation,
 * and strips host/React frames so the stack shows only user code.
 */
function enrichRuntimeError(
  cause: unknown,
  meta: { linePrefixOffset: number; generatedLineCount: number; sourceLineCount: number },
): Error {
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

function positionFromStack(stack: string | undefined): { line: number; column?: number } | null {
  if (!stack) return null;
  for (const raw of stack.split('\n')) {
    if (!raw.includes('next-live:///')) continue;
    const match = /:(\d+):(\d+)\)?\s*$/.exec(raw.trim());
    if (match?.[1]) {
      return { line: Number(match[1]), column: match[2] ? Number(match[2]) : undefined };
    }
  }
  return null;
}

export type { CompileModuleResult } from './types';
export { LiveCompileError };

