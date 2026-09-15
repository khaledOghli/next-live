# Security

[← Scaling](./04-scaling.md) · [Docs index](./README.md) · [API reference →](./06-api-reference.md)

Read this before you deploy. It is short, and the first rule is the one that
matters.

## The model in one paragraph

`next-live` runs code with `new Function` on your page. That code has the page's
full authority - cookies, storage, DOM, and your APIs as the signed-in user.
This is safe when snippet authors are people you trust, and unsafe when they are
not. **Everything below assumes the first.**

## 1. Feed the evaluator only from your own API

This is the rule that protects you.

Snippet source must come from your own authenticated API. Never from a query
parameter, hash fragment, `localStorage`, `postMessage`, or any other channel a
visitor can influence.

```tsx
// ✅ from your API
const { source } = await fetch(`/api/apps/${id}`).then((r) => r.json());

// ❌ never
const source = new URLSearchParams(location.search).get('code');
```

If an attacker can control what reaches `code`, they run arbitrary JavaScript in
your origin - and no CSP setting prevents it, because the execution is by
design. Every other measure here assumes this one holds.

## 2. Treat stored snippets as code

A row in your snippets table is now equivalent to a deploy. Give it the controls
a deploy gets:

- **Authorization on the write path.** Whoever can save a snippet can run
  JavaScript on your site. That endpoint deserves your strictest check.
- **An audit trail**, who changed what, when.
- **Version history**, so you can roll back a bad snippet the way you roll back
  a bad deploy.

## 3. Scope `'unsafe-eval'` to the routes that run snippets

`new Function` requires `'unsafe-eval'` in `script-src`. Next's CSP guide gates
that directive behind a dev-only check, because "Neither React nor Next.js use
`eval` in production by default" - `next-live` does.

