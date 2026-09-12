import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  asLink?: boolean;
  variant?: 'home' | 'docs';
}

function LogoMark({ variant }: { variant: 'home' | 'docs' }) {
  if (variant === 'docs') {
    return (
      <>
        <span className="flex size-8 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground shadow-sm">
          N
        </span>
        <span className="text-lg font-bold uppercase tracking-wide">Docs</span>
      </>
    );
  }

  return (
    <>
      <span className="rounded-md bg-brand px-2 py-1 text-sm font-bold text-brand-foreground shadow-sm sm:px-2.5 sm:text-base">
        next
      </span>
      <span className="text-lg font-bold tracking-tight sm:text-xl">-live</span>
    </>
  );
}

export function Logo({ className, asLink = true, variant = 'home' }: LogoProps) {
  const mark = (
    <span className={cn('inline-flex items-center gap-2', className)}>
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
