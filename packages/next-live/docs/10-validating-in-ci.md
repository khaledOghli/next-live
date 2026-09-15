# Validating stored snippets in CI

[← Non-UI snippets](./09-non-ui-snippets.md) · [Docs index](./README.md)

## The problem

Your snippets live in a database, not in your repository. So when you rename
something in your SDK -

```ts
// lib/live-sdk/modules/store.ts
- export { useCart } from '@/lib/store';
+ export { useBasket } from '@/lib/store';
```

- every stored app importing `useCart` breaks. Nothing fails at build time. The
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
import { LIVE_MODULE_KEYS } from '../lib/live-sdk/module-keys';

const apps = await getAllApps();          // [{ id, source }, …]
const failures = validateSnippets(apps, { modules: [...LIVE_MODULE_KEYS] });

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

A working version is in `apps/playground/scripts/validate-apps.ts`. It validates
both the lab catalogue (`lib/apps.ts`) and the shell catalogue
(`lib/shell-apps.ts`), plus a non-UI API script.

### Keeping the key list honest

Do not hand-maintain registry keys. Derive `@app/*` keys from your
`modules/` directory in Node (the playground uses `readdirSync` in
`lib/live-sdk/module-keys.ts` because `import.meta.glob` cannot run in a CI
script). Add a drift check that compares keys on disk to `LIVE_MODULE_KEYS`:

```bash
npm run validate:apps:test -w playground
```

## What it checks, and what it does not

**Checks:**

- The snippet parses and transpiles - syntax and TypeScript-syntax errors, with
  a line and column.
- Every import resolves against your registry, honouring built-ins
  (`react`, the JSX runtimes), prefix entries (`big-lib/`), and ignored asset
  imports.
- Unresolved specifiers come with a "did you mean" suggestion.
- Optional policy flags (all opt-in): `maxSourceBytes`, `forbidNodeBuiltins`,
  `forbidRemoteImports`, `denySpecifiers`. See
  [API reference: validateSnippet](./06-api-reference.md#validatesnippetsource-options).

**Does not check:**

- **Runtime behaviour.** Nothing is evaluated, so a snippet that throws on
  render still passes. That is deliberate - see below.
- **Types.** Sucrase strips them without verifying them, here as everywhere.
- **Named exports within a module.** It confirms `@app/store` is registered,
  not that `useCart` still exists inside it. To catch that, run your own
  `tsc` over the SDK re-export files, which is where the truth lives.
- **Subpath walking** (`resolveSubpaths`), which needs the registry's actual
  values rather than its keys.
- **Imports whose binding is never used.** Sucrase elides them, on the
  assumption that an unused import was a type import. See below - this is not
  the hole it looks like.

### Unused imports report clean, and that is correct

An import nobody references does not appear in `imports`, and no policy flag
fires on it:

```ts
// Reported as ok, with imports: []
import evil from 'https://evil.test/x.js';
export default function App() { return null; }
```

That is not validation missing something. The same Sucrase pass runs in the
browser, so the specifier is stripped from the compiled output too - the module
is never requested at runtime. Validation and execution agree; there is nothing
to catch because nothing happens.

Use the binding and both react as you would expect:

```ts
// ok: false - forbidden-import -> https://evil.test/x.js
import evil from 'https://evil.test/x.js';
export default function App() { return evil; }
```

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

To keep the list honest, derive it from the filesystem rather than maintaining
a parallel list:

```ts
// lib/live-sdk/module-keys.ts - Node-safe, no import.meta.glob
import { readdirSync } from 'node:fs';
import { vendorModules } from './vendor';

const appKeys = readdirSync('./modules')
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => `@app/${f.replace(/\.tsx?$/, '')}`);

export const LIVE_MODULE_KEYS = [...Object.keys(vendorModules), ...appKeys];
```

Do **not** re-export `LIVE_MODULE_KEYS` from the client registry barrel - it
pulls `node:fs` into the browser bundle.

## Validate on write, too

The same function is useful in your control panel's save endpoint, so a broken
app never reaches the database in the first place:

```ts
const result = validateSnippet(source, { modules: MODULE_KEYS });
if (!result.ok) {
  return Response.json({ errors: result.issues }, { status: 422 });
}
```

CI then catches the other direction - apps that were fine when saved and broke
when the SDK changed underneath them.

## Multi-file snippets

A snippet stored as several files is checked with `validateFiles`. It validates
every file, including files nothing imports yet, and counts an import between two
files of the same project as resolved:

```ts
import { validateFiles } from 'next-live/server';

const projects = await getAllProjects(); // [{ id, files, entry }, ...]
let broken = 0;

for (const project of projects) {
  const result = validateFiles(project.files, {
    entry: project.entry,
    modules: [...LIVE_MODULE_KEYS],
  });

  if (result.ok) continue;
  broken++;
  for (const issue of result.issues) {
    const where = issue.line ? `:${issue.line}` : '';
    console.error(`  ${project.id} ${issue.file}${where}: ${issue.message}`);
  }
}

process.exit(broken === 0 ? 0 : 1);
```

A typo in a relative import looks like this:

```
  checkout App.tsx: Module './components/Buton' is not registered. Did you mean './components/Button'?
```

Every issue carries the `file` it was found in. `result.files` holds the full
result for each file, and `result.imports` lists only what the registry has to
supply across the whole project. The options are the same as for
`validateSnippet`, including the policy flags, plus `entry`.

`validateFiles` throws, instead of returning issues, when the `files` record itself
is broken: two keys for the same path, a path above the project root, or an `entry`
that is not one of the files. Those are bugs in the calling code, not in a snippet.

## Manual browser checks before release

Automated browser tests cover undo, indent, and format in Chromium, Firefox, and
WebKit. Paste is verified in Chromium; run these manually before tagging a
release:

- **Firefox #375:** In the playground editor, select all (Ctrl+A / Cmd+A) then
  paste. Pasted text must replace the entire snippet, not append.
- **#409:** Paste the same multi-line chunk five times with the caret at the
  end. No duplication or cursor jump.

Also smoke-check: toggle `renderEditor`, fixed-height editor scroll, Docusaurus
static + live fences side by side.

---

[← Non-UI snippets](./09-non-ui-snippets.md) · [Docs index](./README.md)
