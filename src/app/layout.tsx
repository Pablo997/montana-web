import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { RegisterServiceWorker } from '@/components/pwa/RegisterServiceWorker';
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LANG,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo/config';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// Outfit: rounded geometric sans used exclusively for the brand
// wordmark. Friendlier than Inter's sharp terminals while keeping a
// modern, tech-oriented feel — fits an outdoor / nature product.
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-brand',
  display: 'swap',
});

export const metadata: Metadata = {
  // `metadataBase` is what lets Next.js resolve relative OG / twitter
  // image URLs into absolute ones. Without it, crawlers receive
  // `/og.png` and silently drop the card preview. Safe to set even
  // when SITE_URL is localhost — the metadata is only emitted on
  // rendered pages, which in dev are never scraped.
  metadataBase: new URL(SITE_URL),
  // `title.template` wraps every per-page `title` with the brand
  // suffix ("Privacy Policy" → "Privacy Policy — Montana") while
  // still letting pages override it via `title.absolute` when they
  // need to.
  title: {
    default: `${SITE_NAME} — Real-time mountain incidents`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  // Default robots policy for indexable pages. Per-page metadata
  // (e.g. /admin, /me, /auth) overrides this with { index: false }.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: SITE_LOCALE,
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Real-time mountain incidents`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Real-time mountain incidents`,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: SITE_URL,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  // iOS PWA support. `apple-mobile-web-app-capable` + status-bar
  // style make the app feel native when launched from the home
  // screen (no Safari chrome, translucent status bar over the map).
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  // Chrome deprecated the standalone `apple-mobile-web-app-capable`
  // tag in favour of the cross-vendor `mobile-web-app-capable`. We
  // emit both so Safari keeps working and Chrome stops warning.
  // Next.js's Metadata type doesn't expose the modern one directly,
  // so we inject via `other`.
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    // Apple-touch-icon: we reuse the SVG. Safari 16+ renders it
    // correctly; older iOS versions fall back to a screenshot of
    // the first viewport, which is an acceptable trade-off vs
    // shipping a raster asset that can drift from the logo.
    apple: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // `themeColor` accepts a list so light-mode browsers don't get the
  // same nearly-black colour as dark. Android Chrome uses this for
  // the status bar tint when the PWA is launched standalone.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1412' },
  ],
  // Cover notches on iOS so the map reaches the edges instead of
  // leaving white strips above/below.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={SITE_LANG} className={`${inter.variable} ${outfit.variable}`}>
      <body>
        {children}
        <RegisterServiceWorker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
