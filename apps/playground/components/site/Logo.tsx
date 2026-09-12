import Link from 'next/link';
import { BrandWordmark } from '@/components/brand/BrandWordmark';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  asLink?: boolean;
  variant?: 'home' | 'docs';
}

function LogoMark({ variant }: { variant: 'home' | 'docs' }) {
  return (
    <>
      <BrandWordmark compact />
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
