'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { LiveError, LivePreview, LiveProvider, type ModuleRegistry } from 'next-live';
import { LiveEditor } from 'next-live/editor';
import { liveModules } from '@/lib/live-sdk';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LiveDemoProps {
  source: string;
  modules?: ModuleRegistry;
  editable?: boolean;
  filePath?: string;
  props?: Record<string, unknown>;
  className?: string;
  /** Defer compile until near the viewport. Use only for demos that throw on purpose. */
  deferUntilVisible?: boolean;
}

const demoFallback = (
  <div className="grid gap-2 p-4">
    <Skeleton className="h-8 w-32" />
    <Skeleton className="h-16 w-full max-w-xs" />
  </div>
);

function useDeferredVisible(enabled: boolean): { rootRef: RefObject<HTMLDivElement | null>; ready: boolean } {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;

    const node = rootRef.current;
    if (!node) return;

    // Docs scroll inside the shell's overflow container, not the window.
    const root = node.closest<HTMLElement>('.overflow-y-auto') ?? null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setReady(true);
      },
      { root, rootMargin: '240px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return { rootRef, ready };
}

export function LiveDemo({
  source,
  modules = liveModules,
  editable = false,
  filePath = 'Demo.tsx',
  props,
  className,
  deferUntilVisible = false,
}: LiveDemoProps) {
  const pathname = usePathname();
  const [code, setCode] = useState(source);
  const { rootRef, ready } = useDeferredVisible(deferUntilVisible);

  return (
    <div ref={rootRef} className={cn('live-demo-breakout min-w-0 max-w-full', className)}>
      {ready ? (
        <LiveProvider
          key={`${pathname}:${filePath}`}
          code={editable ? code : source}
          modules={modules}
          props={props}
          filePath={filePath}
          onCodeChange={editable ? setCode : undefined}
          fallback={demoFallback}
        >
          <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-card xl:grid-cols-2">
            <section className="grid min-w-0 gap-2 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
              <LivePreview className="min-h-32 rounded-lg border border-border bg-background p-4" />
              <LiveError className="text-xs" />
            </section>
            <section className="grid min-w-0 gap-2 border-t border-border p-4 xl:border-t-0 xl:border-l">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {editable ? 'Source (editable)' : 'Source sent to LiveProvider'}
              </p>
              <LiveEditor
                readOnly={!editable}
                className="min-h-32 overflow-x-auto rounded-lg border border-border"
              />
            </section>
          </div>
        </LiveProvider>
      ) : (
        <div className="rounded-xl border border-border bg-card">{demoFallback}</div>
      )}
    </div>
  );
}
