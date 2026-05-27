import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { captureServerError } from '@/lib/observability/sentry';

/**
 * Marks one or more in-app notifications as read on behalf of the
 * authenticated caller. Exists so the service worker — which can't
 * easily speak to Supabase directly — has a same-origin endpoint to
 * POST to when the user clicks a push notification.
 *
 * Auth model:
 *   * `createSupabaseServerClient()` reads the Supabase session cookie
 *     that the SW automatically forwards (same origin → credentials
 *     attached). RLS on the `notifications` table further restricts
 *     the underlying RPC to rows the user owns, so this is defence in
 *     depth, not the only gate.
 *
 * Request body: `{ ids: string[] }`.
 *
 * Why a dedicated route instead of letting the SW call the RPC:
 *   * The SW has no Supabase SDK loaded — adding it would bloat the
 *     worker and complicate caching strategies.
 *   * Keeping the surface as one POST per click means observability
 *     (Sentry tags, future analytics) lives in one place.
 *
 * Return shape: `{ updated: number }` — the count of rows actually
 * changed. Already-read notifications return 0 silently; we don't
 * surface that as an error because the SW will retry on the next
 * click and we'd rather no-op than break the navigation.
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Loose runtime parse: the SW is the only known caller today but
  // this endpoint is publicly reachable, so we validate. UUID format
  // is enforced server-side via the RPC parameter type — we just
  // filter out obvious garbage here so a bad payload doesn't hit
  // Postgres at all.
  const ids = extractIds(body);
  if (ids.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: ids,
  });

  if (error) {
    captureServerError(error, {
      tag: 'api.notifications.mark-read',
      extras: { userId: user.id, idCount: ids.length },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated = typeof data === 'number' ? data : 0;
  return NextResponse.json({ updated });
}

/**
 * Extracts a non-empty list of strings from the parsed body's `ids`
 * field. Returns an empty array (not null) so the caller can treat
 * "no valid ids" as a no-op rather than branching on null. Caps the
 * list at 50 so a malicious client can't tee up an unbounded update.
 */
function extractIds(body: unknown): string[] {
  if (
    body === null ||
    typeof body !== 'object' ||
    !('ids' in body) ||
    !Array.isArray((body as { ids: unknown }).ids)
  ) {
    return [];
  }
  const raw = (body as { ids: unknown[] }).ids;
  const filtered = raw.filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return filtered.slice(0, 50);
}
