import type { ReactNode } from 'react';

interface Step {
  title: string;
  children: ReactNode;
}

interface StepsProps {
  steps: Step[];
}

/**
 * A numbered sequence with a connector line running between the markers, so a
 * long step (one holding a code block or a live demo) still reads as part of
 * the same flow rather than as a new section.
 */
export function Steps({ steps }: StepsProps) {
  return (
    <ol className="not-prose my-8 grid gap-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.title} className="relative grid pb-8 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-3.75 top-8 bottom-0 w-px bg-border"
              />
            )}

            <div className="flex items-center gap-3">
              <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground">
                {index + 1}
              </span>
              <h3 className="text-base font-semibold tracking-tight text-foreground">{step.title}</h3>
            </div>

            <div className="ml-11 mt-3 text-sm leading-relaxed text-muted-foreground [&>*:first-child]:mt-0 [&_a]:font-medium [&_a]:text-brand hover:[&_a]:underline [&_code]:rounded [&_code]:bg-code-inline [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground [&_p]:mt-3 [&_strong]:text-foreground">
              {step.children}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
