// Sentry server SDK configuration.
//
// Loaded by `instrumentation.ts` on the Node.js runtime (server
// components, API routes, server actions). Kept separate from the
// client config because the threat model and the data we can leak
// are different: server events can include request bodies, env
// vars and stack traces pointing at internal paths.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  // Server-side tracing is more valuable than client because it
  // captures DB query waterfalls, but it's also the most expensive
  // data point. Keep it at 10% in prod.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Keep stack traces only from our own code. Without this, Vercel's
  // node_modules frames dominate the UI and obscure the real bug.
  includeLocalVariables: process.env.NODE_ENV !== 'production',

  // Never send request bodies or cookies. Account deletion and
  // consent recording POST sensitive identifiers through JSON, and
  // we don't want those in Sentry.
  sendDefaultPii: false,

  beforeSend(event) {
    // See sentry.client.config.ts for the rationale behind the
    // explicit null ip_address: it's an opt-out signal, not a
    // deletion target. Deleting the key lets Sentry's ingest refill
    // it from the request IP.
    event.user = { ip_address: null as unknown as string };
    if (event.request) {
      // Request objects on server can include cookies, auth
      // headers and arbitrary JSON bodies.
      delete event.request.cookies;
      delete event.request.data;
      if (event.request.headers) {
        delete event.request.headers.Cookie;
        delete event.request.headers.cookie;
        delete event.request.headers.Authorization;
        delete event.request.headers.authorization;
        delete event.request.headers['x-forwarded-for'];
        delete event.request.headers['X-Forwarded-For'];
      }
    }
    if (event.contexts) {
      delete event.contexts.geo;
    }
    return event;
  },
});
