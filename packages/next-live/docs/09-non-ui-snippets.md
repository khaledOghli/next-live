# Snippets that are not components

[← Integration guide](./08-integration-guide.md) · [Docs index](./README.md) · [Validating in CI →](./10-validating-in-ci.md)

Not everything worth storing as editable code renders something. A control
panel accumulates validators, data transformers, calculated fields, pricing
rules, config builders, plain modules with no UI at all.

`useLiveModule` runs those and hands back their exports.

## The difference

```ts
compile(...)        // insists on a component; throws NoComponentError otherwise
compileModule(...)  // returns whatever the snippet exported
```

```tsx
'use client';

import { useLiveModule } from 'next-live';

export function RulePreview({ source, input }: { source: string; input: number }) {
  const { exports, error, isCompiling } = useLiveModule({ code: source });

  if (error) return <p role="alert">{error.message}</p>;
  if (!exports) return <p>{isCompiling ? 'Compiling…' : null}</p>;

  const validate = exports.validate as ((n: number) => boolean) | undefined;
  return <p>{validate?.(input) ? 'valid' : 'invalid'}</p>;
}
```

The snippet is an ordinary module:

```ts
import { taxRate } from '@app/config';

export function validate(amount: number) {
  return amount > 0 && amount < 10_000;
}

export function total(amount: number) {
  return amount * (1 + taxRate);
}

export const schema = { type: 'number', minimum: 0 };
```

## Typing the exports

Pass a type parameter so consumers are not stuck with `unknown`:

```ts
interface PricingRule {
  validate: (amount: number) => boolean;
  total: (amount: number) => number;
  schema: Record<string, unknown>;
}

const { exports } = useLiveModule<PricingRule>({ code: source });
exports?.total(100);
```

This is a **claim, not a check** - Sucrase strips types without verifying them,
so nothing guarantees the snippet actually matches. Validate the shape at
runtime before trusting it:

```ts
if (typeof exports?.total !== 'function') {
  throw new Error('This rule must export a `total` function.');
}
```

## Outside React

`compileModule` has no React dependency of its own and can be called directly:

```ts
import { compileModule } from 'next-live';

const { exports } = await compileModule({
  code: rule.source,
  modules: { '@app/config': config },
});
```

It still evaluates in the current realm, so the usual rule applies: only run
code whose author you trust. See [Security](./05-security.md).

## What it shares with `useLiveRunner`

Both hooks sit on the same scheduler, so their behaviour is identical in every
respect that matters:

- Nothing is evaluated during the server pass; `exports` is `null` on the
  server and on the client's first render, so hydration cannot mismatch.
- Changes are debounced, and a superseded compile never commits its result.
- A failed recompile keeps the last good `exports` (`keepLastGood`, default on).
- `compileId` increments on every successful run.
- `onCompileSuccess` fires after each successful run with sorted `imports` and
  `durationMs`.

The playground's **API script** tab (`/playground`) fetches non-UI source from
an API route and runs it with `useLiveModule` against `@app/store`.

The one thing it does **not** share: there is no render-loop breaker, because
nothing is being rendered. A snippet that loops inside an exported function
will hang the tab exactly as any other synchronous loop would.

## Choosing between them

| Use | When |
|---|---|
| `useLiveRunner` / `<LiveProvider>` | The snippet renders UI |
| `useLiveModule` | The snippet exports functions, values, or config |

A snippet can do both - export a component *and* helpers. `useLiveRunner` picks
the component; `useLiveModule` gives you everything, including the component
under `exports.default`.

---

[← Integration guide](./08-integration-guide.md) · [Docs index](./README.md) · [Validating in CI →](./10-validating-in-ci.md)
