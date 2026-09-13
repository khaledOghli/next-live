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

Three entry points, so you only ship what you use:

| Entry | Contains | Why separate |
|---|---|---|
| `next-live` | Provider, preview, error, hooks, registry, engine | - |
| `next-live/editor` | `<LiveEditor>` | It is the only thing needing `prism-react-renderer`. Measured: a preview-only page pays 16.1 KB instead of 97.2 KB. `prism-react-renderer` is an **optional peer dependency**: npm never installs it automatically, so run `npm install prism-react-renderer` yourself if you use this entry. |
| `next-live/server` | `precompile`, `validateSnippet(s)` | Imports Sucrase statically; must never reach the client bundle. |

## Components

### `<LiveProvider>`

Compiles `code` and provides the result to its children. Everything else must be
inside it.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `code` | `string` | - | The snippet. Controlled: change it and the preview follows. |
| `modules` | `ModuleRegistry` | `{}` | Specifier → value or loader. Merges over the built-ins. |
| `scope` | `LiveScope` | `{}` | Free variables injected as bare identifiers. |
| `props` | `Record<string, unknown>` | `{}` | Passed to the component **by reference**. |
| `fallback` | `ReactNode` | `null` | Rendered until the first compile finishes. |
| `language` | `string` | `'tsx'` | Highlighting hint for `<LiveEditor>`. |
| `onError` | `(error: Error) => void` | - | Called on every compile and runtime error. |
| `formatError` | `(error, position?) => string` | - | Customises `<LiveError>` text. When set, `<LiveError>` does not add a `Line X:Y -` prefix. |
| `onCodeChange` | `(code: string) => void` | - | Called when the code is edited from inside. Not called when the `code` prop changes from outside, so it cannot echo your own saves back. |
| `onCompileSuccess` | `(info: CompileSuccessInfo) => void` | - | Called after every successful compile with `compileId`, sorted `imports`, optional `via`, and `durationMs`. Not called on failure or abort. |
| `debounce` | `number` | `150` | Milliseconds before recompiling after a change. |
| `keepLastGood` | `boolean` | `true` | Keep the last working component mounted when a recompile fails. |
| `maxRendersPerSecond` | `number` | `1000` | Render-loop breaker threshold. |
| `transform` | `TransformFn` | - | Replace the built-in Sucrase pass (e.g. server-precompiled output). |
| `resolveSubpaths` | `boolean` | `false` | Resolve `pkg/Sub` against a registered `pkg` by property access. |
| `filePath` | `string` | `'LiveCode.tsx'` | Name shown in stack traces and DevTools. |
| `production` | `boolean` | `true` | `false` selects `react/jsx-dev-runtime` for richer stacks. |
| `jsxRuntime` | `'automatic' \| 'classic'` | `'automatic'` | |
| `jsxImportSource` | `string` | `'react'` | Register `<source>/jsx-runtime` if you change this. |

### `<LivePreview>`

Renders the compiled component inside an error boundary.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `props` | `Record<string, unknown>` | - | Merged over the provider's `props`. |
| `fallback` | `ReactNode` | provider's | Shown until the first compile finishes. |
| `as` | `ElementType` | `'div'` | Wrapper element. |
| `className` / `style` | | | Applied to the wrapper. |

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
| `autoIndent` | `boolean` | `true` | Enter preserves leading whitespace. Only when no modifier keys are held. |
| `highlightLines` | `string \| number \| number[]` | - | 1-based lines to highlight. |
| `lineNumbers` | `boolean` | `false` | Line-number gutter. Does not combine cleanly with `wrap`. |
| `wrap` | `boolean` | `false` | Soft-wrap long lines. |
| `diagnostics` | `EditorDiagnostic[]` | - | Inline markers and a status list below the editor. |
| `format` | `FormatFn` | - | Async formatter (`next-live/prettier`). Shift+Alt+F when set. |
| `formatOnBlur` | `boolean` | `false` | Run `format` when the editor blurs. |
| `announceErrors` | `boolean` | `false` | Screen-reader live region for provider errors. Off by default for 0.1.0 parity. |
| `onSelectionChange` | `(sel) => void` | - | Selection change callback. |
| `className` / `style` | | | |

`LiveEditorRenderProps` also exposes `error`, `errorLine`, and `errorColumn` for custom editors.

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
| `onError` | `(error: Error) => void` | Required. |
| `resetKey` | `unknown` | Changing it clears the error. Wire to `compileId`. |
| `fallback` | `ReactNode` | Rendered while in the error state. |

## Hooks

### `useLiveRunner`

The headless engine, for building a completely custom UI.

```ts
const { code, setCode, Component, element, error, isCompiling, compileId } =
  useLiveRunner({ code: source, modules, scope });
```

Accepts every `LiveProvider` option except `props`, `language`, `onError`, and
`fallback` - including `onCompileSuccess`. Returns:

