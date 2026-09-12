import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],

  /**
   * The docs index is the site's home page, served at `/` rather than at
   * `/docs`.
   *
   * A rewrite, not a redirect: the visitor stays on the bare domain instead of
   * being bounced to `/docs`. `/docs` keeps working, so every existing link
   * into the documentation survives.
   *
   * `beforeFiles` is the part that matters. Both Next and Vercel apply ordinary
   * rewrites only after the filesystem has been checked, and `/` already
   * resolves to the marketing page, so an afterFiles rewrite (or one in
   * vercel.json) would never fire. `beforeFiles` runs ahead of that check.
   */
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/docs' }],
      afterFiles: [],
      fallback: [],
    };
  },
};

/**
 * MDX defaults to CommonMark, which has no tables, task lists, strikethrough,
 * or autolinks. Without `remark-gfm` every markdown table renders as literal
 * pipe characters, and these docs are full of tables, so a large share of the
 * content was unreadable.
 *
 * Plugins are named as **strings**, not imported functions: Turbopack (the
 * default bundler in Next 16) requires serializable loader options, and a
 * function reference fails the build with "does not have serializable options".
 */
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
    // Gives every heading a stable id at build time, so in-page anchors and
    // deep links work in the served HTML. Without it the table of contents had
    // to invent ids by mutating the DOM after hydration, which meant a link to
    // `#some-heading` resolved to nothing until JavaScript ran.
    rehypePlugins: ['rehype-slug'],
  },
});

export default withMDX(nextConfig);
