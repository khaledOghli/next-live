# Troubleshooting

[← API reference](./06-api-reference.md) · [Docs index](./README.md) · [Integration guide →](./08-integration-guide.md)

Every error below is one you can actually hit, with its real message text.

## `LiveEditor` is not exported from `next-live`

```
The requested module 'next-live' does not provide an export named 'LiveEditor'
```

`<LiveEditor>` lives on its own entry point so preview-only pages never pay for
a syntax highlighter:

```tsx
import { LiveProvider, LivePreview, LiveError } from 'next-live';
import { LiveEditor } from 'next-live/editor';
```

Install the optional peer when you use the editor:

```bash
npm install prism-react-renderer
```

See [API reference: entry points](./06-api-reference.md#components).

## `Module 'x' is not registered in the next-live scope`

```
Module '@app/stroe' is not registered in the next-live scope.

Did you mean '@app/store'?

Registered modules (5): react, react/jsx-runtime, react/jsx-dev-runtime,
  '@app/store', '@app/ui'
```

The snippet imported something you did not register. The message lists what *is*
available and suggests the nearest match.

**If the name looks right but is still missing**, the usual cause is a registry
built by `registryFromGlob` that silently produced no entries - see
[the empty glob](#my-registry-is-empty-and-every-import-fails) below.

**An unused import never triggers this.** The TypeScript transform removes it
before resolution, exactly as `tsc` would.

## My registry is empty and every import fails

`import.meta.glob` matched nothing and returned `{}`, no error, no warning.

**Cause:** the pattern points outside the calling file's own directory.
Turbopack resolves it relative to that file, and a `../` pattern silently
matches nothing.

```ts
import.meta.glob('../modules/*.ts')   // ❌ empty, no warning
import.meta.glob('./modules/*.ts')    // ✅
```

**Fix:** move the file that calls `import.meta.glob` so the directory it globs is
at or below it. Confirm with a quick `console.log(Object.keys(import.meta.glob(...)))`.

Also note `import.meta.glob` requires **Turbopack**; it does not exist under
webpack. Details in [Scaling](./04-scaling.md#the-directory-rule-that-will-cost-you-an-hour).

## `next-live could not evaluate this snippet: the page's Content Security Policy blocks eval`

Your CSP is missing `'unsafe-eval'` on this route. That is expected -
`next-live` compiles at runtime.

**Fix:** add the route to your runner routes in `proxy.ts`. See
[Security](./05-security.md#3-scope-unsafe-eval-to-the-routes-that-run-snippets).

A nonce will not help: nonces authorize script *elements*, while `new Function`
is governed solely by `'unsafe-eval'`.

## `This component rendered more than 1000 times in 1000ms`

```
This component rendered more than 1000 times in 1000ms, so next-live stopped it
to keep the page responsive.

The usual causes are calling a state setter during render, or a useEffect that
updates state without a correct dependency array.
```

The render-loop breaker tripped. Look in the snippet for:

```tsx
setCount(n + 1);                       // ❌ during render
useEffect(() => setCount(n + 1));      // ❌ no dependency array
```

The breaker stays tripped until the next compile - deliberately, because React
retries a failed render before handing the error to a boundary, so a breaker
that forgave itself would let every retry succeed and the loop would never
surface. Editing the snippet clears it.

**If it fires on correct code**, you are rendering faster than 1000 times a
second, plausible for animation-driven snippets. Raise the threshold:

```tsx
<LiveProvider maxRendersPerSecond={5000} />
```

## `You're importing a component that needs useState`

Thrown by Next, not by `next-live`, when a Client Component is imported into a
Server Component without the `'use client'` directive surviving the build.

If you see this from the published package, the build output lost its directive.
Check:

```bash
head -1 node_modules/next-live/dist/index.js    # → "use client";
```

If you see this from **your own** runner component, add `'use client'` to the top
of the file that renders `<LiveProvider>`.

## My store state is not shared with the host app

The snippet has a *different copy* of your store module. Almost always two
installed versions:

```bash
npm ls zustand      # or whichever library
```

More than one version means two modules and two stores. Run `npm dedupe`, or pin
one version with `overrides`. Full explanation and the other three causes in
[Sharing libraries](./03-sharing-your-app-libraries.md#when-you-really-do-get-two-copies).

## `Invalid hook call` / "more than one copy of React"

Same root cause as above, applied to React. Snippets use **your** React instance,
so two Reacts in `node_modules` break hooks:

```bash
npm ls react
```

## My TypeScript errors are not reported

Expected. Sucrase **strips** types without checking them, which is what keeps
compilation in the single-digit milliseconds. A snippet with a real type error
compiles cleanly and fails at runtime.

`react-live` makes the same trade-off. If authors need real diagnostics, run
`tsc` or the TypeScript language service in a worker on your side and surface the
results yourself; `next-live` does not do this for you.

## `The snippet did not produce a component`

```
The snippet did not produce a component. Add `export default YourComponent`,
or end the snippet with a single JSX expression.
```

The code ran but nothing renderable came out. Add an explicit default export -
that is the supported, unambiguous form:

```tsx
export default function App() { return <div/>; }
```

Related variants:

- *"The default export is a string, which React cannot render"* - you exported a
  value rather than a component.
- *"Several components were exported and none is the default"* - mark one with
  `export default`.

## The preview flashes or disappears while typing

It should not, a failed recompile keeps the last working component mounted.
If you turned that off (`keepLastGood={false}`), turn it back on.

If the preview *remounts* and loses state on every successful compile, that is
expected: a recompiled component is a new function identity, so React cannot
carry state over.

## Hydration errors (#418 / #425)

`next-live` should never cause these, it renders the same `fallback` on the
server and on the client's first pass.

If you see one, check whether *your* runner component renders something
different between server and client, for example `Date.now()` or
`window.matchMedia`, outside of `next-live`.

## Precompile ignores my edits

You enabled server precompile and passed `precompiledTransform(compiled)` as
`transform`, but editing the snippet no longer updates the preview.

**Cause:** `precompiledTransform` returns a constant closure. It always serves
the server-compiled output regardless of what `code` says now.

**Fix:** only apply the transform while `code` still matches the catalog source
that was precompiled. As soon as the author edits, set `transform={undefined}`
(or re-precompile the new source):

```tsx
const usingPrecompile =
  precompileEnabled && compiled && code === catalogSource;

<LiveProvider
  code={code}
  transform={usingPrecompile ? precompiledTransform(compiled) : undefined}
/>
```

See [Scaling: compile cost](./04-scaling.md#compile-cost-and-skipping-the-transpiler).

## Tailwind classes in my snippet do nothing

Tailwind scans your **host** source files at build time. Utility classes written
only inside stored snippet strings are invisible to the scanner, so no CSS is
generated for them.

**Fix (recommended):** expose pre-built components through the registry:

```ts
// lib/live-sdk/modules/ui.ts
export { Button, Card } from '@/components/ui';
```

```tsx
// snippet
import { Button, Card } from '@app/ui';
export default () => <Card><Button>Save</Button></Card>;
```

The components' classes are compiled into your host bundle. This is what the
`/apps` shell demo does with shadcn.

**Alternative:** add a `@source` directive in your global CSS pointing at a
file that contains the utility class names your snippets use, or safelist them
in your Tailwind config. See the playground's `app/globals.css` for an example.

## Do React hooks work in snippets?

Yes. Snippets import the **host's** React instance (`react` is a built-in
module), so `useState`, `useEffect`, `useContext`, and the rest work normally.
The `/apps` shell demo includes timer and fetch examples.

Common pitfalls are the same as in any React app: missing effect cleanup,
state updates during render, and dependency arrays. The render-loop breaker catches
runaway re-renders - see [above](#this-component-rendered-more-than-1000-times-in-1000ms).

## The first compile is slow

The Sucrase chunk is fetched on first use. Warm it during idle time:

```tsx
import { preloadTranspiler } from 'next-live';
useEffect(() => preloadTranspiler(), []);
```

Or skip it entirely by precompiling on the server - see
[Scaling](./04-scaling.md#compile-cost-and-skipping-the-transpiler).

## A snippet hung the whole tab

A synchronous infinite loop, `while (true) {}`, a runaway recursion, a
catastrophic regex. This **cannot** be interrupted: JavaScript offers no way to
stop synchronous code in its own realm, so no timer or `AbortController` will
fire. The tab must be closed.

The render-loop breaker catches the *asynchronous* variety (`setState` loops),
which is the common one in practice. See
[Security](./05-security.md#what-is-contained-and-what-is-not).

## Still stuck

Useful things to capture before reporting an issue:

- The snippet source that reproduces it.
- The registry keys: `console.log(Object.keys(liveModules))`.
- Whether it happens in dev, production, or both, CSP differs between them.
- `npm ls react next-live`.

---

[← API reference](./06-api-reference.md) · [Docs index](./README.md) · [Integration guide →](./08-integration-guide.md)
