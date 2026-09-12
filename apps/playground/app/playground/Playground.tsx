'use client';

import { useEffect, useState } from 'react';
import {
  LiveError,
  LivePreview,
  LiveProvider,
  useLiveModule,
  type ModuleRegistry,
} from 'next-live';
// The editor lives on its own entry so pages that only *run* snippets never
// pull in a syntax highlighter.
import { LiveEditor } from 'next-live/editor';
import HostWidget from '@demo/vendor/Widget';
import { clearCart, useCart } from '@/lib/store';
import { liveModules } from '@/lib/live-sdk';
import type { LiveApp } from '@/lib/apps';

// Instance-identity probe. The host imports '@demo/vendor/Widget' statically
// here; the "Shared instance" snippet imports the same specifier through the
// registry. If the snippet can read this marker, both hold one module instance —
// which is what makes a shared store actually shared.
(HostWidget as unknown as Record<string, unknown>).__owner = 'host-app';

interface StoreScriptExports extends Record<string, unknown> {
  run?: () => number;
}

function StoreApiScript({ modules }: { modules: ModuleRegistry }) {
  const [source, setSource] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/store/script', { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { source?: string }) => {
        if (typeof data.source === 'string') setSource(data.source);
        else setFetchError('API returned no source');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setFetchError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => controller.abort();
  }, []);

  const { exports, error, isCompiling } = useLiveModule<StoreScriptExports>({
    code: source ?? '',
    modules,
  });

  const run = exports?.run;

  return (
    <div className="mt-2 rounded-xl border border-dashed border-black/15 p-4 text-sm dark:border-white/20">
      <p className="mb-2 font-medium">API script (useLiveModule)</p>
      {fetchError && <p className="text-xs text-red-600 dark:text-red-400">{fetchError}</p>}
      {!source && !fetchError && <p className="text-xs opacity-60">Loading script from API…</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error.message}</p>}
      <button
        type="button"
        disabled={typeof run !== 'function' || isCompiling}
        onClick={() => {
          if (typeof run === 'function') setLastCount(run());
        }}
        className="rounded-lg border border-black/15 px-3 py-1.5 text-sm transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
      >
        Remove last (API script)
      </button>
      {isCompiling && <span className="ml-2 text-xs opacity-60">Compiling…</span>}
      {lastCount !== null && (
        <p className="mt-2 text-xs opacity-60">Script returned {lastCount} item(s) remaining.</p>
      )}
      <p className="mt-2 text-xs opacity-60">
        Non-UI code from <code className="font-mono">/api/store/script</code>, imports{' '}
        <code className="font-mono">@app/store</code> via the registry.
      </p>
    </div>
  );
}

interface PlaygroundProps {
  /** Sent from the server so the first app is available without a round trip. */
  apps: Array<Pick<LiveApp, 'id' | 'name' | 'description'>>;
  initialApp: LiveApp;
}

export function Playground({ apps, initialApp }: PlaygroundProps) {
  const [activeId, setActiveId] = useState(initialApp.id);
  const [code, setCode] = useState(initialApp.source);
  const [loading, setLoading] = useState(false);

  // A live object handed straight into the snippet. Nothing is serialized, so
  // the snippet mutates the same object the host is holding.
  const [size, setSize] = useState(8);
  const cart = useCart();

  // Fetching each app's source from the API is the point of the demo: the
  // code is data, not part of the bundle.
  useEffect(() => {
    if (activeId === initialApp.id) return;

    const controller = new AbortController();

    fetch(`/api/apps/${activeId}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { source?: string }) => {
        if (typeof data.source === 'string') setCode(data.source);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeId, initialApp.id]);

  // Loading is flagged here rather than in the effect: setting state
  // synchronously in an effect body cascades an extra render, and the click is
  // the moment the load actually begins.
  const selectApp = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    if (id !== initialApp.id) setLoading(true);
  };

  const panel = { size, setSize };
  const isStoreTab = activeId === 'store';

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-2">
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => selectApp(app.id)}
            aria-current={app.id === activeId}
            title={app.description}
            className={
              'rounded-full border px-4 py-1.5 text-sm transition-colors ' +
              (app.id === activeId
                ? 'border-transparent bg-foreground text-background'
                : 'border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10')
            }
          >
            {app.name}
          </button>
        ))}
      </nav>

      <LiveProvider
        code={code}
        // The registry: composed from lib/live-sdk, every entry a lazy loader
        // so nothing is downloaded until a snippet actually imports it.
        modules={liveModules}
        // Free variables, for react-live-style snippets that skip imports.
        scope={{ formatMoney: (n: number) => `$${n.toFixed(2)}` }}
        // Live objects, passed by reference rather than serialized.
        props={{ panel, user: { name: 'Khaled' } }}
        filePath={`${activeId}.tsx`}
        fallback={<p className="text-sm opacity-50">Compiling…</p>}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="grid gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">
              Source {loading && <span className="normal-case">· loading…</span>}
            </h2>
            <LiveEditor className="min-h-[22rem] overflow-hidden rounded-xl" />
          </section>

          <section className="grid content-start gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">Preview</h2>
            <LivePreview className="min-h-[12rem] rounded-xl border border-black/10 p-5 dark:border-white/15" />
            <LiveError className="rounded-xl text-xs" />

            <div className="mt-2 rounded-xl border border-dashed border-black/15 p-4 text-sm dark:border-white/20">
              <p className="mb-1 font-medium">Host state</p>
              <p className="opacity-70">
                panel size {size} · cart {cart.length} item(s)
              </p>
              {isStoreTab && (
                <button
                  type="button"
                  onClick={() => clearCart()}
                  className="mt-2 rounded-lg border border-black/15 px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Clear cart (host direct)
                </button>
              )}
              <p className="mt-2 text-xs opacity-60">
                {isStoreTab
                  ? 'Three paths share one Zustand store: clearCart here, addItem in the preview, removeLastItem via the API script.'
                  : 'These update when the snippet changes them — the same objects, not copies.'}
              </p>
            </div>

            {isStoreTab && <StoreApiScript modules={liveModules} />}
          </section>
        </div>
      </LiveProvider>
    </div>
  );
}
