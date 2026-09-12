import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

type CalloutVariant = 'info' | 'warning' | 'danger' | 'success';

interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
}

/**
 * Icons carry the severity for readers who skim, and for anyone who cannot
 * distinguish the amber/red backgrounds the variants use.
 */
const ICONS: Record<CalloutVariant, ReactNode> = {
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" strokeLinecap="round" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const ICON_TONE: Record<CalloutVariant, string> = {
  info: 'text-brand',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive dark:text-red-400',
  success: 'text-emerald-600 dark:text-emerald-400',
};

/** `success` is not an Alert variant, so it borrows `info`'s neutral surface. */
const ALERT_VARIANT: Record<CalloutVariant, 'info' | 'warning' | 'danger'> = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  success: 'info',
};

export function Callout({ variant = 'info', title, children }: CalloutProps) {
  return (
    <Alert variant={ALERT_VARIANT[variant]} className="not-prose my-6 flex gap-3 pl-4">
      <span className={cn('mt-0.5 size-5 shrink-0', ICON_TONE[variant])}>{ICONS[variant]}</span>
      <div className="min-w-0 flex-1">
        {/*
          Deliberately a <p>, not a heading. `AlertTitle` renders an <h5>, which
          put a level-5 heading straight after a level-2 one in the document
          outline, a skip that screen-reader users navigating by heading hear
          as a missing section. A callout is an aside, not a section of the page.
        */}
        {title && <p className="mb-1 font-medium leading-none text-foreground">{title}</p>}
        <AlertDescription className="leading-relaxed">{children}</AlertDescription>
      </div>
    </Alert>
  );
}
