export interface DocNavItem {
  slug: string;
  title: string;
  description?: string;
}

export interface DocNavGroup {
  title: string;
  slugs: string[];
}

const items: Record<string, DocNavItem> = {
  'getting-started': { slug: 'getting-started', title: 'Getting started', description: 'Install and first live preview' },
  'module-registry': { slug: 'module-registry', title: 'Module registry', description: 'How snippet imports map to your app code' },
  'sharing-libraries': { slug: 'sharing-libraries', title: 'Sharing libraries', description: 'One React instance, one store' },
  scaling: { slug: 'scaling', title: 'Scaling', description: 'Bundle size and precompile' },
  security: { slug: 'security', title: 'Security', description: 'Trust model and access control' },
  'api-reference': { slug: 'api-reference', title: 'API reference', description: 'Every export and prop' },
  troubleshooting: { slug: 'troubleshooting', title: 'Troubleshooting', description: 'Errors and fixes' },
  integration: { slug: 'integration', title: 'Integration guide', description: 'Database to live runner' },
  'non-ui-snippets': { slug: 'non-ui-snippets', title: 'Non-UI snippets', description: 'Validators and scripts' },
  'validating-ci': { slug: 'validating-ci', title: 'Validating in CI', description: 'Catch breaks before users do' },
  docusaurus: { slug: 'docusaurus', title: 'Docusaurus', description: 'Live blocks in MDX docs' },
  'migrating-from-react-live': {
    slug: 'migrating-from-react-live',
    title: 'Migrating from react-live',
    description: 'Issue parity and prop mapping',
  },
};

export const docNavGroups: DocNavGroup[] = [
  { title: 'Start here', slugs: ['getting-started', 'module-registry', 'sharing-libraries'] },
  { title: 'Production', slugs: ['scaling', 'security', 'integration', 'validating-ci'] },
  {
    title: 'Reference',
    slugs: ['api-reference', 'troubleshooting', 'non-ui-snippets', 'docusaurus', 'migrating-from-react-live'],
  },
];

/** Flat list in nav order, used for pager and sitemap. */
export const docNav: DocNavItem[] = docNavGroups.flatMap((group) =>
  group.slugs.map((slug) => items[slug]).filter(Boolean),
);

export function getDocMeta(slug: string): DocNavItem | undefined {
  return items[slug];
}

export function getAdjacentDocs(slug: string): {
  prev?: DocNavItem;
  next?: DocNavItem;
} {
  const index = docNav.findIndex((item) => item.slug === slug);
  if (index === -1) return {};
  return {
    prev: index > 0 ? docNav[index - 1] : undefined,
    next: index < docNav.length - 1 ? docNav[index + 1] : undefined,
  };
}

export function getDocGroups(): Array<{ title: string; items: DocNavItem[] }> {
  return docNavGroups.map((group) => ({
    title: group.title,
    items: group.slugs.map((slug) => items[slug]).filter(Boolean),
  }));
}
