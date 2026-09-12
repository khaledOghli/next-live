import Link from 'next/link';
import { getAdjacentDocs } from '@/lib/docs/nav';

interface DocPagerProps {
  slug: string;
}

export function DocPager({ slug }: DocPagerProps) {
  const { prev, next } = getAdjacentDocs(slug);
  if (!prev && !next) return null;

  return (
    <nav aria-label="Documentation pages" className="not-prose mt-12 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-brand/30 hover:shadow-md"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Previous</p>
          <p className="mt-1 font-semibold group-hover:text-brand">{prev.title}</p>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/docs/${next.slug}`}
          className="group rounded-xl border border-border bg-card p-5 text-right shadow-sm transition-all hover:border-brand/30 hover:shadow-md sm:col-start-2"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next</p>
          <p className="mt-1 font-semibold group-hover:text-brand">{next.title}</p>
        </Link>
      ) : null}
    </nav>
  );
}
