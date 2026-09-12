import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content Security Policy, with `'unsafe-eval'` scoped to the routes that
 * actually run snippets.
 *
 * This is the pattern to copy. `next-live` compiles code at runtime via
 * `new Function`, which requires `'unsafe-eval'` — but that directive does not
 * have to apply to your whole application. Confining it to the runner routes
 * means the rest of the app keeps a clean policy, and a reviewer can see the
 * exception is contained rather than blanket.
 *
 * Worth knowing about `'unsafe-eval'`: it only permits string-to-code APIs
 * (`eval`, `Function`, `setTimeout("…")`). It does **not** allow loading
 * external scripts, so `script-src 'self' 'unsafe-eval'` still blocks
 * attacker-hosted script.
 */

/** Routes that evaluate snippets, and therefore need `'unsafe-eval'`. */
const RUNNER_ROUTES = ['/playground', '/apps'];

function buildCsp(pathname: string, isDev: boolean): string {
  // React uses eval in development to reconstruct server error stacks, so dev
  // needs the directive everywhere regardless of route.
  const needsEval = isDev || RUNNER_ROUTES.some((route) => pathname.startsWith(route));

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
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Add 'upgrade-insecure-requests' when you deploy behind HTTPS. It is
    // omitted here so this demo can be exercised over http://localhost, where
    // upgrading subresource requests would break asset loading.
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  const response = NextResponse.next();

  response.headers.set(
    'Content-Security-Policy',
    buildCsp(request.nextUrl.pathname, isDev),
  );

  return response;
}

export const config = {
  // Without a matcher this runs on every request, including static assets and
  // image optimization — which wastes work and can break asset delivery.
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
