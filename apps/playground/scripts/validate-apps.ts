/**
 * Checks every stored app still compiles against the current SDK surface.
 *
 * Run this in CI. Snippets live in a database, so renaming something in
 * lib/live-sdk breaks them silently — the failure would otherwise surface for
 * whoever opens that app next, not for whoever made the change.
 *
 *   npx tsx scripts/validate-apps.ts
 */
import { validateSnippets } from 'next-live/server';
import { apps } from '../lib/apps.ts';

// Only the keys are needed, and keys are all a CI script can easily get: the
// real registry is full of bundler-specific dynamic imports.
const MODULE_KEYS = [
  '@demo/vendor',
  '@demo/vendor/',
  '@app/store',
];

const failures = validateSnippets(apps, { modules: MODULE_KEYS });

if (failures.length === 0) {
  console.log(`✓ all ${apps.length} stored apps validate against the current SDK`);
  process.exit(0);
}

console.error(`✗ ${failures.length} of ${apps.length} stored apps are broken:\n`);
for (const { id, result } of failures) {
  for (const issue of result.issues) {
    const where = issue.line ? ` (line ${issue.line})` : '';
    console.error(`  ${id}${where}: ${issue.message}`);
  }
}
process.exit(1);
