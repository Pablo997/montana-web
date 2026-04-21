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

module.exports = nextConfig;
