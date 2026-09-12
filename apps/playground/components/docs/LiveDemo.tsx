'use client';

import { useState } from 'react';
import { LiveError, LivePreview, LiveProvider, type ModuleRegistry } from 'next-live';
import { LiveEditor } from 'next-live/editor';
import { liveModules } from '@/lib/live-sdk';
import { Skeleton } from '@/components/ui/skeleton';

interface LiveDemoProps {
  source: string;
  modules?: ModuleRegistry;
  editable?: boolean;
  filePath?: string;
  props?: Record<string, unknown>;
  className?: string;
}

export function LiveDemo({
  source,
  modules = liveModules,
  editable = false,
  filePath = 'Demo.tsx',
  props,
  className,
}: LiveDemoProps) {
  const [code, setCode] = useState(source);

  return (
    <div className={className}>
      <LiveProvider
        code={editable ? code : source}
        modules={modules}
        props={props}
        filePath={filePath}
        onCodeChange={editable ? setCode : undefined}
        fallback={
          <div className="grid gap-2 p-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-16 w-full max-w-xs" />
          </div>
        }
      >
        <div className="grid gap-3 rounded-xl border border-border bg-card xl:grid-cols-2">
          <section className="grid gap-2 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <LivePreview className="min-h-32 rounded-lg border border-border bg-background p-4" />
            <LiveError className="text-xs" />
          </section>
          <section className="grid gap-2 border-t border-border p-4 xl:border-t-0 xl:border-l">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {editable ? 'Source (editable)' : 'Source sent to LiveProvider'}
            </p>
            <LiveEditor
              readOnly={!editable}
              className="min-h-32 overflow-hidden rounded-lg border border-border"
            />
          </section>
        </div>
      </LiveProvider>
    </div>
  );
}
