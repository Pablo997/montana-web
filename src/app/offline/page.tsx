import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Offline — Montana',
  description: 'No network connection.',
  robots: { index: false, follow: false },
};

// Rendered by the service worker as a fallback whenever a navigation
// request fails (airplane mode, mountain-side with no signal, plane
// in the middle of a tunnel). Kept intentionally tiny — no external
// fonts, no map, no Supabase — so it works even when literally every
// third-party origin is unreachable. Inline styles for the same
// reason: the globals.css file may not be cached on the very first
// offline visit.
//
// Translations come from `pwa.offlinePage.*`. This page is RSC so we
// resolve them server-side; the service worker cache will store the
// already-localised HTML, which is the right behaviour — once the
// user is offline we can't run another server render to switch
// language anyway.
export default async function OfflinePage() {
  const t = await getTranslations('pwa.offlinePage');
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem 1.5rem',
        background: '#0f1412',
        color: '#e9efec',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div
          aria-hidden
          style={{
            width: 96,
            height: 96,
            margin: '0 auto 1.5rem',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #3aa37f 0%, #1f6c53 100%)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 32 32"
            aria-hidden
            focusable="false"
          >
            <path
              d="M4 23 C 6 18, 8 13, 11 6 C 13 12, 14 15, 16 18 C 18 15, 19 12, 21 8 C 24 16, 26 21, 28 23"
              fill="none"
              stroke="#fff"
              strokeWidth={2.3}
              strokeLinejoin="round"
              strokeLinecap="round"
              transform="translate(16 16) scale(0.75) translate(-16 -16)"
            />
          </svg>
        </div>

        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>{t('title')}</h1>
        <p style={{ color: '#9aa8a0', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
          {t('body')}
        </p>

        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.7rem 1.4rem',
            borderRadius: 999,
            background: '#2f8f6f',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          {t('retry')}
        </a>
      </div>
    </main>
  );
}
