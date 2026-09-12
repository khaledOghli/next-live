import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DocArticle } from '@/components/docs/DocArticle';
import { loadDocPage } from '@/lib/docs/load-page';

export const metadata: Metadata = {
  title: 'Documentation — next-live',
  description:
    'Live TSX evaluation for the Next.js App Router. Install, integrate, and run snippets safely.',
  alternates: { canonical: '/docs' },
  openGraph: {
    type: 'website',
    title: 'Documentation — next-live',
    description: 'Live TSX evaluation for the Next.js App Router.',
    url: '/docs',
  },
};

export default async function DocsIndexPage() {
  const Content = await loadDocPage('index');
  // The shell renders the sidebar, so a 404 here still leaves a way out.
  if (!Content) notFound();

  return (
    <DocArticle>
      <Content />
    </DocArticle>
  );
}
