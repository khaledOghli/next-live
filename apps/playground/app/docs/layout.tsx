import type { ReactNode } from 'react';
import { DocsShell } from '@/components/docs/DocsShell';

/**
 * The shell lives here rather than inside each page so it survives navigation:
 * below the segment boundary it remounted on every click, resetting the
 * sidebar's scroll position and re-sending the nav with each page.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
