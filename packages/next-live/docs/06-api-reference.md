# API reference

[← Security](./05-security.md) · [Docs index](./README.md) · [Troubleshooting →](./07-troubleshooting.md)

Everything is exported as a **named** binding from `next-live`, never as a
property on a parent object. Across the RSC boundary a Server Component receives
a *client reference*, so `Live.Preview` would resolve to `undefined`.

```ts
import { LiveProvider, LivePreview, defineLoader } from 'next-live';
import { LiveEditor } from 'next-live/editor';   // separate entry - see below
import { precompile } from 'next-live/server';
```

Several entry points, so you only ship what you use:

| Entry | Contains | Why separate |
|---|---|---|
| `next-live` | Provider, preview, error, file tabs, hooks, registry, engine | - |
| `next-live/editor` | `<LiveEditor>` and the `FormatFn` types | It is the only thing needing `prism-react-renderer`. Measured: a preview-only page pays 16.1 KB instead of 97.2 KB. `prism-react-renderer` is an **optional peer dependency**: npm never installs it automatically, so run `npm install prism-react-renderer` yourself if you use this entry. |
| `next-live/server` | `precompile`, `precompileFiles`, `validateSnippet`, `validateSnippets`, `validateFiles` | Imports Sucrase statically; must never reach the client bundle. |
| `next-live/prettier` | `createPrettierFormatter` | Loads Prettier on the first format, so it costs nothing until then. `prettier` is an **optional peer dependency**. |
| `next-live/console` | `<LiveConsole>`, `useLiveConsole`, value formatting helpers | Only pages that show console output need the panel and its value inspector. |
| `next-live/sandbox` | `mountSandbox`, `<LiveSandboxRoot>` | Used only on the sandbox page. It carries its own copy of the compiler. |

## Components

### `<LiveProvider>`

Compiles `code` (or `files`) and provides the result to its children. Everything
else must be inside it.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `code` | `string` | - | The snippet. Controlled: change it and the preview follows. Pass either `code` or `files`. |
| `files` | `Record<string, string>` | - | A snippet made of several files, keyed by path. Takes precedence over `code`. See [Multi-file snippets](./14-multi-file.md). |
| `entry` | `string` | first key of `files` | The file whose exports are rendered. |
| `activeFile` | `string` | managed internally | The file the editor shows. Pass it to control it yourself. |
| `onActiveFileChange` | `(file: string) => void` | - | Called when the active file changes from inside. |
| `onFilesChange` | `(files, changedFile) => void` | - | Called when a file is edited from inside. The multi-file counterpart of `onCodeChange`. |
| `modules` | `ModuleRegistry` | `{}` | Specifier → value or loader. Merges over the built-ins. |
| `scope` | `LiveScope` | `{}` | Free variables injected as bare identifiers. |
| `props` | `Record<string, unknown>` | `{}` | Passed to the component **by reference**. |
| `fallback` | `ReactNode` | `null` | Rendered until the first compile finishes. |
| `language` | `string` | `'tsx'` | Highlighting hint for `<LiveEditor>`. |
| `onError` | `(error: Error) => void` | - | Called on every compile and runtime error. |
| `formatError` | `(error, position?) => string` | - | Customises `<LiveError>` text. When set, `<LiveError>` does not add a `Line X:Y -` prefix. |
| `onCodeChange` | `(code: string) => void` | - | Called when the code is edited from inside. Not called when the `code` prop changes from outside, so it cannot echo your own saves back. |
| `onCompileSuccess` | `(info: CompileSuccessInfo) => void` | - | Called after every successful compile with `compileId`, sorted `imports`, optional `via`, and `durationMs`. Multi-file snippets also get `entry` and `files`. Not called on failure or abort. |
| `onConsole` | `(entry: ConsoleEntry) => void` | - | Captures `console.*` calls made by the snippet. Capture stays off unless this is set or a `<LiveConsole>` is mounted. See [Showing console output](./13-console.md). |
| `forwardConsole` | `boolean` | `true` | While capturing, still pass each call on to the browser console. |
| `debounce` | `number` | `150` | Milliseconds before recompiling after a change. |
| `keepLastGood` | `boolean` | `true` | Keep the last working component mounted when a recompile fails. |
| `maxRendersPerSecond` | `number` | `1000` | Render-loop breaker threshold. |
| `transform` | `TransformFn` | - | Replace the built-in Sucrase pass (e.g. server-precompiled output). |
| `resolveSubpaths` | `boolean` | `false` | Resolve `pkg/Sub` against a registered `pkg` by property access. |
| `filePath` | `string` | `'LiveCode.tsx'` | Name shown in stack traces and DevTools. |
| `production` | `boolean` | `true` | `false` selects `react/jsx-dev-runtime` for richer stacks. |
| `jsxRuntime` | `'automatic' \| 'classic'` | `'automatic'` | |
| `jsxImportSource` | `string` | `'react'` | Register `<source>/jsx-runtime` if you change this. |
| `sandbox` | `LiveSandboxConfig` | - | Run snippets in a sandboxed iframe instead of the page. `modules`, `scope` and `transform` are then ignored, and `props` must be plain data. See [Sandbox mode](./15-sandbox.md). |
| `signal` | `AbortSignal` | - | Once aborted, the in-flight compile is abandoned and no new compile starts. The last result stays mounted, and no error is reported. |
| `children` | `ReactNode` | - | Everything that reads the provider: preview, editor, error, your own UI. |

