'use client';

import { CodeBlock } from '@/components/docs/CodeBlock';

interface FenceExampleProps {
  /** Metastring after the language, e.g. `live` or `title="Counter" showLineNumbers live`. */
  fence: string;
  code: string;
  title?: string;
  showLineNumbers?: boolean;
  caption?: string;
}

/**
 * Documents a Docusaurus MDX fence: prose shows the opener, CodeBlock shows the snippet.
 */
export function FenceExample({
  fence,
  code,
  title,
  showLineNumbers,
  caption,
}: FenceExampleProps) {
  return (
    <div className="not-prose my-6 space-y-2">
      <p className="text-sm leading-relaxed text-muted-foreground">
        MDX fence opener:{' '}
        <code className="rounded-md bg-code-inline px-1.5 py-0.5 font-mono text-[0.8125rem] text-foreground">
          {`\`\`\`tsx ${fence}`}
        </code>
      </p>
      <CodeBlock
        title={title ?? 'snippet.tsx'}
        language="tsx"
        code={code}
        showLineNumbers={showLineNumbers}
        caption={caption}
      />
    </div>
  );
}
