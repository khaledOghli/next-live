'use client';

import { useSyncExternalStore } from 'react';
import { LiveSandboxRoot } from 'next-live/sandbox';

/**
 * What snippets running in the sandbox may import. It lives here, on the
 * sandbox page, because that is where they run.
 */
const sandboxModules = {
  '@demo/format': {
    formatPrice: (amount: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount),
  },
};

/**
 * Development only: let `localhost` embed a sandbox served from `127.0.0.1`
 * and the other way round, for trying a cross-site sandbox locally.
 */
const DEV_ORIGINS =
  process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const subscribe = () => () => {};

export function SandboxClient() {
  // The demo page embedding this sandbox is served by this same app, so its
  // origin is this page's URL origin. `location` only exists in the browser,
  // so nothing renders on the server.
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => null,
  );
  if (origin === null) return null;

  return <LiveSandboxRoot modules={sandboxModules} allowedOrigins={[...new Set([origin, ...DEV_ORIGINS])]} />;
}
