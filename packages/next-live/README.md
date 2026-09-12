# next-live

Live TSX/JSX evaluation for the **Next.js App Router**, real ESM `import`
statements, a module registry instead of a global scope bag, and no hydration
mismatches.

```bash
npm install next-live
```

Using the built-in editor? It needs one optional peer, which npm does **not**
install for you:

```bash
npm install next-live prism-react-renderer
```

Preview-only pages never import `next-live/editor`, and should skip it, that is
the whole point of keeping the highlighter on a separate entry.

## Quick start

```tsx
'use client';

import { LiveProvider, LivePreview, LiveError } from 'next-live';
import { LiveEditor } from 'next-live/editor';

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

## When to use something else

Sandpack solves a different problem: it boots a virtual filesystem and an iframe
per instance. `next-live` is for embedded live tools and control panels, where a
snippet should share your page's React instance and your live objects.

## What you get

- **Real ESM.** `import`, `export default`, namespace imports, deep subpaths.
- **TypeScript and JSX**, transpiled by Sucrase in single-digit milliseconds.
- **A module registry** - hand snippets your store, your UI kit, your helpers.
- **Live props by reference.** Pass a store or a class instance; a snippet
  mutating it updates your app.
- **SSR-safe.** No hydration mismatch, no `next/dynamic` needed.
- **Contained failures.** An error boundary and a render-loop breaker keep a bad
  snippet from taking down the page.
- **Not just components.** `useLiveModule` runs snippets that export
  validators, transformers, or config rather than UI.
- **CI validation.** `validateSnippets` checks every stored snippet still
  compiles against your registry, so an SDK rename fails the build instead of
  breaking apps silently.
- **Small, and lazy.** A page that only runs snippets pays **16.1 KB**; the
  editor and its highlighter are a separate entry, and the transpiler is a
  chunk fetched on first compile.
- **Headless if you want it.** `useLiveRunner` for a completely custom UI.
- **Server precompilation** via `next-live/server`, so the browser can skip the
  transpiler entirely.

## Documentation

**[→ Full documentation](./docs/README.md)**

| | |
|---|---|
| [Getting started](./docs/01-getting-started.md) | Install and first working preview |
| [The module registry](./docs/02-module-registry.md) | How `import` resolves, the core concept |
| [Sharing libraries with your app](./docs/03-sharing-your-app-libraries.md) | One instance, not two copies |
| [Scaling to many apps](./docs/04-scaling.md) | Keeping the bundle small |
| [Security](./docs/05-security.md) | Trust model and CSP, read before deploying |
| [API reference](./docs/06-api-reference.md) | Every export and prop |
| [Troubleshooting](./docs/07-troubleshooting.md) | Real errors and their fixes |
| [Integration guide](./docs/08-integration-guide.md) | End-to-end walkthrough |
| [Snippets that are not components](./docs/09-non-ui-snippets.md) | Validators, transformers, config |
| [Validating stored snippets in CI](./docs/10-validating-in-ci.md) | Catch SDK renames before users do |

## Two things to know up front

**It needs `'unsafe-eval'` in your CSP**, scoped to the routes that run snippets.
That is inherent to compiling at runtime. [Security](./docs/05-security.md)
explains why it is narrower than it sounds and how to contain it.

**It is not a sandbox.** Snippets run with your page's authority. That is what
makes shared stores and live props work, and it means snippet authors must be
people you trust.

## Requirements

React 19+ and Node 20.9+.

**Next.js is not required.** The library imports only `react`,
`react/jsx-runtime`, `react/jsx-dev-runtime`, `prism-react-renderer`, and
`sucrase` - it works in Vite,
CRA, Remix, or anywhere React runs. The name reflects where it was designed and
what it is tuned for: App Router SSR safety, and docs written against Next 16.

## License

MIT
