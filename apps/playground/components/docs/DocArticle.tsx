import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DocArticleProps {
  title?: string;
  description?: string;
  breadcrumb?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  intro?: ReactNode;
  /** Source file for the "Edit this page" link, relative to the repo root. */
  editPath?: string;
}

const REPO_EDIT_BASE = 'https://github.com/khaledoghli/next-live/edit/main';

export function DocArticle({
  title,
  description,
  breadcrumb,
  children,
  footer,
  intro,
  editPath,
}: DocArticleProps) {
  return (
    <div id="doc-article">
      {(breadcrumb || title || description) && (
        <header className="mb-8 border-b border-border/40 pb-8">
          {breadcrumb}
          {title && (
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
          )}
          {description && (
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {description}
            </p>
          )}
        </header>
      )}

      {intro}

      <article
        className={cn(
          'prose prose-neutral max-w-none dark:prose-invert prose-base sm:prose-lg',
          'prose-headings:scroll-mt-20 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
          'prose-p:leading-relaxed prose-p:text-muted-foreground prose-li:leading-relaxed prose-li:text-muted-foreground',
          'prose-strong:text-foreground',
          'prose-a:text-brand prose-a:font-medium prose-a:no-underline hover:prose-a:underline',
          'prose-code:rounded-md prose-code:bg-code-inline prose-code:px-1.5 prose-code:py-0.5',
          'prose-code:text-[0.875em] prose-code:font-normal prose-code:text-foreground',
          'prose-code:before:content-none prose-code:after:content-none',
          'prose-pre:p-0 prose-pre:bg-transparent',
          '[&_.code-block_code]:bg-transparent [&_.code-block_code]:p-0 [&_.code-block_code]:text-inherit',
          '[&_.live-demo-breakout]:not-prose [&_.live-demo-breakout]:-mx-4 sm:[&_.live-demo-breakout]:-mx-6',
        )}
      >
        {children}
      </article>

      {editPath && (
        <div className="not-prose mt-10 flex justify-end">
          <a
            href={`${REPO_EDIT_BASE}/${editPath}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-brand"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4v16h16v-7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Edit this page on GitHub
          </a>
        </div>
      )}

      {footer}
    </div>
  );
}
