'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = 'tsx', title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-border">
      {(title || language) && (
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
          <span className="text-xs text-muted-foreground">{title ?? language}</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
      {!title && !language && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-2 top-2 z-10 h-7 text-xs opacity-0 transition-opacity group-hover:opacity-100"
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
