import { createRegistry } from 'next-live';
import { vendorModules } from './vendor';
import { storeModules } from './stores';

/**
 * The complete SDK surface available to live snippets.
 *
 * Composed from small per-domain files rather than one object that grows
 * without bound. Adding a capability means adding a group, not editing the
 * component that renders the provider.
 */
export const liveModules = createRegistry(vendorModules, storeModules);
// LIVE_MODULE_KEYS lives in ./module-keys.ts - import it from Node scripts only
// (it uses node:fs and must not be re-exported through this client barrel).
