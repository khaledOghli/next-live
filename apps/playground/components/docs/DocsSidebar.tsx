'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDocGroups } from '@/lib/docs/nav';
import { cn } from '@/lib/utils';

interface DocsSidebarProps {
  onNavigate?: () => void;
}

const LINK =
  'relative block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground';

const ACTIVE =
  'bg-muted/50 font-medium text-foreground before:absolute before:left-1 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-brand before:content-[""]';

export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  const pathname = usePathname();
  const groups = getDocGroups();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        // Descriptions are matched too, so "bundle" finds Scaling and "CSP"
        // finds Security even though neither word is in the title.
        items: group.items.filter((item) =>
          `${item.title} ${item.description ?? ''}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-4 pb-2">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                inputRef.current?.blur();
              }
            }}
            placeholder="Filter docs"
            aria-label="Filter documentation pages"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
          />
        </div>
      </div>

      <nav
        aria-label="Documentation"
        className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pb-4"
      >
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground">
            No page matches “{query.trim()}”.
          </p>
        )}

        {filtered.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const href = `/docs/${item.slug}`;
                const active = pathname === href;
                return (
                  <li key={item.slug}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(LINK, active && ACTIVE)}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
