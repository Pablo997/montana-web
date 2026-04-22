import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { RegisterServiceWorker } from '@/components/pwa/RegisterServiceWorker';
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
  title: 'Montana — Real-time mountain incidents',
  description:
    'Community-powered map of mountain incidents, trail hazards and points of interest.',
  // iOS PWA support. `apple-mobile-web-app-capable` + status-bar
  // style make the app feel native when launched from the home
  // screen (no Safari chrome, translucent status bar over the map).
  appleWebApp: {
    capable: true,
    title: 'Montana',
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
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        {children}
        <RegisterServiceWorker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
