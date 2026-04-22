// Sentry Edge runtime configuration.
//
// Loaded by `instrumentation.ts` when a request hits code running
// on Vercel's Edge runtime (middleware, some route handlers). The
// Edge runtime is a subset of Node — no `process.cwd`, no `fs`, no
// local variable capture — so we strip features that only work on
// the server runtime.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  sendDefaultPii: false,

  beforeSend(event) {
    event.user = { ip_address: null as unknown as string };
    if (event.request?.headers) {
      delete event.request.headers.Cookie;
      delete event.request.headers.cookie;
      delete event.request.headers.Authorization;
      delete event.request.headers.authorization;
      delete event.request.headers['x-forwarded-for'];
      delete event.request.headers['X-Forwarded-For'];
    }
    if (event.contexts) {
      delete event.contexts.geo;
    }
    return event;
  },
});
