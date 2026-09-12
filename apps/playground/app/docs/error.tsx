'use client';

export default function DocsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        This documentation page failed to render.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}
