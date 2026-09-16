import { normalizeSignature } from './api-surface';
import type { ParameterInfo, PropertyInfo } from './api-surface';
import { backtickedNames } from './doc-parsers';
import type { DocRow, DocSection } from './doc-parsers';

/**
 * The checks the API reference test runs, as plain functions.
 *
 * Each takes data (what the compiler says, what the docs say) and returns the
 * problems it found as readable strings, empty when the two agree. Keeping them
 * free of Vitest and of the compiler is what lets `doc-checks.test.ts` prove
 * that every check fails when it should, not only that today's docs pass.
 */

const names = (rows: readonly DocRow[]): string[] => rows.flatMap((row) => row.names);

/** Every name a section mentions: table rows plus anything in backticks. */
export function mentionedIn(section: DocSection): Set<string> {
  return new Set([...names(section.rows), ...backtickedNames(section.body)]);
}

/**
 * The section's main table. A component's prop table comes first; tables
 * further down (an imperative handle's methods, say) describe other types.
 */
export function mainTable(section: DocSection): DocRow[] {
  return section.tables[0] ?? [];
}

/** Table rows naming something the type does not have. */
export function unknownRows(rows: readonly DocRow[], real: Iterable<string>): string[] {
  const known = new Set(real);
  return names(rows).filter((name) => !known.has(name));
}

/** Public properties the section never mentions, unless another section owns them. */
export function undocumented(
  properties: readonly PropertyInfo[],
  section: DocSection,
  coveredElsewhere: ReadonlySet<string> = new Set(),
): string[] {
  const mentioned = mentionedIn(section);
  return properties
    .filter((p) => !p.internal && !mentioned.has(p.name) && !coveredElsewhere.has(p.name))
    .map((p) => p.name);
}

/**
 * Rows whose "required" marking disagrees with the type, and required props
 * that have no row at all. The second matters because a required prop that is
 * only named in prose has nowhere to carry the marking.
 */
export function requiredMismatches(
  properties: readonly PropertyInfo[],
  table: readonly DocRow[],
  isRequired: (row: DocRow) => boolean,
): string[] {
  const byName = new Map(properties.map((p) => [p.name, p]));
  const problems: string[] = [];

  for (const row of table) {
    const marked = isRequired(row);
    for (const name of row.names) {
      const property = byName.get(name);
      if (property && marked === property.optional) {
        problems.push(`${name}: docs say ${marked ? 'required' : 'optional'}, type says ${property.optional ? 'optional' : 'required'}`);
      }
    }
  }

  const rowed = new Set(names(table));
  for (const property of properties) {
    if (!property.optional && !property.internal && !rowed.has(property.name)) {
      problems.push(`${property.name}: required, but has no table row`);
    }
  }

  return problems;
}

/**
 * Checks prose of the form "Accepts every `Base` prop except `a`, `b` and `c`."
 *
 * The listed names must be exactly the options the base has and the derived
 * type lacks, and the derived type must add nothing, or "every" is untrue.
 */
export function exceptListProblems(
  body: string,
  baseLabel: string,
  base: Iterable<string>,
  derived: Iterable<string>,
): string[] {
  const pattern = new RegExp(
    `Accepts every\\s+\`${escapeRegExp(baseLabel)}\`\\s+(?:prop|option)s?\\s+except\\s+([^.]+?)\\.(?:\\s|$)`,
  );
  const match = pattern.exec(body.replace(/\s+/g, ' '));
  if (!match) return [`no "Accepts every \`${baseLabel}\` option except ..." sentence`];

  const listed = backtickedNames(match[1] as string);
  const baseSet = new Set(base);
  const derivedSet = new Set(derived);
  const expected = new Set([...baseSet].filter((name) => !derivedSet.has(name)));

  return [
    ...[...expected].filter((name) => !listed.has(name)).map((name) => `${name}: not accepted, but not listed as an exception`),
    ...[...listed].filter((name) => !expected.has(name)).map((name) => `${name}: listed as an exception, but accepted`),
    ...[...derivedSet].filter((name) => !baseSet.has(name)).map((name) => `${name}: accepted, but \`${baseLabel}\` has no such option`),
  ];
}

/**
 * Checks prose of the form "Returns the `base` fields plus `x` and `y`": the
 * derived type must really contain every base field, and each field it adds
 * must be named.
 */
