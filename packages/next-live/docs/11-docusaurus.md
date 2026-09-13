# Docusaurus integration

[Docs index](./README.md)

Interactive demos and a step-by-step walkthrough live on the
[playground docs site](https://next-live-playground.vercel.app/docs/docusaurus).

Install the optional plugin:

Requires React 19 and Docusaurus 3.7+ with `@docusaurus/core` and
`@docusaurus/theme-common` installed in your site.

```bash
npm install next-live next-live-docusaurus prism-react-renderer
```

`docusaurus.config.js`:

```js
import nextLivePlugin from 'next-live-docusaurus';

export default {
  plugins: [
    [nextLivePlugin, { modules: './src/live-modules.ts' }],
  ],
};
```

`src/live-modules.ts` exports your registry values (buttons, hooks wrappers, etc.).

In MDX, add the `live` meta to a fence:

````mdx
```tsx live
import { Button } from '@next-live-docusaurus/modules';

export default function Demo() {
  return <Button>Hello</Button>;
}
```
````

The plugin wraps `@theme/CodeBlock`, renders a static fallback on the server, and mounts `<LiveProvider>` inside `<BrowserOnly>` so hydration stays safe.

See `examples/docusaurus` in the monorepo for a full build. The demo doc uses `slug: /`, so production output is `build/index.html` (not `build/demo/index.html`). After `npm run build`, run `npm run test:smoke` to verify live fences, static title guards, and hydration.
