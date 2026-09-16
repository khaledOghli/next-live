/**
 * Small, strict readers for the two API references: the Markdown shipped in
 * `docs/`, and the MDX page on the docs site.
 *
 * Strict on purpose. A parser that quietly returns nothing when the format
 * shifts would turn every docs check into a pass, so each reader throws when
 * it cannot find what it was asked for.
 */

export interface DocRow {
  /** Every name in the first cell. `className` / `style` gives two. */
  names: string[];
  /** The remaining cells (Markdown) or the rest of the row object (MDX). */
  rest: string[];
}

export interface DocSection {
  heading: string;
  body: string;
  /** Rows of every table in the section, in order. */
  rows: DocRow[];
  /** The same rows, grouped by table. `tables[0]` is the section's main table. */
  tables: DocRow[][];
}

/** Identifier-like tokens inside backticks, e.g. `onError` or `(sel) => void`. */
export function backtickedNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const [, span = ''] of text.matchAll(/`([^`\n]+)`/g)) {
    for (const [token] of span.matchAll(/[A-Za-z_$][\w$]*(?:-[\w$]+)*/g)) names.add(token);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * The section whose heading starts with `headingStart`, up to the next heading
 * of the same or a higher level. Subsections are included.
 */
export function markdownSection(markdown: string, headingStart: string): DocSection {
  const lines = blankFences(markdown).split('\n');

  const start = lines.findIndex((line) => HEADING.exec(line)?.[2]?.startsWith(headingStart));
  if (start === -1) throw new Error(`No Markdown heading starting with ${headingStart}`);

  const level = (HEADING.exec(lines[start] as string) as RegExpExecArray)[1]!.length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const match = HEADING.exec(lines[i] as string);
    if (match && (match[1] as string).length <= level) {
      end = i;
      break;
    }
  }

  const body = lines.slice(start + 1, end).join('\n');
  const tables = markdownTables(body);
  return { heading: lines[start] as string, body, rows: tables.flat(), tables };
}

/** Every pipe table in `body` as its rows, header and divider excluded. */
export function markdownTables(body: string): DocRow[][] {
  const tables: DocRow[][] = [];
  let current: DocRow[] | null = null;

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) {
      current = null;
      continue;
    }
    if (/^\|[\s|:-]+$/.test(line)) {
      // The divider: the line above it was the header, the rows start here.
      current = [];
      tables.push(current);
      continue;
    }
    if (!current) continue;

    const [first = '', ...rest] = splitCells(line);
    current.push({ names: [...backtickedNames(first)], rest });
  }

  return tables;
}

/** Rows of every pipe table in `body`, in order. */
export function markdownRows(body: string): DocRow[] {
  return markdownTables(body).flat();
}

/** A Markdown row is marked required when one of its cells starts with "Required". */
export function markdownRowIsRequired(row: DocRow): boolean {
  return row.rest.some((cell) => /^Required\b/.test(cell));
}

function splitCells(line: string): string[] {
  // `\|` is a literal pipe inside a cell, as in `'automatic' \| 'classic'`.
  return line
    .replace(/\\\|/g, '\u0000')
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.replace(/\u0000/g, '|').trim());
}

/**
 * Fenced code keeps its line count but loses its content: a `#` comment inside
 * a fence is not a heading, and example code is not a documented prop.
 */
function blankFences(markdown: string): string {
  return markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (block) =>
    block.replace(/[^\n]/g, ''),
  );
}

// ---------------------------------------------------------------------------
// MDX (docs site)
// ---------------------------------------------------------------------------

/**
 * Everything from `<ApiEntry name="...">` to the next `<ApiEntry` or `## `
 * heading: the entry's prose and the `<PropTable>` rows that follow it.
 */
export function mdxEntry(mdx: string, name: string): DocSection {
  const match = new RegExp(`<ApiEntry\\s+name="${escapeRegExp(name)}"`).exec(mdx);
  if (!match) throw new Error(`No <ApiEntry name="${name}"> in the docs site page`);

  const after = mdx.slice(match.index + match[0].length);
  const next = after.search(/<ApiEntry\s|^## /m);
  const body = next === -1 ? after : after.slice(0, next);
  const tables = mdxTables(body);
  return { heading: name, body, rows: tables.flat(), tables };
}

/** Every `<PropTable rows={[...]}>` in `body` as its rows, one row object per line. */
export function mdxTables(body: string): DocRow[][] {
  const tables: DocRow[][] = [];
  for (const [table] of body.matchAll(/<PropTable\b[\s\S]*?\n\s*\/>/g)) {
    const rows: DocRow[] = [];
    tables.push(rows);
    for (const line of table.split('\n')) {
      const name = /^\s*\{\s*name:\s*(['"])(.+?)\1/.exec(line);
      if (!name) continue;
      rows.push({
        names: (name[2] as string)
          .split('/')
          .map((part) => part.trim())
          .filter(Boolean),
        rest: [line.slice(name[0].length)],
      });
    }
  }
  return tables;
}

/** Rows of every `<PropTable>` in `body`, in order. */
export function mdxRows(body: string): DocRow[] {
  return mdxTables(body).flat();
}

export function mdxRowIsRequired(row: DocRow): boolean {
  return row.rest.some((text) => /\brequired:\s*true\b/.test(text));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
