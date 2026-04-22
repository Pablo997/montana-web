// Companion server route for /sentry-example-page. Throws on every
// request so the Sentry server SDK captures it. The error shape is
// deliberately unique to make filtering by title trivial in the
// Issues UI.

export const dynamic = 'force-dynamic';

export async function GET() {
  throw new Error('Sentry server test — ' + new Date().toISOString());
}
