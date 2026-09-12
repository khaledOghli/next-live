import { registryFromGlob } from 'next-live';
import type { ModuleRegistry } from 'next-live';
import { pathToAppSpecifier } from './app-module-specifier';

/**
 * Everything in `./modules` is exposed to snippets, generated from the
 * filesystem so this file never has to grow.
 *
 * `import.meta.glob` (Turbopack only) returns `{ path: () => import(path) }` -
 * lazy thunks - which map straight onto loaders, so none of these files is
 * fetched until a snippet imports it.
 *
 * The pattern must be at or below this file's own directory: Turbopack resolves
 * it relative to the calling file, and a `../` pattern silently matches nothing.
 * Keeping the exposed modules in a subdirectory is the right shape anyway - the
 * SDK surface becomes visible in the filesystem instead of being a filter list.
 */
export const storeModules: ModuleRegistry = registryFromGlob(
  import.meta.glob('./modules/*.ts'),
  pathToAppSpecifier,
);
