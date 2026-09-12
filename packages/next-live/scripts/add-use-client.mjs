/**
 * Prepends the 'use client' directive to every client-graph build output.
 *
 * Next.js requires library authors to preserve this themselves: bundlers strip
 * module-level directives when bundling (tsup warns about exactly that), and
 * without it consumers hit "you're importing a component that needs useState"
 * the moment they render from a Server Component.
 *
 * Every emitted file is stamped except the server entries. That deliberately
 * includes tsup's shared `chunk-*.js` files: code split out of two client
 * entries still runs on the client, and the shared chunk here holds
 * `createContext`. A hardcoded list of entry filenames silently missed those
 * the moment a second client entry was added, leaving a chunk that calls
 * client-only React APIs with no directive on it.
 *
 * The chunk must stay shared, incidentally, bundling it into each entry
 * instead would give `next-live` and `next-live/editor` separate `createContext`
 * calls, so `useLiveContext` inside `<LiveEditor>` would never see the value
 * `<LiveProvider>` supplies.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIRECTIVE = '"use client";';
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Entries that must stay usable from Route Handlers and Server Components. */
const SERVER_ENTRIES = new Set(['server.js', 'server.cjs']);

const files = (await readdir(dist)).filter(
  (file) => /\.(js|cjs)$/.test(file) && !SERVER_ENTRIES.has(file),
);

const stamped = [];
for (const file of files) {
  const path = join(dist, file);
  const source = await readFile(path, 'utf8');
  if (source.startsWith(DIRECTIVE) || source.startsWith("'use client'")) continue;

  // The directive must come before everything, including any "use strict"
  // the CJS output starts with.
  await writeFile(path, `${DIRECTIVE}\n${source}`);
  stamped.push(file);
}

console.log(
  stamped.length === 0
    ? 'add-use-client: nothing to stamp'
    : `add-use-client: stamped ${stamped.length} file(s), ${stamped.join(', ')}`,
);