### `<LivePreview>`

Renders the compiled component inside an error boundary.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `props` | `Record<string, unknown>` | - | Merged over the provider's `props`. |
| `fallback` | `ReactNode` | provider's | Shown until the first compile finishes. |
| `as` | `ElementType` | `'div'` | Wrapper element. |
| `className` / `style` | | | Applied to the wrapper. |
| `height` | `number \| 'auto'` | `'auto'` | Sandbox mode only. The iframe height, or follow the content. |
| `title` | `string` | `'Live preview'` | Sandbox mode only. The iframe's accessible title. |
| `loading` | `'eager' \| 'lazy'` | `'eager'` | Sandbox mode only. |
| `frameClassName` / `frameStyle` | | | Sandbox mode only. Applied to the iframe element. |

### `<LiveEditor>`

A `<textarea>` layered over syntax-highlighted output. No editor engine, so it
stays small and has no SSR quirks.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `renderEditor` | `(props: LiveEditorRenderProps) => ReactNode` | - | Replace the built-in editor entirely. |
| `theme` | `PrismTheme` | `themes.vsDark` | From `prism-react-renderer`. |
| `prism` | `typeof Prism` | built-in | A Prism instance with extra languages registered. |
| `readOnly` | `boolean` | see below | Defaults to `true` when there is nothing to write edits to. |
| `tabSize` | `number` | `2` | Spaces inserted by the Tab key. |
| `padding` | `number` | `16` | |
| `errorLineStyle` | `CSSProperties \| null` | red inset highlight | Paint-only highlight on the error line. Pass `null` to disable. |
| `errorLineClassName` | `string` | - | Extra class on the error line. |
| `focusRingStyle` | `CSSProperties \| null` | 2px blue outline | Ring painted while the editor holds keyboard focus. |
| `aria-label` | `string` | `'Live code editor'` | Accessible name. |
| `code` | `string` | from context | Standalone mode - see below. |
| `onChange` | `(code: string) => void` | from context | Standalone mode - see below. |
| `language` | `string` | from context, then `'tsx'` | |
| `error` | `Error \| null` | from context | Error to underline. |
| `file` | `string` | the active file | Multi-file snippets: pin this editor to one file. |
| `autoIndent` | `boolean` | `true` | Enter preserves leading whitespace. Only when no modifier keys are held. |
| `highlightLines` | `string \| number \| readonly number[]` | - | 1-based lines to highlight, e.g. `'1,3-5'` or `[2, 4]`. |
| `highlightLineStyle` | `CSSProperties` | pale blue background | Style for `highlightLines` rows. |
| `highlightLineClassName` | `string` | - | Extra class on `highlightLines` rows. |
| `lineNumbers` | `boolean` | `false` | Line-number gutter. Does not combine cleanly with `wrap`. |
| `wrap` | `boolean` | `false` | Soft-wrap long lines. |
| `diagnostics` | `readonly EditorDiagnostic[]` | - | Inline markers and a status list below the editor. Each is `{ line, column?, message, severity? }`, with `severity` `'error'` or `'warning'`. |
| `format` | `FormatFn` | - | Async formatter (`next-live/prettier`). Shift+Alt+F when set. |
| `formatOnBlur` | `boolean` | `false` | Run `format` when the editor blurs. |
| `onFormatError` | `(error: Error) => void` | `console.warn` outside production | Called when `format` rejects. The code is left as it was. |
| `announceErrors` | `boolean` | `false` | Screen-reader live region for provider errors. Off by default for 0.1.0 parity. |
| `onSelectionChange` | `(selection: EditorSelection) => void` | - | Called when the caret or selection changes. `EditorSelection` is `{ start, end, direction, line, column }`. |
| `ref` | `Ref<LiveEditorHandle>` | - | Imperative handle, see below. |
| `className` / `style` | | | |

