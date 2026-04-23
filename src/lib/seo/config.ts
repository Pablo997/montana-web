// Central source of truth for every SEO primitive.
//
// Why a module and not inline strings:
//   * Canonical URLs, sitemap entries, OpenGraph tags and JSON-LD all
//     need the *same* site name / description / base URL. Copy-pasting
//     invites drift; one place invites updates.
//   * The base URL has to be absolute for metadataBase, OG images, and
//     the sitemap spec. Vercel gives us `VERCEL_URL` on deployments
//     but it's a host only (`foo.vercel.app`), never a scheme. We
//     prefer an explicit `NEXT_PUBLIC_SITE_URL` and only fall back to
//     the Vercel hint.

export const SITE_NAME = 'Montana';

export const SITE_DESCRIPTION =
  'Community-powered real-time map of mountain incidents, trail hazards and points of interest.';

/** Two-letter locale tag used by OpenGraph and JSON-LD. */
export const SITE_LOCALE = 'en_US';

/** English lang code used on <html lang="..."> and JSON-LD. */
export const SITE_LANG = 'en';

/**
 * Best-effort keyword list. Google ignores the `keywords` meta today
 * but several smaller engines (DuckDuckGo, Kagi, Ecosia's backend)
 * still use it as a hint. Cheap to ship.
 */
export const SITE_KEYWORDS = [
  'mountain incidents',
  'trail hazards',
  'hiking safety map',
  'real-time incidents',
  'community map',
  'mountain rescue',
  'outdoor safety',
];

/**
 * Production host. Order of precedence:
 *   1. `NEXT_PUBLIC_SITE_URL` — explicit override, set this in Vercel
 *      for the final domain you care about (e.g. montana.app).
 *   2. `VERCEL_URL`            — the deployment's own host. Used by
 *      preview / production builds when no override is set. We add
 *      the scheme manually because Vercel returns a host only.
 *   3. `http://localhost:3000` — dev fallback.
 *
 * The return value is always a URL with scheme and no trailing slash;
 * callers can safely concatenate paths like `${SITE_URL}/incidents/x`.
 */
export function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}

/** Memoised value so repeated calls across a render don't re-parse env. */
export const SITE_URL = resolveSiteUrl();

/**
 * Absolute URL builder. Prefer this over string concatenation so we
 * can never accidentally emit `https://foo.com//path` or a relative
 * URL where an absolute one is required.
 */
export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalised}`;
}
