import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  asLink?: boolean;
  variant?: 'home' | 'docs';
}

function LiveMark() {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand"
      aria-hidden
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    </span>
  );
}

function Wordmark() {
  return (
    <span className="text-base font-semibold tracking-tight sm:text-lg">
      <span className="text-foreground">next</span>
      <span className="text-brand">live</span>
    </span>
  );
}

function LogoMark({ variant }: { variant: 'home' | 'docs' }) {
  return (
    <>
      <LiveMark />
      <Wordmark />
      {variant === 'docs' && (
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium lowercase text-muted-foreground">
          docs
        </span>
      )}
    </>
  );
}

export function Logo({ className, asLink = true, variant = 'home' }: LogoProps) {
  const mark = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark variant={variant} />
    </span>
  );

  if (!asLink) return mark;

  return (
    <Link href={variant === 'docs' ? '/docs/getting-started' : '/'} className="inline-block">
      {mark}
    </Link>
  );
}
