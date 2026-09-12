import { redirect } from 'next/navigation';

/** Docs home sends readers straight into the first guide — the landing page owns the overview. */
export default function DocsIndexPage() {
  redirect('/docs/getting-started');
}
