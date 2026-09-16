import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadApiSurface, packageRoot } from './api-surface';
import type { ApiSurface, PropertyInfo } from './api-surface';
import {
  apiEntries,
  callSyntaxProblems,
  errorTableProblems,
  exceptListProblems,
  experimentalProblems,
  extendsPlusProblems,
  mainTable,
  missingExports,
  missingLiterals,
  parseCallText,
  requiredMismatches,
  siteSignatureProblems,
  undocumented,
  unknownRows,
} from './doc-checks';
import type { SignatureSource } from './doc-checks';
import {
  backtickedNames,
  markdownRowIsRequired,
  markdownSection,
  markdownTables,
  mdxEntry,
  mdxRowIsRequired,
} from './doc-parsers';

/**
 * Proof that the docs checks fail when they should.
 *
 * `api-reference.test.ts` passing only shows today's docs agree with today's
 * source. A check with a bug in it (a regex that never matches, a set compared
 * with itself) would pass forever, so every check is run here twice: on small
 * inputs that pin down its rules, and on the real reference with one specific
 * mistake put back in, the kind of drift it exists to catch.
 */

const prop = (name: string, optional = true, internal = false): PropertyInfo => ({ name, optional, internal });
const section = (body: string) => {
  const tables = markdownTables(body);
  return { heading: '', body, rows: tables.flat(), tables };
};

describe('unknownRows', () => {
  it('reports a row for a prop the type does not have', () => {
    const doc = section('| Prop |\n|---|\n| `code` |\n| `bogus` |');
    expect(unknownRows(doc.rows, ['code'])).toEqual(['bogus']);
  });

  it('passes when every row is real', () => {
    expect(unknownRows(section('| P |\n|---|\n| `a` / `b` |').rows, ['a', 'b'])).toEqual([]);
  });
});

describe('undocumented', () => {
  const doc = section('Uses `mentioned`.\n\n| P |\n|---|\n| `rowed` |');

  it('reports public props named nowhere', () => {
    expect(undocumented([prop('mentioned'), prop('rowed'), prop('missing')], doc)).toEqual(['missing']);
  });

  it('skips @internal props', () => {
    expect(undocumented([prop('secret', true, true)], doc)).toEqual([]);
  });

  it('skips props another section owns', () => {
    expect(undocumented([prop('filePath')], doc, new Set(['filePath']))).toEqual([]);
  });

  it('does not count a name that only appears unquoted in prose', () => {
    expect(undocumented([prop('plain')], section('The plain prop.'))).toEqual(['plain']);
  });
});

describe('requiredMismatches', () => {
  const table = markdownTables(
    '| P | Type | Notes |\n|---|---|---|\n| `a` | `x` | Required. |\n| `b` | `x` | Optional. |',
  )[0] as ReturnType<typeof markdownTables>[number];

  it('passes when the markings match the type', () => {
    expect(requiredMismatches([prop('a', false), prop('b', true)], table, markdownRowIsRequired)).toEqual([]);
  });

  it('reports a required prop documented as optional', () => {
    expect(requiredMismatches([prop('a', false), prop('b', false)], table, markdownRowIsRequired)).toEqual([
      'b: docs say optional, type says required',
    ]);
  });

  it('reports an optional prop documented as required', () => {
    expect(requiredMismatches([prop('a', true), prop('b', true)], table, markdownRowIsRequired)).toEqual([
      'a: docs say required, type says optional',
    ]);
  });

  it('reports a required prop with no row to carry the marking', () => {
    expect(requiredMismatches([prop('a', false), prop('c', false)], table, markdownRowIsRequired)).toEqual([
      'c: required, but has no table row',
    ]);
  });
});

