import type { ReactNode } from 'react';

interface DocArticleProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

/**
 * A documentation page's heading and body.
 *
 * Separate from `DocsShell` so the shell can live in the layout and survive
 * navigation, while the per-page heading still comes from the page itself.
 */
export function DocArticle({ title, description, children }: DocArticleProps) {
  return (
    <>
      {(title || description) && (
        <header className="mb-8 max-w-3xl">
          {title && <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>}
          {description && <p className="mt-2 text-lg text-muted-foreground">{description}</p>}
        </header>
      )}
      <article className="max-w-3xl [&>*:first-child]:mt-0">{children}</article>
    </>
  );
}
