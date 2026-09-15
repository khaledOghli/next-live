import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    include: ['test/browser/**/*.browser.test.tsx'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          provider: playwright({
            contextOptions: {
              permissions: ['clipboard-read', 'clipboard-write'],
            },
          }),
        },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
});