describe('exceptListProblems', () => {
  const body = 'Accepts every `Provider` prop except `props`, `language` and `onError`. Returns:';

  it('passes when the list is exactly the difference', () => {
    expect(exceptListProblems(body, 'Provider', ['code', 'props', 'language', 'onError'], ['code'])).toEqual([]);
  });

  it('reports an option missing from the list', () => {
    expect(exceptListProblems(body, 'Provider', ['code', 'props', 'language', 'onError', 'sandbox'], ['code'])).toEqual([
      'sandbox: not accepted, but not listed as an exception',
    ]);
  });

  it('reports a listed option that is in fact accepted', () => {
    expect(exceptListProblems(body, 'Provider', ['code', 'props', 'language', 'onError'], ['code', 'onError'])).toEqual([
      'onError: listed as an exception, but accepted',
    ]);
  });

  it('reports an option the derived type adds, which makes "every" untrue', () => {
    expect(exceptListProblems(body, 'Provider', ['props', 'language', 'onError'], ['extra'])).toEqual([
      'extra: accepted, but `Provider` has no such option',
    ]);
  });

  it('reads a sentence wrapped across lines', () => {
    const wrapped = 'Accepts every `Provider` prop except `props`,\n`language` and `onError`.';
    expect(exceptListProblems(wrapped, 'Provider', ['props', 'language', 'onError'], [])).toEqual([]);
  });

  it('reports a missing sentence rather than passing', () => {
    expect(exceptListProblems('Accepts the usual options.', 'Provider', ['a'], [])).toEqual([
      'no "Accepts every `Provider` option except ..." sentence',
    ]);
  });
});

describe('extendsPlusProblems', () => {
  it('passes when every addition is named', () => {
    expect(extendsPlusProblems('plus `props` and `language`', ['code'], ['code', 'props', 'language'])).toEqual([]);
  });

  it('reports an unnamed addition', () => {
    expect(extendsPlusProblems('plus `props`', ['code'], ['code', 'props', 'formatError'])).toEqual([
      'formatError: returned, but not named',
    ]);
  });

  it('reports a base field the derived type does not have', () => {
    expect(extendsPlusProblems('', ['code', 'gone'], ['code'])).toEqual(['gone: said to be included, but missing']);
  });
});

describe('errorTableProblems', () => {
  const table = markdownTables(
    [
      '| Class | Raised when |',
      '|---|---|',
      '| `ParentError` | Carries `line` and `column`. |',
      '| `ChildError` | `instanceof ParentError` is true. |',
    ].join('\n'),
  )[0] as ReturnType<typeof markdownTables>[number];

  const classes = [
    { name: 'ParentError', fields: ['line', 'column'] },
    { name: 'ChildError', fields: ['line', 'column'], parent: 'ParentError' },
  ];

  it('passes, letting a subclass rely on its parent row', () => {
    expect(errorTableProblems(table, classes)).toEqual([]);
  });

  it('reports a field no row mentions', () => {
    expect(errorTableProblems(table, [{ name: 'ParentError', fields: ['line', 'file'] }, classes[1] as never])).toContain(
      'ParentError.file: not mentioned in its row',
    );
  });

  it('reports a class with no row, and a row with no class', () => {
    const problems = errorTableProblems(table, [classes[0] as never, { name: 'NewError', fields: [] }]);
    expect(problems).toContain('NewError: has no row');
    expect(problems).toContain('ChildError: has a row, but is not an error class');
  });

  it('does not loop on a class listed as its own parent', () => {
    expect(errorTableProblems(table, [{ name: 'ParentError', fields: ['line'], parent: 'ParentError' }, classes[1] as never])).toEqual([]);
  });
});

describe('missingLiterals, missingExports, experimentalProblems', () => {
  it('reports literal values never shown in backticks', () => {
    expect(missingLiterals("`'COMPILE'` and RUNTIME", ['COMPILE', 'RUNTIME'])).toEqual(['RUNTIME']);
  });

  it('reports exports never mentioned', () => {
    expect(missingExports(new Set(['a']), [{ entry: 'pkg', name: 'a' }, { entry: 'pkg/x', name: 'b' }])).toEqual(['pkg/x#b']);
  });

  it('reports the experimental table in both directions', () => {
    const table = markdownTables('| Export |\n|---|\n| `setTranspiler(module)` |\n| `stable()` |')[0] ?? [];
    expect(experimentalProblems(table, ['setTranspiler', 'createRenderBudget'])).toEqual([
      'createRenderBudget: @experimental, but not listed',
      'stable: listed, but not @experimental',
    ]);
  });
});

