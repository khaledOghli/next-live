# next-live-docusaurus

Docusaurus plugin that turns ` ```tsx live ` fences into editable next-live previews.

## Requirements

- React 19+
- Docusaurus 3.7+ with `@docusaurus/core` and `@docusaurus/theme-common` installed in your site
- [next-live](https://www.npmjs.com/package/next-live) ^1
- `prism-react-renderer` (required by `next-live/editor`)

## Compatibility

The theme uses `@docusaurus/theme-common/internal` for metastring parsing (same pattern as `@docusaurus/theme-live-codeblock`). Peer range `^3.7` plus the CI Docusaurus smoke test cover breakage across Docusaurus minors.

## Setup

```js
// docusaurus.config.js
import nextLivePlugin from 'next-live-docusaurus';

export default {
  plugins: [
    [
      nextLivePlugin,
      {
        modules: './src/live-modules.ts',
      },
    ],
  ],
};
```

Mark a fence as live with a `live` metastring token:

````mdx
```tsx live
export default function Demo() {
  return <button>Hello</button>;
}
```
````

## Module registry

Export components from the file passed to `modules`. They are available as `@next-live-docusaurus/modules` inside live snippets.
