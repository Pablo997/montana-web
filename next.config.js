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
  {
    // `geolocation=*` intentionally allows all origins. Some iOS Safari
    // versions misparse the `(self)` syntax and silently block the
    // permission prompt even though the origin matches. The app is
    // never embedded in a third-party frame (X-Frame-Options: DENY),
    // so a permissive policy here has no real-world attack surface.
    key: 'Permissions-Policy',
    value: 'camera=(self), geolocation=*, microphone=(), payment=(), usb=()',
  },
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