describe('parseCallText and callSyntaxProblems', () => {
  const overloads = (name: string) =>
    ({
      transpile: [[{ name: 'source', optional: false, rest: false }, { name: 'options', optional: true, rest: false }]],
      createRegistry: [[{ name: 'groups', optional: false, rest: true }]],
      defineModule: [[{ name: 'shape', optional: false, rest: false }]],
      precompiledTransform: [
        [{ name: 'result', optional: false, rest: false }],
        [{ name: 'results', optional: false, rest: false }],
      ],
    })[name] ?? null;

  it('splits parameters, keeping nested brackets whole', () => {
    expect(parseCallText('defineModule({ default, exports })')).toEqual({ name: 'defineModule', params: ['{ default, exports }'] });
    expect(parseCallText('preload()')).toEqual({ name: 'preload', params: [] });
    expect(parseCallText('not a call')).toBeNull();
  });

  it('passes correct call syntax, including rest, destructuring, and any overload', () => {
    const text = '`transpile(source, options?)` `createRegistry(...groups)` `defineModule({ default })` `precompiledTransform(results)`';
    expect(callSyntaxProblems(text, overloads)).toEqual([]);
  });

  it('reports a parameter missing its `?`', () => {
    expect(callSyntaxProblems('`transpile(source, options)`', overloads)).toEqual([
      'transpile(source, options) should be transpile(source, options?)',
    ]);
  });

  it('reports a renamed or extra parameter, and a missing rest marker', () => {
    expect(callSyntaxProblems('`transpile(code, options?)`', overloads)).toHaveLength(1);
    expect(callSyntaxProblems('`transpile(source, options?, extra)`', overloads)).toHaveLength(1);
    expect(callSyntaxProblems('`createRegistry(groups)`', overloads)).toHaveLength(1);
  });

  it('ignores calls to names that are not public functions', () => {
    expect(callSyntaxProblems('`isStale(entry)` `reload()`', overloads)).toEqual([]);
  });
});

describe('apiEntries and siteSignatureProblems', () => {
  const source: SignatureSource = {
    isExported: (_from, name) => ['run', 'useThing', 'Boundary', 'TABLE'].includes(name),
    callable: (_from, name) =>
      name === 'run'
        ? { signatures: ['(input: Input, options?: Options | undefined) => Promise<Result>'] }
        : name === 'useThing'
          ? { signatures: ['() => State'] }
          : null,
    heritage: (_from, name) => (name === 'Boundary' ? 'extends Component<Props>' : null),
    constantType: (_from, name) => (name === 'TABLE' ? 'Registry' : null),
  };
  const entry = (name: string, kind: string, signature: string) => ({ name, kind, from: 'pkg', signature });

  it('reads attributes in any order, with `>` inside the signature', () => {
    const [read] = apiEntries('<ApiEntry signature="function f(): Promise<A>" from="pkg" kind="function" name="f">');
    expect(read).toEqual({ name: 'f', kind: 'function', from: 'pkg', signature: 'function f(): Promise<A>' });
  });

  it('passes correct functions, hooks, classes and constants', () => {
    expect(
      siteSignatureProblems(
        [
          entry('run', 'function', 'function run(input: Input, options?: Options): Promise<Result>'),
          entry('useThing', 'hook', 'function useThing(): State'),
          entry('Boundary', 'component', 'class Boundary extends Component<Props>'),
          entry('TABLE', 'constant', 'const TABLE: Registry'),
        ],
        source,
      ),
    ).toEqual([]);
  });

  it('reports a wrong return type', () => {
    expect(siteSignatureProblems([entry('run', 'function', 'function run(input: Input, options?: Options): Result')], source)).toHaveLength(1);
  });

  it('reports a documented overload that does not exist', () => {
    const signature = 'function run(input: Input, options?: Options): Promise<Result>\nfunction run(): void';
    expect(siteSignatureProblems([entry('run', 'function', signature)], source)).toHaveLength(1);
  });

  it('reports a class written as a function, and a wrong constant type', () => {
    expect(siteSignatureProblems([entry('Boundary', 'component', 'function Boundary(props: Props): ReactNode')], source)).toHaveLength(1);
    expect(siteSignatureProblems([entry('TABLE', 'constant', 'const TABLE: Other')], source)).toHaveLength(1);
  });

  it('reports a kind that does not fit', () => {
    expect(siteSignatureProblems([entry('useThing', 'function', 'function useThing(): State')], source)).toEqual([
      'useThing: kind "function" does not fit its name',
    ]);
    expect(siteSignatureProblems([entry('TABLE', 'function', 'const TABLE: Registry')], source)).toEqual([
      'TABLE is a constant, but kind is "function"',
    ]);
  });

  it('reports an entry that is not exported, or has no signature', () => {
    expect(siteSignatureProblems([entry('gone', 'function', 'function gone(): void')], source)).toEqual(['gone is not exported from pkg']);
    expect(siteSignatureProblems([entry('run', 'function', '')], source)).toEqual(['run has no signature']);
  });
});

