'use client';

import { AppShell } from '@/components/shell/AppShell';
import { Skeleton } from '@/components/ui/skeleton';
import { liveModules } from '@/lib/live-sdk';
import type { ShellApp } from '@/lib/shell-apps';
import { useCart } from '@/lib/store';
import { LiveError, LivePreview, LiveProvider } from 'next-live';
import { LiveEditor } from 'next-live/editor';
import { useEffect, useState } from 'react';

interface ShellRunnerProps {
  apps: Array<Pick<ShellApp, 'id' | 'name' | 'description'>>;
  initialApp: ShellApp;
}

export function ShellRunner({ apps, initialApp }: ShellRunnerProps) {
  const [activeId, setActiveId] = useState(initialApp.id);
  const [source, setSource] = useState(initialApp.source);
  const [loading, setLoading] = useState(false);
  const cart = useCart();

  useEffect(() => {
    if (activeId === initialApp.id) return;

    const controller = new AbortController();

    fetch(`/api/shell-apps/${activeId}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { source?: string }) => {
        if (typeof data.source === 'string') setSource(data.source);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeId, initialApp.id, initialApp.source]);

  const selectApp = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    if (id === initialApp.id) {
      setSource(initialApp.source);
      setLoading(false);
    } else {
      setLoading(true);
    }
  };

  return (
    <AppShell
      apps={apps}
      activeId={activeId}
      onSelectApp={selectApp}
      cartCount={cart.length}
    >
      <div className="grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {apps.find((app) => app.id === activeId)?.name ?? activeId}
          </h2>
          <p className="text-sm text-muted-foreground">
            {apps.find((app) => app.id === activeId)?.description}
            {loading && ' · loading…'}
          </p>
        </div>

        <LiveProvider
          key={activeId}
          code={source}
          modules={liveModules}
          props={{ user: { name: 'Demo User' } }}
          filePath={`shell-${activeId}.tsx`}
          onError={(error) => console.error('[shell-app]', activeId, error)}
          fallback={
            <div className="grid gap-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-24 w-full max-w-md" />
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="grid gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview
              </h3>
              <LivePreview className="min-h-64 rounded-xl border border-border bg-card p-6" />
              <LiveError className="rounded-lg text-xs" />
            </section>

            <section className="grid gap-2">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Source sent to LiveProvider
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  <code className="font-mono">code={'{source}'}</code>
                  {' · '}
                  {activeId === initialApp.id ? (
                    <>from server catalogue (<code className="font-mono">lib/shell-apps.ts</code>)</>
                  ) : (
                    <>
                      fetched from{' '}
                      <code className="font-mono">/api/shell-apps/{activeId}</code>
                    </>
                  )}
                </p>
              </div>
              <LiveEditor
                readOnly
                className="min-h-64 overflow-hidden rounded-xl border border-border"
              />
            </section>
          </div>
        </LiveProvider>
      </div>
    </AppShell>
  );
}
