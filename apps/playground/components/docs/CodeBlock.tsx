'use client';

import { useMemo, useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import type { Language } from 'prism-react-renderer';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  /** Filename shown in the header. Falls back to the language name. */
  title?: string;
  /**
   * `install` renders unhighlighted on a neutral surface, so shell one-liners
   * read as commands to run rather than as source to study.
   */
  variant?: 'block' | 'install';
  /** `"3"`, `"3-5"`, `"1,4-6"`, painted with a brand gutter. */
  highlight?: string;
  showLineNumbers?: boolean;
  /** Caption under the block, for "what to notice" notes. */
  caption?: string;
  className?: string;
}

/** Expands `"1,4-6"` into a Set of 1-based line numbers. */
function parseHighlight(spec: string | undefined): Set<number> {
  const lines = new Set<number>();
  if (!spec) return lines;
  for (const part of spec.split(',')) {
    const [rawStart, rawEnd] = part.trim().split('-');
    const start = Number(rawStart);
    if (!Number.isFinite(start)) continue;
    const end = rawEnd === undefined ? start : Number(rawEnd);
    if (!Number.isFinite(end)) continue;
    for (let n = Math.min(start, end); n <= Math.max(start, end); n++) lines.add(n);
  }
  return lines;
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
    </svg>
  );
}

export function CodeBlock({
  code,
  language = 'tsx',
  title,
  variant = 'block',
  highlight,
  showLineNumbers = false,
  caption,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isInstall = variant === 'install';
  const trimmed = code.trim();
  const highlighted = useMemo(() => parseHighlight(highlight), [highlight]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded views.
      // The code is still selectable, so a failed copy is not worth an error.
    }
  };

  return (
    <figure className={cn('code-block not-prose group relative my-6', className)}>
      <div
        className={cn(
          'overflow-hidden rounded-xl border text-sm shadow-sm',
          isInstall ? 'border-border bg-muted/40' : 'border-zinc-800 bg-[#1e1e1e]',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-3 px-4 py-2 text-xs',
            isInstall
              ? 'border-b border-border text-muted-foreground'
              : 'border-b border-white/10 text-zinc-400',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {!isInstall && (
              <span aria-hidden className="flex shrink-0 gap-1.5">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </span>
            )}
            <span className="truncate font-mono">{title ?? language}</span>
          </span>

          <button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Copied to clipboard' : 'Copy code to clipboard'}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors',
              'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
              isInstall
                ? 'hover:bg-background focus-visible:bg-background'
                : 'hover:bg-white/10 hover:text-zinc-100 focus-visible:bg-white/10',
            )}
          >
            <CopyIcon copied={copied} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/*
          Install commands are not syntax-highlighted: Prism's light themes
          render dark text, which vanishes against the dark-mode `muted`
          surface this variant uses. A shell one-liner gains nothing from
          colour, so it renders in plain `foreground` and stays legible in
          both themes.
        */}
        {isInstall ? (
          <pre className="overflow-x-auto px-4 py-4 font-mono leading-relaxed text-foreground">
            {trimmed}
          </pre>
        ) : (
          <Highlight theme={themes.vsDark} code={trimmed} language={language as Language}>
            {({ className: prismClass, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className={cn(prismClass, 'overflow-x-auto py-4 font-mono leading-relaxed')}
                style={{ ...style, margin: 0, background: 'transparent' }}
              >
                {tokens.map((line, lineIndex) => {
                  const lineNumber = lineIndex + 1;
                  return (
                    <div
                      key={lineIndex}
                      {...getLineProps({ line })}
                      className={cn(
                        'px-4',
                        highlighted.has(lineNumber) &&
                          'bg-brand/20 shadow-[inset_2px_0_0_var(--brand)]',
                      )}
                    >
                      {showLineNumbers && (
                        <span
                          aria-hidden
                          className="mr-4 inline-block w-6 select-none text-right tabular-nums text-zinc-600"
                        >
                          {lineNumber}
                        </span>
                      )}
                      {line.map((token, tokenIndex) => (
                        <span key={tokenIndex} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  );
                })}
              </pre>
            )}
          </Highlight>
        )}
      </div>

      {caption && (
        <figcaption className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
