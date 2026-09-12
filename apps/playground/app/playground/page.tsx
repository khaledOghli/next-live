import { RunnerLink } from '@/components/RunnerLink';
import { apps, getApp } from '@/lib/apps';
import { Playground } from './Playground';

export const metadata = {
  title: 'next-live playground',
  description: 'Live TSX evaluation in the Next.js App Router.',
};

/**
 * A Server Component. It reads the app catalogue on the server and hands the
 * first one to the client component that does the compiling - nothing is
 * evaluated during the server pass.
 */
export default function PlaygroundPage() {
  const initialApp = getApp('counter');
  if (!initialApp) throw new Error('The default app is missing from the catalogue.');

  const summaries = apps.map(({ id, name, description }) => ({ id, name, description }));

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-6">
      <header className="grid gap-1">
        <RunnerLink href="/docs/getting-started" className="text-sm text-muted-foreground hover:text-brand">
          ← Documentation
        </RunnerLink>
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="max-w-2xl text-sm opacity-70">
          Each tab loads a different app&apos;s source from{' '}
          <code className="font-mono text-xs">/api/apps/[id]</code> and runs it live. The
          snippets use real <code className="font-mono text-xs">import</code> statements,
          resolved against a registry of values this page owns.
        </p>
      </header>

      <Playground apps={summaries} initialApp={initialApp} />
    </main>
  );
}
