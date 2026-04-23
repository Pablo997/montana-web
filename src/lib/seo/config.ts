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

/**
 * Language-specific SEO strings.
 *
 * We DO NOT pull these from `messages/*.json` even though they're
 * user-facing. Reasons:
 *   * The sitemap and `<html lang>` run in contexts where the
 *     next-intl provider isn't mounted (static generation of
 *     robots/sitemap, server-side metadata assembly).
 *   * The string list is tiny (7 keywords + 1 description) and
 *     rarely changes, so keeping it inline here avoids an async
 *     message-load dance in every `generateMetadata`.
 * Trade-off: translators have to touch two places when adding a
 * locale. For a product with 2 locales that's fine.
 */
type SiteSeoStrings = {
  description: string;
  /** OpenGraph locale tag (e.g. `es_ES`, `en_US`). */
  ogLocale: string;
  /** HTML `lang` attribute value. */
  htmlLang: string;
  keywords: string[];
};

const SITE_SEO_BY_LOCALE: Record<string, SiteSeoStrings> = {
  es: {
    description:
      'Mapa comunitario en tiempo real de incidencias en montaña, peligros en rutas y puntos de interés.',
    ogLocale: 'es_ES',
    htmlLang: 'es',
    keywords: [
      'incidencias montaña',
      'peligros ruta',
      'senderismo seguro',
      'mapa comunitario',
      'rescate montaña',
      'seguridad outdoor',
      'rutas pirineos',
    ],
  },
  en: {
    description:
      'Community-powered real-time map of mountain incidents, trail hazards and points of interest.',
    ogLocale: 'en_US',
    htmlLang: 'en',
    keywords: [
      'mountain incidents',
      'trail hazards',
      'hiking safety map',
      'real-time incidents',
      'community map',
      'mountain rescue',
      'outdoor safety',
    ],
  },
};

/**
 * Resolve SEO strings for a given locale. Falls back to Spanish
 * (our default) when the locale is unknown so the metadata is never
 * empty — an empty description silently tanks rich-results preview.
 */
export function siteSeo(locale: string | undefined): SiteSeoStrings {
  if (!locale) return SITE_SEO_BY_LOCALE.es;
  const short = locale.toLowerCase().split('-')[0];
  return SITE_SEO_BY_LOCALE[short] ?? SITE_SEO_BY_LOCALE.es;
}

// Kept for BC with modules that imported the constants directly
// (JSON-LD, sitemap, opengraph-image). They always want the neutral
// default, not the request's locale — a crawler's Accept-Language
// is unreliable anyway.
export const SITE_DESCRIPTION = SITE_SEO_BY_LOCALE.es.description;
export const SITE_LOCALE = SITE_SEO_BY_LOCALE.es.ogLocale;
export const SITE_LANG = SITE_SEO_BY_LOCALE.es.htmlLang;
export const SITE_KEYWORDS = SITE_SEO_BY_LOCALE.es.keywords;

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
