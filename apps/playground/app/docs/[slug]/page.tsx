import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DocArticle } from '@/components/docs/DocArticle';
import { DocGuideCards } from '@/components/docs/DocGuideCards';
import { DocPager } from '@/components/docs/DocPager';
import { loadDocPage } from '@/lib/docs/load-page';
import { getDocMeta } from '@/lib/docs/nav';

interface DocPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const { getAllDocSlugs } = await import('@/lib/docs/load-page');
  return getAllDocSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const meta = getDocMeta(slug);
  if (!meta) return {};

  return {
    title: `${meta.title} — next-live docs`,
    description: meta.description,
    alternates: { canonical: `/docs/${slug}` },
    openGraph: {
      type: 'article',
      title: `${meta.title} — next-live docs`,
      description: meta.description,
      url: `/docs/${slug}`,
    },
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const meta = getDocMeta(slug);
  const Content = await loadDocPage(slug);

  if (!meta || !Content) notFound();

  return (
    <DocArticle
      title={meta.title}
      description={meta.description}
      intro={slug === 'getting-started' ? <DocGuideCards /> : undefined}
      footer={<DocPager slug={slug} />}
    >
      <Content />
    </DocArticle>
  );
}
