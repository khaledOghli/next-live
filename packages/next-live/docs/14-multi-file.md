# Snippets with more than one file

[← Showing console output](./13-console.md) · [Docs index](./README.md) · [Sandbox mode →](./15-sandbox.md)

Real components are rarely one file. A card imports a button, and the button
imports a helper that formats prices. With `files`, a snippet can be split the same
way, and the files import each other with ordinary relative imports.

## Quick start

Pass `files` instead of `code`. Each key is a path, each value is that file's source.

```tsx
'use client';

import { LiveProvider, LivePreview, LiveError, LiveFileTabs } from 'next-live';
import { LiveEditor } from 'next-live/editor';

const files = {
  'App.tsx': `import { PriceTag } from './components/PriceTag';

export default function App() {
  return <PriceTag amount={19.5} />;
}`,

  'components/PriceTag.tsx': `import { Badge } from './Badge';
import { formatPrice } from '../lib/format';
import { theme } from '/theme';

export function PriceTag({ amount }: { amount: number }) {
  return (
    <span style={{ color: theme.accent }}>
      <Badge>Price</Badge> {formatPrice(amount)}
    </span>
  );
}`,

  'components/Badge.tsx': `import { CheckIcon } from '../icons';

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span>
      <CheckIcon /> {children}
    </span>
  );
}`,

  'icons/index.tsx': `export function CheckIcon() {
  return <span aria-hidden>✓</span>;
}`,

  'lib/format.ts': `export function formatPrice(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}`,

  'theme.ts': `export const theme = { accent: '#2563eb' };`,
};

export function Playground() {
  return (
    <LiveProvider files={files}>
      <LiveFileTabs />
      <LiveEditor />
      <LivePreview />
      <LiveError />
    </LiveProvider>
  );
}
```

Here is what you get:

- **`App.tsx` is the entry**, because it is the first key. Its default export is what
  the preview renders.
- **`<LiveFileTabs>`** shows one tab per file.
- **`<LiveEditor>`** edits whichever tab is selected. Nothing else to wire up.

Everything else works as before: the module registry, `props`, errors, the render
loop breaker and SSR safety.

## Choosing the entry file

The entry is the file whose exports get rendered. By default it is the first key of
`files`. Name another one with `entry`:

```tsx
<LiveProvider files={files} entry="components/PriceTag.tsx">
```

## How imports are resolved

Imports between files follow the rules you already know from bundlers:

| From file | This import | Finds |
|---|---|---|
| `components/PriceTag.tsx` | `import { Badge } from './Badge'` | `components/Badge.tsx` |
| `components/PriceTag.tsx` | `import { formatPrice } from '../lib/format'` | `lib/format.ts` |
| `components/PriceTag.tsx` | `import { theme } from '/theme'` | `theme.ts`, from the project root |
| `components/Badge.tsx` | `import { CheckIcon } from '../icons'` | `icons/index.tsx`, a folder with an index file |
| any file | `import { useState } from 'react'` | the module registry, never a file |

The quick start above uses every file import in this table. `react` is the only row that comes from the registry instead of a project file.

In detail:

1. **`./` and `../`** are relative to the importing file. **`/`** starts from the root
   of the project.
2. **The extension is optional.** The exact path is tried first, then `.tsx`, `.ts`,
   `.jsx` and `.js`, then an `index` file with each of those extensions.
3. **Bare specifiers go to the registry.** `react`, `@acme/ui` and anything else that
   does not start with `.` or `/` is looked up in `modules`, exactly as before. A file
   called `react.tsx` can never take the place of React.
4. **Files win over the registry, and the registry is still a fallback.** If a
   relative import matches no file, next-live tries the registry with the exact
   specifier. So a registry key such as `'./theme'` that worked in a single snippet
   keeps working in a project, unless the project has its own `theme` file.

Keys can be written however you like: `'App.tsx'`, `'./App.tsx'` and `'/App.tsx'`
are the same file. Two keys that point to the same file are an error. Errors, tabs
and callbacks always use your key exactly as you wrote it.

## Editing files

`<LiveEditor>` edits the active file, and `<LiveFileTabs>` switches it. To pin an
editor to one file (say, a split view with two editors), use the `file` prop:

```tsx
<LiveEditor file="App.tsx" />
<LiveEditor file="lib/format.ts" />
```

> **Tip for undo.** A single editor switching between files shares one browser undo
> history, so Ctrl+Z after switching tabs can undo an edit made in the other file.
> Give the editor a `key` so each file gets a fresh editor:
>
> ```tsx
> function Editor() {
>   const { activeFile } = useLiveContext();
>   return <LiveEditor key={activeFile} />;
> }
> ```

You can also change files from code. `useLiveContext()` returns these extra fields
for a multi-file snippet:

| Field | What it does |
|---|---|
| `files` | Every file's current source, including edits. |
| `entry` | The key of the entry file. |
| `activeFile` | The key of the file shown in the editor. |
| `setActiveFile(file)` | Shows another file. Does not recompile. |
| `setFile(file, source)` | Replaces one file, or adds a new one, and recompiles. |
| `setFiles(files)` | Replaces every file at once and recompiles. |

For example, a button that adds a file and opens it:

```tsx
function AddFileButton() {
  const { setFile, setActiveFile } = useLiveContext();

  const addFile = () => {
    setFile?.('components/Badge.tsx', `export function Badge() {\n  return <span>New</span>;\n}\n`);
    setActiveFile?.('components/Badge.tsx');
  };

  return <button onClick={addFile}>Add Badge.tsx</button>;
}
```

A single `code` snippet has none of these fields, which is how you can tell the two
apart: `if (live.files) { ... }`.

## Saving edits

