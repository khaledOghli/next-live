# API reference

[← Security](./05-security.md) · [Docs index](./README.md) · [Troubleshooting →](./07-troubleshooting.md)

Everything is exported as a **named** binding from `next-live`, never as a
property on a parent object. Across the RSC boundary a Server Component receives
a *client reference*, so `Live.Preview` would resolve to `undefined`.

```ts
import { LiveProvider, LivePreview, defineLoader } from 'next-live';
import { precompile } from 'next-live/server';
```

## Components

### `<LiveProvider>`

Compiles `code` and provides the result to its children. Everything else must be
inside it.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `code` | `string` | — | The snippet. Controlled: change it and the preview follows. |
| `modules` | `ModuleRegistry` | `{}` | Specifier → value or loader. Merges over the built-ins. |
| `scope` | `LiveScope` | `{}` | Free variables injected as bare identifiers. |
| `props` | `Record<string, unknown>` | `{}` | Passed to the component **by reference**. |
| `fallback` | `ReactNode` | `null` | Rendered until the first compile finishes. |
| `language` | `string` | `'tsx'` | Highlighting hint for `<LiveEditor>`. |
| `onError` | `(error: Error) => void` | — | Called on every compile and runtime error. |
| `debounce` | `number` | `150` | Milliseconds before recompiling after a change. |
| `keepLastGood` | `boolean` | `true` | Keep the last working component mounted when a recompile fails. |
| `maxRendersPerSecond` | `number` | `1000` | Render-loop breaker threshold. |
| `transform` | `TransformFn` | — | Replace the built-in Sucrase pass (e.g. server-precompiled output). |
| `resolveSubpaths` | `boolean` | `false` | Resolve `pkg/Sub` against a registered `pkg` by property access. |
| `filePath` | `string` | `'LiveCode.tsx'` | Name shown in stack traces and DevTools. |
| `production` | `boolean` | `true` | `false` selects `react/jsx-dev-runtime` for richer stacks. |
| `jsxRuntime` | `'automatic' \| 'classic'` | `'automatic'` | |
| `jsxImportSource` | `string` | `'react'` | Register `<source>/jsx-runtime` if you change this. |

### `<LivePreview>`

Renders the compiled component inside an error boundary.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `props` | `Record<string, unknown>` | — | Merged over the provider's `props`. |
| `fallback` | `ReactNode` | provider's | Shown until the first compile finishes. |
| `as` | `ElementType` | `'div'` | Wrapper element. |
| `className` / `style` | | | Applied to the wrapper. |

### `<LiveEditor>`

A `<textarea>` layered over syntax-highlighted output. No editor engine, so it
stays small and has no SSR quirks.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `renderEditor` | `(props: LiveEditorRenderProps) => ReactNode` | — | Replace the built-in editor entirely. |
| `theme` | `PrismTheme` | `themes.vsDark` | From `prism-react-renderer`. |
| `readOnly` | `boolean` | `false` | |
| `tabSize` | `number` | `2` | Spaces inserted by the Tab key. |
| `padding` | `number` | `16` | |
| `className` / `style` | | | |

Dropping in a different editor:

```tsx
<LiveEditor
  renderEditor={({ code, onChange, language }) => (
    <CodeMirror value={code} onChange={onChange} lang={language} />
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
`fallback`. Returns:

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

The type parameter is a claim, not a check — validate the shape at runtime. See
[Non-UI snippets](./09-non-ui-snippets.md).

### `useLiveContext`

Reads the surrounding `<LiveProvider>` — for custom editors, toolbars, or status
indicators. Throws if called outside a provider. Returns the `useLiveRunner`
fields plus `props`, `language`, `fallback`, and `reportRuntimeError`.

## Registry helpers

### `defineLoader(load)`

Marks a function as a lazy loader rather than the module value itself. Without
it, a registered component function would be indistinguishable from a loader.

```ts
'@app/store': defineLoader(() => import('@/lib/store'))
```

The loader receives the imported specifier — which is what prefix entries need:

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

## Engine

| Export | Purpose |
|---|---|
| `compile(input)` | Transpile + resolve + evaluate. Returns `{ renderable, via, code }`. Throws if the snippet produced nothing renderable. |
| `compileModule(input)` | The same pipeline, returning `{ exports, code }` with no component required. |
| `transpile(source, options, transform?)` | Source → CommonJS. No evaluation. |
| `preloadTranspiler()` | Warm the Sucrase chunk during idle time. |
| `setTranspiler(module)` | Swap the transpiler. For tests and custom backends. |
| `normalizeModule(value)` | The interop normalisation applied to registry values. |
| `createRequire(resolved)` | The synchronous `require` shim. |
| `resolveModules(options)` | Resolve specifiers against a registry. |
| `createRenderBudget(options)` | The render-loop breaker. |

## Server entry — `next-live/server`

No `'use client'` directive and no React import, so it is safe in Route Handlers
and Server Components.

### `precompile(source, options?)`

Transpiles to the same CommonJS the browser path produces. Returns
`{ code, hash, linePrefixOffset, expression }`, where `hash` is a stable cache
key or ETag.

### `precompiledTransform(result)`

Wraps a precompiled result as a `transform` function, so the client skips
loading Sucrase entirely.

### `validateSnippet(source, options?)`

Statically checks that a snippet compiles and that every import resolves.
Never evaluates, so it is safe to run over untrusted content in CI.

```ts
const result = validateSnippet(source, { modules: ['@app/store', 'big-lib/'] });
// { ok, issues: [{ kind, message, specifier?, suggestion?, line?, column? }], imports }
```

`modules` accepts a registry object or just its keys.

### `validateSnippets(snippets, options?)`

Validates many at once and returns only the failures, as
`{ id, result }[]`. See [Validating in CI](./10-validating-in-ci.md).

## Errors

All extend `LiveError` (exported as `LiveErrorBase` to avoid colliding with the
`<LiveError>` component).

| Class | Raised when |
|---|---|
| `LiveCompileError` | Parse/transpile failure, or CSP blocking `eval`. Carries `line` and `column`. |
| `LiveRuntimeError` | The snippet threw. Carries `line` where it can be mapped. |
| `RenderLoopError` | The render-rate breaker tripped. |
| `ModuleNotFoundError` | An import specifier is not registered. Carries `specifier` and `available`. |
| `NoComponentError` | The snippet produced nothing renderable. |
| `TranspilerLoadError` | Sucrase failed to load (usually a chunk-load failure). |

## Types

`ModuleRegistry`, `ModuleLoader`, `ModuleValue`, `NormalizedModule`, `LiveScope`,
`LiveRenderable`, `LiveRunnerState`, `LiveContextValue`, `CompileOptions`,
`CompileResult`, `CompileInput`, `TranspileOptions`, `TransformFn`,
`TransformResult`, `ExtractionSource`, `UseLiveRunnerOptions`,
`RenderBudgetOptions`, `GlobResult`, `CompileModuleResult`, `LiveModuleState`,
`UseLiveModuleOptions`, `ValidationResult`, `ValidationIssue`,
`ValidationIssueKind`, `ValidateOptions`, plus the props type for each
component.

---

[← Security](./05-security.md) · [Docs index](./README.md) · [Troubleshooting →](./07-troubleshooting.md)
