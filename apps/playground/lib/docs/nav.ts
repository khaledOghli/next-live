export interface DocNavItem {
  slug: string;
  title: string;
  description?: string;
}

export const docNav: DocNavItem[] = [
  { slug: 'getting-started', title: 'Getting started', description: 'Install and first live preview' },
  { slug: 'module-registry', title: 'Module registry', description: 'How import resolves' },
  { slug: 'sharing-libraries', title: 'Sharing libraries', description: 'One React instance, one store' },
  { slug: 'scaling', title: 'Scaling', description: 'Bundle size and precompile' },
  { slug: 'security', title: 'Security', description: 'Trust model and access control' },
  { slug: 'api-reference', title: 'API reference', description: 'Every export and prop' },
  { slug: 'troubleshooting', title: 'Troubleshooting', description: 'Errors and fixes' },
  { slug: 'integration', title: 'Integration guide', description: 'Database to live runner' },
  { slug: 'non-ui-snippets', title: 'Non-UI snippets', description: 'Validators and scripts' },
  { slug: 'validating-ci', title: 'Validating in CI', description: 'Catch breaks before users do' },
  { slug: 'migrating', title: 'Migrating from react-live', description: 'scope to registry' },
];

export function getDocMeta(slug: string): DocNavItem | undefined {
  return docNav.find((item) => item.slug === slug);
}
