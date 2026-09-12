import { cn } from '@/lib/utils';

interface BrandIconProps {
  className?: string;
  size?: number;
}

/** Square next-live mark for headers, tabs, and compact placements. */
export function BrandIcon({ className, size = 28 }: BrandIconProps) {
  return (
    <picture className={cn('block shrink-0', className)}>
      <source srcSet="/brand/nextlive-icon.webp" type="image/webp" />
      <img
        src="/brand/nextlive-icon.png"
        alt=""
        width={size}
        height={size}
        decoding="async"
        aria-hidden
        className="rounded-lg"
        style={{ width: size, height: size }}
      />
    </picture>
  );
}
