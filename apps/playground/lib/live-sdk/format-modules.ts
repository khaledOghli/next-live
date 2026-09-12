import { defineLoader } from 'next-live';
import type { ModuleRegistry } from 'next-live';

export const formatModules: ModuleRegistry = {
  '@app/format': defineLoader(() => import('./modules/format')),
};