It does **not** have to apply to your whole application. In `proxy.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

/** Only these routes evaluate snippets. */
const RUNNER_ROUTES = ['/apps', '/playground'];

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  // React uses eval in development for server error stacks, so dev needs the
  // directive everywhere regardless of route.
  const needsEval =
    isDev || RUNNER_ROUTES.some((r) => request.nextUrl.pathname.startsWith(r));

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${needsEval ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Without a matcher this runs on every request, including static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

A working copy is in `apps/playground/proxy.ts`. The `/rsc-check` route there is
a deliberate control: it is *not* a runner route, so evaluation is blocked and
you can see what the failure looks like.

> CSP moved to `proxy.ts` in Next 16 - `middleware.ts` was renamed.

### The catch: a CSP does not follow a client-side navigation

Route-scoped CSP and client-side routing do not compose, and the failure is
quiet.

A policy is attached to a **document**. A Next `<Link>` navigation fetches no
new document, so the policy from wherever the visitor first landed stays in
force for the rest of the session. Land on `/` (no `'unsafe-eval'`), click a
`<Link>` to `/apps`, and every snippet fails to compile, even though `/apps`
would have been served the right policy had it been loaded directly.

It works in development, because React needs `'unsafe-eval'` there anyway and
the dev branch grants it everywhere. It works if you reload directly onto a
runner route. It breaks on the path most visitors actually take.

Cross that boundary with a real page load:

```tsx
// A link into a runner route must not be a client-side navigation.
<a href="/apps">Open the app</a>       // ✅ new document, correct policy
<Link href="/apps">Open the app</Link> // ❌ keeps the previous page's policy
```

The playground wraps this in a `RunnerLink` component that reads the same
`RUNNER_ROUTES` list the proxy uses, so the two cannot drift. See
`apps/playground/components/RunnerLink.tsx` and `lib/runner-routes.ts`.

The cost is one full page load when entering the runner section. The
alternative is granting `'unsafe-eval'` application-wide, which is the thing
this whole section exists to avoid.

One consequence worth planning for: every page a visitor can reach *from* a
runner route by soft navigation also needs the runner policy, or it needs its
own hard link back. Keeping the runner section contiguous (one prefix, as the
playground does with `/docs`) is simpler than scattering eval-enabled pages
through the app.

## 4. Keep the rest of the policy strict

`'unsafe-eval'` sounds worse than it is. It gates **only** string-to-code APIs
(`eval`, `Function`, `setTimeout("…")`). It does **not** permit loading external
scripts, so `script-src 'self' 'unsafe-eval'` still blocks attacker-hosted code.

**`'unsafe-inline'` in `script-src` is the one weakening worth naming.** The
policy above carries it because Next injects inline bootstrap and streaming
scripts; without it a stock App Router page does not run. On a runner route it
costs you little extra, since `'unsafe-eval'` is already present and is the
stronger capability of the two. Removing it means adopting a nonce, which is
worth doing on your non-runner routes if you can accept the cost described
below, and which buys you nothing on the runner routes themselves.

Two further directives are worth particular attention:

- **`connect-src`** bounds a misbehaving snippet: it can read whatever the page
  can, but it cannot send it anywhere you did not allow. Widen it per-host,
  deliberately.
- **`object-src 'none'`** and **`base-uri 'self'`** close well-known bypasses and
  cost nothing.

### Two things that will not help

- **A nonce is not a substitute.** `'nonce-…'` and `'strict-dynamic'` authorize
  script *elements*; `new Function` is governed solely by `'unsafe-eval'`.
- **A `blob:` URL is not safer.** It runs in the same origin with the same
  powers, and `'strict-dynamic'` causes scheme allowlists like `blob:` to be
  ignored anyway.

Also note that adopting a nonce-based CSP forces fully dynamic rendering and is
incompatible with PPR / `cacheComponents` - a real cost worth weighing.

If CSP does block evaluation, `next-live` detects it and reports what to change
instead of surfacing the browser's raw `EvalError`.

## What is contained, and what is not

**Contained.** Runtime errors and render loops. `<LiveErrorBoundary>` keeps a
broken snippet from taking down the host app, and a render-rate breaker stops
runaway `setState` loops - the common real-world hang. React's own "Maximum
update depth" guard catches the synchronous case, but not an effect that updates
state on every commit; the breaker catches that one.

**Not contained.** A snippet runs with the page's full authority. A synchronous
`while (true)` - in module scope, in render, or in a handler - will hang the tab,
and no timer, `AbortController`, or `Promise.race` can interrupt it, because
JavaScript cannot interrupt synchronous code in its own realm.

The [module registry](./02-module-registry.md) does not change this. It bounds
what snippets can *conveniently* reach, not what they *can* reach, `window`,
`fetch`, and the DOM are always there.

## If your authors stop being trusted

Everything above assumes the people writing snippets are on your side. Running
code in the page is a stability aid for cooperative authors, not a security
boundary. If snippets can come from a public playground, from an AI model, from
users sharing code with each other, or from tenants whose code runs for other
tenants' users, none of the above is enough, however strict the rest of the
policy is.

For those snippets, use [sandbox mode](./15-sandbox.md):

```tsx
<LiveProvider code={source} sandbox={{ src: '/sandbox' }}>
```

It runs each snippet in an iframe that the browser gives an opaque origin, so the
snippet cannot read your cookies, storage or DOM, and cannot call your APIs as the
signed-in user. Your page never compiles or runs the snippet itself.

Know the trade before choosing it:

| | In the page (default) | Sandbox mode |
|---|---|---|
| Who can write snippets | People you trust | Anyone |
| `props` | Passed by reference: stores, functions, live objects | Copied: plain data only |
| Modules | Registered on your page | Registered on the sandbox page |
| `'unsafe-eval'` on your page | Required on runner routes | Not required. Only the sandbox page needs it. |
| A snippet stuck in `while (true)` | Freezes the tab | Freezes the frame, which is replaced. Your page stays responsive when the sandbox is on a separate site. |

Passing a store, a library or a function by reference is what makes in-page
evaluation useful (see [Sharing libraries](./03-sharing-your-app-libraries.md)),
and it is exactly what the sandbox gives up. The [sandbox guide](./15-sandbox.md)
covers the page you host, the headers it needs, and what the isolation does and
does not stop.

---

[← Scaling](./04-scaling.md) · [Docs index](./README.md) · [API reference →](./06-api-reference.md)
