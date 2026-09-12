# Integration guide: apps stored in a database

[← Troubleshooting](./07-troubleshooting.md) · [Docs index](./README.md)

An end-to-end walkthrough of the pattern `next-live` was built for: a control
panel where staff author apps, whose source is stored in a database and executed
in the browser when a user opens one.

Everything here is generic — substitute your own store, UI kit, and data layer.

## What we are building

```
Control panel  ──writes──▶  database  ──serves──▶  /api/apps/[id]
                                                        │
                                                        ▼
                                              /apps/[id]  ──▶  <LiveProvider>
                                                                    │
                                                       compiles in the browser
                                                                    │
                                                                    ▼
                                                           the running app
```

## Step 1 — Install

```bash
npm install next-live
```

## Step 2 — Decide your SDK surface first

Do this before writing any code. Whatever you expose becomes a public contract
with your authors — you cannot rename it later without breaking stored apps.

Pick a handful of stable namespaces:

| Specifier | Contains |
|---|---|
| `@app/store` | Your application state |
| `@app/ui` | Buttons, inputs, layout primitives |
| `@app/data` | Fetch helpers scoped to the signed-in user |
| `@app/format` | Dates, currency, units |

Create one directory holding exactly these, each a **thin re-export** of the real
implementation. That way the implementations stay free to move:

```
lib/live-sdk/
  index.ts          # composes the registry
  vendor.ts         # third-party packages
  generated.ts      # globs ./modules
  modules/          # ← the SDK surface, one file per namespace
    store.ts
    ui.ts
    data.ts
    format.ts
```

```ts
// lib/live-sdk/modules/store.ts
export { useAppStore, addItem, clearCart } from '@/lib/store';
```

```ts
// lib/live-sdk/modules/ui.ts
export { Button, Card, Stack } from '@/components/ui';
```

## Step 3 — Generate the registry from that directory

```ts
// lib/live-sdk/generated.ts
import { registryFromGlob } from 'next-live';
import type { ModuleRegistry } from 'next-live';

export const generatedModules: ModuleRegistry = registryFromGlob(
  // Must be at or below this file's own directory — a '../' pattern silently
  // matches nothing under Turbopack.
  import.meta.glob('./modules/*.ts'),
  (path) => {
    const name = path.split('/').pop()?.replace(/\.tsx?$/, '');
    return name ? `@app/${name}` : null;
  },
);
```

Add a file to `modules/` and it becomes importable by snippets — lazily, with no
edit here. This file never grows.

## Step 4 — Register third-party packages as loaders

```ts
// lib/live-sdk/vendor.ts
import { defineLoader } from 'next-live';
import type { ModuleRegistry } from 'next-live';

export const vendorModules: ModuleRegistry = {
  'date-fns': defineLoader(() => import('date-fns')),
  'my-charts': defineLoader(() => import('my-charts')),

  // A key ending in '/' claims a whole subtree and receives the full specifier.
  'big-lib/': defineLoader((specifier) =>
    import(`big-lib/${specifier.slice('big-lib/'.length)}`),
  ),
};
```

Loaders, never values — a value ends up in your page bundle for every visitor.
If your app already imports the package for its own use, the loader costs
nothing extra; it hands over the module that is already loaded.

## Step 5 — Compose

```ts
// lib/live-sdk/index.ts
import { createRegistry } from 'next-live';
import { vendorModules } from './vendor';
import { generatedModules } from './generated';

export const liveModules = createRegistry(vendorModules, generatedModules);
```

## Step 6 — Serve the source from your API

```ts
// app/api/apps/[id]/route.ts
import { NextResponse } from 'next/server';
import { getApp } from '@/lib/apps';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // Authorise the read the same way you authorise any other resource.
  const app = await getApp(id);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ id: app.id, name: app.name, source: app.source });
}
```

**Snippet source must only ever come from here** — never from a query parameter,
hash fragment, or `localStorage`. See [Security](./05-security.md).

## Step 7 — The runner component

