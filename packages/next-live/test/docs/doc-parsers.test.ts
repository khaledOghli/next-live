import { describe, expect, it } from 'vitest';
import { normalizeSignature } from './api-surface';
import {
  backtickedNames,
  markdownRowIsRequired,
  markdownRows,
  markdownSection,
  markdownTables,
  mdxEntry,
  mdxRowIsRequired,
  mdxRows,
} from './doc-parsers';

/**
 * The readers the docs checks stand on. A parser that silently returns less
 * than the document holds would make every check pass, so these pin down the
 * edge cases the real reference relies on.
 */

describe('backtickedNames', () => {
  it('collects identifiers inside backticks only', () => {
    expect([...backtickedNames('call `onError` or onChange, then `setCode`')]).toEqual(['onError', 'setCode']);
  });

  it('splits code spans into their identifiers', () => {
    expect([...backtickedNames('`(error, position?) => string`')]).toEqual(['error', 'position', 'string']);
  });

  it('keeps hyphenated names whole', () => {
    expect(backtickedNames('`aria-label` and `handshake-timeout`')).toEqual(new Set(['aria-label', 'handshake-timeout']));
  });

  it('reads quoted literals as their value', () => {
    expect(backtickedNames("`'MODULE_NOT_FOUND'`").has('MODULE_NOT_FOUND')).toBe(true);
  });

  it('ignores a span broken across lines', () => {
    expect(backtickedNames('`on\nError`').size).toBe(0);
  });
});

describe('markdownSection', () => {
  const doc = [
    '# Title',
    '## Components',
    '### `<A>`',
    'About A, with `propA`.',
    '#### Detail',
    'Nested `detailName`.',
    '### `<B>`',
    'About B.',
    '## Hooks',
    'Hook text.',
  ].join('\n');

  it('runs from its heading to the next heading of the same level', () => {
    const section = markdownSection(doc, '`<A>`');
    expect(section.body).toContain('propA');
    expect(section.body).not.toContain('About B');
  });

  it('includes deeper subsections', () => {
    expect(markdownSection(doc, '`<A>`').body).toContain('detailName');
  });

  it('stops at a higher-level heading', () => {
    expect(markdownSection(doc, '`<B>`').body).not.toContain('Hook text');
  });

  it('runs to the end of the document when nothing follows', () => {
    expect(markdownSection(doc, 'Hooks').body).toContain('Hook text');
  });

  it('matches on the start of the heading, so a signature can follow the name', () => {
    const withCall = '### `precompile(source, options?)`\nBody.';
    expect(markdownSection(withCall, '`precompile(').body).toContain('Body.');
  });

  it('does not mistake a `#` comment inside fenced code for a heading', () => {
    const fenced = ['## Section', '```sh', '# not a heading', '```', 'Still `inside`.', '## Next'].join('\n');
    expect(backtickedNames(markdownSection(fenced, 'Section').body).has('inside')).toBe(true);
  });

  it('hides fenced example code from the checks', () => {
    const fenced = ['## Section', '```ts', 'const `ghost` = 1;', '```', '## Next'].join('\n');
    expect(backtickedNames(markdownSection(fenced, 'Section').body).has('ghost')).toBe(false);
  });

  it('throws when the heading is missing, rather than checking nothing', () => {
    expect(() => markdownSection(doc, '`<Missing>`')).toThrow(/No Markdown heading/);
  });
});

describe('markdownTables', () => {
  const table = [
    '| Prop | Type | Notes |',
    '|---|---|---|',
    '| `code` | `string` | The snippet. |',
    "| `jsxRuntime` | `'automatic' \\| 'classic'` | Two runtimes. |",
    '| `className` / `style` | | |',
    '',
    'Between the tables.',
    '',
    '| Method | Type |',
    '|:--|--:|',
    '| `focus` | `() => void` |',
  ].join('\n');

  it('groups rows by table and skips headers and dividers', () => {
    const tables = markdownTables(table);
    expect(tables.map((rows) => rows.map((row) => row.names[0]))).toEqual([
      ['code', 'jsxRuntime', 'className'],
      ['focus'],
    ]);
  });

  it('reads every name in a shared first cell', () => {
    expect(markdownRows(table)[2]?.names).toEqual(['className', 'style']);
  });

  it('keeps an escaped pipe inside its cell', () => {
    const row = markdownRows(table)[1];
    expect(row?.rest).toHaveLength(2);
    expect(row?.rest[0]).toBe("`'automatic' | 'classic'`");
  });

  it('ignores pipe lines with no divider above them', () => {
    expect(markdownRows('| `not` | a table |\n| `still` | not |')).toEqual([]);
  });
});

describe('markdownRowIsRequired', () => {
  const row = (rest: string[]) => ({ names: ['x'], rest });

  it('is true when a cell starts with "Required"', () => {
    expect(markdownRowIsRequired(row(['`unknown`', 'Required. Changing it clears the error.']))).toBe(true);
  });

  it('is false for notes that merely contain the word', () => {
    expect(markdownRowIsRequired(row(['`string`', 'Not required when `code` is set.']))).toBe(false);
  });

  it('is false for an unmarked row', () => {
    expect(markdownRowIsRequired(row(['`boolean`', '`false`', 'Soft-wrap long lines.']))).toBe(false);
  });
});

