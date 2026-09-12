# Security Policy

## Supported versions

next-live is pre-1.0. Security fixes land on the latest minor release only.

| Version | Supported |
|---|---|
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reporting a vulnerability

**Do not open a public issue.**

Report privately through GitHub's
[private vulnerability reporting](https://github.com/khaledOghli/next-live/security/advisories/new).
If that is unavailable to you, email the maintainer listed on the
[GitHub profile](https://github.com/khaledOghli).

Please include:

- the affected version and entry point (`next-live`, `/editor`, `/server`),
- a minimal snippet or registry setup that reproduces it,
- what an attacker gains, and what access they need to get there.

You can expect an acknowledgement within 72 hours and an assessment within
7 days. If the report is valid, you will be credited in the advisory and the
changelog unless you ask otherwise.

## Threat model, read this first

next-live **evaluates code**. That is its purpose, not a flaw. A snippet runs
with the same privileges as the page that hosts it: same origin, same cookies,
same DOM, same `fetch`. Treat every snippet as untrusted code running in your
users' browsers.

The library's job is to make the *module graph* explicit, not to sandbox
execution:

- Only modules you register are importable. There is no ambient global scope.
- `validateSnippet` in `next-live/server` rejects snippets before they are
  stored, with opt-in `forbidNodeBuiltins`, `forbidRemoteImports`,
  `denySpecifiers` and `maxSourceBytes`.
- A CSP without `unsafe-eval` blocks evaluation entirely, by design.

**In scope** for a report: escaping the module registry to reach an
unregistered module; `validateSnippet` accepting something its options say it
must reject; the `'use client'` boundary leaking snippet evaluation into a
Server Component; XSS reachable without the host page storing attacker code.

**Out of scope:** a snippet you chose to run doing something you did not want.
If arbitrary users can author snippets that other users execute, that is a
stored-XSS design in the host application, see
[`packages/next-live/docs/05-security.md`](packages/next-live/docs/05-security.md)
before shipping it.
