import Link from 'next/link';

export default function DocsNotFound() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        That documentation page does not exist. The sidebar lists everything available.
      </p>
      <Link href="/docs/getting-started" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
        Back to getting started
      </Link>
    </div>
  );
}