describe('mdxEntry and mdxRows', () => {
  const page = [
    '<ApiEntry name="LiveEditor" kind="component" from="next-live/editor" signature="function LiveEditor(props: LiveEditorProps): ReactNode">',
    'The editor, with `renderEditor`.',
    '</ApiEntry>',
    '',
    '<PropTable',
    '  rows={[',
    "    { name: 'code', type: 'string', notes: 'The code.' },",
    "    { name: 'format / formatOnBlur', type: 'FormatFn / boolean' },",
    '  ]}',
    '/>',
    '',
    '<PropTable',
    '  label="Method"',
    '  rows={[',
    "    { name: \"focus\", type: '() => void', required: true },",
    '  ]}',
    '/>',
    '',
    '<ApiEntry name="LiveError" kind="component" from="next-live" signature="function LiveError(props: LiveErrorProps): ReactNode">',
    '</ApiEntry>',
    '',
    '## Hooks',
  ].join('\n');

  it('spans from its entry to the next entry', () => {
    const entry = mdxEntry(page, 'LiveEditor');
    expect(entry.body).toContain('renderEditor');
    expect(entry.body).not.toContain('LiveErrorProps');
  });

  it('groups rows by <PropTable>', () => {
    expect(mdxEntry(page, 'LiveEditor').tables.map((rows) => rows.flatMap((row) => row.names))).toEqual([
      ['code', 'format', 'formatOnBlur'],
      ['focus'],
    ]);
  });

  it('accepts either quote style for names', () => {
    expect(mdxRows(page).some((row) => row.names[0] === 'focus')).toBe(true);
  });

  it('reads `required: true`, and nothing else, as required', () => {
    const rows = mdxRows(page);
    expect(rows.filter(mdxRowIsRequired).map((row) => row.names[0])).toEqual(['focus']);
  });

  it('stops at a `##` heading', () => {
    expect(mdxEntry(page, 'LiveError').body).not.toContain('Hooks');
  });

  it('does not match an entry whose name only starts the same way', () => {
    expect(() => mdxEntry(page, 'Live')).toThrow(/No <ApiEntry name="Live">/);
  });
});

describe('normalizeSignature', () => {
  it('treats a declaration and an arrow type as the same signature', () => {
    expect(normalizeSignature('function f(a: string): number', 'f')).toBe(normalizeSignature('(a: string) => number'));
  });

  it('keeps generic parameters, including constraints and defaults', () => {
    expect(normalizeSignature('function f<T extends { id: string } = { id: string }>(x: T): T', 'f')).toBe(
      '<T extends { id: string } = { id: string }>(x: T) => T',
    );
  });

  it('keeps an arrow-typed return type intact', () => {
    expect(normalizeSignature('function f(r: R): (s: string) => M', 'f')).toBe('(r: R) => (s: string) => M');
  });

  it('drops the `| undefined` the compiler adds to optional members and parameters', () => {
    expect(normalizeSignature('(a?: string | undefined, b?: { c?: number | undefined; }) => void')).toBe(
      normalizeSignature('(a?: string, b?: { c?: number }) => void'),
    );
  });

  it('keeps `| undefined` on a required parameter, where it means something', () => {
    expect(normalizeSignature('(error: Error | null | undefined) => void')).toContain('| undefined');
  });

  it('keeps nested generics with commas intact while stripping', () => {
    expect(normalizeSignature('(o?: Record<string, unknown> | undefined) => void')).toBe(
      '(o?: Record<string, unknown>) => void',
    );
  });

  it('ignores whitespace, quote style, and a trailing semicolon in an object type', () => {
    expect(normalizeSignature("(x: { a: 'b';  })  =>  void")).toBe(normalizeSignature('(x: { a: "b" }) => void'));
  });

  it('shortens an absolute import type to its package name', () => {
    expect(
      normalizeSignature('(m: typeof import("/repo/node_modules/sucrase/dist/types/index") | null) => void'),
    ).toBe(normalizeSignature("(m: typeof import('sucrase') | null) => void"));
  });

  it('keeps the scope of a scoped package', () => {
    expect(normalizeSignature('(m: typeof import("/r/node_modules/@scope/pkg/dist/x")) => void')).toContain(
      'import("@scope/pkg")',
    );
  });

  it('removes a `const name:` prefix', () => {
    expect(normalizeSignature('const LiveContext: Context<X | null>', 'LiveContext')).toBe('Context<X | null>');
  });

  it('still tells different signatures apart', () => {
    expect(normalizeSignature('() => void')).not.toBe(normalizeSignature('() => Promise<void>'));
    expect(normalizeSignature('(a?: string) => void')).not.toBe(normalizeSignature('(a: string) => void'));
  });

  it('throws on unbalanced brackets instead of guessing', () => {
    expect(() => normalizeSignature('function f(a: string: void', 'f')).toThrow(/Unbalanced/);
  });
});
