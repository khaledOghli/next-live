/**
 * Checks every stored app still compiles against the current SDK surface.
 *
 * Run this in CI. Snippets live in a database, so renaming something in
 * lib/live-sdk breaks them silently, the failure would otherwise surface for
 * whoever opens that app next, not for whoever made the change.
 *
 *   npx tsx scripts/validate-apps.ts
 */
import { validateSnippet, validateSnippets } from 'next-live/server';
import { apps } from '../lib/apps.ts';
import { shellApps } from '../lib/shell-apps.ts';
import { storeScriptSource } from '../lib/store-script.ts';
import * as docsDemos from '../lib/docs/demos.ts';
import { LIVE_MODULE_KEYS } from '../lib/live-sdk/module-keys.ts';

/**
 * The documentation's own live demos, held to the same standard as stored apps.
 *
 * They import `@app/*` exactly as a real snippet does, so an SDK rename breaks
 * them too, on the site that teaches the library, which is the worst place to
 * find out late.
 */
const demoSnippets = Object.entries(docsDemos)
  .filter(([, source]) => typeof source === 'string')
  .map(([id, source]) => ({ id: `docs/${id}`, source: source as string }));

const failures = [
  ...validateSnippets(apps, { modules: [...LIVE_MODULE_KEYS] }),
  ...validateSnippets(shellApps, { modules: [...LIVE_MODULE_KEYS] }),
  ...validateSnippets(demoSnippets, { modules: [...LIVE_MODULE_KEYS] }),
];

const scriptResult = validateSnippet(storeScriptSource, { modules: [...LIVE_MODULE_KEYS] });
if (!scriptResult.ok) {
  failures.push({ id: 'store-script', result: scriptResult });
}

if (failures.length === 0) {
  console.log(
    `✓ all ${apps.length} lab apps, ${shellApps.length} shell apps, ` +
      `${demoSnippets.length} docs demos, and the store API script validate against the current SDK`,
  );
  process.exit(0);
}

console.error(`✗ ${failures.length} snippet(s) are broken:\n`);
for (const { id, result } of failures) {
  for (const issue of result.issues) {
    const where = issue.line ? ` (line ${issue.line})` : '';
    console.error(`  ${id}${where}: ${issue.message}`);
  }
}
process.exit(1);
