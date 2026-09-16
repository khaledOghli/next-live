import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadApiSurface, packageRoot } from './api-surface';
import type { ApiSurface } from './api-surface';
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
  requiredMismatches,
  siteSignatureProblems,
  undocumented,
  unknownRows,
} from './doc-checks';
import {
  backtickedNames,
  markdownRowIsRequired,
  markdownSection,
  mdxEntry,
  mdxRowIsRequired,
} from './doc-parsers';
import type { DocRow, DocSection } from './doc-parsers';

/**
 * The API reference, checked against the compiler.
 *
 * Both references are hand-written, which is what keeps them readable, and
 * what lets them drift: a prop gets added, a default changes, a parameter
 * becomes optional, and nothing makes anyone revisit a Markdown table. These
 * tests are that something. Each failure names the entry and the exact names
 * that disagree, so the fix is a docs edit, not an investigation.
 *
 * Checked for both the Markdown shipped in the package and the docs site:
 *
 * - Every documented prop, field, and option exists in the source type.
 * - Every public prop, field, and option is documented.
 * - "Required" is marked exactly where the type requires it.
 * - "Accepts every X prop except ..." lists exactly the real difference.
 * - Error classes, their fields, their codes, and sandbox reasons are listed.
 * - Every export of every public entry is mentioned.
 * - The Experimental table matches the `@experimental` tags.
 *
 * And per format: call syntax like `transpile(source, options?)` in the
 * Markdown, and full signatures in the site's `<ApiEntry>` headers.
 *
 * The checks themselves are proven to fail on broken docs in
 * `doc-checks.test.ts`.
 */

const markdownPath = join(packageRoot, 'docs', '06-api-reference.md');
const sitePath = join(packageRoot, '..', '..', 'apps', 'playground', 'content', 'docs', 'api-reference.mdx');
// The site lives in the monorepo, not in the published package. Skipping when
// it is absent keeps the suite usable from a standalone copy of the package.
const hasSite = existsSync(sitePath);

const markdownText = () => readFileSync(markdownPath, 'utf8');
const siteText = () => readFileSync(sitePath, 'utf8');

let api: ApiSurface;
beforeAll(() => {
  api = loadApiSurface();
});

// ---------------------------------------------------------------------------
// What each documented entry corresponds to in source
// ---------------------------------------------------------------------------

interface TypeRef {
  entry: string;
  name: string;
}

interface ComponentSpec {
  /** Markdown heading start, e.g. "`<LiveProvider>`". */
  heading: string;
  /** Docs site `<ApiEntry name>`. */
  siteName: string;
  props: TypeRef;
}

const COMPONENTS: ComponentSpec[] = [
  { heading: '`<LiveProvider>`', siteName: 'LiveProvider', props: { entry: 'next-live', name: 'LiveProviderProps' } },
  { heading: '`<LivePreview>`', siteName: 'LivePreview', props: { entry: 'next-live', name: 'LivePreviewProps' } },
  { heading: '`<LiveEditor>`', siteName: 'LiveEditor', props: { entry: 'next-live/editor', name: 'LiveEditorProps' } },
  { heading: '`<LiveError>`', siteName: 'LiveError', props: { entry: 'next-live', name: 'LiveErrorProps' } },
  { heading: '`<LiveErrorBoundary>`', siteName: 'LiveErrorBoundary', props: { entry: 'next-live', name: 'LiveErrorBoundaryProps' } },
  { heading: '`<LiveFileTabs>`', siteName: 'LiveFileTabs', props: { entry: 'next-live', name: 'LiveFileTabsProps' } },
  { heading: '`<LiveConsole>`', siteName: 'LiveConsole', props: { entry: 'next-live/console', name: 'LiveConsoleProps' } },
];

interface CoverageSpec {
  heading: string;
  siteName: string;
  /** Every public property of these types must be named in the section. */
  types: TypeRef[];
  /**
   * Option types this section may refer to rather than list, because another
   * section owns them (lists them in its own `types`) and so checks them fully.
   */
  shared?: TypeRef[];
}

const TRANSPILE_OPTIONS: TypeRef = { entry: 'next-live/server', name: 'TranspileOptions' };
const VALIDATE_OPTIONS: TypeRef = { entry: 'next-live/server', name: 'ValidateOptions' };

