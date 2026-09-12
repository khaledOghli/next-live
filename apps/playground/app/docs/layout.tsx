import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DocsShell } from '@/components/docs/DocsShell';

export const metadata: Metadata = {
  title: { default: 'Documentation | next-live', template: '%s | next-live docs' },
  description: 'Install, integrate, and run live TSX snippets with next-live.',
};

/**
 * The shell lives here rather than inside each page so it survives navigation:
 * below the segment boundary it remounted on every click, resetting the
 * sidebar's scroll position and re-sending the nav with each page.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
