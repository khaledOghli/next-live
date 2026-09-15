# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-09-15

Three new features, all opt-in. An app that changes nothing keeps its exact 1.0
behaviour: the same context keys, the same error shapes, and no new code running
unless it asks for it.

### Added

- **Console capture.** `<LiveConsole>`, from the new `next-live/console` entry, shows `console.*` output from snippets next to the preview, with level filtering, a clear button and `console.group` indentation. `onConsole` on `<LiveProvider>`, `useLiveRunner`, `useLiveModule`, `compile` and `compileModule` delivers the entries to your own code instead. Capture stays off until one of them is used, and `forwardConsole` decides whether calls still reach the browser console. Also exports `useLiveConsole`, `createConsoleStore`, `serializeValue`, `serializeValues`, `formatConsoleValue` and `formatConsoleArgs`.
- **Multi-file snippets.** `files` and `entry` on `<LiveProvider>`, `useLiveRunner`, `useLiveModule`, `compile` and `compileModule`. Files import each other with relative paths (`./`, `../`, `/`, optional extensions, `index` files), while bare specifiers still go to the registry. Adds `<LiveFileTabs>`, a `file` prop on `<LiveEditor>`, `activeFile`, `onActiveFileChange` and `onFilesChange`, and `files`, `entry`, `activeFile`, `setFile`, `setFiles` and `setActiveFile` on the context.
- **Errors name their file.** Compile and runtime errors from a multi-file snippet carry `file`. `ModuleNotFoundError` carries `importer` and suggests relative paths. `errorPosition` and `formatError` receive `file`.
- **Sandbox mode.** `<LiveProvider sandbox={{ src }}>` runs snippets in a sandboxed iframe instead of the page, for code you do not trust. The new `next-live/sandbox` entry provides `mountSandbox` and `<LiveSandboxRoot>` for the page inside the iframe. Includes origin checks on both sides, a private `MessageChannel`, a watchdog that replaces frozen frames, automatic height, and errors and console output forwarded to `<LiveError>` and `<LiveConsole>`. Adds `LiveSandboxError` (code `SANDBOX`), `serializeError`, `rehydrateError` and `preloadSandboxHost`.
- **Server helpers for projects.** `precompileFiles` and `validateFiles` in `next-live/server`. `precompiledTransform` accepts the record `precompileFiles` returns.
- **Guides.** [Showing console output](./docs/13-console.md), [Multi-file snippets](./docs/14-multi-file.md) and [Sandbox mode](./docs/15-sandbox.md). The security guide now points untrusted authors to sandbox mode.

### Changed

- `code` on `<LiveProvider>` and `useLiveRunner` is now optional, because a snippet can be given as `files` instead. A provider with neither logs a warning in development.
- The sandbox host code is loaded on demand through the internal `next-live/internal/sandbox-host` export, so pages that never use `sandbox` do not download it. That export is an implementation detail, not a public API.
- Bundle sizes, measured minified and gzipped: `next-live` 7.9 KB → 13.2 KB, `next-live/editor` 4.3 KB → 4.6 KB, `next-live/server` 2.1 KB → 3.2 KB. New: `next-live/console` 3.9 KB, the sandbox host 7.5 KB (sandbox mode only), and `next-live/sandbox` 14.0 KB (the sandbox page only). Size budgets in the build tests moved accordingly.

### Fixed

- Errors thrown at the top level of an `export default function` snippet under `<LiveProvider>` lost their line number, because the render-loop instrumentation inserted an extra line. It is now added on the same line.

### Notes

- `LiveErrorCode` gains `'SANDBOX'`. A TypeScript `switch` that checks every code exhaustively needs a new case.
- In sandbox mode `props` are copied into the iframe, so they must be plain data, and `modules`, `scope` and `transform` belong on the sandbox page.

## [1.0.0] - 2026-09-13

### Added

