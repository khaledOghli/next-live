# next-live

Live TSX/JSX evaluation for the Next.js App Router, real ESM `import`
statements, a module registry instead of a global scope bag, and no hydration
mismatches.

This is the development monorepo. **[→ Package README and documentation](packages/next-live/README.md)**

## Layout

| Path | What it is |
|---|---|
| [`packages/next-live`](packages/next-live) | The published npm package, and [its documentation](packages/next-live/docs/README.md). |
| [`apps/playground`](apps/playground) | A Next.js 16 demo that loads app source from an API and runs it live. |
| `packages/demo-vendor` | A fake third-party package used by the demo to exercise deep subpaths and lazy loading. Not published. |

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000/playground>. Each tab loads a different app's
source from `/api/apps/[id]` and runs it, with real `import` statements resolved
against a registry the page owns.

The demo apps each prove something specific:

| App | Demonstrates |
|---|---|
| Counter | Hooks via a real ESM import |
| Live props | Deep subpaths, and a live object mutated by reference |
| Shared store | The host application's own store, imported by a snippet |
| Lazy heavy module | A large module fetched only when a snippet imports it |
| Shared instance | Host and snippet holding one module, not two copies |
| Inline expression | `react-live`-style bare JSX |

`/rsc-check` is a deliberate double control: a Server Component that imports the
library directly, so the build fails if the published bundle ever loses its
`'use client'` directive - and a route excluded from the CSP runner list, so in
a production build you can see what a blocked evaluation looks like.

## Scripts

```bash
npm run build       # build the library
npm run dev         # run the playground
npm run typecheck   # typecheck every workspace
npm run lint        # lint the playground
```

## License

MIT
