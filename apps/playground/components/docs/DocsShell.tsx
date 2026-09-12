'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { docNav } from '@/lib/docs/nav';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RunnerLink } from '@/components/RunnerLink';

interface DocsShellProps {
  children: ReactNode;
}

/** Shared by every sidebar link so focus is visible against the hover state. */
const NAV_LINK =
  'rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Chrome for the documentation section.
 *
 * Rendered from `app/docs/layout.tsx` rather than from each page: below the
 * segment boundary it would remount on every navigation, resetting the
 * sidebar's scroll position and re-serialising the whole nav into each page's
 * payload.
 */
export function DocsShell({ children }: DocsShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isIndex = pathname === '/docs';

  // Escape closes the mobile drawer — expected of anything modal-ish, and the
  // only way out for a keyboard user who opened it.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Without this, reaching the content means tabbing past ~17 links. */}
      <a
        href="#docs-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold">
              next-live
            </Link>
            <Separator orientation="vertical" className="hidden h-5 sm:block" />
            <nav aria-label="Main" className="hidden items-center gap-4 text-sm sm:flex">
              <Link
                href="/docs"
                aria-current={pathname.startsWith('/docs') ? 'page' : undefined}
                className={cn(
                  pathname.startsWith('/docs') && 'font-medium text-foreground',
                  'text-muted-foreground hover:text-foreground',
                )}
              >
                Docs
              </Link>
              {/* Runner routes: a real page load, so the CSP is theirs. */}
              <RunnerLink href="/playground" className="text-muted-foreground hover:text-foreground">
                Playground
              </RunnerLink>
              <RunnerLink href="/apps" className="text-muted-foreground hover:text-foreground">
                Apps shell
              </RunnerLink>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sm:hidden"
              aria-expanded={mobileOpen}
              aria-controls="docs-sidebar"
              aria-label={mobileOpen ? 'Close documentation menu' : 'Open documentation menu'}
              onClick={() => setMobileOpen((open) => !open)}
            >
              Menu
            </Button>
            <a
              href="https://www.npmjs.com/package/next-live"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted sm:inline-flex"
            >
              npm
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside
          id="docs-sidebar"
          // `transform` hides it visually but leaves it in the tab order, so a
          // phone user would tab through 12 invisible links. `inert` removes it
          // from focus and the accessibility tree while it is off-screen.
          inert={mobileOpen ? undefined : true}
          className={cn(
            'fixed inset-y-0 left-0 z-30 w-64 shrink-0 border-r border-border bg-background pt-14 transition-transform sm:static sm:translate-x-0',
            mobileOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
          )}
        >
          <ScrollArea className="h-[calc(100vh-3.5rem)]">
            <nav aria-label="Documentation" className="grid gap-1 p-4">
              <Link
                href="/docs"
                onClick={() => setMobileOpen(false)}
                aria-current={isIndex ? 'page' : undefined}
                className={cn(NAV_LINK, isIndex && 'bg-muted font-medium')}
              >
                Overview
              </Link>
              {docNav.map((item) => {
                const href = `/docs/${item.slug}`;
                const active = pathname === href;
                return (
                  <Link
                    key={item.slug}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(NAV_LINK, active && 'bg-muted font-medium')}
                  >
                    <span className="block">{item.title}</span>
                    {item.description && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
        </aside>

        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-black/40 sm:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <main id="docs-content" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12">
          {children}
        </main>
      </div>
    </div>
  );
}
