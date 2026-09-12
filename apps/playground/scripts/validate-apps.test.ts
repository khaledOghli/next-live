/**
 * Ensures LIVE_MODULE_KEYS matches lib/live-sdk/modules/ on disk.
 * Run via: npm run validate:apps:test -w playground
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filenameToAppSpecifier } from '../lib/live-sdk/app-module-specifier.ts';
import { LIVE_MODULE_KEYS } from '../lib/live-sdk/module-keys.ts';

const modulesDir = join(dirname(fileURLToPath(import.meta.url)), '../lib/live-sdk/modules');

function expectedAppKeysFromFilesystem(): string[] {
  return readdirSync(modulesDir)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => filenameToAppSpecifier(file))
    .filter((key): key is string => key !== null)
    .sort();
}

const expectedAppKeys = expectedAppKeysFromFilesystem();
const actualAppKeys = LIVE_MODULE_KEYS.filter((key) => key.startsWith('@app/')).sort();

const missingFromRegistry = expectedAppKeys.filter((key) => !actualAppKeys.includes(key));
const extraInRegistry = actualAppKeys.filter((key) => !expectedAppKeys.includes(key));

if (missingFromRegistry.length > 0 || extraInRegistry.length > 0) {
  console.error('✗ LIVE_MODULE_KEYS drift from lib/live-sdk/modules/:');
  if (missingFromRegistry.length > 0) {
    console.error(`  missing keys: ${missingFromRegistry.join(', ')}`);
  }
  if (extraInRegistry.length > 0) {
    console.error(`  extra keys: ${extraInRegistry.join(', ')}`);
  }
  process.exit(1);
}

console.log(`✓ LIVE_MODULE_KEYS matches ${expectedAppKeys.length} app module(s) on disk`);
