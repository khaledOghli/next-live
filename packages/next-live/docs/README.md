# next-live documentation

Live TSX/JSX evaluation for React, SSR-safe and tuned for the Next.js App Router.

## Guides

| | |
|---|---|
| **[1. Getting started](./01-getting-started.md)** | Install, and a working live preview in four steps. |
| **[2. The module registry](./02-module-registry.md)** | How `import` resolves. The core concept, read this second. |
| **[3. Sharing libraries with your app](./03-sharing-your-app-libraries.md)** | Your app and your snippets both use the same library. Is that two copies? (No.) |
| **[4. Scaling to many apps](./04-scaling.md)** | Keeping the bundle small with hundreds of snippets and a large SDK. |
| **[5. Security](./05-security.md)** | The trust model, and the CSP you need. **Read before deploying.** |
| **[6. API reference](./06-api-reference.md)** | Every export, prop, and type. |
| **[7. Troubleshooting](./07-troubleshooting.md)** | Real error messages and their fixes. |
| **[8. Integration guide](./08-integration-guide.md)** | End-to-end: apps stored in a database, authored in a control panel. |
| **[9. Snippets that are not components](./09-non-ui-snippets.md)** | Validators, transformers, config, code with no UI. |
| **[10. Validating stored snippets in CI](./10-validating-in-ci.md)** | Catch an SDK rename breaking stored apps before your users do. |
| **[11. Docusaurus integration](./11-docusaurus.md)** | Live fences in MDX via `next-live-docusaurus`. |
| **[13. Showing console output](./13-console.md)** | Show what snippets log with `console.log`, right next to the preview. |
| **[14. Snippets with more than one file](./14-multi-file.md)** | Split a snippet into files that import each other, with file tabs. |
| **[15. Sandbox mode](./15-sandbox.md)** | Run snippets written by people you do not trust, in an isolated iframe. |

## Where to start

- **New here?** [Getting started](./01-getting-started.md), then
  [the module registry](./02-module-registry.md).
- **Adding this to a real application?** Jump to the
  [integration guide](./08-integration-guide.md), then try the live
  **`/apps` shell demo** in the playground repository.
- **Something is broken?** [Troubleshooting](./07-troubleshooting.md).
- **About to deploy?** [Security](./05-security.md), it takes ten minutes and
  covers the one rule that actually protects you.
- **Letting anyone write snippets?** Read [sandbox mode](./15-sandbox.md) first.

## Frequently asked

**Does `import` work for any package?**
Only what you register. There is no npm in the browser, see
[the module registry](./02-module-registry.md).

**My app already uses the same library. Two copies?**
No, one instance, which is why a shared store really is shared.
[Details and the cases that break it](./03-sharing-your-app-libraries.md).

**Do I need `'unsafe-eval'` in production?**
Yes, but scoped to the routes that run snippets, not your whole app.
[Security](./05-security.md). In sandbox mode, only the sandbox page needs it.

**Will this bloat my bundle?**
No. The main entry is about **13 KB** minified and gzipped. The editor and its
syntax highlighter (`next-live/editor`), the console panel (`next-live/console`)
and the sandbox code live on separate entries, and the transpiler is a
lazily-fetched chunk. Registering modules as loaders keeps your own
dependencies out of the page too: measured 827 KB → 666 KB.
[Scaling](./04-scaling.md).

**Are TypeScript types checked?**
No. They are stripped, not verified -
[why](./07-troubleshooting.md#my-typescript-errors-are-not-reported).

**Do I need `next/dynamic` with `ssr: false`?**
No. It is already SSR-safe.
[How](./01-getting-started.md#ssr-and-hydration).

**Does this require Next.js?**
No. The library imports only React, it works in Vite, CRA, Remix, or anywhere
React runs. The name reflects where it was designed, not what it needs.

**Can a snippet export something other than a component?**
Yes, `useLiveModule` returns raw exports.
[Non-UI snippets](./09-non-ui-snippets.md).

**How do I know when I break my stored apps?**
Validate them in CI.
[Validating in CI](./10-validating-in-ci.md).

**Do React hooks and Tailwind work in snippets?**
Hooks yes, snippets share your React instance.
[Troubleshooting: hooks](./07-troubleshooting.md#do-react-hooks-work-in-snippets).
Tailwind only through registered UI components or an explicit safelist -
[Module registry: styling](./02-module-registry.md#styling-and-tailwind).

**Can I see what a snippet logs?**
Yes. Put `<LiveConsole>` from `next-live/console` inside the provider.
[Showing console output](./13-console.md).

**Can a snippet have more than one file?**
Yes. Pass `files` instead of `code`, and the files import each other with relative
paths. [Multi-file snippets](./14-multi-file.md).

**Can I run snippets from people I do not trust?**
Not in the page. Use sandbox mode, which runs them in an isolated iframe.
[Sandbox mode](./15-sandbox.md).
