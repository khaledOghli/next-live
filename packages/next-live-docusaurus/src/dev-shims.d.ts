/** Local type shims for plugin development. Not published (see package.json files). */
declare module '@theme/CodeBlock' {
  import type { ReactNode } from 'react';

  export interface Props {
    children?: ReactNode;
    metastring?: string;
    className?: string;
    title?: string;
    showLineNumbers?: boolean;
    language?: string;
  }

  const CodeBlock: (props: Props) => ReactNode;
  export default CodeBlock;
}

declare module '@theme-init/CodeBlock' {
  import type { Props } from '@theme/CodeBlock';
  const CodeBlock: (props: Props) => ReactNode;
  export default CodeBlock;
  export type { Props };
}

declare module '@next-live-docusaurus/modules' {
  const modules: Record<string, unknown>;
  export = modules;
}
