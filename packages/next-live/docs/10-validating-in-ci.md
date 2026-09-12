# Validating stored snippets in CI

[← Non-UI snippets](./09-non-ui-snippets.md) · [Docs index](./README.md)

## The problem

Your snippets live in a database, not in your repository. So when you rename
something in your SDK —

```ts
// lib/live-sdk/modules/store.ts
- export { useCart } from '@/lib/store';
+ export { useBasket } from '@/lib/store';
```

— every stored app importing `useCart` breaks. Nothing fails at build time. The
tests pass. The failure surfaces days later, for whoever opens that app next.

The more apps you have, the worse this gets, and the less anyone wants to
refactor the SDK at all.

## The fix

`validateSnippets` compiles every stored snippet and checks its imports against
your registry. Run it in CI and the rename fails the build instead.

```ts
// scripts/validate-apps.ts
import { validateSnippets } from 'next-live/server';
import { getAllApps } from '../lib/db';

const MODULE_KEYS = ['@app/store', '@app/ui', '@app/data', 'big-lib/'];

const apps = await getAllApps();          // [{ id, source }, …]
const failures = validateSnippets(apps, { modules: MODULE_KEYS });

if (failures.length === 0) {
  console.log(`✓ all ${apps.length} stored apps validate`);
  process.exit(0);
}

console.error(`✗ ${failures.length} of ${apps.length} stored apps are broken:\n`);
for (const { id, result } of failures) {
  for (const issue of result.issues) {
    const where = issue.line ? ` (line ${issue.line})` : '';
    console.error(`  ${id}${where}: ${issue.message}`);
  }
}
process.exit(1);
```

Output when someone renames a module:

```
✗ 1 of 6 stored apps are broken:

  store: Module '@app/store' is not registered. Did you mean '@app/cart'?
```

```yaml
# .github/workflows/ci.yml
- run: npm run validate:apps
```

A working version is in `apps/playground/scripts/validate-apps.ts`.

## What it checks, and what it does not

**Checks:**

- The snippet parses and transpiles — syntax and TypeScript-syntax errors, with
  a line and column.
- Every import resolves against your registry, honouring built-ins
  (`react`, the JSX runtimes), prefix entries (`big-lib/`), and ignored asset
  imports.
- Unresolved specifiers come with a "did you mean" suggestion.

**Does not check:**

- **Runtime behaviour.** Nothing is evaluated, so a snippet that throws on
  render still passes. That is deliberate — see below.
- **Types.** Sucrase strips them without verifying them, here as everywhere.
- **Named exports within a module.** It confirms `@app/store` is registered,
  not that `useCart` still exists inside it. To catch that, run your own
  `tsc` over the SDK re-export files, which is where the truth lives.
- **Subpath walking** (`resolveSubpaths`), which needs the registry's actual
  values rather than its keys.

## Why it never evaluates

Validation is pure static analysis, which buys three things:

1. **Safe on untrusted content.** CI can validate a snippet a user submitted
   without running it.
2. **No DOM, no React, no browser.** It works in a plain Node script or a Route
   Handler.
3. **No side effects.** A snippet that writes to a database at module scope will
   not do so during validation.

The test suite pins this: a snippet that sets a global at module scope validates
successfully *and* leaves the global untouched.

## Keys, not the registry

Pass the registry keys rather than the registry itself:

```ts
validateSnippets(apps, { modules: ['@app/store', 'big-lib/'] });
```

The real registry is full of bundler-specific dynamic imports and is awkward to
load in a plain Node script. `validateSnippet` accepts a registry object too,
if yours is simple enough to import.

To keep the list honest, export it from one place your app and the script both
read:

```ts
// lib/live-sdk/keys.ts — no bundler-specific code, importable anywhere
export const MODULE_KEYS = ['@app/store', '@app/ui', '@app/data'] as const;
```

## Validate on write, too

The same function is useful in your control panel's save endpoint, so a broken
app never reaches the database in the first place:

```ts
const result = validateSnippet(source, { modules: MODULE_KEYS });
if (!result.ok) {
  return Response.json({ errors: result.issues }, { status: 422 });
}
```

CI then catches the other direction — apps that were fine when saved and broke
when the SDK changed underneath them.

---

[← Non-UI snippets](./09-non-ui-snippets.md) · [Docs index](./README.md)
