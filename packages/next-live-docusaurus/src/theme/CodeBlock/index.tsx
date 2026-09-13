'use client';

import React, { lazy, Suspense } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import CodeBlock from '@theme-init/CodeBlock';
import type { Props } from '@theme/CodeBlock';
import {
  containsLineNumbers,
  parseCodeBlockTitle,
} from '@docusaurus/theme-common/internal';
import { isLiveBlock } from './metastring';

const LiveBlock = lazy(() => import('./LiveBlock'));

function languageFromClassName(className?: string): string {
  const match = className?.match(/language-(\w+)/);
  return match?.[1] ?? 'tsx';
}

function highlightFromMetastring(metastring?: string): string | undefined {
  if (!metastring) return undefined;
  const match = /\{([\d,\s-]+)\}/.exec(metastring);
  return match?.[1];
}

export default function CodeBlockWithLive(props: Props): React.ReactElement {
  if (!isLiveBlock(props.metastring)) {
    return <CodeBlock {...props} />;
  }

  const code = String(props.children ?? '').replace(/\n$/, '');
  const language = languageFromClassName(props.className);
  const title = parseCodeBlockTitle(props.metastring) || props.title;
  const showLineNumbers = props.showLineNumbers ?? containsLineNumbers(props.metastring);
  const highlightLines = highlightFromMetastring(props.metastring);

  return (
    <BrowserOnly fallback={<CodeBlock {...props} />}>
      {() => (
        <Suspense fallback={<CodeBlock {...props} />}>
          <LiveBlock
            code={code}
            language={language}
            title={title}
            showLineNumbers={showLineNumbers}
            highlightLines={highlightLines}
          />
        </Suspense>
      )}
    </BrowserOnly>
  );
}
