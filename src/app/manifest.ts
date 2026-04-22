import type { MetadataRoute } from 'next';

// Next.js App Router picks this file up automatically and serves it at
// `/manifest.webmanifest`. Zero runtime cost vs a static JSON file,
// but we get TS types and can compute values from env vars if the
// need ever arises.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Montana — Mountain incidents map',
    short_name: 'Montana',
    description:
      'Community-powered map of mountain incidents, trail hazards and points of interest. Check before heading out.',
    // Stable identity across start_url changes. Without this Chrome
    // warns "id is not specified in the manifest" and a future
    // start_url tweak would be treated as a different app.
    id: '/',
    start_url: '/',
    scope: '/',
    // `standalone` hides the browser chrome on Android/iOS when the
    // user launches from the home screen, giving the map the full
    // screen. `fullscreen` is too aggressive (hides the status bar).
    display: 'standalone',
    orientation: 'any',
    background_color: '#0f1412',
    theme_color: '#0f1412',
    categories: ['travel', 'navigation', 'sports', 'utilities'],
    lang: 'en',
    icons: [
      // Same SVG is registered twice with different `purpose`s. The
      // spec allows a space-separated list on a single entry ("any
      // maskable") but Next.js 14's TypeScript types only accept one
      // keyword per entry, so we duplicate. The icon file has a 20%
      // safe zone baked in, so it renders correctly in both modes
      // (full-bleed Android adaptive mask and plain square).
      //
      // Note: no PNG fallback. iOS 16+ accepts SVG in webmanifest;
      // older iOS falls back to a Safari-generated screenshot, which
      // is acceptable for the MVP. Add a /icons/icon-512.png entry
      // here + a matching apple-touch-icon in layout metadata when
      // wider legacy coverage is needed.
      // Explicit "512x512" (rather than "any") silences Chrome's
      // "Most operating systems require square icons" warning by
      // telling the installer the exact rendered dimensions.
      {
        src: '/icons/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    // Screenshots shown in the Android "Install app" dialog. Omitted
    // for now — Chrome will show a generic placeholder until we add
    // them. Low priority; add when we have polished marketing shots.
  };
}
