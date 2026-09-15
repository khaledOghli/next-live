import { builtinModules } from './builtins';
import { createConsoleSession } from './console';
import { LiveCompileError, LiveError, LiveRuntimeError, ModuleNotFoundError } from './errors';
import { evaluate, pickRenderable, runModule } from './evaluate';
import type { ModuleResult } from './evaluate';
import type { PositionedError } from './positions';
import {
  normalizeFiles,
  relativeSpecifier,
  resolveEntry,
  resolveProjectSpecifier,
} from './project';
import type { ProjectFile } from './project';
import { injectRenderBudgetTick } from './inject-render-budget';
import { createRequire, resolveModules, scanRequires } from './resolver';
import { filterUserFrames, firstUserFrame, mapPosition } from './stacks';
import { defaultTranspileOptions, transpile } from './transpile';
import type {
  CompileModuleResult,
  CompileOptions,
  CompileResult,
  LiveScope,
  NormalizedModule,
  TransformResult,
} from './types';

export interface CompileInput extends CompileOptions {
  code: string;
  /** Reports each render of the compiled component to the loop breaker. */
  onRender?: () => void;
}

/**
 * Compiles and evaluates a snippet, returning something renderable.
 *
 * The stages run in a fixed order for one reason: Sucrase emits synchronous
 * `require()` calls, so every module - including any registered as an async
 * loader, must be resolved *before* evaluation begins.
 */
export async function compile(input: CompileInput | CompileFilesInput): Promise<CompileResult> {
  if (isFilesInput(input)) return compileProject(input, 'component');
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
    onConsole,
    forwardConsole = true,
    ...transpileOptions
  } = input;

  const options = { ...defaultTranspileOptions, ...transpileOptions };

  const budgetedSource = onRender ? injectRenderBudgetTick(source) : source;
  const transformed = await transpile(budgetedSource, options, transform);
  signal?.throwIfAborted();

  const meta = {
    linePrefixOffset: transformed.linePrefixOffset,
    generatedLineCount: countLines(transformed.code),
    sourceLineCount: countLines(source),
  };

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

  // Only built when asked for. Without it no `console` parameter is injected,
  // so the snippet sees the real console and 1.0 behaviour is untouched.
  const session = onConsole
    ? createConsoleSession({
        emit: onConsole,
        forward: forwardConsole ? consoleForwardTarget(scope) : false,
        locate: (stack) => {
          const frame = firstUserFrame(stack);
          return frame ? mapPosition(frame, meta) : null;
        },
      })
    : undefined;

  return {
    code: transformed.code,
    imports,
    evaluateOptions: {
      code: transformed.code,
      filePath: options.filePath,
      require: createRequire(resolved),
      scope,
      ...(onRender ? { liveTick: onRender } : {}),
      ...(session ? { console: session.proxyFor() } : {}),
    },
    meta,
  };
}

/** A host-supplied `scope.console` keeps receiving calls while capture is on. */
function consoleForwardTarget(scope: LiveScope): object {
  const candidate = scope['console'];
  return typeof candidate === 'object' && candidate !== null ? candidate : globalThis.console;
}

/**
 * Compiles and runs a snippet, returning its exports rather than a component.
 *
 * Use this for stored code that is not UI, a validator, a data transformer, a
 * calculated field. {@link compile} is the right call when you need something
 * to render; this one makes no such demand and will happily return
 * `{ validate, schema }`.
 */
export async function compileModule(
  input: CompileInput | CompileFilesInput,
): Promise<CompileModuleResult> {
  if (isFilesInput(input)) return compileProject(input, 'module');
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
  const frame = firstUserFrame(stack);
  return frame ? { line: frame.line, column: frame.column } : null;
}

/**
 * A snippet made of several files that import each other by relative path.
 *
 * Kept a separate input from {@link CompileInput} rather than folding `code`
 * into a one-file project: the single-snippet path is what every 1.0 host runs,
 * and it stays exactly as it was.
 */
export interface CompileFilesInput extends CompileOptions {
  /** Source by path, e.g. `{ 'App.tsx': ..., 'components/Button.tsx': ... }`. */
  files: Readonly<Record<string, string>>;
  /** The file whose exports are rendered. Default: the first key. */
  entry?: string;
  /** Reports each render of a compiled component to the loop breaker. */
  onRender?: () => void;
}

function isFilesInput(input: CompileInput | CompileFilesInput): input is CompileFilesInput {
  return (input as Partial<CompileFilesInput>).files !== undefined;
}

interface LineMeta {
  linePrefixOffset: number;
  generatedLineCount: number;
  sourceLineCount: number;
}

interface PreparedFile {
  /** Normalized path; also the `sourceURL`, so stack frames name it. */
  path: string;
  /** The host's own key, which is what errors and results report. */
  key: string;
  code: string;
  meta: LineMeta;
  /** Specifier → normalized path, for imports that resolve to another file. */
  links: Map<string, string>;
}

