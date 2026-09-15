import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The package imports its own sandbox host by name (see tsconfig.json).
      // Tests must exercise the source, not a possibly stale build.
      'next-live/internal/sandbox-host': fileURLToPath(new URL('./src/sandbox/host/index.tsx', import.meta.url)),
    },
  },
  test: {
    // Most suites are pure Node. The React suites opt into jsdom per-file with
    // a `@vitest-environment jsdom` docblock, so the fast ones stay fast.
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/browser/**'],
  },
});
