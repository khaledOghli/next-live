'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { LiveError, LivePreview, LiveProvider } from 'next-live';
import { LiveConsole } from 'next-live/console';
import { LiveEditor } from 'next-live/editor';
import { consoleDemo } from '@/lib/docs/demos';
import { liveModules } from '@/lib/live-sdk';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { liveConsoleClassName } from '@/components/docs/demo-styles';

const demoFallback = (
  <div className="grid gap-2 p-4">
    <Skeleton className="h-8 w-32" />
    <Skeleton className="h-16 w-full max-w-xs" />
  </div>
);

export function ConsoleDemo({ className }: { className?: string }) {
  const pathname = usePathname();
  const [code, setCode] = useState(consoleDemo);

  return (
    <div className={cn('live-demo-breakout min-w-0 max-w-full', className)}>
      <LiveProvider
        key={`${pathname}:console-demo`}
        code={code}
        onCodeChange={setCode}
        modules={liveModules}
        filePath="snippet.tsx"
        fallback={demoFallback}
      >
        <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-card xl:grid-cols-2">
          <section className="grid min-w-0 gap-2 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <LivePreview className="min-h-32 rounded-lg border border-border bg-background p-4" />
            <LiveError className="text-xs" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Console</p>
            <LiveConsole
              className={liveConsoleClassName}
              emptyState={<span className="text-muted-foreground">No console output yet.</span>}
            />
          </section>
          <section className="grid min-w-0 content-start gap-2 border-t border-border p-4 xl:border-t-0 xl:border-l">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Source (editable)
              </p>
              {code !== consoleDemo && (
                <button
                  type="button"
                  onClick={() => setCode(consoleDemo)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
            <LiveEditor className="min-h-32 overflow-hidden rounded-lg border border-border" />
          </section>
        </div>
      </LiveProvider>
    </div>
  );
}
