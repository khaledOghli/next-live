'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface InstallPillProps {
  command?: string;
  className?: string;
}

export function InstallPill({ command = 'npm install next-live', className }: InstallPillProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 rounded-full border border-brand/20 bg-brand-muted/70 px-5 py-2.5 font-mono text-sm dark:border-brand/30 dark:bg-brand-muted/25',
        className,
      )}
    >
      <code className="text-foreground">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy install command'}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </button>
    </div>
  );
}
