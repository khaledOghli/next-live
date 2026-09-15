import type { Metadata } from 'next';
import { SandboxClient } from './SandboxClient';

export const metadata: Metadata = {
  title: 'Sandbox',
  robots: { index: false, follow: false },
};

/**
 * The page inside the sandbox iframe used by `/sandbox-demo`.
 *
 * It has no content of its own: `<LiveSandboxRoot>` waits for the page that
 * embeds it to connect, then compiles and renders the snippets it sends.
 * Opened directly in a tab, it shows a short note instead.
 */
export default function SandboxPage() {
  return <SandboxClient />;
}
