import { cn } from '@/lib/utils';

interface BrandWordmarkProps {
  className?: string;
  priority?: boolean;
  /** Header/nav sizing (~16px tall). */
  compact?: boolean;
}

/** Wordmark — WebP primary, PNG fallback. */
export function BrandWordmark({ className, priority = false, compact = false }: BrandWordmarkProps) {
  return (
    <picture className={cn('block', className)}>
      <source srcSet="/brand/next-live-white.webp" type="image/webp" />
      <img
        src="/brand/next-live-white.png"
        alt="next-live"
        width={1890}
        height={327}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        className={cn(
          'h-auto w-auto',
          compact ? 'h-4 sm:h-5' : 'w-full max-w-[min(100%,780px)]',
        )}
      />
    </picture>
  );
}