export function extendsPlusProblems(body: string, base: Iterable<string>, derived: Iterable<string>): string[] {
  const baseSet = new Set(base);
  const derivedSet = new Set(derived);
  const mentioned = backtickedNames(body);
  return [
    ...[...baseSet].filter((name) => !derivedSet.has(name)).map((name) => `${name}: said to be included, but missing`),
    ...[...derivedSet]
      .filter((name) => !baseSet.has(name) && !mentioned.has(name))
      .map((name) => `${name}: returned, but not named`),
  ];
}

export interface ErrorClassInfo {
  name: string;
  /** Fields the class declares, `code` excluded. */
  fields: string[];
  /** The class it extends, when that class has its own row. */
  parent?: string;
}

/**
 * The errors table must have exactly one row per class, and each row must name
 * the class's fields. A subclass may leave inherited fields to its parent's
 * row, which is what "`instanceof LiveRuntimeError` is true" tells the reader.
 */
export function errorTableProblems(table: readonly DocRow[], classes: readonly ErrorClassInfo[]): string[] {
  const rows = new Map(table.map((row) => [row.names[0] as string, row]));
  const byName = new Map(classes.map((c) => [c.name, c]));
  const problems: string[] = [];

  for (const name of rows.keys()) if (!byName.has(name)) problems.push(`${name}: has a row, but is not an error class`);
  for (const name of byName.keys()) if (!rows.has(name)) problems.push(`${name}: has no row`);

  const documentedFor = (name: string, seen = new Set<string>()): Set<string> => {
    const found = new Set<string>();
    if (seen.has(name)) return found;
    seen.add(name);
    const row = rows.get(name);
    if (row) for (const n of backtickedNames(row.rest.join(' '))) found.add(n);
    const parent = byName.get(name)?.parent;
    if (parent) for (const n of documentedFor(parent, seen)) found.add(n);
    return found;
  };

  for (const errorClass of classes) {
    if (!rows.has(errorClass.name)) continue;
    const documented = documentedFor(errorClass.name);
    for (const field of errorClass.fields) {
      if (!documented.has(field)) problems.push(`${errorClass.name}.${field}: not mentioned in its row`);
    }
  }

  return problems;
}

/** Values of a string union, such as an error code, that the text never shows in backticks. */
export function missingLiterals(text: string, literals: readonly string[]): string[] {
  const mentioned = backtickedNames(text);
  return literals.filter((literal) => !mentioned.has(literal));
}

/** `entry#name` for every export the document does not mention. */
export function missingExports(
  mentioned: ReadonlySet<string>,
  exports: readonly { entry: string; name: string }[],
): string[] {
  return exports.filter((e) => !mentioned.has(e.name)).map((e) => `${e.entry}#${e.name}`);
}

/** The Experimental table must list exactly the exports tagged `@experimental`. */
export function experimentalProblems(table: readonly DocRow[], experimental: Iterable<string>): string[] {
  const listed = new Set(table.map((row) => row.names[0] as string));
  const tagged = new Set(experimental);
  return [
    ...[...tagged].filter((name) => !listed.has(name)).map((name) => `${name}: @experimental, but not listed`),
    ...[...listed].filter((name) => !tagged.has(name)).map((name) => `${name}: listed, but not @experimental`),
  ];
}

// ---------------------------------------------------------------------------
// Call syntax in Markdown
// ---------------------------------------------------------------------------

/**
 * `name(a, b?, ...rest)` as written in a heading or a table cell. Nested
 * brackets are kept whole, so `defineModule({ default, exports })` has one
 * parameter.
 */
export function parseCallText(text: string): { name: string; params: string[] } | null {
  const match = /^([A-Za-z_$][\w$]*)\((.*)\)$/.exec(text.trim());
  if (!match) return null;
  const inner = (match[2] as string).trim();
  if (inner === '') return { name: match[1] as string, params: [] };

  const params: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of inner) {
    if ('({['.includes(char)) depth++;
    if (')}]'.includes(char)) depth--;
    if (char === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else current += char;
  }
  params.push(current.trim());
  return { name: match[1] as string, params };
}

const formatParam = (p: ParameterInfo) => `${p.rest ? '...' : ''}${p.name}${p.optional ? '?' : ''}`;

/**
 * Every `fn(params)` span in the text whose name is a public function must
 * match one of its overloads: same count, names, `?` and `...`. A destructured
 * parameter (`{ default, exports }`) only has to be a required, non-rest one.
 */
