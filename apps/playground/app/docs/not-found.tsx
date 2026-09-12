import Link from 'next/link';

export default function DocsNotFound() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        That documentation page does not exist. The sidebar lists everything available.
      </p>
      <Link href="/docs" className="mt-6 inline-block text-sm font-medium underline">
        Back to the documentation overview
      </Link>
    </div>
  );
}
