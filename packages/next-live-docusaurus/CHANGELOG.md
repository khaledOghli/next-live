# Changelog

## [1.0.0] - 2026-09-13

### Added

- Initial release: live TSX/JSX code blocks for Docusaurus 3.7+.
- Theme override at `lib/theme/CodeBlock` (built from `src/theme`).
- `modules` option resolved relative to the site directory.
- Forwards `title`, `showLineNumbers`, and highlight metadata to live blocks.
- Uses `@theme-init/CodeBlock` to avoid self-import loops when the plugin is the topmost theme.
- Parses metastring via `@docusaurus/theme-common/internal` (`parseCodeBlockTitle`, `containsLineNumbers`).
- Live preview scoped with `data-testid="next-live-preview"` for smoke tests.
- Split `LiveBlock` into a lazy-loaded chunk so static fences never pull `next-live` into the SSR bundle.
