import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/config';

// robots.txt is Next.js App Router-generated. Everything private
// gets a `disallow`; sitemap absolute URL points back to our dynamic
// /sitemap.xml so crawlers don't have to guess.
//
// Specific disallows (not just a catch-all) so engines know exactly
// which paths to skip — which is how they stop re-fetching them on
// every crawl cycle. Paths listed here are:
//   /admin/*      — moderator-only UI, 404s for strangers anyway.
//   /me           — per-user profile, auth-gated.
//   /auth/*       — login flow. Indexing is useless and SafetyNets
//                   around magic-link URLs are a pain if Googlebot
//                   ever decides to fetch them.
//   /api/*        — JSON endpoints. `noindex` headers would work too
//                   but this is cheaper and more visible.
//   /monitoring   — Sentry tunnel route injected by withSentryConfig.
//   /offline      — service-worker fallback, never linked externally.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/me',
          '/auth/',
          '/api/',
          '/monitoring',
          '/offline',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
