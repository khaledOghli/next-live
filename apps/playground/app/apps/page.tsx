import { RunnerLink } from '@/components/RunnerLink';
import { shellApps, getShellApp } from '@/lib/shell-apps';
import { ShellRunner } from './ShellRunner';

export const metadata = {
  title: 'Apps - next-live shell demo',
  description: 'Production-shaped shell with API-driven live snippets.',
};

export default function AppsPage() {
  const initialApp = getShellApp('hooks-timer');
  if (!initialApp) throw new Error('Default shell app is missing from the catalogue.');

  const summaries = shellApps.map(({ id, name, description }) => ({ id, name, description }));

  return (
    <>
      <ShellRunner apps={summaries} initialApp={initialApp} />
      <div className="fixed bottom-4 right-4 flex gap-2">
        <RunnerLink
          href="/docs/getting-started"
          className="rounded-full border border-border bg-background px-4 py-2 text-xs text-muted-foreground shadow-sm hover:text-brand"
        >
          Documentation
        </RunnerLink>
        <RunnerLink
          href="/playground"
          className="rounded-full border border-border bg-background px-4 py-2 text-xs text-muted-foreground shadow-sm hover:text-foreground"
        >
          Playground
        </RunnerLink>
      </div>
    </>
  );
}
