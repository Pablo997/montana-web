// Security headers applied to every response. These are defence-in-depth
// only: the app does not rely on them for correctness, but turning them
// on costs nothing and mitigates common attack classes (clickjacking,
// MIME sniffing, referrer leakage, powerful-feature abuse).
//
// We intentionally do NOT ship a strict CSP yet: MapTiler, Supabase
// storage, Vercel analytics and `next/font` each need their own
// allow-listed origins and a misconfigured CSP would silently break
// tiles or auth. Revisit once we've measured real prod requests.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // `Permissions-Policy` intentionally omitted. Some iOS Safari
  // versions interpret any form of the header (`(self)`, `*`, even
  // explicit origin lists) as restricting geolocation and return
  // `denied` from `navigator.permissions.query` regardless of the
  // user's choice. With the header absent, the browser defaults to
  // "allow same-origin, no cross-origin" which is exactly what we
  // want. We can reinstate the header with per-feature granularity
  // once we need to gate e.g. camera access in nested iframes.
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry wrapping.
//
// `withSentryConfig` does two things for us:
//   1. Wraps the build pipeline so source maps are uploaded to Sentry
//      during `next build`, which makes stack traces in Issues show
//      our original TS lines instead of `main-<hash>.js:1:12345`.
//      This only runs when SENTRY_AUTH_TOKEN is present, so local
//      builds and preview deployments without a token still succeed.
//   2. Injects a lightweight tunnel route (/monitoring) so reports
//      aren't blocked by ad-blockers that drop *.sentry.io.
//
// Options that are `undefined` (e.g. `org`, `project`) simply skip
// the relevant step instead of failing, so the config is safe even
// before you've pasted the env vars into Vercel.
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppresses the verbose "uploading source maps" spam in CI logs.
  silent: !process.env.CI,

  // /monitoring is an internal route that proxies events to Sentry
  // so ad-blockers don't strip them. Small runtime cost, big gain
  // in completeness of error reporting.
  tunnelRoute: '/monitoring',

  // Don't automatically add a 503 handler for React errors; we own
  // error boundaries explicitly and don't want the SDK wrapping
  // pages we haven't opted in.
  widenClientFileUpload: true,
  disableLogger: true,

  // Upload source maps to Sentry, then delete them from the build
  // output so end-users never download them. Without this the SDK
  // warns on every build, and source maps ship to production which
  // both bloats page weight and exposes our uncompiled source.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
