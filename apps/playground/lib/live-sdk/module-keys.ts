import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filenameToAppSpecifier } from './app-module-specifier.ts';
import { vendorModules } from './vendor.ts';

const modulesDir = join(dirname(fileURLToPath(import.meta.url)), 'modules');

/** @app/* keys derived from lib/live-sdk/modules/ — same rule as stores.ts. */
function appModuleKeys(): string[] {
  return readdirSync(modulesDir)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => filenameToAppSpecifier(file))
    .filter((key): key is string => key !== null)
    .sort();
}

/**
 * Registry keys for CI validation. Node scripts cannot import `liveModules`
 * (it uses import.meta.glob); vendor keys come from vendorModules, app keys
 * from the modules/ directory listing.
 */
export const LIVE_MODULE_KEYS = [...Object.keys(vendorModules), ...appModuleKeys()] as const;