const COVERAGE: CoverageSpec[] = [
  {
    heading: '`<LiveEditor>`',
    siteName: 'LiveEditor',
    types: [
      { entry: 'next-live/editor', name: 'LiveEditorProps' },
      { entry: 'next-live/editor', name: 'LiveEditorRenderProps' },
      { entry: 'next-live/editor', name: 'LiveEditorHandle' },
    ],
  },
  { heading: '`useLiveRunner`', siteName: 'useLiveRunner', types: [{ entry: 'next-live', name: 'LiveRunnerState' }] },
  { heading: '`useLiveModule`', siteName: 'useLiveModule', types: [{ entry: 'next-live', name: 'LiveModuleState' }] },
  {
    heading: '`useLiveConsole`',
    siteName: 'useLiveConsole',
    types: [
      { entry: 'next-live/console', name: 'UseLiveConsoleOptions' },
      { entry: 'next-live/console', name: 'LiveConsoleState' },
    ],
  },
  {
    heading: '`precompile(',
    siteName: 'precompile',
    types: [{ entry: 'next-live/server', name: 'PrecompileResult' }, TRANSPILE_OPTIONS],
  },
  {
    heading: '`validateSnippet(',
    siteName: 'validateSnippet',
    types: [VALIDATE_OPTIONS, { entry: 'next-live/server', name: 'ValidationResult' }],
    shared: [TRANSPILE_OPTIONS],
  },
  {
    heading: '`precompileFiles(',
    siteName: 'precompileFiles',
    types: [
      { entry: 'next-live/server', name: 'PrecompileFilesOptions' },
      { entry: 'next-live/server', name: 'PrecompileFilesResult' },
    ],
    shared: [TRANSPILE_OPTIONS],
  },
  {
    heading: '`validateFiles(',
    siteName: 'validateFiles',
    types: [
      { entry: 'next-live/server', name: 'ValidateFilesOptions' },
      { entry: 'next-live/server', name: 'FilesValidationResult' },
    ],
    // "Accepts the validateSnippet options plus entry".
    shared: [TRANSPILE_OPTIONS, VALIDATE_OPTIONS],
  },
  {
    heading: '`mountSandbox(',
    siteName: 'mountSandbox',
    types: [
      { entry: 'next-live/sandbox', name: 'MountSandboxOptions' },
      { entry: 'next-live/sandbox', name: 'SandboxMount' },
    ],
  },
  {
    heading: '`<LiveSandboxRoot>`',
    siteName: 'LiveSandboxRoot',
    types: [{ entry: 'next-live/sandbox', name: 'LiveSandboxRootProps' }],
  },
];

interface InheritanceSpec {
  heading: string;
  siteName: string;
  /** The type whose options the prose says this one takes "every" of. */
  base: TypeRef & { label: string };
  derived: TypeRef;
}

const INHERITANCE: InheritanceSpec[] = [
  {
    heading: '`useLiveRunner`',
    siteName: 'useLiveRunner',
    base: { entry: 'next-live', name: 'LiveProviderProps', label: 'LiveProvider' },
    derived: { entry: 'next-live', name: 'UseLiveRunnerOptions' },
  },
  {
    heading: '`useLiveModule`',
    siteName: 'useLiveModule',
    base: { entry: 'next-live', name: 'UseLiveRunnerOptions', label: 'useLiveRunner' },
    derived: { entry: 'next-live', name: 'UseLiveModuleOptions' },
  },
];

// ---------------------------------------------------------------------------
// The two documents
// ---------------------------------------------------------------------------

interface DocumentUnderTest {
  label: string;
  /** Every name the document mentions as code. */
  mentioned: () => Set<string>;
  /** The section for an entry, by Markdown heading or site entry name. */
  entry: (spec: { heading: string; siteName: string }) => DocSection;
  /** A `##`-level section, by heading. */
  section: (heading: string) => DocSection;
  isRequired: (row: DocRow) => boolean;
}

const MARKDOWN: DocumentUnderTest = {
  label: 'docs/06-api-reference.md',
  mentioned: () => backtickedNames(markdownText()),
  entry: (spec) => markdownSection(markdownText(), spec.heading),
  section: (heading) => markdownSection(markdownText(), heading),
  isRequired: markdownRowIsRequired,
};

