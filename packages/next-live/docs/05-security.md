# Security

[← Scaling](./04-scaling.md) · [Docs index](./README.md) · [API reference →](./06-api-reference.md)

Read this before you deploy. It is short, and the first rule is the one that
matters.

## The model in one paragraph

`next-live` runs code with `new Function` on your page. That code has the page's
full authority — cookies, storage, DOM, and your APIs as the signed-in user.
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
your origin — and no CSP setting prevents it, because the execution is by
design. Every other measure here assumes this one holds.

## 2. Treat stored snippets as code

A row in your snippets table is now equivalent to a deploy. Give it the controls
a deploy gets:

- **Authorization on the write path.** Whoever can save a snippet can run
  JavaScript on your site. That endpoint deserves your strictest check.
- **An audit trail** — who changed what, when.
- **Version history**, so you can roll back a bad snippet the way you roll back
  a bad deploy.

## 3. Scope `'unsafe-eval'` to the routes that run snippets

`new Function` requires `'unsafe-eval'` in `script-src`. Next's CSP guide gates
that directive behind a dev-only check, because "Neither React nor Next.js use
`eval` in production by default" — `next-live` does.

It does **not** have to apply to your whole application. In `proxy.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

/** Only these routes evaluate snippets. */
const RUNNER_ROUTES = ['/apps'];

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

> CSP moved to `proxy.ts` in Next 16 — `middleware.ts` was renamed.

## 4. Keep the rest of the policy strict

`'unsafe-eval'` sounds worse than it is. It gates **only** string-to-code APIs
(`eval`, `Function`, `setTimeout("…")`). It does **not** permit loading external
scripts, so `script-src 'self' 'unsafe-eval'` still blocks attacker-hosted code.

Two directives are worth particular attention:

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
incompatible with PPR / `cacheComponents` — a real cost worth weighing.

If CSP does block evaluation, `next-live` detects it and reports what to change
instead of surfacing the browser's raw `EvalError`.

## What is contained, and what is not

**Contained.** Runtime errors and render loops. `<LiveErrorBoundary>` keeps a
broken snippet from taking down the host app, and a render-rate breaker stops
runaway `setState` loops — the common real-world hang. React's own "Maximum
update depth" guard catches the synchronous case, but not an effect that updates
state on every commit; the breaker catches that one.

**Not contained.** A snippet runs with the page's full authority. A synchronous
`while (true)` — in module scope, in render, or in a handler — will hang the tab,
and no timer, `AbortController`, or `Promise.race` can interrupt it, because
JavaScript cannot interrupt synchronous code in its own realm.

The [module registry](./02-module-registry.md) does not change this. It bounds
what snippets can *conveniently* reach, not what they *can* reach — `window`,
`fetch`, and the DOM are always there.

## If your authors stop being trusted

Same-realm evaluation is a stability aid for cooperative authors, not a security
boundary. If snippets ever come from a public marketplace, user-to-user sharing,
or tenants writing code that runs for other tenants' users, none of the above is
sufficient.

What you would need is the preview running in an iframe on a **separate origin**,
which cannot read your cookies or DOM. Know the cost before choosing it: props
would have to cross by structured clone, so you could no longer pass a store, a
library, a function, or any live object by reference — see
[Sharing libraries](./03-sharing-your-app-libraries.md). That is a different
product, and this library does not pretend to be it.

---

[← Scaling](./04-scaling.md) · [Docs index](./README.md) · [API reference →](./06-api-reference.md)
