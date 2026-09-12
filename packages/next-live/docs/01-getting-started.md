# Getting started

[Docs index](./README.md) · [Module registry →](./02-module-registry.md)

By the end of this page you will have a page that takes a string of TSX and
renders it as a live React component.

**Requirements:** React 19+, Next.js 16+ (App Router), Node 20.9+.

## Step 1 — Install

```bash
npm install next-live
```

## Step 2 — Create the runner

`next-live` compiles in the browser, so the component that uses it must be a
Client Component. Create `app/apps/Runner.tsx`:

```tsx
'use client';

import { LiveProvider, LivePreview, LiveError } from 'next-live';
import { LiveEditor } from 'next-live/editor';

export function Runner({ source }: { source: string }) {
  return (
    <LiveProvider code={source}>
      <LiveEditor />
      <LivePreview />
      <LiveError />
    </LiveProvider>
  );
}
```

That is already a working playground — `react` is registered for you, so
snippets can use hooks immediately.

## Step 3 — Render it from a page

`app/apps/page.tsx`, a normal Server Component:

```tsx
import { Runner } from './Runner';

const EXAMPLE = `import { useState } from 'react';

export default function App() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>clicked {n} times</button>;
}
`;

export default function AppsPage() {
  return <Runner source={EXAMPLE} />;
}
```

Load the page and the button works. Edit the code in the editor and the preview
updates as you type.

> You do **not** need `next/dynamic(..., { ssr: false })`. Reaching for it is the
> reflex, but `next-live` is already SSR-safe — see
> [SSR and hydration](#ssr-and-hydration) below.

## Step 4 — Give snippets access to your app

By default a snippet can only import `react`. To let it import your own code,
pass a `modules` registry:

```tsx
'use client';

import { LiveProvider, LivePreview, LiveError, defineLoader } from 'next-live';
import { LiveEditor } from 'next-live/editor';

export function Runner({ source, user }: { source: string; user: User }) {
  return (
    <LiveProvider
      code={source}
      modules={{
        '@app/store': defineLoader(() => import('@/lib/store')),
        '@app/ui': defineLoader(() => import('@/components/ui')),
      }}
      props={{ user }}
    >
      <LiveEditor />
      <LivePreview />
      <LiveError />
    </LiveProvider>
  );
}
```

Snippet authors then write ordinary code:

```tsx
import { useCart } from '@app/store';
import { Button } from '@app/ui';

export default function App({ user }) {
  const cart = useCart();
  return <Button>{user.name}: {cart.length} items</Button>;
}
```

Read [Module registry](./02-module-registry.md) next — it is the core concept.

## Step 5 — Before you deploy

`next-live` evaluates code with `new Function`, which requires `'unsafe-eval'`
in your Content Security Policy. It should be scoped to the routes that run
snippets, not your whole app.

**Do not skip this** — read [Security](./05-security.md) before going to
production. It takes about ten minutes and covers the CSP plus the one rule that
actually protects you.

## What each piece does

| Component | Purpose |
|---|---|
| `<LiveProvider>` | Compiles `code` and provides the result. Everything else must be inside it. |
| `<LiveEditor>` | A textarea with syntax highlighting. Optional — omit it for a read-only runner. |
| `<LivePreview>` | Renders the compiled component, wrapped in an error boundary. |
| `<LiveError>` | Shows the current compile or runtime error; renders nothing when healthy. |

You can also skip the components entirely and drive the engine yourself with
[`useLiveRunner`](./06-api-reference.md#useliverunner).

## What a snippet may look like

All of these work:

```tsx
export default function App() { return <div/> }   // a module (recommended)
function App() { return <div/> }                  // bare declaration
<div>hello</div>                                  // bare expression
() => <div/>                                      // bare expression
render(<App prop="x"/>)                           // explicit render call
```

`export default` is the supported, unambiguous form. The others are recovered
heuristically for `react-live` compatibility — prefer `export default` in
anything you store.

TypeScript works: types, interfaces, and generics are all stripped. Note they
are **not checked** — see [Troubleshooting](./07-troubleshooting.md#my-typescript-errors-are-not-reported).

## SSR and hydration

Nothing is compiled during the server pass. `<LivePreview>` renders its
`fallback` on the server *and* on the client's first render, so the two are
identical and hydration cannot mismatch. Compilation starts afterwards, in an
effect.

Give it a `fallback` sized like your content to avoid layout shift:

```tsx
<LivePreview fallback={<div style={{ height: 320 }} />} />
```

## Loading snippets from an API

The real use case is code stored elsewhere. `code` is controlled — change it and
the preview follows:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { LiveProvider, LivePreview, LiveError } from 'next-live';

export function RemoteApp({ id }: { id: string }) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/apps/${id}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { source: string }) => setSource(data.source))
      .catch(() => {});
    return () => controller.abort();
  }, [id]);

  if (source === null) return <p>Loading…</p>;

  return (
    <LiveProvider code={source}>
      <LivePreview />
      <LiveError />
    </LiveProvider>
  );
}
```

**Only ever fetch snippet source from your own authenticated API.** Never from a
query parameter, hash fragment, or `localStorage` — see
[Security](./05-security.md).

## Try the live demos

This repository's playground includes two routes:

- **`/apps`** — production-shaped shell (sidebar tabs, API-fetched snippets,
  shadcn UI via `@app/ui`, hooks demos)
- **`/playground`** — developer lab with editor and experiments

```bash
npm install && npm run dev
```

## Next steps

- [Module registry](./02-module-registry.md) — how imports resolve
- [Sharing libraries with your app](./03-sharing-your-app-libraries.md) — the
  single-instance question
- [Scaling to many apps](./04-scaling.md) — keeping the bundle small
- [Security](./05-security.md) — read before deploying
- [Integration guide](./08-integration-guide.md) — apps stored in a database

---

[Docs index](./README.md) · [Module registry →](./02-module-registry.md)
