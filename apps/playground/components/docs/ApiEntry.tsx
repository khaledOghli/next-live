import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type EntryKind = 'component' | 'hook' | 'function' | 'type' | 'error' | 'constant';

interface ApiEntryProps {
  /** The exported name. Becomes the heading text and the anchor id. */
  name: string;
  kind?: EntryKind;
  /** One-line type signature, rendered as syntax-highlighted code. */
  signature?: string;
  /** Entry point the export comes from, e.g. `next-live/server`. */
  from?: string;
  children: ReactNode;
}

const KIND_LABEL: Record<EntryKind, string> = {
  component: 'component',
  hook: 'hook',
  function: 'function',
  type: 'type',
  error: 'error',
  constant: 'constant',
};

const KIND_TONE: Record<EntryKind, string> = {
  component: 'border-brand/30 bg-brand/10 text-brand',
  hook: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  function: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  type: 'border-border bg-muted text-muted-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-destructive dark:text-red-400',
  constant: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

/** Mirrors rehype-slug so hand-authored anchors match generated heading ids. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * One documented export: a linkable heading, a kind badge, its signature, and
 * the prose or tables that describe it.
 *
 * Kept as a component rather than plain MDX headings so every entry gets the
 * same anatomy, readers scanning the reference learn the shape once.
 */
export function ApiEntry({ name, kind = 'function', signature, from, children }: ApiEntryProps) {
  const id = slugify(name);

  return (
    <section id={id} className="not-prose scroll-mt-20 border-t border-border py-8 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="group/anchor text-lg font-semibold tracking-tight text-foreground">
          <a href={`#${id}`} className="no-underline">
            <code className="font-mono">{name}</code>
            <span
              aria-hidden
              className="ml-2 select-none text-brand opacity-0 transition-opacity group-hover/anchor:opacity-100"
            >
              #
            </span>
          </a>
        </h3>

        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            KIND_TONE[kind],
          )}
        >
          {KIND_LABEL[kind]}
        </span>

        {from && (
          <span className="font-mono text-xs text-muted-foreground">
            from <code className="rounded bg-code-inline px-1.5 py-0.5 text-foreground">{from}</code>
          </span>
        )}
      </div>

      {/*
        Deliberately not syntax-highlighted. Prism's light themes render dark
        text, which disappears on the dark-mode surface this sits on, and a
        one-line signature reads fine in a single colour.
      */}
      {signature && (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/40 px-4 py-2.5 font-mono text-[0.8125rem] leading-relaxed text-foreground">
          {signature.trim()}
        </pre>
      )}

      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-brand hover:[&_a]:underline [&_code]:rounded [&_code]:bg-code-inline [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}
