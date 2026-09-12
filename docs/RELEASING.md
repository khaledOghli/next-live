# Releasing next-live

Maintainers only. Releases are tag-driven: pushing a `v*` tag runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which
builds, tests, publishes to npm with
[provenance](https://docs.npmjs.com/generating-provenance-statements), and opens
the GitHub Release.

## One-time setup

1. **`NPM_TOKEN` secret.** Create a *granular access token* on npmjs.com scoped
   to the `next-live` package with read/write, no IP allowlist, then add it under
   Settings → Environments → `npm-publish` → Secrets as `NPM_TOKEN`.
   Environment-scoped, not repo-scoped, so a PR from a fork can never reach it.
2. **`npm-publish` environment.** Settings → Environments → New environment.
   Add yourself as a required reviewer if you want a manual gate before each
   publish.

## Cutting a release

```bash
git switch main && git pull
git merge --ff-only develop            # develop is where work lands
```

1. Bump the version in `packages/next-live/package.json`. Pre-1.0, a breaking
   change bumps the **minor**.
2. In `packages/next-live/CHANGELOG.md`, rename `## [Unreleased]` to
   `## [x.y.z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and
   add the comparison link at the bottom.
3. Commit and tag:

```bash
git commit -am "chore(release): v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin main --follow-tags
```

The workflow refuses to publish if the tag does not match the `package.json`
version, or if the changelog has no matching `## [x.y.z]` section. Both are
cheap guards against publishing the wrong number.

## Dry run

Actions → Release → Run workflow, with **dry-run** left checked. That runs the
whole build, test and `npm pack --dry-run` path without publishing, which is the
way to check the tarball contents after changing `files` or the tsup config.

## After it publishes

```bash
npm view next-live version
npm install next-live@latest      # in a scratch project, confirm the entries resolve
```

Then merge `main` back into `develop` so the version bump is not stranded:

```bash
git switch develop && git merge main && git push
```

## If a release is broken

Do not unpublish, npm only allows it within 72 hours and it breaks lockfiles.
Deprecate and ship a patch:

```bash
npm deprecate next-live@0.2.0 "Broken build, use 0.2.1 or later"
```
