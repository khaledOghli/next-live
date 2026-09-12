'use client';

import { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import type { Language } from 'prism-react-renderer';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  variant?: 'block' | 'install';
}

export function CodeBlock({ code, language = 'tsx', title, variant = 'block' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isInstall = variant === 'install';
  const prismTheme = isInstall ? themes.github : themes.vsDark;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'code-block not-prose group relative my-6 overflow-hidden rounded-lg border text-sm',
        isInstall ? 'border-border bg-muted/40' : 'border-zinc-800 bg-[#1e1e1e] shadow-sm',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between px-4 py-2 text-xs',
          isInstall ? 'border-b border-border text-muted-foreground' : 'border-b border-white/10 text-zinc-400',
        )}
      >
        <span>{title ?? language}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            'rounded px-2 py-0.5 transition-colors',
            isInstall ? 'hover:bg-background' : 'hover:bg-white/10 hover:text-zinc-200',
          )}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <Highlight theme={prismTheme} code={code.trim()} language={language as Language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(className, 'overflow-x-auto p-4 font-mono leading-relaxed')}
            style={{ ...style, margin: 0, background: 'transparent' }}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })}>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
