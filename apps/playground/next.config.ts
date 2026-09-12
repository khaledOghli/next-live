import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
};

/**
 * MDX defaults to CommonMark, which has no tables, task lists, strikethrough,
 * or autolinks. Without `remark-gfm` every markdown table renders as literal
 * pipe characters — and these docs are full of tables, so a large share of the
 * content was unreadable.
 *
 * Plugins are named as **strings**, not imported functions: Turbopack (the
 * default bundler in Next 16) requires serializable loader options, and a
 * function reference fails the build with "does not have serializable options".
 */
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
  },
});

export default withMDX(nextConfig);
