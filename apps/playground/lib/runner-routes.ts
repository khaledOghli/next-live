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
 */
export const RUNNER_ROUTES = ['/playground', '/apps', '/docs'] as const;

/** Whether a pathname is served with `'unsafe-eval'`. */
export function isRunnerRoute(pathname: string): boolean {
  return RUNNER_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
