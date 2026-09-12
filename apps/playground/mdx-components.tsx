import type { MDXComponents } from 'mdx/types';

/** Minimal overrides — prose typography handles most MDX content. */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
  };
}