export function callSyntaxProblems(
  text: string,
  overloadsOf: (name: string) => ParameterInfo[][] | null,
): string[] {
  const problems: string[] = [];
  for (const [, span = ''] of text.matchAll(/`([A-Za-z_$][\w$]*\([^`]*\))`/g)) {
    const call = parseCallText(span);
    const overloads = call && overloadsOf(call.name);
    if (!call || !overloads) continue;

    const matches = overloads.some(
      (params) =>
        params.length === call.params.length &&
        params.every((param, i) => {
          const written = call.params[i] as string;
          if (written.startsWith('{')) return !param.rest && !param.optional;
          return written === formatParam(param);
        }),
    );
    if (!matches) {
      const real = overloads.map((params) => `${call.name}(${params.map(formatParam).join(', ')})`).join(' or ');
      problems.push(`${span} should be ${real}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Signatures on the docs site
// ---------------------------------------------------------------------------

export interface ApiEntryInfo {
  name: string;
  kind: string;
  from: string;
  signature: string;
}

/** Every `<ApiEntry>` with its attributes, whatever order they are written in. */
export function apiEntries(mdx: string): ApiEntryInfo[] {
  // Attributes are read as whole quoted strings: a signature holds `=>` and
  // `Promise<T>`, so stopping at the first `>` would cut it short.
  return [...mdx.matchAll(/<ApiEntry((?:\s+[\w-]+="[^"]*")*)\s*>/g)].map(([, attributes = '']) => {
    const read = (key: string) => new RegExp(`\\b${key}="([^"]*)"`).exec(attributes)?.[1] ?? '';
    return { name: read('name'), kind: read('kind'), from: read('from'), signature: read('signature') };
  });
}

export interface SignatureSource {
  isExported(from: string, name: string): boolean;
  callable(from: string, name: string): { signatures: string[] } | null;
  heritage(from: string, name: string): string | null;
  constantType(from: string, name: string): string | null;
}

/**
 * Each entry must name a real export of its entry point, carry a signature,
 * use a `kind` that fits what the export is, and write the signature the
 * compiler would, overload for overload.
 */
export function siteSignatureProblems(entries: readonly ApiEntryInfo[], source: SignatureSource): string[] {
  const problems: string[] = [];

  for (const { name, kind, from, signature } of entries) {
    if (!name || !from) {
      problems.push(`<ApiEntry name="${name}"> needs both name and from`);
      continue;
    }
    if (!source.isExported(from, name)) {
      problems.push(`${name} is not exported from ${from}`);
      continue;
    }
    if (!signature.trim()) {
      problems.push(`${name} has no signature`);
      continue;
    }

    const heritage = source.heritage(from, name);
    const callable = source.callable(from, name);
    const constantType = source.constantType(from, name);

    if (heritage !== null) {
      if (kind !== 'component') problems.push(`${name} is a class component, but kind is "${kind}"`);
      const expected = `class ${name} ${heritage}`;
      if (normalizeSignature(signature) !== normalizeSignature(expected)) {
        problems.push(`${name}\n    docs: ${signature}\n    real: ${expected}`);
      }
      continue;
    }

    if (constantType !== null) {
      if (kind !== 'constant') problems.push(`${name} is a constant, but kind is "${kind}"`);
      const documented = normalizeSignature(signature, name);
      if (documented !== normalizeSignature(constantType)) {
        problems.push(`${name}\n    docs: ${documented}\n    real: ${constantType}`);
      }
      continue;
    }

    if (!callable) {
      problems.push(`${name} is documented as a ${kind}, but is neither a function, a class, nor a constant`);
      continue;
    }

    const isHook = /^use[A-Z]/.test(name);
    if (isHook !== (kind === 'hook')) problems.push(`${name}: kind "${kind}" does not fit its name`);
    if (!['hook', 'function', 'component'].includes(kind)) problems.push(`${name}: kind "${kind}" is not callable`);

    const documented = signature
      .split('\n')
      .map((line) => normalizeSignature(line, name))
      .filter(Boolean)
      .sort();
    const real = callable.signatures.map((s) => normalizeSignature(s)).sort();
    if (JSON.stringify(documented) !== JSON.stringify(real)) {
      problems.push(`${name}\n    docs: ${documented.join('\n          ')}\n    real: ${real.join('\n          ')}`);
    }
  }

  return problems;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
