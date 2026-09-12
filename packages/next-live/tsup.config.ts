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
