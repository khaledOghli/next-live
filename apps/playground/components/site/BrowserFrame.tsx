import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BrowserFrameProps {
  title?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}

export function BrowserFrame({ title = 'Counter.tsx', badge, children, className }: BrowserFrameProps) {
  return (
    <div className={cn('relative', className)}>
      {badge && (
        <span className="absolute -top-3 right-4 z-10 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground shadow-sm">
          {badge}
        </span>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-code-bg shadow-2xl shadow-brand/10">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="size-3 rounded-full bg-red-500/90" aria-hidden />
          <span className="size-3 rounded-full bg-amber-400/90" aria-hidden />
          <span className="size-3 rounded-full bg-emerald-500/90" aria-hidden />
          <span className="ml-2 truncate font-mono text-xs text-zinc-400">{title}</span>
        </div>
        <div className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-zinc-300">{children}</div>
      </div>
    </div>
  );
}
