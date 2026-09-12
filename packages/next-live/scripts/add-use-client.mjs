/**
 * Prepends the 'use client' directive to the client build outputs.
 *
 * Next.js requires library authors to preserve this themselves: bundlers strip
 * module-level directives when bundling (tsup emits a warning saying exactly
 * that), and without it consumers hit "you're importing a component that needs
 * useState" the moment they render from a Server Component.
 *
 * The server entry is deliberately excluded — it must stay usable from Route
 * Handlers and Server Components.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIRECTIVE = '"use client";';
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const CLIENT_ENTRIES = ['index.js', 'index.cjs'];

let changed = 0;
for (const file of CLIENT_ENTRIES) {
  const path = join(dist, file);
  const source = await readFile(path, 'utf8');
  if (source.startsWith(DIRECTIVE) || source.startsWith("'use client'")) continue;

  // The directive must come before everything, including any "use strict"
  // the CJS output starts with.
  await writeFile(path, `${DIRECTIVE}\n${source}`);
  changed += 1;
}

console.log(`add-use-client: ${changed} client entr${changed === 1 ? 'y' : 'ies'} updated`);
