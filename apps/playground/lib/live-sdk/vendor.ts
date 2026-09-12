import { defineLoader } from 'next-live';
import type { ModuleRegistry } from 'next-live';

/**
 * Third-party modules snippets may import.
 *
 * Every entry is a `defineLoader`, never a value. That is the whole trick: a
 * loader is a dynamic `import()`, so the bundler code-splits it and the code is
 * fetched only if a snippet actually imports that specifier. Registering the
 * value instead (`import * as x from 'y'`) puts it in the page bundle for every
 * visitor, used or not.
 */
export const vendorModules: ModuleRegistry = {
  // Exact entry: the package root.
  '@demo/vendor': defineLoader(() => import('@demo/vendor')),

  // Prefix entry - a key ending in '/' claims the whole subtree and receives
  // the full specifier, so one line serves every deep subpath
  // ('@demo/vendor/charts/BarChart', '@demo/vendor/format/currency', …)
  // without enumerating them.
  '@demo/vendor/': defineLoader((specifier) => {
    const subpath = specifier.slice('@demo/vendor/'.length);
    return import(`@demo/vendor/${subpath}`);
  }),
};