`onFilesChange` is called whenever a file is edited from inside, with every file's
current source and the key of the file that changed:

```tsx
<LiveProvider
  files={savedFiles}
  onFilesChange={(files, changedFile) => {
    saveDraft(files);
    console.info(`${changedFile} changed`);
  }}
>
```

`changedFile` is `undefined` after `setFiles`, which replaces everything at once.

The `files` prop works like `code`: when you pass new content, the preview follows.
That makes a fully controlled editor straightforward:

```tsx
'use client';

import { useState } from 'react';

export function ControlledPlayground({ initialFiles }: { initialFiles: Record<string, string> }) {
  const [files, setFiles] = useState(initialFiles);

  return (
    <LiveProvider files={files} onFilesChange={(next) => setFiles(next)}>
      <LiveFileTabs />
      <LiveEditor />
      <LivePreview />
    </LiveProvider>
  );
}
```

Passing the same content back (or a new object with the same content, like an inline
`files={{ ... }}`) never triggers an extra compile. Only real changes do.

> `onCodeChange` is not called for a multi-file snippet. Use `onFilesChange` instead.

## Controlling the active file

Leave `activeFile` out and the tabs manage it for you. Pass it to control it
yourself, for example to keep the open file in the URL:

```tsx
const [activeFile, setActiveFile] = useState('App.tsx');

<LiveProvider files={files} activeFile={activeFile} onActiveFileChange={setActiveFile}>
  <LiveFileTabs />
  <LiveEditor />
</LiveProvider>
```

## File tabs

`<LiveFileTabs>` is an accessible, unstyled tab list. It follows the WAI-ARIA tabs
pattern: Left and Right arrows move between files, Home and End jump to the first and
last. It renders nothing for a single `code` snippet, so it is safe to leave in place.

| Prop | Type | Default | What it does |
|---|---|---|---|
| `order` | `string[]` | the order of `files` | The order of the tabs. Files you leave out follow in their original order. |
| `renderTab` | `(file, state) => ReactNode` | the file key | Replaces a tab's label. `state` has `selected`, `hasError` and `isEntry`. |
| `panelId` | `string` | - | The id of the element the tabs control, for `aria-controls`. |
| `aria-label` | `string` | `'Files'` | The accessible name of the tab list. |
| `className`, `style` | | | Applied to the tab list. |

Each tab has `aria-selected`, plus `data-entry` on the entry file and `data-error` on
the file the current error came from. Showing only the file name, with a marker on a
broken file:

```tsx
<LiveFileTabs
  renderTab={(file, { hasError }) => (
    <>
      {file.split('/').pop()}
      {hasError ? <span aria-label="has an error"> ●</span> : null}
    </>
  )}
/>
```

```css
[data-next-live-file-tabs] [role='tab'][aria-selected='true'] {
  border-bottom: 2px solid currentColor;
}
```

## Errors tell you which file

Every compile and runtime error from a project carries the file it came from:

```ts
error.file; // 'components/PriceTag.tsx'
error.line; // 4
```

Next-live uses that in three places:

- **`<LiveError>`** shows the message with its position.
- **`<LiveFileTabs>`** marks the failing tab with `data-error`.
- **`<LiveEditor>`** underlines the error line only while it shows the file the error
  is in, so line 4 of one file is never painted over another.

`formatError` receives the file in its position argument:

```tsx
<LiveProvider
  files={files}
  formatError={(error, position) =>
    position?.file ? `${position.file}:${position.line}  ${error.message}` : error.message
  }
>
```

A typo in an import names both the file that asked and the file it probably meant:

```
Module './components/PriceTg' is not registered in the next-live scope (imported from 'App.tsx').

Did you mean './components/PriceTag'?
```

## Rules worth knowing

- **Only the entry can be a bare expression.** The entry file can be `<b>hi</b>` or
  use `render()`, like a single snippet. Every other file is a normal module and
  shares what it `export`s.
- **Only imported files are compiled.** A half-written file does not break the preview
  until something imports it. (`validateFiles`, below, checks all of them.)
- **Each file runs once.** Two files importing the same helper get the same instance.
- **Circular imports work, the CommonJS way.** When two files import each other, each
  sees the other's exports as soon as they are defined. That is fine for functions
  called later, but a value read at the very top of a file may still be `undefined`.
- **`useLiveModule` accepts `files` too**, for [non-UI snippets](./09-non-ui-snippets.md)
  split across files.

## On the server

### Precompiling a project

`precompileFiles` from `next-live/server` compiles every file once, so the browser
never downloads the transpiler:

```ts
// app/api/projects/[id]/route.ts
import { precompileFiles } from 'next-live/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.projects.find(id);
  const compiled = precompileFiles(project.files, { entry: project.entry });

  return Response.json({ files: project.files, compiled: compiled.files }, {
    headers: { ETag: compiled.hash },
  });
}
```

```tsx
// On the client
import { LiveProvider, precompiledTransform } from 'next-live';

<LiveProvider files={data.files} transform={precompiledTransform(data.compiled)} />;
```

`compiled.hash` changes whenever any file or the entry changes, so it makes a good
cache key.

### Validating a project in CI

`validateFiles` checks that every file compiles and every import resolves, to another
file or to the registry, without running anything:

```ts
import { validateFiles } from 'next-live/server';

const result = validateFiles(project.files, { modules: Object.keys(liveModules) });

for (const issue of result.issues) {
  console.error(`${issue.file}: ${issue.message}`);
}
process.exitCode = result.ok ? 0 : 1;
```

See [Validating in CI](./10-validating-in-ci.md) for running it over every stored
snippet.

---

[← Showing console output](./13-console.md) · [Docs index](./README.md) · [Sandbox mode →](./15-sandbox.md)
