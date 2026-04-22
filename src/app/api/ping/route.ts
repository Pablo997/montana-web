import { NextResponse } from 'next/server';

/**
 * Lightweight connectivity probe used by the client-side offline
 * indicator. Returns an empty 200 with no-store headers so neither
 * the browser nor any intermediate cache can mask an actual network
 * failure. The service worker also excludes `/api/` from caching, so
 * a successful response means we really reached the origin.
 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}

export function GET() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
