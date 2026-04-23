import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { RegisterServiceWorker } from '@/components/pwa/RegisterServiceWorker';
import { SITE_NAME, SITE_URL, siteSeo } from '@/lib/seo/config';
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

/**
 * Metadata is now locale-aware. Runs in an RSC context so
 * `getLocale()` can read the locale resolved by `i18n/request.ts`
 * (cookie / Accept-Language). Per-page metadata still overrides
 * what's set here via the usual `generateMetadata` export.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const seo = siteSeo(locale);

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${SITE_NAME} — ${seo.description.split(/[.,—]/)[0]}`,
      template: `%s — ${SITE_NAME}`,
    },
    description: seo.description,
    keywords: seo.keywords,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
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
      locale: seo.ogLocale,
      url: SITE_URL,
      siteName: SITE_NAME,
      title: `${SITE_NAME} — ${seo.description.split(/[.,—]/)[0]}`,
      description: seo.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${SITE_NAME} — ${seo.description.split(/[.,—]/)[0]}`,
      description: seo.description,
    },
    alternates: {
      canonical: SITE_URL,
    },
    formatDetection: {
      telephone: false,
      email: false,
      address: false,
    },
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: 'black-translucent',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
    icons: {
      icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
      apple: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1412' },
  ],
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // `getLocale()` resolves the request's locale (cookie / header)
  // via the config in `src/i18n/request.ts`. `getMessages()` loads
  // the matching JSON bundle — these become the context for every
  // `useTranslations()` call deeper in the tree.
  const locale = await getLocale();
  const messages = await getMessages();
  const htmlLang = siteSeo(locale).htmlLang;

  return (
    <html lang={htmlLang} className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <RegisterServiceWorker />
          <Analytics />
          <SpeedInsights />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
