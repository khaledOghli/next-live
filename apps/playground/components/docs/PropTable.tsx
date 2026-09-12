import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PropRow {
  name: string;
  type: string;
  default?: string;
  notes?: ReactNode;
  required?: boolean;
}

interface PropTableProps {
  rows: PropRow[];
  /** Column heading for the first column, "Prop", "Field", "Option", "Export". */
  label?: string;
  caption?: string;
}

function TypeCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-code-inline px-1.5 py-0.5 font-mono text-[0.8em] text-foreground">
      {children}
    </code>
  );
}

function RequiredBadge() {
  return (
    <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-destructive dark:text-red-400">
      required
    </span>
  );
}

/**
 * Renders as a table on desktop and as stacked cards below `sm`.
 *
 * A four-column table at phone width either overflows horizontally or crushes
 * the notes column to two words per line; the card layout keeps every field
 * readable without a scroll container.
 */
export function PropTable({ rows, label = 'Prop', caption }: PropTableProps) {
  return (
    <div className="not-prose my-6">
      {/* Desktop */}
      <div className="hidden w-full overflow-x-auto rounded-xl border border-border sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th scope="col" className="px-4 py-2.5 font-medium text-foreground">
                {label}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-foreground">
                Type
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-foreground">
                Default
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-foreground">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/30"
              >
                <th
                  scope="row"
                  className="whitespace-nowrap px-4 py-3 text-left font-mono text-[0.8125rem] font-medium text-foreground"
                >
                  {row.name}
                  {row.required && <RequiredBadge />}
                </th>
                <td className="px-4 py-3">
                  <TypeCode>{row.type}</TypeCode>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {row.default ?? '-'}
                </td>
                <td className="px-4 py-3 leading-relaxed text-muted-foreground">{row.notes ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="grid gap-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.name} className="rounded-xl border border-border p-4">
            <p className="font-mono text-sm font-medium text-foreground">
              {row.name}
              {row.required && <RequiredBadge />}
            </p>
            <dl className="mt-2 grid gap-1.5 text-xs">
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="shrink-0 text-muted-foreground">Type</dt>
                <dd className="min-w-0">
                  <TypeCode>{row.type}</TypeCode>
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="shrink-0 text-muted-foreground">Default</dt>
                <dd className="font-mono text-muted-foreground">{row.default ?? '-'}</dd>
              </div>
            </dl>
            {row.notes && (
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{row.notes}</p>
            )}
          </li>
        ))}
      </ul>

      {caption && <p className={cn('mt-2 px-1 text-xs text-muted-foreground')}>{caption}</p>}
    </div>
  );
}