const SITE: DocumentUnderTest = {
  label: 'apps/playground/content/docs/api-reference.mdx',
  // An `<ApiEntry name="...">` documents that export as surely as backticks do.
  mentioned: () =>
    new Set([...backtickedNames(siteText()), ...apiEntries(siteText()).map((e) => e.name)]),
  entry: (spec) => mdxEntry(siteText(), spec.siteName),
  section: (heading) => markdownSection(siteText(), heading),
  isRequired: mdxRowIsRequired,
};

const propertyNames = (ref: TypeRef) => api.propertiesOf(ref.entry, ref.name).map((p) => p.name);

function describeDocument(doc: DocumentUnderTest) {
  describe(doc.label, () => {
    describe.each(COMPONENTS)('<$siteName> props', (spec) => {
      it('has a prop table naming only real props', () => {
        const table = mainTable(doc.entry(spec));
        expect(table.length, 'no prop table found').toBeGreaterThan(0);
        expect(unknownRows(table, propertyNames(spec.props))).toEqual([]);
      });

      it('documents every public prop', () => {
        expect(undocumented(api.propertiesOf(spec.props.entry, spec.props.name), doc.entry(spec))).toEqual([]);
      });

      it('marks exactly the required props as required', () => {
        const properties = api.propertiesOf(spec.props.entry, spec.props.name);
        expect(requiredMismatches(properties, mainTable(doc.entry(spec)), doc.isRequired)).toEqual([]);
      });
    });

    describe.each(COVERAGE)('$siteName', (spec) => {
      it('names every field and option of its types', () => {
        const section = doc.entry(spec);
        const shared = new Set((spec.shared ?? []).flatMap(propertyNames));
        const missing = spec.types.flatMap((ref) =>
          undocumented(api.propertiesOf(ref.entry, ref.name), section, shared).map((name) => `${ref.name}.${name}`),
        );
        expect(missing).toEqual([]);
      });

      it('has no table row for a field its types lack', () => {
        const section = doc.entry(spec);
        expect(unknownRows(section.rows, spec.types.flatMap(propertyNames))).toEqual([]);
      });
    });

    describe.each(INHERITANCE)('$siteName options', (spec) => {
      it('lists exactly the options it does not share with its base', () => {
        expect(
          exceptListProblems(doc.entry(spec).body, spec.base.label, propertyNames(spec.base), propertyNames(spec.derived)),
        ).toEqual([]);
      });
    });

    it('useLiveContext returns the useLiveRunner fields plus exactly what it names', () => {
      const body = doc.entry({ heading: '`useLiveContext`', siteName: 'useLiveContext' }).body;
      expect(
        extendsPlusProblems(
          body,
          propertyNames({ entry: 'next-live', name: 'LiveRunnerState' }),
          propertyNames({ entry: 'next-live', name: 'LiveContextValue' }),
        ),
      ).toEqual([]);
    });

    it('lists every error class with the fields it carries', () => {
      const classes = errorClasses().map((name) => {
        const parent = /^extends\s+([A-Za-z_$][\w$]*)/.exec(api.classHeritageOf('next-live', name) ?? '')?.[1];
        return {
          name,
          fields: propertyNames({ entry: 'next-live', name }).filter((field) => field !== 'code'),
          ...(parent ? { parent } : {}),
        };
      });
      expect(classes.length).toBeGreaterThanOrEqual(7);
      expect(errorTableProblems(mainTable(doc.section('Errors')), classes)).toEqual([]);
    });

    it('documents `code` and every LiveErrorCode value', () => {
      const errors = doc.section('Errors').body;
      expect(backtickedNames(errors).has('code')).toBe(true);
      expect(missingLiterals(errors, api.literalsOf('next-live', 'LiveErrorCode'))).toEqual([]);
    });

    it('documents every LiveSandboxErrorReason value', () => {
      expect(
        missingLiterals(doc.section('Errors').body, api.literalsOf('next-live', 'LiveSandboxErrorReason')),
      ).toEqual([]);
    });

    it('mentions every export of every public entry', () => {
      const exports = api.entries.flatMap((entry) => api.exportsOf(entry).map((e) => ({ entry, name: e.name })));
      expect(missingExports(doc.mentioned(), exports)).toEqual([]);
    });

    it('lists exactly the @experimental exports as experimental', () => {
      const experimental = api.entries.flatMap((entry) =>
        api.exportsOf(entry).filter((e) => e.experimental).map((e) => e.name),
      );
      expect(experimental.length).toBeGreaterThan(0);
      expect(experimentalProblems(mainTable(doc.section('Experimental APIs')), experimental)).toEqual([]);
    });
  });
}

