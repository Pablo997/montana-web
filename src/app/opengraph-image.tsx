import { ImageResponse } from 'next/og';

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

export const runtime = 'edge';
export const alt = 'Montana — Real-time mountain incidents';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
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
          Real-time map of
          <br />
          mountain incidents
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
          Community-powered reports of trail hazards, accidents and points of
          interest. Crowd-validated, updated in real time.
        </div>
      </div>
    ),
    size,
  );
}
