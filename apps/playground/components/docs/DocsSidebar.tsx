'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDocGroups } from '@/lib/docs/nav';
import { cn } from '@/lib/utils';

interface DocsSidebarProps {
  onNavigate?: () => void;
}

const LINK =
  'block rounded-md border-l-2 border-transparent py-1.5 pl-3 pr-2 text-sm text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground';

export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  const pathname = usePathname();
  const groups = getDocGroups();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav aria-label="Documentation" className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                      className={cn(
                        LINK,
                        active && 'border-l-2 border-brand bg-background font-medium text-brand',
                      )}
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
      <p className="shrink-0 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
        next-live playground
      </p>
    </div>
  );
}