/**
 * Exported error classes, found rather than listed, so a new one fails the
 * table check until it has a row. `LiveErrorBase` is the base class, described
 * in the section's prose rather than a row.
 */
function errorClasses(): string[] {
  return api
    .exportsOf('next-live')
    .filter((e) => e.isClass && e.name !== 'LiveErrorBase' && /Error$/.test(e.name) && e.name !== 'LiveErrorBoundary')
    .map((e) => e.name);
}

describe('test configuration', () => {
  it('only shares option types that some section fully checks', () => {
    const owned = new Set(COVERAGE.flatMap((spec) => spec.types.map((t) => `${t.entry}#${t.name}`)));
    const unowned = COVERAGE.flatMap((spec) => spec.shared ?? [])
      .map((t) => `${t.entry}#${t.name}`)
      .filter((key) => !owned.has(key));
    expect(unowned).toEqual([]);
  });

  it('covers every exported component', () => {
    const components = api
      .exportsOf('next-live')
      .concat(api.exportsOf('next-live/editor'), api.exportsOf('next-live/console'))
      .filter((e) => e.kind === 'value' && /^Live[A-Z]\w*$/.test(e.name) && api.entries.some((entry) => {
        try {
          return api.propertiesOf(entry, `${e.name}Props`).length > 0;
        } catch {
          return false;
        }
      }))
      .map((e) => e.name);
    expect(components.filter((name) => !COMPONENTS.some((c) => c.siteName === name)).sort()).toEqual([]);
  });
});

describeDocument(MARKDOWN);
if (hasSite) describeDocument(SITE);

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

function overloadsOf(name: string) {
  for (const entry of api.entries) {
    const found = api.exportsOf(entry).find((e) => e.name === name && e.kind === 'value' && !e.isClass);
    const callable = found && api.callableOf(entry, name);
    if (callable) return callable.parameters;
  }
  return null;
}

describe('docs/06-api-reference.md call syntax', () => {
  it('writes every function with its real parameter names and optional markers', () => {
    const text = markdownText();
    expect([...text.matchAll(/`[A-Za-z_$][\w$]*\([^`]*\)`/g)].length).toBeGreaterThan(20);
    expect(callSyntaxProblems(text, overloadsOf)).toEqual([]);
  });
});

describe.skipIf(!hasSite)('docs site signatures', () => {
  it('reads every <ApiEntry> on the page', () => {
    const entries = apiEntries(siteText());
    expect(entries.length).toBe([...siteText().matchAll(/<ApiEntry\b/g)].length);
    expect(entries.length).toBeGreaterThan(40);
  });

  it('matches the compiler for every entry: export, kind, and signature', () => {
    const problems = siteSignatureProblems(apiEntries(siteText()), {
      isExported: (from, name) => api.entries.includes(from) && api.exportsOf(from).some((e) => e.name === name),
      callable: (from, name) => api.callableOf(from, name),
      heritage: (from, name) => api.classHeritageOf(from, name),
      constantType: (from, name) => api.constantTypeOf(from, name),
    });
    expect(problems.join('\n')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// The declarations themselves
// ---------------------------------------------------------------------------

describe('public declarations', () => {
  /**
   * Types a public declaration mentions without exporting them.
   *
   * `State` is `<LiveErrorBoundary>`'s own React state. It appears only as the
   * class's second type argument, and nothing in the documented API hands it to
   * a caller, so exporting it would add surface without adding a use.
   */
  const ALLOWED = new Set(['next-live#LiveErrorBoundary:State']);

  it('exports every type a public signature or prop refers to', () => {
    const forgotten = api
      .forgottenExports()
      .map((f) => `${f.usedBy}:${f.typeName}`)
      .filter((key) => !ALLOWED.has(key));
    expect(forgotten).toEqual([]);
  });

  it('keeps the allowlist honest: each allowed entry is still needed', () => {
    const current = new Set(api.forgottenExports().map((f) => `${f.usedBy}:${f.typeName}`));
    expect([...ALLOWED].filter((key) => !current.has(key))).toEqual([]);
  });
});
