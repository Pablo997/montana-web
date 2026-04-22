// Sentry browser SDK configuration.
//
// Loaded automatically by `@sentry/nextjs` on the client. Nothing to
// import from here; the presence of the file plus the DSN env var is
// enough.
//
// Zero-DSN behaviour: if `NEXT_PUBLIC_SENTRY_DSN` is missing (local
// dev without a key, preview deploys we don't want to pollute)
// `Sentry.init` is a silent no-op, so there's no guard here.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Tag every event with the Vercel environment so Issues can be
  // filtered by "production" vs "preview" vs "development". Falls
  // back to NODE_ENV when not on Vercel (e.g. self-hosted tests).
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

  // Tracing: 10% sample in prod, 100% in dev. Performance data is a
  // lot cheaper than error data but Sentry's free tier still bills
  // it against the events quota, so we stay conservative.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay: disabled by default. Recording user sessions
  // raises GDPR concerns that we haven't covered in the Privacy
  // Policy, and replays eat the free quota an order of magnitude
  // faster than error events. Enable only after updating legal.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Reduce client-side noise that's not actionable:
  //   * ResizeObserver loops: benign, fires on layout thrash.
  //   * AbortError: we use AbortController on every fetch; a user
  //     navigating away mid-request is expected, not a bug.
  //   * Extension-injected script errors: we can't fix them.
  //   * Private Relay / ad-blocker DNS errors on MapTiler: noise.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'AbortError',
    'Non-Error promise rejection captured',
    /^TypeError: Failed to fetch$/,
    /^TypeError: NetworkError/,
    /^TypeError: cancelled$/,
  ],

  // Strip personally identifiable data before it leaves the browser.
  // The Privacy Policy promises we don't ship account-identifying
  // fields to third parties, so we actively scrub here.
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    if (event.request?.headers) {
      delete event.request.headers['User-Agent'];
      delete event.request.headers.Cookie;
      delete event.request.headers.cookie;
      delete event.request.headers.Authorization;
    }
    return event;
  },
});