// ---------------------------------------------------------------------------
// The real reference, with one mistake put back in at a time
// ---------------------------------------------------------------------------

const markdownPath = join(packageRoot, 'docs', '06-api-reference.md');
const sitePath = join(packageRoot, '..', '..', 'apps', 'playground', 'content', 'docs', 'api-reference.mdx');

/** Replaces exactly one occurrence, so a mutation can never silently miss. */
function mutate(text: string, from: string | RegExp, to: string): string {
  const count = typeof from === 'string' ? text.split(from).length - 1 : [...text.matchAll(new RegExp(from, 'g'))].length;
  if (count !== 1) throw new Error(`Mutation target found ${count} times: ${String(from)}`);
  return text.replace(from, to);
}

describe('the checks catch drift in the real reference', () => {
  let api: ApiSurface;
  let markdown: string;
  beforeAll(() => {
    api = loadApiSurface();
    markdown = readFileSync(markdownPath, 'utf8');
  });

  const names = (entry: string, type: string) => api.propertiesOf(entry, type).map((p) => p.name);

  it('a new prop nobody documented', () => {
    const broken = mutate(markdown, /\| `signal` \| `AbortSignal` \|[^\n]*\n/, '');
    const provider = markdownSection(broken, '`<LiveProvider>`');
    expect(undocumented(api.propertiesOf('next-live', 'LiveProviderProps'), provider)).toEqual(['signal']);
  });

  it('a row for a prop that was removed', () => {
    const broken = mutate(markdown, '| `debounce` | `number` |', '| `debounceMs` | `number` |');
    const provider = markdownSection(broken, '`<LiveProvider>`');
    expect(unknownRows(mainTable(provider), names('next-live', 'LiveProviderProps'))).toEqual(['debounceMs']);
  });

  it('a required prop documented as optional', () => {
    const broken = mutate(markdown, '| `unknown` | Required. Changing it', '| `unknown` | Changing it');
    const boundary = markdownSection(broken, '`<LiveErrorBoundary>`');
    expect(
      requiredMismatches(api.propertiesOf('next-live', 'LiveErrorBoundaryProps'), mainTable(boundary), markdownRowIsRequired),
    ).toEqual(['resetKey: docs say optional, type says required']);
  });

  it('an exception list that forgot an option', () => {
    const broken = mutate(markdown, '`onError`, `props` and `sandbox`. Returns:', '`onError` and `props`. Returns:');
    const runner = markdownSection(broken, '`useLiveRunner`');
    expect(
      exceptListProblems(runner.body, 'LiveProvider', names('next-live', 'LiveProviderProps'), names('next-live', 'UseLiveRunnerOptions')),
    ).toEqual(['sandbox: not accepted, but not listed as an exception']);
  });

  it('a parameter that became optional', () => {
    const broken = mutate(markdown, '`transpile(source, options?, transform?)`', '`transpile(source, options, transform?)`');
    const overloadsOf = (name: string) => (name === 'transpile' ? api.callableOf('next-live', 'transpile')?.parameters ?? null : null);
    expect(callSyntaxProblems(broken, overloadsOf)).toEqual([
      'transpile(source, options, transform?) should be transpile(source, options?, transform?)',
    ]);
  });

  it('an error code nobody listed', () => {
    const broken = mutate(markdown, "| `LiveSandboxError` | `'SANDBOX'` |", '| `LiveSandboxError` | - |');
    const errors = markdownSection(broken, 'Errors').body;
    expect(missingLiterals(errors, api.literalsOf('next-live', 'LiveErrorCode'))).toEqual(['SANDBOX']);
  });

  it('an error field the row no longer mentions', () => {
    const broken = mutate(markdown, 'Carries `line` and `column` where the stack can be mapped', 'Carries `line` where the stack can be mapped');
    const table = mainTable(markdownSection(broken, 'Errors'));
    const fields = names('next-live', 'LiveRuntimeError').filter((f) => f !== 'code');
    const problems = errorTableProblems(
      table,
      table.map((row) => row.names[0] as string).map((name) => ({ name, fields: name === 'LiveRuntimeError' ? fields : [] })),
    );
    expect(problems).toEqual(['LiveRuntimeError.column: not mentioned in its row']);
  });

  it('an export that lost its only mention', () => {
    const broken = markdown.split('PROTOCOL_VERSION').join('PROTOCOL');
    expect(missingExports(backtickedNames(broken), [{ entry: 'next-live/sandbox', name: 'PROTOCOL_VERSION' }])).toEqual([
      'next-live/sandbox#PROTOCOL_VERSION',
    ]);
  });

  describe.skipIf(!existsSync(sitePath))('on the docs site', () => {
    let site: string;
    beforeAll(() => {
      site = readFileSync(sitePath, 'utf8');
    });

    const signatureSource = (): SignatureSource => ({
      isExported: (from, name) => api.entries.includes(from) && api.exportsOf(from).some((e) => e.name === name),
      callable: (from, name) => api.callableOf(from, name),
      heritage: (from, name) => api.classHeritageOf(from, name),
      constantType: (from, name) => api.constantTypeOf(from, name),
    });

    it('a return type written from memory', () => {
      const broken = mutate(site, 'signature="function preloadTranspiler(): void"', 'signature="function preloadTranspiler(): Promise<void>"');
      const entries = apiEntries(broken).filter((e) => e.name === 'preloadTranspiler');
      expect(siteSignatureProblems(entries, signatureSource())).toHaveLength(1);
    });

    it('a field that grew but the signature did not', () => {
      const broken = mutate(site, '{ line: number; column?: number; file?: string } | null">', '{ line: number; column?: number } | null">');
      const entries = apiEntries(broken).filter((e) => e.name === 'errorPosition');
      expect(siteSignatureProblems(entries, signatureSource())).toHaveLength(1);
    });

    it('a required prop missing `required: true`', () => {
      const broken = mutate(site, "{ name: 'resetKey', type: 'unknown', required: true,", "{ name: 'resetKey', type: 'unknown',");
      const boundary = mdxEntry(broken, 'LiveErrorBoundary');
      expect(
        requiredMismatches(api.propertiesOf('next-live', 'LiveErrorBoundaryProps'), mainTable(boundary), mdxRowIsRequired),
      ).toEqual(['resetKey: docs say optional, type says required']);
    });

    it('a returned field left out of the prose', () => {
      const broken = mutate(site, '`reportRuntimeError`, and `formatError` when the provider has one.', '`reportRuntimeError`.');
      const context = mdxEntry(broken, 'useLiveContext');
      expect(
        extendsPlusProblems(context.body, names('next-live', 'LiveRunnerState'), names('next-live', 'LiveContextValue')),
      ).toEqual(['formatError: returned, but not named']);
    });
  });
});
