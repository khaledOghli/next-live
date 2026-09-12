# Releasing next-live

Maintainers only. A release is **a version bump merged to `main`**. Nothing
else: [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) sees a
version the registry does not have, then builds, tests, publishes with
[provenance](https://docs.npmjs.com/generating-provenance-statements), tags the
commit and opens the GitHub Release.

Every other push to `main` runs the same workflow, finds the version already
published, and stops. That is the point: the version is the gate, not the push,
so a docs commit or a merged Dependabot PR is a no-op rather than a failed
publish.

## One-time setup

Both are already in place:

1. **`npm-publish` environment** with the `NPM_TOKEN` secret. Environment-scoped
   rather than repo-scoped, so a pull request from a fork can never read it.
   Deployments are restricted to `main` and `v*` tags.
2. **Granular npm token** scoped to the `next-live` package, read/write.

If the token ever needs rotating: npmjs.com → Access Tokens → Granular, then
Settings → Environments → `npm-publish` → Secrets → `NPM_TOKEN`.

## Cutting a release

```bash
git switch develop && git pull
```

1. Bump `version` in `packages/next-live/package.json`. Pre-1.0, a breaking
   change bumps the **minor**.
2. In `packages/next-live/CHANGELOG.md`, rename `## [Unreleased]` to
   `## [x.y.z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and
   update the comparison links at the bottom. The workflow **fails** if the
   version has no matching `## [x.y.z]` section, so this is not optional.
3. Commit, then merge to `main`:

```bash
git commit -am "chore(release): v0.2.0"
git push origin develop
```

Then open a PR from `develop` to `main`, or fast-forward it directly. The
publish starts as soon as it lands on `main`.

Do **not** create the tag yourself, the workflow creates and pushes `vx.y.z`
after a successful publish. A tag you push by hand only ends up pointing at a
different commit than the one that shipped.

## Dry run

Actions → **Publish to npm** → Run workflow, with **dry-run** left checked. That
runs the whole build, test and `npm pack --dry-run` path without publishing,
which is how to check the tarball after changing `files` or the tsup config.

## After it publishes

```bash
npm view next-live version
npm install next-live@latest     # in a scratch project, confirm the entries resolve
```

The provenance badge should appear on the npm page within a minute or two. Then
merge `main` back into `develop` so the version bump is not stranded:

```bash
git switch develop && git merge main && git push
```

## If a release is broken

Do not unpublish, npm only allows it within 72 hours and it breaks lockfiles for
anyone who already installed. Deprecate and ship a patch:

```bash
npm deprecate next-live@0.2.0 "Broken build, use 0.2.1 or later"
```
