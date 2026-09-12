# Contributing to next-live

Thanks for taking the time to contribute. This document covers the mechanics;
if something here is wrong or missing, a PR fixing it is a fine first
contribution.

## Getting set up

```bash
git clone https://github.com/khaledOghli/next-live.git
cd next-live
npm install
npm run dev          # runs the playground at http://localhost:3000/playground
```

Node >= 20.9 is required, and CI tests on 20.19, 22 and 24.

## Repository layout

| Path | What it is |
|---|---|
| `packages/next-live` | The published npm package. |
| `apps/playground` | A Next.js demo that loads app source from an API and runs it live. |
| `packages/demo-vendor` | A fake third-party package the demo uses to exercise deep subpaths. Not published. |

## Before you open a pull request

Run the same checks CI runs:

```bash
npm run build -w next-live      # must come first: the playground consumes dist/
npm run build -w playground     # generates the route types typecheck needs
npm test -w next-live
npm run typecheck
npm run lint
```

`npm test -w next-live` includes `test/build.test.ts`, which asserts the shape
of the published bundle (entry points, type declarations, the `'use client'`
directive). It only does that if `dist/` exists, so build before you test.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`, `chore(scope): ...`.
  Scopes in use: `next-live`, `playground`, `build`, `docs`, `ci`.
- **Branches** come off `develop`. `main` is the released branch.
- **Tests** live next to what they cover in `packages/next-live/test`. A bug fix
  should come with a test that fails without it.
- **Public API changes** need a matching entry in
  [`packages/next-live/CHANGELOG.md`](packages/next-live/CHANGELOG.md) under
  `## [Unreleased]`, and a docs update in `packages/next-live/docs/`.

## Working on the library

`npm run dev:lib` rebuilds `packages/next-live` on change, including the
`'use client'` stamping step. Run it alongside `npm run dev` and the playground
picks up changes without a manual rebuild.

Two invariants are easy to break and expensive to miss:

- **The `'use client'` directive** must survive the build on every client
  entry. `scripts/add-use-client.mjs` stamps it; `/rsc-check` in the playground
  fails the build if it is ever lost.
- **One `LiveContext` per page**, however many copies of the module a bundler
  produces. See `packages/next-live/src/shared.ts`.

## Reporting bugs and asking for features

Use the [issue templates](https://github.com/khaledOghli/next-live/issues/new/choose).
For anything security-related, do **not** open an issue, follow
[SECURITY.md](SECURITY.md) instead.

## Releasing

Maintainers only, see [`docs/RELEASING.md`](docs/RELEASING.md).

## Code of conduct

This project ships a [Code of Conduct](CODE_OF_CONDUCT.md). By participating you
agree to uphold it.

## License

Contributions are licensed under the [MIT License](LICENSE) that covers the
project.
