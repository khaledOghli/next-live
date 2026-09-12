'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './CodeBlock';

export interface CodeTabFile {
  /** Tab label, normally the filename. */
  name: string;
  code: string;
  language?: string;
  highlight?: string;
}

interface CodeTabsProps {
  files: CodeTabFile[];
  caption?: string;
}

/**
 * Several files that belong to one example, behind tabs.
 *
 * Integration examples span a registry file, a provider, and a page. Stacking
 * three code blocks buries the relationship between them; tabs keep the set
 * legible as a single unit.
 */
export function CodeTabs({ files, caption }: CodeTabsProps) {
  if (files.length === 0) return null;

  return (
    <div className="not-prose my-6">
      <Tabs defaultValue={files[0].name}>
        <TabsList className="flex-wrap">
          {files.map((file) => (
            <TabsTrigger key={file.name} value={file.name} className="font-mono text-xs">
              {file.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {files.map((file) => (
          <TabsContent key={file.name} value={file.name}>
            <CodeBlock
              code={file.code}
              language={file.language ?? 'tsx'}
              title={file.name}
              highlight={file.highlight}
              className="my-2"
            />
          </TabsContent>
        ))}
      </Tabs>
      {caption && <p className="mt-1 px-1 text-xs leading-relaxed text-muted-foreground">{caption}</p>}
    </div>
  );
}
