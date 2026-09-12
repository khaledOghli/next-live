import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-2xl content-center gap-6 p-8 sm:min-h-screen">
      <h1 className="text-3xl font-semibold tracking-tight">next-live</h1>
      <p className="opacity-75">
        Live TSX evaluation for the Next.js App Router — real ESM imports, a module
        registry instead of a global scope, and no hydration mismatches.
      </p>
      <Link
        href="/playground"
        className="justify-self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
      >
        Open the playground
      </Link>
    </main>
  );
}
