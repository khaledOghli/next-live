import { NextResponse, type NextRequest } from 'next/server';
import { isRunnerRoute, isSandboxRoute } from '@/lib/runner-routes';

/**
 * Content Security Policy, with `'unsafe-eval'` scoped to the routes that
 * actually run snippets.
 *
 * This is the pattern to copy. `next-live` compiles code at runtime via
 * `new Function`, which requires `'unsafe-eval'` - but that directive does not
 * have to apply to your whole application. Confining it to the runner routes
 * means the rest of the app keeps a clean policy, and a reviewer can see the
 * exception is contained rather than blanket.
 *
 * A CSP is attached to a document, and a client-side navigation fetches no new
 * document - so a soft navigation from a non-runner page would carry the wrong
 * policy into a runner route. `<RunnerLink>` forces a real page load across
 * that boundary; both it and this file read `RUNNER_ROUTES` from
 * `lib/runner-routes.ts` so they cannot disagree.
 *
 * Worth knowing about `'unsafe-eval'`: it only permits string-to-code APIs
 * (`eval`, `Function`, `setTimeout("…")`). It does **not** allow loading
 * external scripts, so `script-src 'self' 'unsafe-eval'` still blocks
 * attacker-hosted script.
 */

/**
 * Local host names the sandbox demo may use in development. Serving the host
 * page from `localhost` and the sandbox from `127.0.0.1` makes them different
 * sites, which is how to see a frozen snippet freeze only its frame.
 */
const DEV_SANDBOX_HOSTS = 'http://localhost:3000 http://127.0.0.1:3000';

function buildCsp(pathname: string, isDev: boolean): string {
  // React uses eval in development to reconstruct server error stacks, so dev
  // needs the directive everywhere regardless of route.
  const needsEval = isDev || isRunnerRoute(pathname);

  const scriptSrc = ["'self'", "'unsafe-inline'", needsEval ? "'unsafe-eval'" : null]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Next injects inline styles; styles are not a script execution vector.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    // The directive that actually bounds a misbehaving snippet: it can read
    // whatever the page can, but it cannot send it anywhere you did not allow.
    // Widen this deliberately, per host, if snippets must call third-party APIs.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    // Pages may frame the sandbox page (see buildSandboxCsp) and nothing else.
    `frame-src 'self'${isDev ? ` ${DEV_SANDBOX_HOSTS}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Production only: over http://localhost, upgrading subresource requests
    // would break asset loading. Gating it on the environment means a real
    // deployment gets it without anyone remembering to switch it on.
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/**
 * The policy for the page inside the sandbox iframe.
 *
 * This page runs code written by strangers, so it gets the strictest policy on
 * the site, with the one exception it cannot work without: `'unsafe-eval'`.
 */
function buildSandboxCsp(isDev: boolean): string {
  return [
    // Keeps the page isolated with an opaque origin even when it is opened
    // directly, or framed by something that left off the sandbox attribute.
    'sandbox allow-scripts',
    "default-src 'self'",
    // The sandbox compiles snippets, so it is the page that needs eval.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    // No network for snippets. Development keeps the dev server's socket.
    `connect-src ${isDev ? "'self' ws: wss:" : "'none'"}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    // Only this site may embed the sandbox.
    `frame-ancestors 'self'${isDev ? ` ${DEV_SANDBOX_HOSTS}` : ''}`,
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  response.headers.set(
    'Content-Security-Policy',
    isSandboxRoute(pathname) ? buildSandboxCsp(isDev) : buildCsp(pathname, isDev),
  );
  return response;
}

export const config = {
  // Without a matcher this runs on every request, including static assets and
  // image optimization - which wastes work and can break asset delivery.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
