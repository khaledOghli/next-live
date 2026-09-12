## What this changes

<!-- One or two sentences. Link the issue it closes: Closes #123 -->

## Why

<!-- The problem this solves. If it changes public API, say what a consumer has
     to do differently. -->

## Checklist

- [ ] `npm run build -w next-live` passes
- [ ] `npm test -w next-live` passes, and a new test covers the change
- [ ] `npm run typecheck` and `npm run lint` pass
- [ ] Public API changes are in `packages/next-live/CHANGELOG.md` under `## [Unreleased]`
- [ ] Docs in `packages/next-live/docs/` updated, if behavior or API changed
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

## Breaking change?

<!-- No, or: what breaks and how consumers migrate. -->
