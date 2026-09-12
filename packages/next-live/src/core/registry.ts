import { defineLoader } from './resolver';
import type { ModuleRegistry } from './types';

/**
 * Merges registry groups into one, later groups winning.
 *
 * A large SDK surface is best kept as several small files - one per domain -
 * rather than a single object that grows without bound. This composes them.
 *
 * ```ts
 * export const liveModules = createRegistry(vendorModules, storeModules, uiModules);
 * ```
 *
 * A key defined by two groups is almost always a mistake rather than an
 * intentional override, and it fails silently otherwise, so it warns in
 * development.
 */
export function createRegistry(...groups: ModuleRegistry[]): ModuleRegistry {
  const merged: ModuleRegistry = {};

  if (process.env.NODE_ENV !== 'production') {
    const seen = new Map<string, number>();
    groups.forEach((group, index) => {
      for (const key of Object.keys(group)) {
        const previous = seen.get(key);
        if (previous !== undefined) {
          console.warn(
            `next-live: module '${key}' is defined in more than one registry group ` +
              `(group ${previous} and group ${index}). The later one wins.`,
          );
        }
        seen.set(key, index);
      }
    });
  }

  for (const group of groups) Object.assign(merged, group);
  return merged;
}

/** The lazy shape `import.meta.glob()` returns: path → thunk. */
export type GlobResult = Record<string, () => Promise<unknown>>;

/**
 * Builds a registry from a directory of files, so the registry stops needing
 * hand-maintenance as the codebase grows.
 *
 * Pass the *result* of `import.meta.glob` - the call has to stay in your own
 * code, because bundlers resolve the pattern statically at the call site.
 * (`import.meta.glob` requires Turbopack; under webpack, build an equivalent
 * `{ path: () => import(path) }` object yourself.)
 *
 * ```ts
 * export const storeModules = registryFromGlob(
 *   import.meta.glob('../stores/*.ts'),
 *   (path) => `@app/store/${path.split('/').pop()!.replace(/\.tsx?$/, '')}`,
 * );
 * // → { '@app/store/cart': <loader>, '@app/store/user': <loader>, … }
 * ```
 *
 * Every entry is a loader, so none of these files is fetched until a snippet
 * imports it.
 *
 * @param glob       Result of `import.meta.glob(pattern)`, left lazy.
 * @param toSpecifier Maps a file path to the specifier snippet authors write.
 *   Return `null` to leave a file out of the registry.
 */
export function registryFromGlob(
  glob: GlobResult,
  toSpecifier: (path: string) => string | null,
): ModuleRegistry {
  const registry: ModuleRegistry = {};

  for (const [path, load] of Object.entries(glob)) {
    const specifier = toSpecifier(path);
    if (specifier === null) continue;

    if (process.env.NODE_ENV !== 'production' && specifier in registry) {
      console.warn(
        `next-live: two files map to the module specifier '${specifier}'. ` +
          'Check the toSpecifier function for collisions.',
      );
    }

    registry[specifier] = defineLoader(() => load());
  }

  return registry;
}
