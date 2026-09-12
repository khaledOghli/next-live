import { registryFromGlob } from 'next-live';
import type { ModuleRegistry } from 'next-live';
import { pathToAppSpecifier } from './app-module-specifier';

/**
 * Option B: auto-register every file in `./modules/` as `@app/{name}`.
 *
 * Not wired into `liveModules` while the playground uses explicit manual groups
 * (ui-modules, format-modules, store-modules). Switch to this when the list
 * grows and hand-maintaining loaders becomes tedious.
 *
 * `import.meta.glob` must stay in this file; the bundler resolves the pattern
 * at the call site.
 */
export const appModulesFromGlob: ModuleRegistry = registryFromGlob(
  import.meta.glob('./modules/*.ts'),
  pathToAppSpecifier,
);
