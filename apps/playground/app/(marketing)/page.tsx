import type { Metadata } from 'next';
import { SiteLanding } from '@/components/site/SiteLanding';

export const metadata: Metadata = {
  title: 'next-live: Live TSX evaluation for React',
  description:
    'Real ESM imports, a module registry, SSR-safe live previews, and ~16 KB preview bundles. Works anywhere React runs, tuned for the Next.js App Router.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: 'next-live: Live TSX evaluation for React',
    description:
      'Real ESM imports, a module registry, SSR-safe live previews, and ~16 KB preview bundles.',
    url: '/',
  },
};

export default function HomePage() {
  return <SiteLanding />;
}