| Field | Type | Notes |
|---|---|---|
| `code` | `string` | Current source. |
| `setCode` | `(code: string) => void` | Stable identity. |
| `Component` | `ComponentType \| null` | `null` until the first successful compile, including during SSR. |
| `element` | `ReactElement \| null` | Set instead of `Component` when the snippet produced an element. |
| `error` | `Error \| null` | |
| `isCompiling` | `boolean` | Only true after ~200 ms, so fast compiles never flash a spinner. |
| `compileId` | `number` | Increments on every successful compile. Use as a remount `key`. |

### `useLiveModule`

Runs a snippet and returns its exports, for code that is not a component.

```ts
const { exports, value, error, isCompiling, compileId } =
  useLiveModule<PricingRule>({ code: source, modules });
```

Accepts every `useLiveRunner` option except `maxRendersPerSecond` (nothing is
rendered, so there is no render loop to break). Returns `exports` (null until
the first successful run), `value` as shorthand for `exports?.default`, and the
same `error` / `isCompiling` / `compileId` fields.

The type parameter is a claim, not a check, validate the shape at runtime. See
[Non-UI snippets](./09-non-ui-snippets.md).

### `useLiveContext`

Reads the surrounding `<LiveProvider>`, for custom editors, toolbars, or status
indicators. Throws if called outside a provider. Returns the `useLiveRunner`
fields plus `props`, `language`, `fallback`, and `reportRuntimeError`.

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
| `createRenderBudget(options)` | Configure the render-loop breaker used during evaluation. |

## Engine

| Export | Purpose |
|---|---|
| `compile(input)` | Transpile + resolve + evaluate. Returns `{ renderable, via, code, imports }`. Throws if the snippet produced nothing renderable. |
| `compileModule(input)` | The same pipeline, returning `{ exports, code, imports }` with no component required. |
| `errorPosition(error)` | Reads `{ line, column? }` from a compile or runtime error, if present. |
| `transpile(source, options, transform?)` | Source → CommonJS. No evaluation. |
| `preloadTranspiler()` | Warm the Sucrase chunk during idle time. |
| `precompiledTransform(result)` | Wraps a server-precompiled result as a `transform`, so the client never loads Sucrase. Exported from the **client** entry - importing it from `next-live/server` would pull the transpiler into your page. |
| `setTranspiler(module)` | Swap the transpiler. For tests and custom backends. |
| `normalizeModule(value)` | The interop normalisation applied to registry values. |
| `createRequire(resolved)` | The synchronous `require` shim. |
| `resolveModules(options)` | Resolve specifiers against a registry. |
| `createRenderBudget(options)` | The render-loop breaker. |

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

### `validateSnippet(source, options?)`

Statically checks that a snippet compiles and that every import resolves.
Never evaluates, so it is safe to run over untrusted content in CI.

```ts
const result = validateSnippet(source, { modules: ['@app/store', 'big-lib/'] });
// { ok, issues: [{ kind, message, specifier?, suggestion?, line?, column? }], imports }
```

`modules` accepts a registry object or just its keys.

Optional policy flags (all opt-in; defaults unchanged):

| Option | Notes |
|---|---|
| `maxSourceBytes` | Reject snippets over this UTF-8 byte count before transpile. |
| `forbidNodeBuiltins` | Treat `node:*` imports as forbidden. |
| `forbidRemoteImports` | Treat `https://`, `http://`, and `//` imports as forbidden. |
| `denySpecifiers` | Deny listed specifiers even when registered (prefix `/` denies a subtree). |

### `validateSnippets(snippets, options?)`

Validates many at once and returns only the failures, as
`{ id, result }[]`. See [Validating in CI](./10-validating-in-ci.md).

## Errors

All extend `LiveError` (exported as `LiveErrorBase` to avoid colliding with the
`<LiveError>` component).

| Class | Raised when |
|---|---|
| `LiveCompileError` | Parse/transpile failure, or CSP blocking `eval`. Carries `line` and `column`. |
| `LiveRuntimeError` | The snippet threw. Carries `line` where it can be mapped. `RenderLoopError` extends this. |
| `RenderLoopError` | The render-rate breaker tripped. `instanceof LiveRuntimeError` is true. |
| `ModuleNotFoundError` | An import specifier is not registered. Carries `specifier` and `available`. |
| `NoComponentError` | The snippet produced nothing renderable. |
| `TranspilerLoadError` | Sucrase failed to load (usually a chunk-load failure). |

## Types

`ModuleRegistry`, `ModuleLoader`, `ModuleValue`, `NormalizedModule`, `LiveScope`,
`LiveRenderable`, `LiveRunnerState`, `LiveContextValue`, `CompileOptions`,
`CompileResult`, `CompileInput`, `CompileSuccessInfo`, `TranspileOptions`,
`TransformFn`, `TransformResult`, `ExtractionSource`, `UseLiveRunnerOptions`,
`RenderBudgetOptions`, `GlobResult`, `CompileModuleResult`, `LiveModuleState`,
`UseLiveModuleOptions`, `PositionedError`, `ValidationResult`, `ValidationIssue`,
`ValidationIssueKind` (`syntax`, `unresolved-import`, `source-too-large`,
`forbidden-import`), `ValidateOptions`, plus the props type for each component.

---

[← Security](./05-security.md) · [Docs index](./README.md) · [Troubleshooting →](./07-troubleshooting.md)
