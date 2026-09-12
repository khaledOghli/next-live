import { defineConfig } from 'tsup';

const shared = {
  format: ['esm', 'cjs'] as const,
  dts: true,
  sourcemap: true,
  // dist is cleaned by the build script, not per-config: tsup runs these
  // configs concurrently, so a per-config clean races with the others and can
  // delete declarations another config just emitted.
  clean: false,
  treeshake: true,
  target: 'es2022',
  external: ['react', 'react-dom'],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts', editor: 'src/editor.ts' },
    // Pin the shared chunk's filename instead of content-hashing it.
    //
    // The two client entries share `LiveContext`, so tsup splits it into a
    // chunk, which must stay shared: bundling a copy into each entry would
    // give `next-live` and `next-live/editor` separate `createContext` calls,
    // and `useLiveContext` inside `<LiveEditor>` would never see what
    // `<LiveProvider>` supplies.
    //
    // With a hashed name that chunk is renamed on every rebuild, and a dev
    // server holding a resolved path to the old file then fails with
    // "Cannot read properties of undefined (reading 'call')", a missing module
    // factory, on the next client-side navigation. A stable name makes
    // rebuilding the library safe while an app is running against it.
    esbuildOptions(options) {
      options.chunkNames = 'shared';
    },
    // The 'use client' directive is added afterwards by scripts/add-use-client.mjs.
    // A bundler-level `banner` does not survive here: tsup strips module-level
    // directives while bundling (it warns about exactly this), so the only
    // reliable place to add it is after the build.
  },
  {
    ...shared,
    // The server entry must NOT carry the 'use client' banner.
    entry: { server: 'src/server.ts' },
  },
]);
