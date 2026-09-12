import type { ReactNode } from 'react';
import { RunnerLink } from '@/components/RunnerLink';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';

interface SiteHeaderProps {
  active?: 'home' | 'docs';
  className?: string;
  trailing?: ReactNode;
  fullWidth?: boolean;
}

export function SiteHeader({
  active = 'home',
  className,
  trailing,
  fullWidth = false,
}: SiteHeaderProps) {
  return (
    <header
      className={cn(
        'z-40 shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        active !== 'docs' && 'sticky top-0',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center justify-between gap-4 px-4 sm:px-6',
          fullWidth ? 'w-full' : 'mx-auto max-w-6xl',
        )}
      >
        <Logo variant={active === 'docs' ? 'docs' : 'home'} />

        <nav aria-label="Main" className="flex items-center gap-5 text-sm">
          <RunnerLink
            href="/docs/getting-started"
            className={cn(
              'font-medium transition-colors hover:text-brand',
              active === 'docs' ? 'text-brand' : 'text-muted-foreground',
            )}
          >
            Documentation
          </RunnerLink>
          <a
            href="https://www.npmjs.com/package/next-live"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            npm
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" x2="21" y1="14" y2="3" />
            </svg>
          </a>
          <a
            href="https://github.com/khaledoghli/next-live"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.395-.135-.345-.72-1.395-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          {trailing}
        </nav>
      </div>
    </header>
  );
}
