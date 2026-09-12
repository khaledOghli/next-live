# The module registry

[← Getting started](./01-getting-started.md) · [Docs index](./README.md) · [Sharing libraries →](./03-sharing-your-app-libraries.md)

This is the core concept. Everything else follows from it.

## The mental model

**There is no npm in the browser.** No bundler, no package resolution, no
network fetch for `lodash`. Your application's JavaScript contains only what
*you* imported when it was built.

So a snippet saying `import _ from 'lodash'` cannot conjure lodash into
existence. You have to hand it over. The `modules` prop is how:

```tsx
<LiveProvider
  code={source}
  modules={{
    '@app/store': defineLoader(() => import('@/lib/store')),
  }}
/>
```

`next-live` compiles `import x from 'y'` into a lookup against that map. If the
specifier is not registered, the snippet fails with a clear error naming it.

This replaces `react-live`'s flat `scope` object, where every hook and helper had
to be injected as a global variable and `import` could not be used at all.

## The key is just a string

A registry key does **not** have to be a real path or a real package name. It is
whatever you want snippet authors to type:

```tsx
modules={{
  '@app/store':   /* … */,   // looks like a package
  '@/store':      /* … */,   // looks like a path alias
  'my-utils':     /* … */,   // looks like a dependency
  './helpers':    /* … */,   // looks like a relative import
}}
```

Pick names that read like a deliberate SDK. See
[Scaling](./04-scaling.md#design-an-sdk-surface-not-a-mirror-of-your-codebase).

## Two ways to register

### As a loader — the default choice

```ts
'@app/store': defineLoader(() => import('@/lib/store'))
```

A dynamic import, so the bundler code-splits it and the browser fetches it only
if a snippet actually imports that specifier.

### As a value

```ts
import * as store from '@/lib/store';
modules={{ '@app/store': store }}
```

Simpler to read, but the module is now in your page bundle for every visitor,
used or not. Fine for something tiny; wrong for anything large.

**Use loaders.** A registry of 300 loaders costs nothing at runtime — only
specifiers that appear in the compiled snippet are ever resolved. See
[Scaling](./04-scaling.md) for the measured difference.

## Every import form works

Given `modules={{ '@app/ui': uiModule }}`:

| Snippet writes | Gets |
|---|---|
| `import ui from '@app/ui'` | the module's `default`, or the module itself if it has none |
| `import { Button } from '@app/ui'` | the named export |
| `import * as ui from '@app/ui'` | the namespace |
| `import '@app/ui'` | nothing; runs for side effects |

Registered values are treated as **CommonJS exports objects**: a value with its
own `default` key is unwrapped, and anything else *is* the default. That makes
the common shapes work without configuration:

```ts
'@app/config': { apiUrl: 'https://…' }
// import config from '@app/config'        → the object
// import { apiUrl } from '@app/config'    → the string
```

### The one ambiguous case

Because a value with its own `default` key is unwrapped, an object that
genuinely contains the word `default` gets unwrapped too:

```ts
'@app/theme': { default: 'dark', light: '#fff' }
// import theme from '@app/theme'  →  'dark', not the object
```

When that is not what you meant, say so explicitly with `defineModule`:

```ts
import { defineModule } from 'next-live';

modules={{
  '@app/theme': defineModule({ default: { default: 'dark', light: '#fff' } }),
}}
// import theme from '@app/theme'  →  the whole object
```

`default` and `exports.default` address the same slot — ESM makes no distinction
between a default export and a named export called `default`.

## Always available

Registered for you, no configuration needed:

- `react`
- `react/jsx-runtime`
- `react/jsx-dev-runtime`

The two JSX runtimes are not optional — every JSX tag compiles to a call into
one of them, so without them no snippet would render at all. They come from
**your** React, which is what lets hooks and context work across the boundary.

Your entries merge over these, so you can substitute a React shim if you need to.

`react-dom` is deliberately not included; register it explicitly if snippets
need `createPortal`.

## Prefix entries — one key for a whole subtree

A key ending in `/` claims everything beneath it, and its loader receives the
**full specifier**:

```ts
'big-lib/': defineLoader((specifier) => {
  const subpath = specifier.slice('big-lib/'.length);
  return import(`big-lib/${subpath}`);
}),
```

Now `big-lib/charts/BarChart` and `big-lib/format/currency` both resolve without
enumerating them. There is a build-time cost — see
[Scaling](./04-scaling.md#deep-subpaths).

## Subpath fallback

`resolveSubpaths` lets `pkg/Sub` resolve against a registered `pkg` by reading
`Sub` as a property:

```tsx
<LiveProvider resolveSubpaths modules={{ 'big-lib': bigLib }} />
// 'big-lib/Chart' → bigLib.Chart
```

**Off by default, deliberately.** It is right for barrel-shaped packages and
wrong for packages whose subpaths are not re-exported from the barrel — and a
silently wrong value is worse than a clear error.

## Asset imports are ignored

`import './styles.css'` resolves to an empty module rather than failing, so a
snippet pasted out of a real file still runs. Applies to `.css`, `.scss`,
`.svg`, images, and fonts.

## Free variables: the `scope` prop

For `react-live` compatibility, `scope` injects values as bare identifiers with
no import at all:

```tsx
<LiveProvider scope={{ formatMoney, t }} />
```

```tsx
export default () => <b>{formatMoney(42)}</b>;   // no import needed
```

Both mechanisms work together. Prefer `modules` — an explicit import says where
something came from, and snippets stay closer to real files. Keys that are not
valid identifiers, or that collide with the injected names (`module`, `exports`,
`require`, `React`, `render`), are skipped with a console warning.

## Runtime props

`props` are handed to the component **by reference**, not serialized:

```tsx
<LivePreview props={{ panel, user, store }} />
```

```tsx
export default function App({ panel, user }) {
  return <button onClick={() => panel.setSize(17)}>{user.name}</button>;
}
```

Because nothing is cloned, a snippet calling `panel.setSize(17)` mutates the same
object your app holds and your UI updates. Class instances, functions, and live
handles all survive. This is only possible because snippets run in your page —
an iframe sandbox could not do it.

`props` on `<LivePreview>` merge over `props` on `<LiveProvider>`.

## When a module is missing

```
Module '@ui/coree' is not registered in the next-live scope.

Did you mean '@ui/core'?

Registered modules (7): react, react/jsx-runtime, react/jsx-dev-runtime,
  '@app/store', '@app/ui', 'big-lib/', 'date-fns'

next-live does not bundle npm packages — pass them in explicitly:
  <LiveProvider modules={{ '@ui/coree': theModule }} />
```

One thing to know: an import a snippet never *uses* is removed by the TypeScript
transform before resolution runs, exactly as `tsc` would. So an unused typo does
not error — it simply disappears.

## What the registry is not

It bounds what snippets can **conveniently** reach, not what they **can** reach.
Evaluated code still has `window`, `fetch`, `document`, and your cookies.

Treat the registry as module resolution and ergonomics. It is not a security
boundary — see [Security](./05-security.md).

---

[← Getting started](./01-getting-started.md) · [Docs index](./README.md) · [Sharing libraries →](./03-sharing-your-app-libraries.md)