async function compileProject(input: CompileFilesInput, want: 'component'): Promise<CompileResult>;
async function compileProject(input: CompileFilesInput, want: 'module'): Promise<CompileModuleResult>;
async function compileProject(
  input: CompileFilesInput,
  want: 'component' | 'module',
): Promise<CompileResult | CompileModuleResult> {
  const {
    files,
    entry: entryName,
    modules,
    scope = {},
    transform,
    signal,
    onRender,
    resolveSubpaths = false,
    onConsole,
    forwardConsole = true,
    ...transpileOptions
  } = input;

  const project = normalizeFiles(files);
  const entry = resolveEntry(project, entryName);
  const baseOptions = { ...defaultTranspileOptions, ...transpileOptions };

  const prepareFile = async (path: string): Promise<PreparedFile> => {
    const file = project.get(path) as ProjectFile;
    const source = onRender ? injectRenderBudgetTick(file.source) : file.source;
    let transformed: TransformResult;
    try {
      transformed = await transpile(
        source,
        // The transform sees the host's key, so a precompiled record keyed the
        // same way finds each file.
        { ...baseOptions, filePath: file.key },
        transform,
        path === entry ? 'auto' : 'module',
      );
    } catch (cause) {
      throw withFile(cause, file.key);
    }
    return {
      path,
      key: file.key,
      code: transformed.code,
      meta: {
        linePrefixOffset: transformed.linePrefixOffset,
        generatedLineCount: countLines(transformed.code),
        sourceLineCount: countLines(file.source),
      },
      links: new Map(),
    };
  };

  // Walk the import graph from the entry, one layer at a time, transpiling
  // each layer in parallel. Files nothing imports are never compiled, so a
  // half-written scratch file cannot break the preview.
  const prepared = new Map<string, PreparedFile>();
  const external = new Set<string>();
  const queued = new Set([entry]);
  let layer = [entry];

  while (layer.length > 0) {
    const batch = await Promise.all(layer.map(prepareFile));
    signal?.throwIfAborted();

    const next: string[] = [];
    for (const file of batch) {
      prepared.set(file.path, file);
      for (const specifier of scanRequires(file.code)) {
        const target = resolveProjectSpecifier(file.path, specifier, project);
        if (target === undefined) {
          external.add(specifier);
          continue;
        }
        file.links.set(specifier, target);
        if (!queued.has(target)) {
          queued.add(target);
          next.push(target);
        }
      }
    }
    layer = next;
  }

  const registry = { ...builtinModules, ...modules };
  const imports = [...external].sort();
  const resolved = await resolveModules({
    registry,
    specifiers: imports,
    resolveSubpaths,
    ...(signal ? { signal } : {}),
  });
  signal?.throwIfAborted();
  const fromRegistry = createRequire(resolved);

  const session = onConsole
    ? createConsoleSession({
        emit: onConsole,
        forward: forwardConsole ? consoleForwardTarget(scope) : false,
        locate: (stack) => {
          const frame = firstUserFrame(stack);
          const file = frame?.file !== undefined ? prepared.get(frame.file) : undefined;
          return frame && file ? mapPosition(frame, file.meta) : null;
        },
      })
    : undefined;

  const entryKey = (prepared.get(entry) as PreparedFile).key;
  const renderOutsideEntry = (): never => {
    throw new LiveRuntimeError(`render() can only be called from the entry file ('${entryKey}').`);
  };

  // CommonJS semantics, because that is what Sucrase emits: a file runs once,
  // on first require, and is cached *before* it runs so a circular import gets
  // the partially-filled exports instead of recursing forever.
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const ran: string[] = [];

  const run = (file: PreparedFile): ModuleResult => {
    const record = { exports: Object.create(null) as Record<string, unknown> };
    cache.set(file.path, record);
    ran.push(file.key);
    try {
      return runModule({
        code: file.code,
        filePath: file.path,
        require: requireFor(file),
        scope,
        module: record,
        ...(file.path === entry ? {} : { recoverDefault: false, render: renderOutsideEntry }),
        ...(onRender ? { liveTick: onRender } : {}),
        ...(session ? { console: session.proxyFor(file.key) } : {}),
      });
    } catch (error) {
      cache.delete(file.path);
      throw error;
    }
  };

  const requireFor =
    (file: PreparedFile) =>
    (specifier: string): NormalizedModule => {
      const target = file.links.get(specifier);
      if (target !== undefined) {
        const cached = cache.get(target);
        if (cached) return cached.exports as unknown as NormalizedModule;
        return run(prepared.get(target) as PreparedFile).exports as unknown as NormalizedModule;
      }

      try {
        return fromRegistry(specifier);
      } catch (error) {
        if (!(error instanceof ModuleNotFoundError)) throw error;
        const siblings = [...project.keys()]
          .filter((path) => path !== file.path)
          .map((path) => relativeSpecifier(file.path, path));
        throw new ModuleNotFoundError(specifier, [...error.available, ...siblings], file.key);
      }
    };

  let entryResult: ModuleResult;
  try {
    entryResult = run(prepared.get(entry) as PreparedFile);
  } catch (cause) {
    throw enrichProjectError(cause, prepared);
  }

  const shared = { code: (prepared.get(entry) as PreparedFile).code, imports, entry: entryKey, files: [...ran] };
  if (want === 'module') return { exports: entryResult.exports, ...shared };

  try {
    const { renderable, via } = pickRenderable(
      entryResult.exports,
      entryResult.rendered,
      entryResult.recovered,
    );
    return { renderable, via, ...shared };
  } catch (cause) {
    throw enrichProjectError(cause, prepared);
  }
}

/** Names the file a transpile error came from, keeping its position. */
function withFile(cause: unknown, key: string): unknown {
  if (!(cause instanceof LiveCompileError) || cause.file !== undefined) return cause;
  return new LiveCompileError(
    cause.message,
    {
      ...(cause.line !== undefined ? { line: cause.line } : {}),
      ...(cause.column !== undefined ? { column: cause.column } : {}),
      file: key,
    },
    cause.cause,
  );
}

/**
 * The multi-file counterpart of `enrichRuntimeError`: the innermost snippet
 * frame names the file, and that file's own line metadata maps the position.
 */
function enrichProjectError(cause: unknown, prepared: Map<string, PreparedFile>): Error {
  if (!(cause instanceof Error)) {
    return new LiveRuntimeError(String(cause), { cause });
  }

  const frame = firstUserFrame(cause.stack);
  const file = frame?.file !== undefined ? prepared.get(frame.file) : undefined;
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

export type { CompileModuleResult } from './types';
export { LiveCompileError };

