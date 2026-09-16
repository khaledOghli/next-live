import { join } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { packageRoot } from '../docs/api-surface';

/**
 * Type-level guarantees, compiled for real.
 *
 * Runtime tests cannot see a type that is missing or wrong, and `tsc` only
 * checks `src`. So each fixture below is compiled against the source with the
 * package's own compiler options. A fixture must compile cleanly, and every
 * `@ts-expect-error` in it must find the error it expects, which proves the
 * negative cases too: an unused `@ts-expect-error` is itself a compile error.
 */

const fixtureDir = join(packageRoot, 'test', 'types');

/**
 * Every fixture, compiled together in one program: building a program means
 * loading `src` and React's types, which is the slow part, so it happens once.
 * Diagnostics are then read back per fixture file.
 */
const FIXTURES: Record<string, string> = {};

function fixture(name: string, source: string): string {
  FIXTURES[name] = source;
  return name;
}

let diagnostics: Map<string, string[]>;

beforeAll(() => {
  const config = ts.readConfigFile(join(packageRoot, 'tsconfig.json'), (path) => ts.sys.readFile(path));
  const options = { ...ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot).options, noEmit: true };

  const files = new Map(Object.entries(FIXTURES).map(([name, source]) => [join(fixtureDir, `${name}.fixture.ts`), source]));
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (path, languageVersion, ...rest) => {
    const source = files.get(path);
    return source !== undefined
      ? ts.createSourceFile(path, source, languageVersion, true)
      : getSourceFile.call(host, path, languageVersion, ...rest);
  };
  host.fileExists = (path) => files.has(path) || fileExists.call(host, path);
  host.readFile = (path) => files.get(path) ?? readFile.call(host, path);

  const program = ts.createProgram({ rootNames: [...files.keys()], options, host });
  diagnostics = new Map([...files.keys()].map((path) => [path, [] as string[]]));
  for (const d of ts.getPreEmitDiagnostics(program)) {
    const list = d.file && diagnostics.get(d.file.fileName);
    if (!list) continue;
    const { line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0);
    list.push(`line ${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  }
});

/** Diagnostics reported inside one fixture file, as readable lines. */
function diagnosticsFor(name: string): string[] {
  const list = diagnostics.get(join(fixtureDir, `${name}.fixture.ts`));
  if (!list) throw new Error(`Unknown fixture ${name}`);
  return list;
}

describe('the harness', () => {
  const control = fixture('control', 'export const n: number = "not a number";');
  const unused = fixture('unused', '// @ts-expect-error\nexport const n: number = 1;');

  it('reports a real type error, so a clean result means something', () => {
    expect(diagnosticsFor(control)).toHaveLength(1);
  });

  it('reports an unused @ts-expect-error', () => {
    expect(diagnosticsFor(unused)).toHaveLength(1);
  });
});

describe('public types', () => {
  const runtimeError = fixture('runtime-error', `
      import { LiveRuntimeError, RenderLoopError, errorPosition } from '../../src/index';

      declare const error: LiveRuntimeError;
      const line: number | undefined = error.line;
      const column: number | undefined = error.column;
      const file: string | undefined = error.file;

      // Inherited by the render-loop breaker's error.
      declare const loop: RenderLoopError;
      const loopLine: number | undefined = loop.line;

      // @ts-expect-error optional: a caller has to handle undefined
      const mustNarrow: number = error.line;

      // @ts-expect-error readonly
      error.line = 3;

      // What the docs show, with no cast.
      function paint(caught: unknown) {
        if (caught instanceof LiveRuntimeError && caught.line !== undefined) {
          const exact: number = caught.line;
          return exact + (caught.column ?? 0);
        }
        return errorPosition(caught as Error)?.line;
      }

      export { line, column, file, loopLine, mustNarrow, paint };
    `);
  it('LiveRuntimeError declares its optional, readonly position fields', () => {
    expect(diagnosticsFor(runtimeError)).toEqual([]);
  });

  const transpile = fixture('transpile', `
      import { transpile } from '../../src/index';
      import type { TransformFn } from '../../src/index';

      const passthrough: TransformFn = (code) => ({ code, linePrefixOffset: 0, expression: false });

      void transpile('<div />');
      void transpile('<div />', { filePath: 'A.tsx' });
      void transpile('<div />', {}, passthrough);

      // @ts-expect-error the mode switch is internal
      void transpile('<div />', {}, undefined, 'module');
    `);
  it('transpile takes three parameters, and no internal mode switch', () => {
    expect(diagnosticsFor(transpile)).toEqual([]);
  });

  const format = fixture('format', `
      import type { FormatContext, FormatFn, FormatResult, LiveEditorProps } from '../../src/editor';
      import { createPrettierFormatter } from '../../src/prettier';
      import type { FormatFn as PrettierFormatFn } from '../../src/prettier';

      const upper: FormatFn = (code: string, ctx: FormatContext): FormatResult => ({
        code: code.toUpperCase(),
        cursorOffset: ctx.cursorOffset,
      });
      const asyncFormat: FormatFn = async (code) => code;

      const prettier: PrettierFormatFn = createPrettierFormatter({ semi: false });
      const interchangeable: FormatFn = prettier;
      const props: LiveEditorProps = { format: upper };

      // @ts-expect-error a formatter must return code
      const broken: FormatFn = () => 42;

      export { asyncFormat, interchangeable, props, broken };
    `);
  it('exports the formatter types from next-live/editor and next-live/prettier, as one type', () => {
    expect(diagnosticsFor(format)).toEqual([]);
  });

  const resolver = fixture('resolver', `
      import { createRequire, resolveModules } from '../../src/index';
      import type { ResolvedModules, ResolveOptions } from '../../src/index';

      const options: ResolveOptions = { registry: { react: {} }, specifiers: ['react'], resolveSubpaths: false };
      const pending: Promise<ResolvedModules> = resolveModules(options);

      async function load() {
        const resolved: ResolvedModules = await pending;
        const keys: readonly string[] = resolved.keys;
        return { require: createRequire(resolved), keys };
      }

      // @ts-expect-error specifiers are required
      const incomplete: ResolveOptions = { registry: {} };

      export { load, incomplete };
    `);
  it('exports the types createRequire and resolveModules are written in', () => {
    expect(diagnosticsFor(resolver)).toEqual([]);
  });

  const setTranspiler = fixture('set-transpiler', `
      import { setTranspiler } from '../../src/index';
      import * as sucrase from 'sucrase';

      setTranspiler(sucrase);
      setTranspiler(null);

      // @ts-expect-error not a transpiler
      setTranspiler({ transform: 42 });
    `);
  it('types setTranspiler as the Sucrase module or null', () => {
    expect(diagnosticsFor(setTranspiler)).toEqual([]);
  });

  const options = fixture('options', `
      import { useLiveModule, useLiveRunner } from '../../src/index';
      import type { LiveProviderProps, UseLiveModuleOptions, UseLiveRunnerOptions } from '../../src/index';

      const signal = new AbortController().signal;
      const provider: LiveProviderProps = { code: 'x', signal, resolveSubpaths: true };
      const runner: UseLiveRunnerOptions = { code: 'x', signal, resolveSubpaths: true };
      const module: UseLiveModuleOptions = { code: 'x', signal, resolveSubpaths: true };

      // @ts-expect-error a signal, not a boolean
      const wrong: UseLiveRunnerOptions = { code: 'x', signal: true };

      export { provider, runner, module, wrong, useLiveModule, useLiveRunner };
    `);
  it('accepts signal and resolveSubpaths on the provider and both hooks', () => {
    expect(diagnosticsFor(options)).toEqual([]);
  });
});