- **Stable 1.0 API**: semver-stable exports across `next-live`, `next-live/editor`, `next-live/server`, and `next-live/prettier`.
- **Editor foundation**: native undo-safe edits via `replaceRange`, multi-line Tab indent, Mod+[ / Mod+] outdent/indent, Enter auto-indent (`autoIndent`, default on).
- **Line highlighting**: `highlightLines`, `highlightLineStyle`, `lineNumbers` on `<LiveEditor>`.
- **Diagnostics**: optional `diagnostics` prop with line highlights and live-region messages.
- **Selection API**: `onSelectionChange`, React 19 `ref` handle (`LiveEditorHandle`), `insertText`, `format()`.
- **Formatting**: optional `format` hook, `formatOnBlur`, `onFormatError`; `createPrettierFormatter` in `next-live/prettier`.
- **Theme-friendly editor styling**: CSS custom properties (`--next-live-font-*`) shared by both editor layers.
- **`wrap` prop**: opt-in `pre-wrap` for long lines (#201).
- **Error codes**: every error class exposes readonly `code` for stable branching.
- **`formatError` on `<LiveProvider>`**: customise error messages for docs and AI-regenerate flows.
- **Real-browser test harness**: `npm run test:browser` (Chromium, Firefox, WebKit) for undo, indent, and format; paste verified in Chromium; Firefox/WebKit paste checked manually before release.

### Changed

- **`<LiveEditor>` Enter**: preserves the current line's leading whitespace by default; pass `autoIndent={false}` for plain newline behaviour.
- **Editor bundle budget**: `editor.js` ceiling raised from 12 KB to 22 KB for indent, selection, format, highlighting, and diagnostics.
- **`aria-keyshortcuts`**: documents Escape, Shift+Alt+F, and Mod+[ / Mod+] on the built-in editor.

### Fixed

- Restored 0.1.0-compatible `LiveErrorBase(message, { cause })` constructor and `RenderLoopError instanceof LiveRuntimeError`.
- One `onChange` per edit; removed duplicate `onInput` handler and post-`replaceRange` callbacks.
- Keyboard: AltGr `[`/`]` no longer indents; Cmd+Enter not intercepted; Shift+Alt+KeyF format shortcut; IME Enter guard.
- Format safety: no focus steal on blur, skip stale/unmounted/unchanged writes; Prettier loads TS plugin only for TS.
- Gutter in its own grid column; visible diagnostics; compile-error live region opt-in via `announceErrors`.
- `formatError` stored in a ref with try/catch; receives `{ line, column }` without forcing context re-renders.
- Real jsdom #413 regression test; stronger editor unit and browser tests.
- Mod+] at line start no longer corrupts text; outdent preserves selection and respects `tabSize`.

### Notes

- **1.0.0 is semver-stable** for documented public APIs. Only exports marked
  `@experimental` in source (see **Experimental APIs** in the API reference,
  e.g. `setTranspiler`, `createRenderBudget`) may change in minor releases.
- `prettier` is an **optional** peer for `next-live/prettier`; `prism-react-renderer` is optional for `next-live/editor`.
- Docusaurus integration ships in the separate **`next-live-docusaurus`** package.

## [0.1.0] - 2026-09-12

### Added

- Live TSX/JSX evaluation for the Next.js App Router with real ESM `import` statements and a module registry.
- Three entry points: `next-live` (provider, preview, hooks, engine), `next-live/editor` (syntax-highlighted editor), `next-live/server` (precompile, validateSnippet).
- `onCodeChange` on `<LiveProvider>`, called when code is edited from inside, not when the `code` prop changes from outside.
- `precompiledTransform` on the client entry, wrap server-precompiled output without pulling Sucrase into the page bundle.
- `validateSnippet` / `validateSnippets` for CI validation of stored snippets.
- `useLiveModule` for non-UI snippets (validators, transformers, config).
- Render-loop breaker, error boundary, SSR-safe hydration, lazy Sucrase loading.
- Error-line highlighting in `<LiveEditor>`, compile and runtime errors mark the reported line in the built-in editor; `LiveEditorRenderProps` exposes `error`, `errorLine`, and `errorColumn` for custom editors.
- `onCompileSuccess` on `<LiveProvider>` / `useLiveRunner` / `useLiveModule`, fires after a successful compile with `compileId`, sorted `imports`, optional `via`, and `durationMs`.
- `CompileResult` and `CompileModuleResult` now include sorted `imports`.
- Opt-in stricter `validateSnippet` options: `maxSourceBytes`, `forbidNodeBuiltins`, `forbidRemoteImports`, `denySpecifiers`.
- `errorPosition` and `PositionedError` exported from `next-live`.
- `resolveSubpaths` on `<LiveProvider>` / `useLiveRunner` / `useLiveModule`, opt in to resolving `pkg/Sub` against a registered `pkg` by property access.

### Changed

- **`<LiveEditor>` is exported from `next-live/editor`, not `next-live`.** Preview-only pages that never edit snippets should import only from `next-live`, measured ~16 KB instead of ~97 KB when Prism is not needed.
- `prism-react-renderer` is an **optional** peer dependency. Package managers do not install it automatically, so run `npm install prism-react-renderer` yourself if you import `next-live/editor`. Preview-only pages need nothing extra.

[unreleased]: https://github.com/khaledOghli/next-live/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/khaledOghli/next-live/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/khaledOghli/next-live/releases/tag/v1.0.0
[0.1.0]: https://github.com/khaledOghli/next-live/releases/tag/v0.1.0
