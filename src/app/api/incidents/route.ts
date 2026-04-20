import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rowToIncident } from '@/lib/incidents/mappers';

/**
 * GET /api/incidents?lng=...&lat=...&radius=...
 * Thin HTTP wrapper around the `nearby_incidents` RPC. Useful for
 * server-rendered pages, share links and third-party integrations.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lng = Number(searchParams.get('lng'));
  const lat = Number(searchParams.get('lat'));
  const radius = Number(searchParams.get('radius') ?? '25000');

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('nearby_incidents', {
    p_lng: lng,
    p_lat: lat,
    p_radius_m: radius,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    incidents: (data ?? []).map(rowToIncident),
  });
}