#### Imperative handle

Pass a `ref` to drive the editor from a toolbar or a keyboard shortcut. The
handle is a `LiveEditorHandle`:

```tsx
const editor = useRef<LiveEditorHandle>(null);

<button onClick={() => editor.current?.insertText('console.log()')}>Insert log</button>
<LiveEditor ref={editor} format={createPrettierFormatter()} />
```

| Method | Type | Notes |
|---|---|---|
| `focus` | `() => void` | Moves keyboard focus into the editor. |
| `getSelection` | `() => EditorSelection \| null` | The current selection, or `null` while the editor is not mounted. |
| `setSelection` | `(start: number, end?: number) => void` | Selects a range. Leave out `end` to place the caret. |
| `insertText` | `(text: string) => void` | Replaces the selection, keeping the edit on the native undo stack. Does nothing when read-only. |
| `format` | `() => Promise<void>` | Runs the `format` prop. Does nothing without one, or when read-only. |

#### Custom editors

`renderEditor` receives a `LiveEditorRenderProps`: `code`, `onChange`,
`language`, `error`, `errorLine`, `errorColumn`, and, when the host provides
them, `diagnostics`, `selection` and `onSelectionChange`.

#### Formatting

`format` takes a `FormatFn`, `(code: string, ctx: FormatContext) => FormatResult`.
`FormatContext` is `{ language, cursorOffset }`, and a `FormatResult` is the new
code, or `{ code, cursorOffset? }` so the caret lands in the right place, either
directly or as a promise. `createPrettierFormatter` from `next-live/prettier`
returns one ready to use.

#### Standalone, without a provider

`<LiveEditor>` normally takes its code from the surrounding `<LiveProvider>`
and sends edits back to it. Pass `code` and it works on its own, which is how
you render a highlighted snippet on a page that is not running anything:

```tsx
import { LiveEditor } from 'next-live/editor';

// Read-only: no onChange, so nothing can be written to.
<LiveEditor code={source} language="tsx" />

// Editable, driven by your own state.
<LiveEditor code={code} onChange={setCode} />
```

With neither a provider nor `code`, the editor throws rather than rendering
empty.

#### Highlighting other languages

`prism-react-renderer` bundles a small language set. For anything else, hand
over a Prism instance you have extended:

```tsx
import { Prism } from 'prism-react-renderer';

(globalThis as typeof globalThis & { Prism?: unknown }).Prism = Prism;
await import('prismjs/components/prism-rust');

<LiveEditor code={source} language="rust" prism={Prism} />
```

#### Keyboard access

Tab inserts spaces, because an editor that moves focus on Tab cannot be typed
into. **Press Escape, then Tab, to move focus out** - the same convention
CodeMirror and Monaco use. The editor announces this through
`aria-keyshortcuts` and a visually-hidden description, and paints a focus ring
while it holds focus, so it satisfies WCAG 2.1.2 (No Keyboard Trap) and 2.4.7
(Focus Visible).

Any other keystroke re-arms indentation, so Escape only ever releases the very
next Tab.

Dropping in a different editor:

```tsx
<LiveEditor
  renderEditor={({ code, onChange, language, errorLine }) => (
    <CodeMirror value={code} onChange={onChange} lang={language} highlightLine={errorLine} />
  )}
/>
```

### `<LiveError>`

Shows the current compile or runtime error; renders nothing when healthy.

