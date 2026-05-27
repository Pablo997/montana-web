import { ImageResponse } from 'next/og';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, normaliseLocale, type Locale } from '@/i18n/config';

// Dynamic Open Graph image for the home page.
//
// Next.js automatically registers this file as the default OG image
// for `/`, links to it from `<meta property="og:image">` and serves
// it pre-rendered at build time. We intentionally *don't* generate
// per-incident images here — those would be expensive at runtime and
// Vercel's function budget doesn't like them. For incident pages we
// fall back to the first attached photo (see `loadFirstMediaUrl`).
//
// Design choices:
//   * No external fonts. `ImageResponse` requires remote fetch +
//     pre-registration to use custom fonts; system sans renders fine
//     at 1200×630 and keeps the build deterministic.
//   * A subtle radial gradient picks up the brand greens without
//     needing a bitmap asset.
//   * Large wordmark + tagline — the exact two pieces of info a
//     Twitter/Discord/Slack preview has real estate for.
//   * Locale-aware copy: we read `NEXT_LOCALE` (or `Accept-Language`)
//     and render the heading + subtitle in the right language. Social
//     bots typically don't send our cookie, so most embeds will show
//     the language hinted by `Accept-Language`, which lines up with
//     the user's own browser when they paste the link.

export const runtime = 'edge';
export const alt = 'Montana — Real-time mountain incidents';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Copy per locale. Kept here (not in `messages/*.json`) because the
 * OG image route runs on the Edge runtime where the next-intl plugin
 * is not wired up — we resolve the locale ourselves and look up the
 * literals from this tiny table. The strings rarely change, so the
 * duplication is acceptable.
 */
const COPY: Record<
  Locale,
  { heading: { line1: string; line2: string }; subtitle: string }
> = {
  es: {
    heading: {
      line1: 'Mapa en tiempo real',
      line2: 'de incidencias en montaña',
    },
    subtitle:
      'Reportes comunitarios de peligros en rutas, accidentes y puntos de interés. Validados por la comunidad y actualizados al instante.',
  },
  en: {
    heading: {
      line1: 'Real-time map of',
      line2: 'mountain incidents',
    },
    subtitle:
      'Community-powered reports of trail hazards, accidents and points of interest. Crowd-validated, updated in real time.',
  },
};

/**
 * Resolve the OG copy locale.
 *
 * Priority mirrors `src/i18n/request.ts` so the OG card matches what
 * the user (or social bot) would see if they actually opened the page:
 *   1. `NEXT_LOCALE` cookie — the user explicitly chose a language.
 *   2. `Accept-Language` header — the bot's / browser's preferred lang.
 *   3. Spanish default — product is Spanish-primary.
 */
function resolveLocale(): Locale {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  if (cookieLocale) return normaliseLocale(cookieLocale);
  const accept = headers().get('accept-language');
  if (accept) return normaliseLocale(accept.split(',')[0]?.trim());
  return 'es';
}

export default async function OpenGraphImage() {
  const copy = COPY[resolveLocale()];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          background:
            'radial-gradient(circle at 20% 20%, #1f5e4a 0%, #0f1412 60%, #0a0e0c 100%)',
          color: '#e9efec',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #2f8f6f 0%, #1f5e4a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 700,
              color: '#f5f7f6',
            }}
          >
            M
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: 0.5 }}>
            Montana
          </div>
        </div>
        <div
          style={{
            fontSize: 92,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 960,
          }}
        >
          {copy.heading.line1}
          <br />
          {copy.heading.line2}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 30,
            color: '#9aa8a0',
            maxWidth: 860,
            lineHeight: 1.3,
          }}
        >
          {copy.subtitle}
        </div>
      </div>
    ),
    size,
  );
}
