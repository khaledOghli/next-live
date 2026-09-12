import type { ComponentType } from 'react';

const pages: Record<string, () => Promise<{ default: ComponentType }>> = {
  index: () => import('@/content/docs/index.mdx'),
  'getting-started': () => import('@/content/docs/getting-started.mdx'),
  'module-registry': () => import('@/content/docs/module-registry.mdx'),
  'sharing-libraries': () => import('@/content/docs/sharing-libraries.mdx'),
  scaling: () => import('@/content/docs/scaling.mdx'),
  security: () => import('@/content/docs/security.mdx'),
  'api-reference': () => import('@/content/docs/api-reference.mdx'),
  troubleshooting: () => import('@/content/docs/troubleshooting.mdx'),
  integration: () => import('@/content/docs/integration.mdx'),
  'non-ui-snippets': () => import('@/content/docs/non-ui-snippets.mdx'),
  'validating-ci': () => import('@/content/docs/validating-ci.mdx'),
  migrating: () => import('@/content/docs/migrating.mdx'),
};

export async function loadDocPage(slug: string): Promise<ComponentType | null> {
  const loader = pages[slug];
  if (!loader) return null;
  return (await loader()).default;
}

export function getAllDocSlugs(): string[] {
  return Object.keys(pages).filter((slug) => slug !== 'index');
}
