import Link from 'next/link';
import type { ComponentProps } from 'react';
import { isRunnerRoute } from '@/lib/runner-routes';

type RunnerLinkProps = Omit<ComponentProps<'a'>, 'href'> & { href: string };

/**
 * A link that crosses the CSP boundary correctly.
 *
 * For a destination that runs snippets it renders a plain `<a>`, forcing a real
 * document request so `proxy.ts` can serve that page its own policy. Everything
 * else gets a normal client-side `<Link>`.
 *
 * Without this, arriving at `/docs` from `/` keeps the landing page's policy —
 * which has no `'unsafe-eval'` — and every live demo silently fails to compile.
 * See `lib/runner-routes.ts` for why a CSP cannot follow a soft navigation.
 */
export function RunnerLink({ href, children, ...anchorProps }: RunnerLinkProps) {
  if (isRunnerRoute(href)) {
    return (
      <a href={href} {...anchorProps}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} {...anchorProps}>
      {children}
    </Link>
  );
}
