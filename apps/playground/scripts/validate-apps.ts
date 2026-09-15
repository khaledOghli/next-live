/**
 * Checks every stored app still compiles against the current SDK surface.
 *
 * Run this in CI. Snippets live in a database, so renaming something in
 * lib/live-sdk breaks them silently, the failure would otherwise surface for
 * whoever opens that app next, not for whoever made the change.
 *
 *   npx tsx scripts/validate-apps.ts
 */
import { validateFiles, validateSnippet, validateSnippets } from 'next-live/server';
import { apps } from '../lib/apps.ts';
import { shellApps } from '../lib/shell-apps.ts';
import { storeScriptSource } from '../lib/store-script.ts';
import * as docsDemos from '../lib/docs/demos.ts';
import * as docusaurusDemos from '../lib/docs/docusaurus-demos.ts';
import { LIVE_MODULE_KEYS } from '../lib/live-sdk/module-keys.ts';

const DOCUSAURUS_MODULE_KEYS = ['@next-live-docusaurus/modules'] as const;

/**
 * The documentation's own live demos, held to the same standard as stored apps.
 *
 * They import `@app/*` exactly as a real snippet does, so an SDK rename breaks
 * them too, on the site that teaches the library, which is the worst place to
 * find out late.
 */
const singleFileDocDemos = Object.entries(docsDemos)
  .filter(([, source]) => typeof source === 'string')
  .map(([id, source]) => ({ id: `docs/${id}`, source: source as string }));

const docusaurusDocDemos = Object.entries(docusaurusDemos)
  .filter(([, source]) => typeof source === 'string')
  .map(([id, source]) => ({
    id: `docs/docusaurus/${id}`,
    source: source as string,
    modules:
      (source as string).includes('@next-live-docusaurus/modules')
        ? [...DOCUSAURUS_MODULE_KEYS]
        : [...LIVE_MODULE_KEYS],
  }));

const failures = [
  ...validateSnippets(apps, { modules: [...LIVE_MODULE_KEYS] }),
  ...validateSnippets(shellApps, { modules: [...LIVE_MODULE_KEYS] }),
  ...validateSnippets(singleFileDocDemos, { modules: [...LIVE_MODULE_KEYS] }),
  ...docusaurusDocDemos.flatMap(({ id, source, modules }) => {
    const result = validateSnippet(source, { modules });
    return result.ok ? [] : [{ id, result }];
  }),
];

const multiFileResult = validateFiles(docsDemos.multiFileDemo, { modules: [...LIVE_MODULE_KEYS] });
if (!multiFileResult.ok) {
  failures.push({ id: 'docs/multiFileDemo', result: multiFileResult });
}

const scriptResult = validateSnippet(storeScriptSource, { modules: [...LIVE_MODULE_KEYS] });
if (!scriptResult.ok) {
  failures.push({ id: 'store-script', result: scriptResult });
}

const docDemoCount = singleFileDocDemos.length + docusaurusDocDemos.length + 1;

if (failures.length === 0) {
  console.log(
    `✓ all ${apps.length} lab apps, ${shellApps.length} shell apps, ` +
      `${docDemoCount} docs demos (single-file, multi-file, and docusaurus), ` +
      'and the store API script validate against the current SDK',
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
