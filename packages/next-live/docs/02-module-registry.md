# The module registry

[← Getting started](./01-getting-started.md) · [Docs index](./README.md) · [Sharing libraries →](./03-sharing-your-app-libraries.md)

This is the core concept. Everything else follows from it.

If you only remember one thing: **live snippets cannot import anything you did
not register.** You choose what they can reach, and you give each thing a name.

## The mental model

**There is no npm in the browser.** No bundler, no package resolution, no
network fetch for `lodash`. Your application's JavaScript contains only what
*you* imported when it was built.

In normal app code:

```tsx
import { Button } from '@/components/ui/button';
```

Your bundler resolves that path at build time and ships the file. A live snippet
is a **string** that was not part of the build. When it says:

```tsx
import _ from 'lodash';
```

that does not install or fetch lodash. It means "look up `lodash` in the
registry I was given."

You hand real code over through the `modules` prop:

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

Think of `modules` as a **phone book**:

| Snippet writes | Registry key | What loads |
|---|---|---|
| `import { Button } from '@app/ui'` | `'@app/ui'` | Your UI module |
| `import { useCart } from '@app/store'` | `'@app/store'` | Your store |
| `import _ from 'lodash'` | *(missing)* | Error |

The snippet only knows the label. You decide which real code it points to.

## Walkthrough: from string to component

**1. Host setup**

```tsx
<LiveProvider
  code={source}
  modules={{
    '@app/format': defineLoader(() => import('@/lib/format')),
  }}
>
  <LivePreview />
</LiveProvider>
```

**2. Snippet source**

```tsx
import { formatMoney } from '@app/format';

export default function Price() {
  return <p>{formatMoney(99)}</p>;
}
```

**3. Compile** - the import becomes a registry lookup for `'@app/format'`.

**4. Load** - the loader runs `import('@/lib/format')` (lazy, code-split).

**5. Render** - `formatMoney` from your real file is passed to the snippet.

## `scope` vs `modules`

The `scope` prop injects globals; snippets cannot use `import`:

```tsx
<LiveProvider scope={{ useState, Button, formatMoney }} />
```

```tsx
export default () => <Button>{formatMoney(42)}</Button>;
```

**next-live** uses real imports against a registry:

```tsx
modules={{
  '@app/ui': defineLoader(() => import('@/components/ui')),
  '@app/format': defineLoader(() => import('@/lib/format')),
}}
```

```tsx
import { Button } from '@app/ui';
import { formatMoney } from '@app/format';
```

`react` is built in. Everything else you register. Prefer `modules` over `scope`
for new code.

## The key is just a string

A registry key does **not** have to be a real path or a real package name. It is
whatever you want snippet authors to type. These could all point at the same
file:

```tsx
modules={{
  '@app/store': defineLoader(() => import('@/lib/store')),
  '@/store':    defineLoader(() => import('@/lib/store')),
  'my-store':   defineLoader(() => import('@/lib/store')),
}}
```

