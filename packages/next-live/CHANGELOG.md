# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

### Changed

- **`<LiveEditor>` is exported from `next-live/editor`, not `next-live`.** Preview-only pages that never edit snippets should import only from `next-live`, measured ~16 KB instead of ~97 KB when Prism is not needed.
- `prism-react-renderer` is an optional peer dependency, installed only when you import `next-live/editor`.

[0.1.0]: https://github.com/khaledoghli/next-live/releases/tag/v0.1.0
