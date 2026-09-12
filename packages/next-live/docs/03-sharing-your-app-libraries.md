# Sharing libraries between your app and your snippets

[← Module registry](./02-module-registry.md) · [Docs index](./README.md) · [Scaling →](./04-scaling.md)

## The question

Your app already uses a charting library and a store in its own components:

```tsx
// app/dashboard/page.tsx — your normal application code
import { BarChart } from 'my-charts';
import { useAppStore } from '@/store';
```

And you register the same things so snippets can use them:

```tsx
modules={{
  'my-charts': defineLoader(() => import('my-charts')),
  '@app/store': defineLoader(() => import('@/store')),
}}
```

That looks like importing the same library twice. Is it?

## The answer: one instance, not two

**No — there is exactly one copy.** JavaScript modules are instantiated once per
resolved specifier. Your static `import` and the registry's dynamic `import()`
resolve to the same module, so the bundler hands both the same object. This is
the same reason `import React from 'react'` in fifty files gives you one React.

This is verified in the playground, not assumed. The host page imports a module
and stamps a marker on it:

```tsx
import HostWidget from '@demo/vendor/Widget';
(HostWidget as Record<string, unknown>).__owner = 'host-app';
```

A snippet imports the *same specifier* through the registry and reads it back:

```tsx
import Widget from '@demo/vendor/Widget';
export default () => <b>Widget.__owner = {String(Widget.__owner)}</b>;
```

It renders `Widget.__owner = host-app`. One object. Run the **Shared instance**
demo in the playground to see it.

## Why this matters much more than bundle size

The obvious worry is downloading a library twice. That is real but minor. The
serious consequence is **state**.

If a snippet got its own copy of your store module, it would get its own
*store*. Your app's cart and the snippet's cart would be two unrelated objects. The snippet
would appear to work — no error, no warning — while silently sharing nothing.
Every bug report would be "my changes don't show up".

Because there is one instance, the store a snippet imports **is** your store:

```tsx
// snippet
import { useAppStore } from '@app/store';

export default function App() {
  const cart = useAppStore((s) => s.cart);      // your app's cart
  const add = useAppStore((s) => s.addItem);    // updates your app's UI too
  return <button onClick={() => add('x')}>{cart.length} items</button>;
}
```

The same applies to React itself, React context, and any live object you pass
through `props`.

## No second download either

When your app already imports a module statically, it is in a chunk the page has
already loaded. A snippet importing the same specifier gets the loaded module
back — the browser fetches nothing.

Measured in the playground: selecting the snippet that imports a
host-already-imported module fetched **zero** additional chunks.

The practical consequence is a nice one:

- If your app **already uses** the library, registering it as a loader costs
  nothing extra — the loader just hands over what is already there.
- If your app **does not** use it, the loader keeps it out of your bundle until
  a snippet asks for it.

Either way, registering as a loader is the right call. There is no case where
registering by value is better. See [Scaling](./04-scaling.md).

## When you really do get two copies

The reassuring answer has edges. These are the cases that bite:

### 1. Two versions installed

The most common cause. If your app depends on `zustand@4` and some other
dependency pulls `zustand@5`, npm may install both, and they are genuinely two
different modules with two different stores.

Check before you debug anything else:

```bash
npm ls zustand
npm ls react
```

If you see more than one version, deduplicate:

```bash
npm dedupe
```

or pin a single version with an `overrides` entry in your root `package.json`:

```json
{
  "overrides": {
    "zustand": "5.0.2"
  }
}
```

**Symptom:** state that will not sync, or — for React — `Invalid hook call` and
"more than one copy of React".

### 2. Different specifiers are different modules

`zustand` and `zustand/vanilla` are two modules, even though both "are Zustand".
If your app imports one and your registry maps the other, snippets get the other
one's exports.

Register the specifier your app actually uses.

### 3. You registered a copy, not the module

Spreading a module into a new object breaks live bindings and, for a store,
hands over a snapshot rather than the store:

```ts
'@app/store': { ...storeModule }          // ❌ a copy
'@app/store': defineLoader(() => import('@/store'))   // ✅ the module
```

### 4. Server and client are separate instances

Node and the browser instantiate modules separately. This never affects
snippets, because `next-live` only evaluates on the client — but it is worth
knowing if you keep module-level state and expect it to survive SSR.

## The recommended pattern

Do not register third-party packages directly. Register a **thin re-export
module that you own**:

```ts
// lib/live-sdk/modules/store.ts
export { useAppStore, addItem, clearCart } from '@/store';
```

```ts
// lib/live-sdk/modules/charts.ts
export { BarChart, LineChart } from 'my-charts';
```

Four reasons this is better than pointing at the package:

1. **One path to the thing.** There is no way to accidentally register a
   different specifier than your app uses.
2. **You control the surface.** Snippet authors get the handful of exports you
   support, not every module in the package.
3. **You can refactor.** Move or rename the real implementation and update one
   re-export; every stored snippet keeps working.
4. **It reads as an API.** `@app/charts` is a contract. A deep path into a
   third-party package is an implementation detail leaking into your users' code.

## How to check this in your own app

Drop this snippet into your control panel once, as a smoke test:

```tsx
import { useAppStore } from '@app/store';

export default function InstanceCheck() {
  const state = useAppStore((s) => s);
  return (
    <pre>
      store keys: {Object.keys(state).join(', ')}
      {'\n'}same instance as host: change something in the app UI and watch this update
    </pre>
  );
}
```

If mutating state from your app's own UI updates this snippet live, you have one
instance and everything above holds.

---

[← Module registry](./02-module-registry.md) · [Docs index](./README.md) · [Scaling →](./04-scaling.md)