Pick names that read like a deliberate SDK, not a mirror of your folder tree.
See [Scaling](./04-scaling.md#design-an-sdk-surface-not-a-mirror-of-your-codebase).

## Common mistakes

**Typo in a named export** - the module loads but the export is missing. Fix
the import or re-export from your SDK module.

**Two paths to the same library** - registering a different import path than
your app uses creates two instances (two stores, two React copies). Keep one
canonical path. See [Sharing libraries](./03-sharing-your-app-libraries.md).

**Expecting npm packages to work automatically** - register them explicitly:

```tsx
'date-fns': defineLoader(() => import('date-fns')),
```

**Unused typo imports** - stripped at compile time like TypeScript. Only imports
that survive compilation are resolved.

## Two ways to register

### As a loader: the default choice

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

**Use loaders.** A registry of 300 loaders costs nothing at runtime - only
specifiers that appear in the compiled snippet are ever resolved. See
[Scaling](./04-scaling.md) for the measured difference.

## Organizing your registry in separate files

You do not need a giant `modules={{ … }}` on `<LiveProvider>`. Put the full list
in a dedicated SDK folder and import one object:

```tsx
import { liveModules } from '@/lib/live-sdk';

<LiveProvider code={source} modules={liveModules}>
  <LivePreview />
</LiveProvider>
```

**100 registered loaders does not mean 100 network requests.** Each entry is a
small loader function. next-live scans the compiled snippet and only runs
loaders for specifiers the snippet actually imports.

### Recommended layout

```
lib/live-sdk/
  index.ts              # export liveModules
  ui-modules.ts         # manual group
  format-modules.ts
  store-modules.ts
  vendor.ts             # prefix / npm loaders
  app-modules-glob.ts   # optional auto-register
  modules/
    ui.ts               # re-exports for snippets
    format.ts
    store.ts
```

### Option A: manual groups + `createRegistry`

```ts
// lib/live-sdk/format-modules.ts
export const formatModules = {
  '@app/format': defineLoader(() => import('./modules/format')),
  '@app/x': defineLoader(() => import('@/lib/x')),
};

// lib/live-sdk/index.ts
export const liveModules = createRegistry(
  vendorModules,
  uiModules,
  formatModules,
  storeModules,
);
```

### Option B: `registryFromGlob`

```ts
export const appModulesFromGlob = registryFromGlob(
  import.meta.glob('./modules/*.ts'),
  (path) => `@app/${path.split('/').pop()!.replace(/\.tsx?$/, '')}`,
);
```

Add a file under `modules/` and it is registered automatically.

### Option C: hybrid

Manual groups for special cases (prefix loaders, npm packages) plus glob for
the `./modules/` surface:

```ts
export const liveModules = createRegistry(vendorModules, appModulesFromGlob);
```

The playground uses Option A for `@app/ui`, `@app/format`, and `@app/store`,
with `app-modules-glob.ts` kept as a ready-made Option B example.

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

`default` and `exports.default` address the same slot - ESM makes no distinction
between a default export and a named export called `default`.

## Always available

Registered for you, no configuration needed:

- `react`
- `react/jsx-runtime`
- `react/jsx-dev-runtime`

The two JSX runtimes are not optional, every JSX tag compiles to a call into
one of them, so without them no snippet would render at all. They come from
**your** React, which is what lets hooks and context work across the boundary.

Your entries merge over these, so you can substitute a React shim if you need to.

`react-dom` is deliberately not included; register it explicitly if snippets
need `createPortal`.

## Prefix entries: one key for a whole subtree

A key ending in `/` claims everything beneath it, and its loader receives the
**full specifier**:

```ts
'big-lib/': defineLoader((specifier) => {
  const subpath = specifier.slice('big-lib/'.length);
  return import(`big-lib/${subpath}`);
}),
```

Now `big-lib/charts/BarChart` and `big-lib/format/currency` both resolve without
enumerating them. There is a build-time cost - see
[Scaling](./04-scaling.md#deep-subpaths).

## Subpath fallback

`resolveSubpaths` lets `pkg/Sub` resolve against a registered `pkg` by reading
`Sub` as a property:

```tsx
<LiveProvider resolveSubpaths modules={{ 'big-lib': bigLib }} />
// 'big-lib/Chart' → bigLib.Chart
```

**Off by default, deliberately.** It is right for barrel-shaped packages and
wrong for packages whose subpaths are not re-exported from the barrel - and a
silently wrong value is worse than a clear error.

## Generating entries from the filesystem

### Turbopack: `import.meta.glob`

```ts
import { registryFromGlob } from 'next-live';

export const storeModules = registryFromGlob(
  import.meta.glob('./modules/*.ts'),
  (path) => {
    const name = path.split('/').pop()?.replace(/\.tsx?$/, '');
    return name ? `@app/${name}` : null;
  },
);
```

### Webpack: `require.context`

`registryFromGlob` accepts any `Record<string, () => Promise<unknown>>`. Under
webpack, build that object from `require.context`:

```ts
import { registryFromGlob } from 'next-live';

const context = require.context('./modules', false, /\.tsx?$/);

export const storeModules = registryFromGlob(
  Object.fromEntries(
    context.keys().map((key) => [
      key,
      () => Promise.resolve(context(key)),
    ]),
  ),
  (path) => {
    const name = path.replace(/^\.\//, '').replace(/\.tsx?$/, '');
    return `@app/${name}`;
  },
);
```

See [Scaling](./04-scaling.md#generate-entries-from-the-filesystem) for the
directory rule that silently breaks globs.

## Styling and Tailwind

Snippets can use `className`, but Tailwind only generates CSS for classes it
finds in your **host** source at build time. Arbitrary utility strings inside
stored snippet source will not produce styles unless you safelist them or add
a `@source` scan target.

The reliable pattern is to register UI components whose classes are already
compiled:

```ts
// lib/live-sdk/modules/ui.ts
export { Button, Card, Badge } from '@/components/ui';
```

```tsx
import { Card, Button } from '@app/ui';

export default function App() {
  return (
    <Card>
      <Button>Styled by the host bundle</Button>
    </Card>
  );
}
```

See [Troubleshooting: Tailwind in snippets](./07-troubleshooting.md#tailwind-classes-in-my-snippet-do-nothing).

## Asset imports are ignored

`import './styles.css'` resolves to an empty module rather than failing, so a
snippet pasted out of a real file still runs. Applies to `.css`, `.scss`,
`.svg`, images, and fonts.

## Free variables: the `scope` prop

For legacy snippets, `scope` injects values as bare identifiers with
no import at all:

```tsx
<LiveProvider scope={{ formatMoney, t }} />
```

```tsx
export default () => <b>{formatMoney(42)}</b>;   // no import needed
```

Both mechanisms work together. Prefer `modules` - an explicit import says where
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
handles all survive. This is only possible because snippets run in your page. In
[sandbox mode](./15-sandbox.md) props are copied into the iframe as plain data,
so this does not work there.

`props` on `<LivePreview>` merge over `props` on `<LiveProvider>`.

## When a module is missing

```
Module '@ui/coree' is not registered in the next-live scope.

Did you mean '@ui/core'?

Registered modules (7): react, react/jsx-runtime, react/jsx-dev-runtime,
  '@app/store', '@app/ui', 'big-lib/', 'date-fns'

next-live does not bundle npm packages - pass them in explicitly:
  <LiveProvider modules={{ '@ui/coree': theModule }} />
```

One thing to know: an import a snippet never *uses* is removed by the TypeScript
transform before resolution runs, exactly as `tsc` would. So an unused typo does
not error - it simply disappears.

## What the registry is not

It bounds what snippets can **conveniently** reach, not what they **can** reach.
Evaluated code still has `window`, `fetch`, `document`, and your cookies.

Treat the registry as module resolution and ergonomics. It is not a security
boundary, see [Security](./05-security.md).

---

[← Getting started](./01-getting-started.md) · [Docs index](./README.md) · [Sharing libraries →](./03-sharing-your-app-libraries.md)
