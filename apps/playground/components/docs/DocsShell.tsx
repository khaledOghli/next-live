'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site/SiteHeader';
import { DocsSidebar } from './DocsSidebar';
import { DocToc } from './DocToc';

export function DocsShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    document.documentElement.classList.add('docs-layout');
    return () => document.documentElement.classList.remove('docs-layout');
  }, []);

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <a
        href="#doc-article"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-foreground"
      >
        Skip to content
      </a>

      <SiteHeader
        active="docs"
        fullWidth
        trailing={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="docs-sidebar"
            aria-label={mobileOpen ? 'Close documentation menu' : 'Open documentation menu'}
            onClick={() => setMobileOpen((open) => !open)}
          >
            Menu
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside
          id="docs-sidebar"
          inert={isMobile && !mobileOpen ? true : undefined}
          className={cn(
            'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-docs-sidebar pt-14 transition-transform lg:static lg:z-0 lg:shrink-0 lg:translate-x-0 lg:pt-0',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          <DocsSidebar onNavigate={() => setMobileOpen(false)} />
        </aside>

        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <main
            id="docs-content"
            className="mx-auto w-full min-w-0 max-w-3xl flex-1 px-6 py-10 sm:px-8 lg:px-12"
          >
            {children}
          </main>
          <DocToc />
        </div>
      </div>
    </div>
  );
}
