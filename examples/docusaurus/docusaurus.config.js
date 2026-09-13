import nextLivePlugin from 'next-live-docusaurus';
import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
export default {
  title: 'next-live',
  tagline: 'Live TSX fences for Docusaurus',
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: false,
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'next-live',
      items: [
        {
          href: 'https://next-live-playground.vercel.app/docs/docusaurus',
          label: 'Documentation',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/next-live-docusaurus',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://github.com/khaledOghli/next-live',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      copyright: `next-live · ${new Date().getFullYear()}`,
    },
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    // Always use vsDark for static fences. Matches playground CodeBlock in both themes.
    prism: {
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['tsx', 'jsx'],
    },
  },
  plugins: [
    [
      nextLivePlugin,
      {
        modules: './src/live-modules.ts',
      },
    ],
  ],
};
