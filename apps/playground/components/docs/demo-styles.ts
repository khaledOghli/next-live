/** Shared Tailwind classes for doc live demos. */
export const liveConsoleClassName =
  'rounded-lg border text-xs [&_[data-level=error]]:text-red-700 dark:[&_[data-level=error]]:text-red-400 [&_[data-level=warn]]:text-amber-700 dark:[&_[data-level=warn]]:text-amber-400 [&_[data-stale]]:opacity-50 [&_[role=log]]:max-h-48 [&_[role=log]]:overflow-auto [&_[role=log]]:p-2 [&_[role=log]]:font-mono [&_button]:m-2 [&_button]:underline';

export const liveFileTabsClassName =
  'flex min-w-0 flex-wrap gap-1 border-b bg-muted/40 px-2 py-1 text-xs [&_[aria-selected=true]]:bg-background [&_[role=tab]]:max-w-full [&_[role=tab]]:truncate [&_[role=tab]]:rounded [&_[role=tab]]:px-2 [&_[role=tab]]:py-1';
