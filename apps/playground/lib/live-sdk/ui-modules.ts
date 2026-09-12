import { defineLoader } from 'next-live';
import type { ModuleRegistry } from 'next-live';

/** Manual registry group: one domain, explicit loader per specifier. */
export const uiModules: ModuleRegistry = {
  '@app/ui': defineLoader(() => import('./modules/ui')),
};
