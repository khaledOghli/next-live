import type { MetadataRoute } from 'next';
import { docNav } from '@/lib/docs/nav';
import { siteUrl } from '@/lib/site';

/** Derived from the nav, so a new guide is listed without touching this file. */
export default function sitemap(): MetadataRoute.Sitemap {
  const docPages = docNav.map((item) => ({
    url: `${siteUrl}/docs/${item.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [
    { url: siteUrl, changeFrequency: 'monthly', priority: 1 },
    // The docs index is its own page (overview, FAQ, full page list), not a
    // redirect to the first guide, so it is listed once in its own right.
    { url: `${siteUrl}/docs`, changeFrequency: 'monthly', priority: 0.95 },
    ...docPages,
  ];
}
