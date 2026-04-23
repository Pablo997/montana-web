import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { captureServerError } from '@/lib/observability/sentry';

// Uptime / synthetic-monitoring target.
//
// We keep this deliberately narrower than `/api/ping`:
//   * `/api/ping`   — 200 OK as long as the Next.js runtime is up.
//                     Used by the offline indicator as a cheap probe.
//   * `/api/health` — 200 only when *downstream* dependencies we
//                     actually need are reachable (Supabase first of
//                     all). Used by uptime monitors (BetterUptime,
//                     Uptime Kuma, Pingdom, ...).
//
// Both are intentionally unauthenticated so external probes don't
// need secrets. The health endpoint round-trips a single lightweight
// RPC instead of a table read because that exercises the Postgres
// connection *and* the PostgREST layer with ~2ms of server work.
//
// Cache headers:
//   * `Cache-Control: no-store` so the uptime monitor always gets a
//     fresh measurement instead of a stale 200 from a proxy.
//   * Vercel's edge cache respects `no-store`; no extra config needed.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: {
    database: 'ok' | 'fail';
  };
  timestamp: string;
  release: string | null;
}

export async function GET() {
  const release =
    process.env.SENTRY_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    null;

  const payload: HealthPayload = {
    status: 'ok',
    checks: { database: 'ok' },
    timestamp: new Date().toISOString(),
    release,
  };

  try {
    const supabase = createSupabaseServerClient();
    // `health_ping()` is the cheapest cross-layer probe we can run:
    // it exercises PostgREST → PgBouncer → Postgres without touching
    // any user table and without any RLS surface to worry about.
    const { error } = await supabase.rpc('health_ping');
    if (error) {
      payload.checks.database = 'fail';
      payload.status = 'degraded';
      captureServerError(error, {
        tag: 'api.health',
        level: 'warning',
        extras: { check: 'database' },
      });
    }
  } catch (err) {
    payload.checks.database = 'fail';
    payload.status = 'degraded';
    captureServerError(err, { tag: 'api.health', level: 'warning' });
  }

  return NextResponse.json(payload, {
    status: payload.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
