import type { MDXComponents } from 'mdx/types';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Headings get a hover-revealed `#` that links to themselves.
 *
 * `rehype-slug` (configured in next.config.ts) has already put a stable `id`
 * on every heading at build time, so this only has to render the affordance -
 * there is no id to invent here, and the link works before hydration.
 */
function anchored(Tag: 'h2' | 'h3' | 'h4', className: string) {
  return function Heading({ id, children, ...props }: ComponentPropsWithoutRef<'h2'>) {
    return (
      <Tag id={id} className={cn('group/heading scroll-mt-20', className)} {...props}>
        {children}
        {id && (
          <a
            href={`#${id}`}
            aria-label="Link to this section"
            className="ml-2 select-none text-brand no-underline opacity-0 transition-opacity focus:opacity-100 group-hover/heading:opacity-100"
          >
            #
          </a>
        )}
      </Tag>
    );
  };
}

/**
 * Tables come from markdown (via remark-gfm) with no classes of their own, and
 * a wide one overflows the article at phone width. Wrapping each in its own
 * scroll container keeps the page body from scrolling sideways.
 */
function Table(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="not-prose my-6 w-full overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  );
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    h2: anchored('h2', 'mt-12 border-t border-border/60 pt-8 text-2xl font-semibold tracking-tight'),
    h3: anchored('h3', 'mt-8 text-lg font-semibold tracking-tight'),
    h4: anchored('h4', 'mt-6 text-base font-semibold tracking-tight'),
    table: Table,
    thead: (props: ComponentPropsWithoutRef<'thead'>) => (
      <thead className="border-b border-border bg-muted/50 text-left" {...props} />
    ),
    th: (props: ComponentPropsWithoutRef<'th'>) => (
      <th className="px-4 py-2.5 text-left font-medium text-foreground" {...props} />
    ),
    td: (props: ComponentPropsWithoutRef<'td'>) => (
      <td className="border-b border-border px-4 py-3 align-top text-muted-foreground" {...props} />
    ),
    blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
      <blockquote
        className="my-6 border-l-2 border-brand/50 bg-muted/30 py-2 pl-4 pr-3 italic text-muted-foreground [&>p]:my-1"
        {...props}
      />
    ),
  };
}
