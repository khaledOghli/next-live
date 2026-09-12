import { defineLoader } from 'next-live';
import type { ModuleRegistry } from 'next-live';

export const storeModules: ModuleRegistry = {
  '@app/store': defineLoader(() => import('./modules/store')),
};
