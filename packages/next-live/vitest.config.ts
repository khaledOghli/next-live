import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Most suites are pure Node. The React suites opt into jsdom per-file with
    // a `@vitest-environment jsdom` docblock, so the fast ones stay fast.
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/browser/**'],
  },
});
