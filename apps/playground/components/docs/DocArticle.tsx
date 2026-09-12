import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DocArticleProps {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  intro?: ReactNode;
}

export function DocArticle({ title, description, children, footer, intro }: DocArticleProps) {
  return (
    <div id="doc-article">
      {(title || description) && (
        <header className="mb-10">
          {title && <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>}
          {description && (
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>
          )}
        </header>
      )}
      {intro}
      <article
        className={cn(
          'prose prose-neutral max-w-none dark:prose-invert prose-base sm:prose-lg',
          'prose-headings:scroll-mt-6 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
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
      {footer}
    </div>
  );
}
