/**
 * The canonical origin, used for sitemap URLs and for resolving the relative
 * `alternates`/`openGraph` URLs in page metadata.
 *
 * Vercel exposes the deployment host but not a scheme, hence the prefix. Set
 * NEXT_PUBLIC_SITE_URL to pin a custom domain.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');
