'use client';

import { useState, useSyncExternalStore } from 'react';
import { LiveError, LiveFileTabs, LivePreview, LiveProvider, useLiveContext } from 'next-live';
import { LiveConsole } from 'next-live/console';
import { LiveEditor } from 'next-live/editor';

interface Example {
  id: string;
  label: string;
  description: string;
  files: Record<string, string>;
}

const EXAMPLES: Example[] = [
  {
    id: 'project',
    label: 'Multi-file project',
    description:
      'Two files that import each other, a module registered on the sandbox page, and console output shown below the preview.',
    files: {
      'App.tsx': `import { useState } from 'react';
import { PriceTag } from './components/PriceTag';

export default function App() {
  const [amount, setAmount] = useState(19.5);
  console.log('Rendering with amount', amount);

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <PriceTag amount={amount} />
      <button style={{ marginLeft: 12 }} onClick={() => setAmount((value) => value + 5)}>
        Add $5
      </button>
    </div>
  );
}
`,
      'components/PriceTag.tsx': `import { formatPrice } from '@demo/format';

export function PriceTag({ amount }: { amount: number }) {
  return <strong style={{ fontSize: 24 }}>{formatPrice(amount)}</strong>;
}
`,
    },
  },
  {
    id: 'secrets',
    label: 'Tries to read your data',
    description:
      'A snippet reaching for storage, cookies and the parent page. Inside the sandbox every attempt fails with a SecurityError.',
    files: {
      'App.tsx': `function attempt(label: string, read: () => unknown) {
  try {
    return label + ': ' + String(read());
  } catch (error) {
    return label + ': blocked (' + (error as Error).name + ')';
  }
}

export default function App() {
  const results = [
    attempt('localStorage', () => window.localStorage.getItem('token')),
    attempt('document.cookie', () => document.cookie),
    attempt('parent page title', () => window.parent.document.title),
  ];
  console.table(results);

  return (
    <ul style={{ fontFamily: 'ui-monospace, monospace', padding: 16 }}>
      {results.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}
`,
    },
  },
  {
    id: 'freeze',
    label: 'Endless loop',
    description:
      'Press the button to start an endless loop. The watchdog notices the frame stopped answering and replaces it. With the sandbox on the same site, this page freezes too until then; switch to 127.0.0.1 below to keep it responsive.',
    files: {
      'App.tsx': `import { useState } from 'react';

export default function App() {
  const [frozen, setFrozen] = useState(false);

  if (frozen) {
    while (true) {
      // Never returns.
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <button onClick={() => setFrozen(true)}>Freeze the sandbox</button>
    </div>
  );
}
`,
    },
  },
];

const subscribe = () => () => {};

/** Only offered when the demo runs on localhost, where 127.0.0.1 is a different site. */
function useCrossSiteSandboxUrl(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (window.location.hostname === 'localhost' ? `http://127.0.0.1:${window.location.port}/sandbox` : null),
    () => null,
  );
}

function SandboxStatus() {
  const { sandbox } = useLiveContext();
  if (!sandbox) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Sandbox: <strong className="text-foreground">{sandbox.status}</strong>{' '}
      <button type="button" className="ml-2 underline" onClick={sandbox.reload}>
        Restart
      </button>
    </p>
  );
}

export function SandboxDemo() {
  const [exampleId, setExampleId] = useState(EXAMPLES[0]?.id ?? 'project');
  const [crossSite, setCrossSite] = useState(false);
  const crossSiteUrl = useCrossSiteSandboxUrl();

  const example = EXAMPLES.find((candidate) => candidate.id === exampleId) ?? EXAMPLES[0];
  if (!example) return null;

  const src = crossSite && crossSiteUrl ? crossSiteUrl : '/sandbox';

  return (
    <div className="mt-8 space-y-4">
      <div role="group" aria-label="Examples" className="flex flex-wrap gap-2">
        {EXAMPLES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === example.id}
            onClick={() => setExampleId(candidate.id)}
            className="rounded-md border px-3 py-1.5 text-sm aria-pressed:bg-foreground aria-pressed:text-background"
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <p className="max-w-3xl text-sm text-muted-foreground">{example.description}</p>

      {crossSiteUrl ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={crossSite} onChange={(event) => setCrossSite(event.target.checked)} />
          Serve the sandbox from <code>127.0.0.1</code>, a different site (development only)
        </label>
      ) : null}

      <LiveProvider key={`${example.id}:${src}`} files={example.files} sandbox={{ src }}>
        <SandboxStatus />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 overflow-hidden rounded-lg border">
            <LiveFileTabs className="flex gap-1 border-b bg-muted/40 px-2 py-1 text-xs [&_[aria-selected=true]]:bg-background [&_[role=tab]]:rounded [&_[role=tab]]:px-2 [&_[role=tab]]:py-1" />
            <LiveEditor />
          </div>
          <div className="min-w-0 space-y-3">
            <LivePreview
              title="Sandboxed preview"
              className="rounded-lg border bg-background"
              fallback={<p className="p-4 text-sm text-muted-foreground">Connecting to the sandbox…</p>}
            />
            <LiveError className="whitespace-pre-wrap rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800" />
            <LiveConsole
              className="rounded-lg border text-xs [&_[data-level=error]]:text-red-700 [&_[data-level=warn]]:text-amber-700 [&_[data-stale]]:opacity-50 [&_[role=log]]:max-h-48 [&_[role=log]]:overflow-auto [&_[role=log]]:p-2 [&_[role=log]]:font-mono [&_button]:m-2 [&_button]:underline"
              emptyState={<span className="text-muted-foreground">No console output yet.</span>}
            />
          </div>
        </div>
      </LiveProvider>
    </div>
  );
}
