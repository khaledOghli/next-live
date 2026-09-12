/**
 * The routes that evaluate snippets, and therefore need `'unsafe-eval'`.
 *
 * Deliberately shared by two things that must never disagree:
 *
 * 1. `proxy.ts`, which grants the directive per document.
 * 2. `<RunnerLink>`, which forces a real navigation into these routes.
 *
 * Point 2 is the non-obvious one. A Content Security Policy is attached to a
 * **document**, and a Next client-side navigation does not fetch a new
 * document, so the policy from wherever the visitor first landed stays in
 * force for the whole session. Soft-navigating from `/` (no `'unsafe-eval'`)
 * into `/docs` therefore leaves the live demos blocked, even though `/docs`
 * would have been served with the right policy had it been loaded directly.
 *
 * Per-route CSP and client-side routing simply do not compose. The fix is to
 * cross that boundary with a real page load; the cost is one navigation, and
 * the alternative is granting `'unsafe-eval'` application-wide.
 *
 * `/` is in the list because next.config.ts rewrites it to the docs index. The
 * rewrite happens after this proxy runs, so the policy is decided from the
 * incoming `/`, and a visitor landing on the home page and clicking through to
 * a guide would otherwise carry a policy with no `'unsafe-eval'` into it, with
 * every live demo dead on arrival. Matching is exact for `/`: the
 * `startsWith('/' + '/')` branch cannot match a real path, so this grants the
 * directive to the home page only, not to the whole site.
 */
export const RUNNER_ROUTES = ['/', '/playground', '/apps', '/docs'] as const;

/** Whether a pathname is served with `'unsafe-eval'`. */
export function isRunnerRoute(pathname: string): boolean {
  return RUNNER_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
