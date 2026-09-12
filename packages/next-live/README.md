# next-live

Live TSX/JSX evaluation for the **Next.js App Router** — real ESM `import`
statements, a module registry instead of a global scope bag, and no hydration
mismatches.

```bash
npm install next-live
```

## Quick start

```tsx
'use client';

import { LiveProvider, LiveEditor, LivePreview, LiveError } from 'next-live';

export function Playground({ source }: { source: string }) {
  return (
    <LiveProvider code={source}>
      <LiveEditor />
      <LivePreview />
      <LiveError />
    </LiveProvider>
  );
}
```

The snippet is written the way a real file is written:

```tsx
import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>clicked {count} times</button>;
}
```

To let snippets reach your own code, hand it over explicitly:

```tsx
<LiveProvider
  code={source}
  modules={{ '@app/store': defineLoader(() => import('@/lib/store')) }}
  props={{ user }}
/>
```

## Why not `react-live`?

`react-live` is effectively unmaintained, and its design predates modern tooling.

| | `react-live` | `next-live` |
|---|---|---|
| Dependencies | one flat `scope` object of free variables | a **module registry**; snippets use real `import` statements |
| ES modules | not supported | `import` / `export default` / namespaces / subpaths |
| App Router | compiles during the server pass, causing hydration errors #418/#425 | never compiles on the server; first client render matches it exactly |
| Transpiler | bundled into the client chunk | code-split behind a dynamic import, or precompiled on the server |
| Runaway code | no protection | error boundary plus a render-loop breaker |

Sandpack solves a different problem: it boots a virtual filesystem and an iframe
per instance. `next-live` is for embedded live tools and control panels, where a
snippet should share your page's React instance and your live objects.

## What you get

- **Real ESM.** `import`, `export default`, namespace imports, deep subpaths.
- **TypeScript and JSX**, transpiled by Sucrase in single-digit milliseconds.
- **A module registry** — hand snippets your store, your UI kit, your helpers.
- **Live props by reference.** Pass a store or a class instance; a snippet
  mutating it updates your app.
- **SSR-safe.** No hydration mismatch, no `next/dynamic` needed.
- **Contained failures.** An error boundary and a render-loop breaker keep a bad
  snippet from taking down the page.
- **Headless if you want it.** `useLiveRunner` for a completely custom UI.
- **Server precompilation** via `next-live/server`, so the browser can skip the
  transpiler entirely.

## Documentation

**[→ Full documentation](./docs/README.md)**

| | |
|---|---|
| [Getting started](./docs/01-getting-started.md) | Install and first working preview |
| [The module registry](./docs/02-module-registry.md) | How `import` resolves — the core concept |
| [Sharing libraries with your app](./docs/03-sharing-your-app-libraries.md) | One instance, not two copies |
| [Scaling to many apps](./docs/04-scaling.md) | Keeping the bundle small |
| [Security](./docs/05-security.md) | Trust model and CSP — read before deploying |
| [API reference](./docs/06-api-reference.md) | Every export and prop |
| [Troubleshooting](./docs/07-troubleshooting.md) | Real errors and their fixes |
| [Integration guide](./docs/08-integration-guide.md) | End-to-end walkthrough |

## Two things to know up front

**It needs `'unsafe-eval'` in your CSP**, scoped to the routes that run snippets.
That is inherent to compiling at runtime. [Security](./docs/05-security.md)
explains why it is narrower than it sounds and how to contain it.

**It is not a sandbox.** Snippets run with your page's authority. That is what
makes shared stores and live props work, and it means snippet authors must be
people you trust.

## Requirements

React 19+, Next.js 16+ (App Router), Node 20.9+.

## License

MIT
