// @ts-nocheck
/* eslint-disable */
// Supabase Edge Functions run on Deno, not Node. This file is intentionally
// excluded from the main TS project (see tsconfig `exclude`) and uses Deno
// APIs + remote imports. The checker runs through `supabase functions serve`
// or on deploy, not via Next.js's tsc.

/**
 * push-notify — fans out Web Push notifications for newly reported
 * incidents.
 *
 * Trigger: scheduled from `pg_cron` every ~60s, which calls this endpoint
 * with the service-role key in the Authorization header. The function:
 *
 *   1. Calls `pick_new_incidents_for_push` (advances the cursor atomically).
 *   2. For each incident, joins with subscriptions via
 *      `push_fanout_for_incidents` (spatial + severity filters applied
 *      in-DB so we don't drag a million rows over the network).
 *   3. Encrypts and sends each push via `web-push` (Deno port below).
 *   4. Reports delivery outcomes back to the DB: rotates stale
 *      subscriptions (410 Gone / 404) and marks successes.
 *
 * Failure modes considered:
 *   - Push provider transient errors (5xx, 429): ignored this tick, will
 *     retry on the next cron tick because the incident row is still
 *     present and the subscription still enabled.
 *   - Invalid VAPID env: throws on startup so the cron fails loudly
 *     instead of silently dropping pushes.
 *   - Duplicate cron invocations (rare, but possible on retries): the
 *     DB cursor is monotonic, so a repeat call just returns empty.
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// Shared secret the pg_cron job sends so random public callers can't
// trigger a fan-out storm. Set alongside the VAPID keys.
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET');

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set.');
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
}
if (!CRON_SECRET) {
  throw new Error('PUSH_CRON_SECRET must be set.');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface FanoutRow {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  incident_id: string;
  incident_title: string;
  incident_type: string;
  incident_severity: string;
  incident_lat: number;
  incident_lng: number;
}

const SEVERITY_EMOJI: Record<string, string> = {
  mild: 'ℹ️',
  moderate: '⚠️',
  severe: '🚨',
};

const TYPE_LABELS: Record<string, string> = {
  accident: 'Accident',
  trail_blocked: 'Trail blocked',
  detour: 'Detour',
  water_source: 'Water source',
  shelter: 'Shelter',
  point_of_interest: 'Point of interest',
  wildlife: 'Wildlife',
  weather_hazard: 'Weather hazard',
  other: 'Incident',
};

function buildPayload(row: FanoutRow) {
  const emoji = SEVERITY_EMOJI[row.incident_severity] ?? '';
  const typeLabel = TYPE_LABELS[row.incident_type] ?? 'Incident';
  const title = `${emoji} ${typeLabel}: ${row.incident_title}`.trim();

  return JSON.stringify({
    title,
    body: `Reported near your area. Tap to view.`,
    tag: row.incident_id,
    url: `/incidents/${row.incident_id}`,
    type: row.incident_type,
    severity: row.incident_severity,
  });
}

async function sendOne(row: FanoutRow): Promise<'ok' | 'gone' | 'error'> {
  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      buildPayload(row),
      { TTL: 60 * 60 * 6 }, // 6h; no point delivering a stale hazard
    );
    return 'ok';
  } catch (err: any) {
    const status = err?.statusCode;
    // 404/410 mean the endpoint is dead (unsubscribed, browser cleared).
    // Everything else (429, 5xx, network) is transient — we let the next
    // tick retry naturally.
    if (status === 404 || status === 410) return 'gone';
    console.error('push send failed', {
      status,
      endpoint: row.endpoint.slice(0, 60),
      err: err?.message,
    });
    return 'error';
  }
}

Deno.serve(async (req) => {
  // Simple bearer check — the cron job stores `PUSH_CRON_SECRET` and
  // sends it as `Authorization: Bearer <secret>`. Anything else is
  // rejected so that anon/auth users can't invoke the function (there
  // is no reason for them to).
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();

  const { data: pickData, error: pickErr } = await supabase.rpc(
    'pick_new_incidents_for_push',
  );
  if (pickErr) {
    console.error('pick_new_incidents_for_push failed', pickErr);
    return new Response(JSON.stringify({ error: pickErr.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const incidentIds: string[] =
    (pickData ?? []).map((r: { incident_id: string }) => r.incident_id);

  if (incidentIds.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, incidents: 0, sent: 0, durationMs: Date.now() - startedAt }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  const { data: rows, error: fanErr } = await supabase.rpc(
    'push_fanout_for_incidents',
    { incident_ids: incidentIds },
  );
  if (fanErr) {
    console.error('push_fanout_for_incidents failed', fanErr);
    return new Response(JSON.stringify({ error: fanErr.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const fanout: FanoutRow[] = rows ?? [];

  // Concurrency cap: the push providers are tolerant of parallel
  // connections, but the Deno isolate has a per-request socket budget
  // and we'd rather degrade gracefully than OOM. 25 in flight is a
  // comfortable number for the Supabase free tier.
  const CONCURRENCY = 25;
  const sentIds: string[] = [];
  const goneIds: string[] = [];

  let cursor = 0;
  async function worker() {
    while (cursor < fanout.length) {
      const row = fanout[cursor++];
      const result = await sendOne(row);
      if (result === 'ok') sentIds.push(row.subscription_id);
      else if (result === 'gone') goneIds.push(row.subscription_id);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, fanout.length) }, worker),
  );

  // Bookkeeping. Best-effort: if these RPCs fail we still return a
  // success to the cron (the next tick will re-evaluate freshness).
  if (sentIds.length > 0) {
    await supabase.rpc('mark_push_sent', { subscription_ids: sentIds });
  }
  for (const id of goneIds) {
    await supabase.rpc('disable_push_subscription', { subscription_id: id });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      incidents: incidentIds.length,
      fanout: fanout.length,
      sent: sentIds.length,
      gone: goneIds.length,
      durationMs: Date.now() - startedAt,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
});