```tsx
// app/apps/[id]/Runner.tsx
'use client';

import { useEffect, useState } from 'react';
import { LiveProvider, LivePreview, LiveError } from 'next-live';
import { liveModules } from '@/lib/live-sdk';
import { useCurrentUser } from '@/lib/auth';

export function Runner({ id }: { id: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const user = useCurrentUser();

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);

    fetch(`/api/apps/${id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { source: string }) => setSource(data.source))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, [id]);

  if (failed) return <p>This app could not be loaded.</p>;
  if (source === null) return <AppSkeleton />;

  return (
    <LiveProvider
      code={source}
      modules={liveModules}
      props={{ user }}
      filePath={`${id}.tsx`}
      fallback={<AppSkeleton />}
      onError={(error) => reportToMonitoring(error, { appId: id })}
    >
      <LivePreview />
      <LiveError />
    </LiveProvider>
  );
}
```

Three details worth copying:

- **`filePath`** gives stack traces and DevTools a stable, identifiable name.
- **`fallback`** should be the same skeleton you use while fetching, so there is
  no layout shift when compiling starts.
- **`onError`** is where you find out that an app your staff published is broken
  in production. Wire it to your monitoring.

## Step 8 — The page

```tsx
// app/apps/[id]/page.tsx
import { Runner } from './Runner';

export default async function AppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Runner id={id} />;
}
```

A Server Component can import and render the runner directly — `next-live`
components carry `'use client'` themselves.

## Step 9 — CSP

```ts
// proxy.ts
const RUNNER_ROUTES = ['/apps'];
```

Full file in [Security](./05-security.md#3-scope-unsafe-eval-to-the-routes-that-run-snippets).
**Do not skip this** — without `'unsafe-eval'` on `/apps`, nothing runs in
production, and you want the directive confined to that route.

## Step 10 — The editor side

Your control panel needs the editor rather than just the preview:

```tsx
'use client';

import { useState } from 'react';
import { LiveProvider, LiveEditor, LivePreview, LiveError } from 'next-live';
import { liveModules } from '@/lib/live-sdk';

export function AppEditor({ initialSource, onSave }: {
  initialSource: string;
  onSave: (source: string) => Promise<void>;
}) {
  const [source, setSource] = useState(initialSource);

  return (
    <LiveProvider code={source} modules={liveModules}>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveEditor renderEditor={({ code, onChange }) => (
          <textarea
            value={code}
            onChange={(e) => { onChange(e.target.value); setSource(e.target.value); }}
          />
        )} />
        <div>
          <LivePreview />
          <LiveError />
        </div>
      </div>
      <button onClick={() => onSave(source)}>Save</button>
    </LiveProvider>
  );
}
```

Remember that saving is equivalent to deploying: authorise the write endpoint
strictly, and keep an audit trail and version history.

## Step 11 — Optional: precompile on the server

If the same apps are opened repeatedly, transpile once and cache by content
hash. The browser then never downloads the transpiler:

```ts
import { precompile } from 'next-live/server';

const result = precompile(app.source, { filePath: `${app.id}.tsx` });
// cache by result.hash, return result.code
```

```tsx
<LiveProvider code={source} transform={() => compiled} />
```

## Pre-launch checklist

- [ ] Snippet source comes only from your authenticated API.
- [ ] The write endpoint is authorised, audited, and versioned.
- [ ] `'unsafe-eval'` is scoped to runner routes in `proxy.ts`.
- [ ] `connect-src` is as narrow as your apps allow.
- [ ] `onError` reports to monitoring.
- [ ] `fallback` matches your loading skeleton.
- [ ] `npm ls react` shows exactly one version.
- [ ] Every registry entry is a loader, not a value.
- [ ] CI validates every stored snippet against the registry
      ([Validating in CI](./10-validating-in-ci.md)).
- [ ] An author-facing note explains that TypeScript types are stripped, not
      checked.

## A worked example

`apps/playground` in this repository implements all of the above: a fake
database of apps, an API route that serves and optionally precompiles them, a
composed lazy registry, scoped CSP, and demo apps covering deep subpaths, a
shared store, lazy heavy modules, and module-instance identity.

```bash
npm install
npm run dev
# http://localhost:3000/playground
```

---

[← Troubleshooting](./07-troubleshooting.md) · [Docs index](./README.md)
