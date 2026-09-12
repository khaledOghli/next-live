# Migrating from `react-live`

[← Validating in CI](./10-validating-in-ci.md) · [Docs index](./README.md)

The component names are deliberately the same, so most of a migration is
mechanical. The one real change is conceptual: **`scope` becomes a module
registry**, and snippets start using real `import` statements.

## The shape stays the same

```tsx
// react-live
import { LiveProvider, LiveEditor, LivePreview, LiveError } from 'react-live';

// next-live
import { LiveProvider, LivePreview, LiveError } from 'next-live';
import { LiveEditor } from 'next-live/editor';
```

The editor is on its own entry point so pages that only *run* snippets do not
pay for a syntax highlighter — measured at 97.2 KB → 16.1 KB for a preview-only
page. If you use the editor, import it from `next-live/editor`.

## `scope` → `modules`

This is the main change. In `react-live`, everything a snippet needs is injected
as a free variable:

```tsx
// react-live
<LiveProvider code={code} scope={{ useState, Button, formatDate }} />
```

```tsx
// the snippet — no imports possible
function App() {
  const [n] = useState(0);
  return <Button>{formatDate(n)}</Button>;
}
```

In `next-live` you register modules, and snippets import from them:

```tsx
// next-live
<LiveProvider
  code={code}
  modules={{
    '@app/ui': defineLoader(() => import('@/components/ui')),
    '@app/format': defineLoader(() => import('@/lib/format')),
  }}
/>
```

```tsx
// the snippet — reads like a real file
import { useState } from 'react';
import { Button } from '@app/ui';
import { formatDate } from '@app/format';

export default function App() {
  const [n] = useState(0);
  return <Button>{formatDate(n)}</Button>;
}
```

`react` is registered for you, so `useState` needs no setup.

### Migrating without rewriting every snippet

`scope` still works, and both mechanisms run together. So you can move over in
two steps: keep `scope` as-is to get running, then convert snippets to imports
at your own pace.

```tsx
<LiveProvider
  code={code}
  scope={{ formatDate }}                                    // old snippets
  modules={{ '@app/ui': defineLoader(() => import('@/ui')) }} // new ones
/>
```

Prefer `modules` for anything new: an explicit import says where a thing came
from, and the snippet stays closer to a real file. See
[the module registry](./02-module-registry.md).

## `noInline` → `render()`

```tsx
// react-live
<LiveProvider code={code} noInline />
```

There is no `noInline` prop. Call `render()` and it is detected automatically:

```tsx
const App = () => <div/>;
render(<App />);
```

All the `react-live` authoring styles still work unchanged — a bare expression,
a bare declaration, or an explicit `export default`. `export default` is the
recommended form for anything you store.

## Prop differences

| `react-live` | `next-live` |
|---|---|
| `scope` | `scope` (kept) **or** `modules` (preferred) |
| `noInline` | not needed — `render()` is detected |
| `transformCode` | `transform` (same idea, typed as `TransformFn`) |
| `language` | `language` (unchanged) |
| `theme` | moved to `<LiveEditor theme={…}>` |
| `enableTypeScript` | always on; TypeScript is stripped by default |
| — | `props` — passed to the component by reference |
| — | `onCodeChange`, `onError` |
| — | `fallback`, `keepLastGood`, `maxRendersPerSecond` |

## Behaviour that differs

**Server rendering.** `react-live` compiles during the server pass, which is the
source of its hydration errors (#418/#425). `next-live` never compiles on the
server: `<LivePreview>` renders `fallback` on the server *and* on the client's
first render, then compiles in an effect. Pass a `fallback` sized like your
content to avoid layout shift.

**A failed edit keeps the last good output.** `react-live` blanks the preview on
every keystroke that is briefly invalid. `next-live` keeps the previous working
component mounted and shows the error alongside it. Set `keepLastGood={false}`
for the old behaviour.

**Runaway renders are stopped.** A `setState` loop trips a breaker at 1000
renders/second instead of freezing the tab. Tune with `maxRendersPerSecond`.

**No npm in the browser, in either library.** If a snippet imports something you
did not register, you get an error naming the specifier and suggesting the
closest match — rather than an undefined variable at runtime.

## Things to check after migrating

- Every specifier your snippets import is registered — run
  [`validateSnippets`](./10-validating-in-ci.md) over your stored code and you
  will get the full list at once.
- Your CSP allows `'unsafe-eval'` on the routes that run snippets. `react-live`
  needs this too; it is easy to have never noticed.
  See [Security](./05-security.md).
- Registry entries are `defineLoader(() => import(...))` rather than values, so
  they code-split. See [Scaling](./04-scaling.md).

---

[← Validating in CI](./10-validating-in-ci.md) · [Docs index](./README.md)
