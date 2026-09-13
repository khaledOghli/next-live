# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

[unreleased]: https://github.com/khaledOghli/next-live/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/khaledOghli/next-live/releases/tag/v1.0.0
[0.1.0]: https://github.com/khaledOghli/next-live/releases/tag/v0.1.0
