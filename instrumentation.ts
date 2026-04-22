// Next.js instrumentation hook.
//
// This file is picked up automatically by Next.js and runs once per
// runtime at process start. We use it exclusively to bootstrap Sentry
// on the server/edge — the browser side is handled by
// `sentry.client.config.ts`.
//
// The `NEXT_RUNTIME` env var is set by Next.js itself before our code
// runs; checking it prevents the wrong SDK flavour from being pulled
// into the wrong runtime (the Edge runtime cannot import the full
// Node SDK, and vice versa).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Next.js 15+ uses `onRequestError` to report request-level errors
// from React Server Components to Sentry. Forwarding here is a no-op
// on 14 (the hook isn't called) but keeps the project forward-
// compatible when we upgrade.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
