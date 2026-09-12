# Scaling to many apps

[← Sharing libraries](./03-sharing-your-app-libraries.md) · [Docs index](./README.md) · [Security →](./05-security.md)

For an app hosting hundreds of snippets with a large SDK surface, this is where
things go wrong — and it is mostly about *how* you register, not *how much*.

## Register loaders, not values

Registering a module **by value** means your page imports it statically, so it
ships to every visitor whether or not any snippet uses it:

```ts
import * as charts from 'my-charts';             // ❌ in the page bundle, always
modules={{ 'my-charts': charts }}
```

Register a **loader** and it becomes a dynamic import, which the bundler
code-splits and fetches only when a snippet imports that specifier:

```ts
modules={{ 'my-charts': defineLoader(() => import('my-charts')) }}       // ✅
```

Measured on the playground with a 192 KB vendor module:

| | initial JS for the page |
|---|---|
| registered by value | 827 KB |
| registered as a loader | **666 KB** |

With the loader, the module is absent from every initially-loaded chunk, and the
browser fetches its chunk at the moment a snippet imports it — verified by
watching network activity, not inferred.

**A registry of 300 loaders costs nothing.** `next-live` only resolves
specifiers that appear in the compiled snippet, so unused entries are never
touched. Your provider can list everything without penalty.

> If your app already imports the library for its own use, the loader costs
> nothing extra either — it hands over the already-loaded module. See
> [Sharing libraries](./03-sharing-your-app-libraries.md#no-second-download-either).

## The library's own weight

Before your registry, what does `next-live` itself cost a page? Measured with
esbuild, React externalised, code-splitting on:

| Page imports | Entry chunk |
|---|---|
| `LiveProvider` + `LivePreview` + `LiveError` | **16.1 KB** |
| the above plus `LiveEditor` from `next-live/editor` | 102.1 KB |

The difference is `prism-react-renderer`. It is only needed to syntax-highlight
an editor, so it lives on its own entry and is an optional peer dependency —
a page that merely *runs* stored snippets never downloads or installs it.

Sucrase is not in either number: it is fetched as a separate chunk on first
compile, or skipped entirely if you
[precompile on the server](#compile-cost-and-skipping-the-transpiler).

## Design an SDK surface, not a mirror of your codebase

The bigger question is *what* to register.

Everything in the registry is a public contract with your snippet authors. Expose
500 internal functions and you can never rename or move any of them again —
every stored snippet becomes a reason not to refactor.

Prefer a small, deliberate set of stable namespaces:

```
@app/store      @app/ui      @app/data      @app/charts
```

each a thin re-export of the real implementation:

```ts
// lib/live-sdk/modules/charts.ts
export { BarChart, LineChart } from 'my-charts';
```

This, more than any technique below, is what stops the provider growing without
bound. It is a design decision, not a technical one.

## Compose the registry from small files

`createRegistry` merges groups, so the surface lives in one file per domain
rather than one object that grows forever:

```ts
// lib/live-sdk/index.ts
import { createRegistry } from 'next-live';
import { vendorModules } from './vendor';
import { storeModules } from './stores';
import { uiModules } from './ui';

export const liveModules = createRegistry(vendorModules, storeModules, uiModules);
```

```tsx
<LiveProvider code={source} modules={liveModules} />
```

Adding a capability means adding a group, not editing the component that renders
the provider. Later groups win, and a key defined by two groups logs a warning in
development — a silent override is painful to debug.

## Generate entries from the filesystem

For a directory that is genuinely one-file-per-thing, `registryFromGlob` removes
the hand-maintenance entirely. Turbopack's `import.meta.glob` already returns
`{ path: () => import(path) }` — lazy thunks, exactly the shape a registry needs:

```ts
// lib/live-sdk/modules.ts
import { registryFromGlob } from 'next-live';

export const storeModules = registryFromGlob(
  import.meta.glob('./modules/*.ts'),
  (path) => {
    const name = path.split('/').pop()!.replace(/\.tsx?$/, '');
    return name ? `@app/${name}` : null;      // return null to omit a file
  },
);
```

Add a file to `./modules` and snippets can import it immediately, still lazily.
This file never has to change again.

### The directory rule that will cost you an hour

**The pattern must be at or below the calling file's own directory.**

Turbopack resolves the pattern relative to the file calling it, and a `../`
pattern **silently matches nothing**. It returns an empty object rather than
erroring, so your registry quietly has zero entries and every snippet fails with
"module is not registered".

Verified against Turbopack 16.3.5:

| Pattern | Result |
|---|---|
| `'./*.ts'` | ✅ matches |
| `'./modules/*.ts'` | ✅ matches |
| `'../*.ts'` | ❌ empty |
| `'../store.ts'` (explicit file) | ❌ empty |

That constraint pushes you toward the better shape anyway: keep a dedicated
directory of modules exposed to snippets, each a thin re-export. Your SDK
surface becomes visible in the filesystem instead of buried in a filter list.

`import.meta.glob` requires **Turbopack** — it does not exist under webpack.
Under webpack, build the equivalent `{ path: () => import(path) }` object
yourself and pass that to `registryFromGlob`.

## Deep subpaths

Some packages are used through hundreds of deep modules rather than a barrel —
`big-lib/charts/BarChart`, `big-lib/format/currency`, and so on. A **prefix
entry** — a key ending in `/` — serves the whole subtree from one line,
receiving the full specifier:

```ts
'big-lib/': defineLoader((specifier) => {
  const subpath = specifier.slice('big-lib/'.length);
  return import(`big-lib/${subpath}`);
}),
```

Verified with Turbopack: deep subpaths resolve, and each arrives as its own
chunk fetched on demand.

### Know the trade-off

A template-literal import compiles to a **context** — the bundler emits a chunk
for every module matching the pattern, including ones no snippet ever imports.
Confirmed in the playground: a module imported by no app still had chunks
generated for it.

Those chunks are not in your initial bundle, so page load is unaffected. But
build time and output file count grow with the size of the package. This was
verified on a small package — measure it yourself before pointing a prefix entry
at something with hundreds of modules.

If build times suffer, narrow the scope:

```ts
// Only the subtrees you actually use
'big-lib/charts/': defineLoader(/* … */),
'big-lib/format/': defineLoader(/* … */),
```

or list the specific modules explicitly. An explicit list is more verbose but is
also an allowlist, which some teams prefer for exactly that reason — and it is
the approach the [recommended SDK pattern](#design-an-sdk-surface-not-a-mirror-of-your-codebase)
gives you for free.

## Compile cost, and skipping the transpiler

Compilation is a few milliseconds, and results are not shared between page
loads. If you serve many stored snippets, transpile once on the server and cache
by content hash — the browser then never downloads Sucrase at all:

```ts
// app/api/apps/[id]/route.ts
import { precompile } from 'next-live/server';

const result = precompile(source, { filePath: `${id}.tsx` });
// result.hash is a stable cache key / ETag
```

```tsx
<LiveProvider code={source} transform={() => precompiledResult} />
```

You can also warm the transpiler chunk during idle time so the first compile is
not gated on a network round trip:

```ts
import { preloadTranspiler } from 'next-live';
useEffect(() => preloadTranspiler(), []);
```

---

[← Sharing libraries](./03-sharing-your-app-libraries.md) · [Docs index](./README.md) · [Security →](./05-security.md)
