# next-live documentation

Live TSX/JSX evaluation for the Next.js App Router.

## Guides

| | |
|---|---|
| **[1. Getting started](./01-getting-started.md)** | Install, and a working live preview in four steps. |
| **[2. The module registry](./02-module-registry.md)** | How `import` resolves. The core concept — read this second. |
| **[3. Sharing libraries with your app](./03-sharing-your-app-libraries.md)** | Your app and your snippets both use the same library. Is that two copies? (No.) |
| **[4. Scaling to many apps](./04-scaling.md)** | Keeping the bundle small with hundreds of snippets and a large SDK. |
| **[5. Security](./05-security.md)** | The trust model, and the CSP you need. **Read before deploying.** |
| **[6. API reference](./06-api-reference.md)** | Every export, prop, and type. |
| **[7. Troubleshooting](./07-troubleshooting.md)** | Real error messages and their fixes. |
| **[8. Integration guide](./08-integration-guide.md)** | End-to-end: apps stored in a database, authored in a control panel. |

## Where to start

- **New here?** [Getting started](./01-getting-started.md), then
  [the module registry](./02-module-registry.md).
- **Adding this to a real application?** Jump to the
  [integration guide](./08-integration-guide.md).
- **Something is broken?** [Troubleshooting](./07-troubleshooting.md).
- **About to deploy?** [Security](./05-security.md) — it takes ten minutes and
  covers the one rule that actually protects you.

## Frequently asked

**Does `import` work for any package?**
Only what you register. There is no npm in the browser — see
[the module registry](./02-module-registry.md).

**My app already uses the same library. Two copies?**
No, one instance — which is why a shared store really is shared.
[Details and the cases that break it](./03-sharing-your-app-libraries.md).

**Do I need `'unsafe-eval'` in production?**
Yes, but scoped to the routes that run snippets, not your whole app.
[Security](./05-security.md).

**Will this bloat my bundle?**
Not if you register loaders. Measured: 827 KB → 666 KB.
[Scaling](./04-scaling.md).

**Are TypeScript types checked?**
No. They are stripped, not verified —
[why](./07-troubleshooting.md#my-typescript-errors-are-not-reported).

**Do I need `next/dynamic` with `ssr: false`?**
No. It is already SSR-safe.
[How](./01-getting-started.md#ssr-and-hydration).
