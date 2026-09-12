import { createRegistry } from 'next-live';
import { formatModules } from './format-modules';
import { storeModules } from './store-modules';
import { uiModules } from './ui-modules';
import { vendorModules } from './vendor';

/**
 * The complete SDK surface available to live snippets.
 *
 * Composed from small per-domain files rather than one object inline on
 * LiveProvider. Each entry is a lazy loader; only specifiers a snippet imports
 * are fetched at runtime.
 *
 * For many modules, replace the manual groups with `appModulesFromGlob` from
 * `./app-modules-glob.ts`. See /docs/module-registry#organizing-your-registry.
 */
export const liveModules = createRegistry(
  vendorModules,
  uiModules,
  formatModules,
  storeModules,
);
// LIVE_MODULE_KEYS lives in ./module-keys.ts - import it from Node scripts only
// (it uses node:fs and must not be re-exported through this client barrel).