| Prop | Type | Default |
|---|---|---|
| `children` | `(error: Error) => ReactNode` | built-in rendering |
| `as` | `ElementType` | `'pre'` |
| `className` / `style` | | |

### `<LiveErrorBoundary>`

Used internally by `<LivePreview>`. Exported for custom UIs.

| Prop | Type | Notes |
|---|---|---|
| `children` | `ReactNode` | Required. The content to guard. |
| `onError` | `(error: Error) => void` | Required. Called when rendering `children` throws. |
| `resetKey` | `unknown` | Required. Changing it clears the error. Wire to `compileId`. |
| `fallback` | `ReactNode` | Rendered while in the error state. |

### `<LiveFileTabs>`

One tab per file of a multi-file snippet. Selecting a tab switches what
`<LiveEditor>` shows. Renders nothing for a single `code` snippet.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `order` | `string[]` | order of `files` | Tab order. Files left out follow in their original order. |
| `renderTab` | `(file, { selected, hasError, isEntry }) => ReactNode` | the key | Replaces a tab's label. |
| `panelId` | `string` | - | Sets `aria-controls` on every tab. |
| `aria-label` | `string` | `'Files'` | |
| `className` / `style` | | | Applied to the tab list. |

Tabs carry `aria-selected`, `data-entry` and `data-error`, and support the arrow,
Home and End keys. See [Multi-file snippets](./14-multi-file.md#file-tabs).

### `<LiveConsole>` (from `next-live/console`)

Shows `console.*` output from the snippet. Mounting it switches capture on.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `levels` | `ConsoleLevel[]` | every level | Only show these levels. |
| `maxEntries` | `number` | `500` | Oldest rows are dropped past this. |
| `clearOnCompile` | `boolean` | `true` | Drop output from earlier compiles when a new one lands. |
| `clearButton` | `boolean` | `true` | Show the "Clear console" button. |
| `announce` | `boolean` | `false` | Announce new output to screen readers. |
| `emptyState` | `ReactNode` | - | Shown while there is no output. |
| `renderEntry` | `(entry: ConsoleEntry, info: LiveConsoleEntryInfo) => ReactNode` | text preview | Replaces a row's content. `info` is `{ preview, serialized, stale }`. |
| `children` | `(state: LiveConsoleState) => ReactNode` | - | Replaces the whole panel. |
| `aria-label` | `string` | `'Console output'` | |
| `className` / `style` | | | Applied to the wrapper. |

See [Showing console output](./13-console.md).

## Hooks

### `useLiveRunner`

The headless engine, for building a completely custom UI.

```ts
const { code, setCode, Component, element, error, isCompiling, compileId } =
  useLiveRunner({ code: source, modules, scope });
```

Accepts every `LiveProvider` prop except `children`, `fallback`, `formatError`,
`language`, `onError`, `props` and `sandbox`. Returns:

| Field | Type | Notes |
|---|---|---|
| `code` | `string` | Current source. |
| `setCode` | `(code: string) => void` | Stable identity. |
| `Component` | `ComponentType \| null` | `null` until the first successful compile, including during SSR. |
| `element` | `ReactElement \| null` | Set instead of `Component` when the snippet produced an element. |
| `error` | `Error \| null` | |
| `isCompiling` | `boolean` | Only true after ~200 ms, so fast compiles never flash a spinner. |
| `compileId` | `number` | Increments on every successful compile. Use as a remount `key`. |

For a multi-file snippet, `code` and `setCode` refer to the active file, and the
result also has `files`, `entry`, `activeFile`, `setActiveFile`, `setFile` and
`setFiles`. A single `code` snippet has none of these fields.

### `useLiveModule`

Runs a snippet and returns its exports, for code that is not a component.

```ts
const { exports, value, error, isCompiling, compileId } =
  useLiveModule<PricingRule>({ code: source, modules });
```

Accepts every `useLiveRunner` option except `maxRendersPerSecond` (nothing is
rendered, so there is no render loop to break). Returns `exports` (null until
the first successful run), `value` as shorthand for `exports?.default`, and the
same `code`, `setCode`, `error`, `isCompiling` and `compileId` fields as
`useLiveRunner`. For a multi-file snippet it also returns `files`, `entry`,
`activeFile`, `setActiveFile`, `setFile` and `setFiles`.

The type parameter is a claim, not a check, validate the shape at runtime. See
[Non-UI snippets](./09-non-ui-snippets.md).

### `useLiveContext`

Reads the surrounding `<LiveProvider>`, for custom editors, toolbars, or status
indicators. Throws if called outside a provider. Returns the `useLiveRunner`
fields plus `props`, `language`, `fallback`, `reportRuntimeError`, and
`formatError` when the provider has one.

Under `<LiveProvider sandbox>` it also returns `sandbox`, with the connection
`status` (`connecting`, `ready`, `unresponsive` or `failed`) and a `reload()`
function. `Component` and `element` stay `null` there, because the snippet runs in
the iframe.

### `useLiveConsole` (from `next-live/console`)

The state behind `<LiveConsole>`, for a custom panel. Mounting it switches capture
on, just like the component.

```ts
const { entries, clear, compileId, isStale } = useLiveConsole({ levels: ['warn', 'error'] });
```

Accepts `maxEntries`, `clearOnCompile` and `levels`, with the same defaults as
`<LiveConsole>`. Returns:

| Field | Type | Notes |
|---|---|---|
| `entries` | `readonly ConsoleEntry[]` | Captured calls, oldest first, filtered by `levels`. |
| `clear` | `() => void` | Empties the list. |
| `compileId` | `number` | The provider's current compile. |
| `isStale` | `(entry: ConsoleEntry) => boolean` | True for output from code that has since been replaced. |

### Console helpers (from `next-live/console`)

For a panel that does not use `<LiveProvider>` at all, or an inspector of your own.

| Export | Purpose |
|---|---|
| `createConsoleStore(options?)` | An external store of entries for `useSyncExternalStore`, with `push`, `clear`, `compiled`, `subscribe` and `getSnapshot`. `ConsoleStoreOptions` takes `maxEntries` and `clearOnCompile`. |
| `serializeValue(value, options?)` | Turns any value into a clone-safe `SerializedValue`. Cycles, functions, DOM nodes and React elements become short descriptions. |
| `serializeValues(values, options?)` | The same for a whole argument list, sharing one size budget. `SerializeOptions` takes `maxDepth` (4), `maxKeys` (100), `maxItems` (100), `maxString` (10 000) and `maxNodes` (2 000). |
| `formatConsoleValue(value, nested?)` | One `SerializedValue` as display text. `nested` quotes strings, the way they read inside an object or array. |
| `formatConsoleArgs(values)` | A whole call as one line, applying `%s`, `%d`, `%i`, `%f`, `%o` and `%O` the way browsers do, and dropping `%c`. |

## Contexts

`useLiveContext` is the way to read a provider. The context objects themselves
are exported for class components and for React's `use()`.

| Export | Value | Notes |
|---|---|---|
| `LiveContext` | `Context<LiveContextValue \| null>` | `null` outside a provider. |
| `LiveConsoleContext` | `Context<LiveConsoleContextValue \| null>` | Used by `<LiveConsole>` to switch capture on. |

## Registry helpers

### `defineLoader(load)`

Marks a function as a lazy loader rather than the module value itself. Without
it, a registered component function would be indistinguishable from a loader.

```ts
'@app/store': defineLoader(() => import('@/lib/store'))
```

The loader receives the imported specifier - which is what prefix entries need:

```ts
'big-lib/': defineLoader((specifier) => import(`big-lib/${specifier.slice(8)}`))
```

### `defineModule({ default, exports })`

Builds an explicit module record. A registered object with its own `default` key
is normally unwrapped; use this when the whole object *is* the default export.
`default` and `exports.default` address the same slot.

### `createRegistry(...groups)`

Merges registry groups, later groups winning. Warns in development when two
groups define the same key.

### `registryFromGlob(glob, toSpecifier)`

Converts `import.meta.glob`'s lazy result into a registry of loaders.
`toSpecifier` maps a file path to the specifier authors write; return `null` to
omit a file. See [Scaling](./04-scaling.md#generate-entries-from-the-filesystem)
for the directory constraint.

### `builtinModules`

The always-registered map: `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`.

## Experimental APIs

These exports are marked `@experimental` in source. They may change in minor
releases without a major bump. Prefer the stable engine surface below for
production integrations.

| Export | Purpose |
|---|---|
| `setTranspiler(module)` | Swap the transpiler implementation. Intended for tests and custom backends. |
| `createRenderBudget(options?)` | Configure the render-loop breaker used during evaluation. |

## Engine

| Export | Purpose |
|---|---|
| `compile(input)` | Transpile + resolve + evaluate. Takes a `CompileInput`, or a `CompileFilesInput` (`{ files, entry }` instead of `code`). Returns `{ renderable, via, code, imports }`, plus `entry` and `files` for a multi-file snippet. Throws if the snippet produced nothing renderable. |
| `compileModule(input)` | The same pipeline, returning `{ exports, code, imports }` with no component required. Accepts `files` too. |
| `errorPosition(error)` | Reads `{ line, column?, file? }` from a compile or runtime error, if present. |
| `serializeError(error)` / `rehydrateError(data)` | Turn any error into plain data and back into a real next-live error class. Used for errors that cross into or out of the sandbox iframe. |
| `preloadSandboxHost()` | Start downloading the sandbox host code before a `<LiveProvider sandbox>` needs it. |
| `transpile(source, options?, transform?)` | Source → CommonJS. No evaluation. |
| `preloadTranspiler()` | Warm the Sucrase chunk during idle time. |
| `precompiledTransform(result)` | Wraps a server-precompiled result as a `transform`, so the client never loads Sucrase. Also accepts the `files` record from `precompileFiles`. Exported from the **client** entry - importing it from `next-live/server` would pull the transpiler into your page. |
| `normalizeModule(value)` | The interop normalisation applied to registry values. Accepts any value. |
| `createRequire(resolved)` | The synchronous `require` shim, over a `ResolvedModules`. |
| `resolveModules(options)` | Resolve specifiers against a registry. Takes a `ResolveOptions` (`registry`, `specifiers`, `resolveSubpaths?`, `signal?`) and returns a `ResolvedModules`. |
| `createRenderBudget(options?)` | The render-loop breaker. Experimental, see above. |
| `setTranspiler(module)` | Experimental, see above. |

## Server entry: `next-live/server`

No `'use client'` directive and no React import, so it is safe in Route Handlers
and Server Components.

### `precompile(source, options?)`

Transpiles to the same CommonJS the browser path produces. Returns a
`PrecompileResult`:

| Field | Type | Meaning |
|---|---|---|
| `code` | `string` | The transpiled CommonJS. |
| `hash` | `string` | Stable hash of the source and the options that affect output. Use it as a cache key or ETag. |
| `linePrefixOffset` | `number` | Lines the wrapper added above the snippet; needed to map error lines back. |
| `expression` | `boolean` | Whether the snippet was compiled as a bare expression rather than a module. |

`PrecompileResult extends TransformResult`, so a result can be handed straight
to [`precompiledTransform`](#engine).

Transpile options, accepted by every function in this entry:

| Option | Type | Default | Notes |
|---|---|---|---|
| `filePath` | `string` | `'LiveCode.tsx'` | Name shown in stack traces. |
| `production` | `boolean` | `true` | `false` selects `react/jsx-dev-runtime`. |
| `jsxRuntime` | `'automatic' \| 'classic'` | `'automatic'` | |
| `jsxImportSource` | `string` | `'react'` | |

Use the same values the client uses, or the precompiled output will not match.

### `validateSnippet(source, options?)`

Statically checks that a snippet compiles and that every import resolves.
Never evaluates, so it is safe to run over untrusted content in CI.

```ts
const result = validateSnippet(source, { modules: ['@app/store', 'big-lib/'] });
// { ok, issues: [{ kind, message, specifier?, suggestion?, line?, column? }], imports }
```

Returns a `ValidationResult`: `ok`, the `issues` found, and the `imports` the
snippet uses. `modules` accepts a registry object or just its keys. The transpile
options above apply too.

Optional policy flags (all opt-in; defaults unchanged):

| Option | Notes |
|---|---|
| `maxSourceBytes` | Reject snippets over this UTF-8 byte count before transpile. |
| `forbidNodeBuiltins` | Treat `node:*` imports as forbidden. |
| `forbidRemoteImports` | Treat `https://`, `http://`, and `//` imports as forbidden. |
| `denySpecifiers` | Deny listed specifiers even when registered. A key ending in `/` denies the whole subtree. |

### `validateSnippets(snippets, options?)`

Validates many `{ id, source }` snippets at once and returns only the failures,
as `{ id, result }[]`. See [Validating in CI](./10-validating-in-ci.md).

### `precompileFiles(files, options?)`

Precompiles every file of a multi-file snippet. Accepts `entry` plus the usual
transpile options, and returns `{ files, entry, hash }`: one `PrecompileResult` per
file under its original key, the entry's key, and a hash of the whole project.
Pass `result.files` to `precompiledTransform` on the client.

### `validateFiles(files, options?)`

Validates a multi-file snippet without running it. Every file must compile, and
every import must resolve to another file or to the registry. Accepts the
`validateSnippet` options plus `entry`, and returns
`{ ok, issues, imports, files }`, where each issue carries the `file` it was found
in. Throws a `LiveCompileError` if the `files` record itself is invalid.

## Sandbox entry: `next-live/sandbox`

For the page inside the sandbox iframe. See [Sandbox mode](./15-sandbox.md).

### `mountSandbox(options)`

Turns the current page into a sandbox and returns a `SandboxMount`, whose
`dispose()` disconnects from the host page and unmounts everything. Throws
straight away if `allowedOrigins` is missing or malformed.

```ts
mountSandbox({ modules: { '@acme/ui': ui }, allowedOrigins: ['https://app.example.com'] });
```

| Option | Type | Default | Notes |
|---|---|---|---|
| `allowedOrigins` | `readonly string[] \| '*'` | - | Required. The host pages allowed to embed the sandbox and send it code, e.g. `['https://app.example.com']`. `'*'` accepts every origin and logs a warning each time. |
| `modules` | `ModuleRegistry` | `{}` | What snippets can import, as on `<LiveProvider>`. |
| `scope` | `LiveScope` | `{}` | Free variables, as on `<LiveProvider>`. |
| `transform` | `TransformFn` | - | A custom transpile step, as on `<LiveProvider>`. |
| `maxCodeChars` | `number` | `1000000` | Largest snippet accepted, in characters, summed across files. |
| `maxFiles` | `number` | `200` | Most files accepted in one multi-file snippet. |
| `onConnect` | `(info: { origin, hostVersion }) => void` | - | Called each time a host page connects. |
| `dangerouslyAllowSameOriginHost` | `boolean` | `false` | Run even when the host page shares the sandbox's origin and did not sandbox the frame, so snippets could reach the host. For local debugging only. |
| `container` | `HTMLElement` | a new `<div>` in `<body>` | Where snippets render. `mountSandbox` only. |
| `window` | `Window` | the global `window` | The window the sandbox runs in. For tests. |

`PROTOCOL_VERSION` is the version of the message protocol between the host page
and the sandbox. Both sides must agree, so deploy the same next-live version to
both pages.

### `<LiveSandboxRoot>`

The same, as a React component, for frameworks that already render the page with
React. Takes the same options as props, except `container` and `window`:
`allowedOrigins` (required), `modules`, `scope`, `transform`, `maxCodeChars`,
`maxFiles`, `onConnect` and `dangerouslyAllowSameOriginHost`.

## Errors

All extend `LiveError` (exported as `LiveErrorBase` to avoid colliding with the
`<LiveError>` component). Every error has a readonly `code`, a `LiveErrorCode`,
which is the stable thing to branch on:

| Class | `code` | Raised when |
|---|---|---|
| `LiveCompileError` | `'COMPILE'` | Parse/transpile failure, or CSP blocking `eval`. Carries `line` and `column`, plus `file` for a multi-file snippet. |
| `LiveRuntimeError` | `'RUNTIME'` | The snippet threw. Carries `line` and `column` where the stack can be mapped, plus `file` for a multi-file snippet. `RenderLoopError` extends this. |
| `RenderLoopError` | `'RENDER_LOOP'` | The render-rate breaker tripped. `instanceof LiveRuntimeError` is true. |
| `ModuleNotFoundError` | `'MODULE_NOT_FOUND'` | An import specifier is not registered. Carries `specifier` and `available`, plus `importer` for a multi-file snippet. |
| `NoComponentError` | `'NO_COMPONENT'` | The snippet produced nothing renderable. |
| `TranspilerLoadError` | `'TRANSPILER_LOAD'` | Sucrase failed to load (usually a chunk-load failure). |
| `LiveSandboxError` | `'SANDBOX'` | Sandbox mode only: see `reason` below. |

`line`, `column`, `file`, `importer` and `reason` are only present when they
apply, so errors from a single in-page snippet have exactly the properties they
had in 1.0.

```ts
if (error instanceof LiveRuntimeError && error.line !== undefined) {
  highlight(error.line, error.column);
}
```

`LiveSandboxError` carries a `reason`, a `LiveSandboxErrorReason`:

| `reason` | Meaning |
|---|---|
| `'invalid-config'` | `sandbox.src` or `allowedOrigins` is not valid. |
| `'same-origin-refused'` | `allowSameOrigin` was set for a sandbox on the page's own origin. |
| `'load-failed'` | The frame could not be reached. |
| `'handshake-timeout'` | The sandbox page did not answer in time. |
| `'origin-rejected'` | The sandbox refused this page's origin. |
| `'protocol-mismatch'` | The host page and the sandbox run incompatible next-live versions. |
| `'unresponsive'` | The sandbox stopped answering, usually a snippet stuck in a loop. |
| `'restart-limit'` | It froze too often and was not restarted again. |
| `'props-not-cloneable'` | `props` held something that cannot be copied into the iframe. |

## Types

`ModuleRegistry`, `ModuleLoader`, `ModuleValue`, `NormalizedModule`, `LiveScope`,
`LiveRenderable`, `LiveRunnerState`, `LiveContextValue`, `CompileOptions`,
`CompileResult`, `CompileInput`, `CompileSuccessInfo`, `TranspileOptions`,
`TransformFn`, `TransformResult`, `ExtractionSource`, `UseLiveRunnerOptions`,
`RenderBudgetOptions`, `GlobResult`, `CompileModuleResult`, `LiveModuleState`,
`UseLiveModuleOptions`, `PositionedError`, `ValidationResult`, `ValidationIssue`,
`ValidationIssueKind` (`syntax`, `unresolved-import`, `source-too-large`,
`forbidden-import`), `ValidateOptions`, `LiveErrorCode`, `FormatErrorFn`,
`FormatErrorPosition`, `PrecompileResult`, `TransformResult`, and the props type
for each component: `LiveProviderProps`, `LivePreviewProps`, `LiveErrorProps`,
`LiveErrorBoundaryProps`, `LiveFileTabsProps`, `LiveEditorProps`,
`LiveEditorRenderProps`, `LiveEditorHandle`, `EditorSelection`,
`EditorDiagnostic`; from `next-live/prettier`: `PrettierFormatterOptions`.

Added in 1.1: `CompileFilesInput`, `LiveProjectState`, `ConsoleEntry`,
`ConsoleLevel`, `ConsoleMethod`, `LiveConsoleContextValue`, `LiveSandboxConfig`,
`SandboxPermission`, `SandboxStatus`, `SandboxHandle`, `SandboxFrameProps`,
`SerializedError`, `LiveSandboxErrorReason`, `PrecompileFilesOptions`,
`PrecompileFilesResult`, `ValidateFilesOptions`, `FilesValidationResult`,
`FileValidationIssue`; from `next-live/console`: `LiveConsoleState`,
`UseLiveConsoleOptions`, `ConsoleStore`, `SerializedValue`; from
`next-live/sandbox`: `MountSandboxOptions`, `SandboxRuntimeOptions`,
`LiveSandboxRootProps`, `SandboxMount`; from `next-live/console`: `LiveConsoleProps`,
`LiveConsoleEntryInfo`, `ConsoleStoreOptions`, `SerializeOptions`.

Added in 1.2: `ResolvedModules` and `ResolveOptions`, the types of `createRequire`
and `resolveModules`; `FormatFn`, `FormatContext` and `FormatResult`, from both
`next-live/editor` and `next-live/prettier`.

---

[← Security](./05-security.md) · [Docs index](./README.md) · [Troubleshooting →](./07-troubleshooting.md)
