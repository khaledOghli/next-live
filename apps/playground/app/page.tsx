import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-2xl content-center gap-6 p-8 sm:min-h-screen">
      <h1 className="text-3xl font-semibold tracking-tight">next-live</h1>
      <p className="opacity-75">
        Live TSX evaluation for the Next.js App Router - real ESM imports, a module
        registry instead of a global scope, and no hydration mismatches.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/apps"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
        >
          Open apps shell
        </Link>
        <Link
          href="/playground"
          className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Open the playground
        </Link>
      </div>
    </main>
  );
}
