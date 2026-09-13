'use client';

import { createRegistry, defineLoader } from 'next-live';
import { LiveDemo } from '@/components/docs/LiveDemo';
import { docusaurusButtonDemo } from '@/lib/docs/docusaurus-demos';

const docusaurusDemoModules = createRegistry({
  '@next-live-docusaurus/modules': defineLoader(() => import('@/lib/live-sdk/modules/ui')),
});

export function DocusaurusButtonDemo() {
  return (
    <LiveDemo
      source={docusaurusButtonDemo}
      modules={docusaurusDemoModules}
      editable
      filePath="Demo.tsx"
    />
  );
}
