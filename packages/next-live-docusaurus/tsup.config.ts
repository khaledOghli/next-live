import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      constants: 'src/constants.ts',
      'modules-stub': 'src/modules-stub.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    outDir: 'dist',
  },
  {
    entry: {
      'CodeBlock/index': 'src/theme/CodeBlock/index.tsx',
      'CodeBlock/LiveBlock': 'src/theme/CodeBlock/LiveBlock.tsx',
    },
    format: ['esm'],
    outDir: 'lib/theme',
    jsx: 'automatic',
    clean: true,
    external: [
      '@theme-init/CodeBlock',
      '@theme/CodeBlock',
      '@docusaurus/BrowserOnly',
      '@docusaurus/theme-common',
      'next-live',
      'next-live/editor',
      'next-live-docusaurus/constants',
      '@next-live-docusaurus/modules',
      'react',
      'react-dom',
    ],
  },
]);
