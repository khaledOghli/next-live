'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { LiveError, LiveFileTabs, LivePreview, LiveProvider } from 'next-live';
import { LiveEditor } from 'next-live/editor';
import { multiFileDemo } from '@/lib/docs/demos';
import { liveModules } from '@/lib/live-sdk';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { liveFileTabsClassName } from '@/components/docs/demo-styles';

const demoFallback = (
  <div className="grid gap-2 p-4">
    <Skeleton className="h-8 w-32" />
    <Skeleton className="h-16 w-full max-w-xs" />
  </div>
);

export function MultiFileDemo({ className }: { className?: string }) {
  const pathname = usePathname();
  const [files, setFiles] = useState(multiFileDemo);

  return (
    <div className={cn('live-demo-breakout min-w-0 max-w-full', className)}>
      <LiveProvider
        key={`${pathname}:multi-file-demo`}
        files={files}
        onFilesChange={(next) => setFiles({ ...next })}
        modules={liveModules}
        fallback={demoFallback}
      >
        <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-card xl:grid-cols-2">
          <section className="grid min-w-0 content-start gap-2 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <LivePreview className="min-h-32 rounded-lg border border-border bg-background p-4" />
            <LiveError className="text-xs" />
          </section>
          <section className="grid min-w-0 content-start gap-2 border-t border-border p-4 xl:border-t-0 xl:border-l">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Project files (editable)
              </p>
              {files !== multiFileDemo && (
                <button
                  type="button"
                  onClick={() => setFiles(multiFileDemo)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="min-w-0 overflow-hidden rounded-lg border border-border">
              <LiveFileTabs
                className={liveFileTabsClassName}
                renderTab={(file) => (
                  <span className="truncate" title={file}>
                    {file.split('/').pop()}
                  </span>
                )}
              />
              <LiveEditor className="min-h-32 overflow-x-auto border-0" />
            </div>
          </section>
        </div>
      </LiveProvider>
    </div>
  );
}
