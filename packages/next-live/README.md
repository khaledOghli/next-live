# next-live

[![npm version](https://img.shields.io/npm/v/next-live.svg?color=0b7285)](https://www.npmjs.com/package/next-live)
[![CI](https://github.com/khaledOghli/next-live/actions/workflows/ci.yml/badge.svg)](https://github.com/khaledOghli/next-live/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/next-live.svg?color=0b7285)](https://www.npmjs.com/package/next-live)
[![bundle size](https://img.shields.io/bundlephobia/minzip/next-live?label=minzip)](https://bundlephobia.com/package/next-live)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/khaledOghli/next-live/blob/main/LICENSE)
[![Docs](https://img.shields.io/badge/docs-live%20site-0b7285)](https://next-live-playground.vercel.app)

**[→ Documentation and live demos](https://next-live-playground.vercel.app)**

Live TSX/JSX evaluation for **React**, real ESM `import` statements, a module
registry instead of a global scope bag, and no hydration mismatches.

**Next.js is not required.** It works in Vite, Remix, CRA, or anywhere React
runs. The name reflects where it was designed and what it is tuned for: App
Router SSR safety, and docs written against Next 16.

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
snippet should share your page's React instance and your live objects. When
snippets come from people you do not trust, `next-live` can also run them in an
isolated iframe: see [Sandbox mode](./docs/15-sandbox.md).

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
- **Console output.** `<LiveConsole>` shows what a snippet logs, right next to
  the preview.
- **More than one file.** Pass `files`, and the files import each other with
  relative paths. `<LiveFileTabs>` adds tabs.
- **Sandbox mode** for code you do not trust. The snippet runs in an isolated
  iframe, and your page never evaluates it.
- **CI validation.** `validateSnippets` checks every stored snippet still
  compiles against your registry, so an SDK rename fails the build instead of
  breaking apps silently.
- **Small, and lazy.** The main entry is about **13 KB** minified and gzipped.
  The editor and its highlighter, the console panel and the sandbox code are
  separate entries, and the transpiler is a chunk fetched on first compile.
- **Headless if you want it.** `useLiveRunner` for a completely custom UI.
- **Server precompilation** via `next-live/server`, so the browser can skip the
  transpiler entirely.

## Documentation

**[→ Read the documentation online](https://next-live-playground.vercel.app)**, or the markdown copies below.

| | |
| --- | --- |
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
| [Showing console output](./docs/13-console.md) | Show what snippets log next to the preview |
| [Snippets with more than one file](./docs/14-multi-file.md) | Files that import each other, with tabs |
| [Sandbox mode](./docs/15-sandbox.md) | Run code you do not trust in an isolated iframe |

## Two things to know up front

**It needs `'unsafe-eval'` in your CSP**, scoped to the routes that run snippets.
That is inherent to compiling at runtime. [Security](./docs/05-security.md)
explains why it is narrower than it sounds and how to contain it.

**By default it is not a sandbox.** Snippets run with your page's authority. That
is what makes shared stores and live props work, and it means snippet authors must
be people you trust. For anyone else, use [sandbox mode](./docs/15-sandbox.md),
which runs snippets in an isolated iframe.

## Requirements

React 19+ and Node 20.9+. Nothing else is required: the library imports only
`react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `sucrase`, and
`prism-react-renderer` on the `/editor` entry.

## Contributing

Bug reports, feature requests and pull requests are welcome. Start with
[CONTRIBUTING.md](https://github.com/khaledOghli/next-live/blob/main/CONTRIBUTING.md),
and see the [changelog](./CHANGELOG.md) for what has changed.

Found a security issue? Do not open an issue, follow
[SECURITY.md](https://github.com/khaledOghli/next-live/blob/main/SECURITY.md).

## License

[MIT](https://github.com/khaledOghli/next-live/blob/main/LICENSE) (c) KhaledOghli
