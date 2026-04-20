import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { rowToIncident } from './mappers';
import {
  BBoxSchema,
  CreateIncidentSchema,
  VoteSchema,
  type BBox,
  type CreateIncidentInput,
  type Vote,
} from './schemas';
import type { Incident } from '@/types/incident';

export type { BBox, CreateIncidentInput, Vote } from './schemas';

const supabase = () => createSupabaseBrowserClient();

/**
 * Insert a new incident. Location is passed through a PostGIS helper so the
 * RPC accepts plain lng/lat instead of WKT strings. Returns the created row.
 *
 * The payload is validated with `CreateIncidentSchema` before we touch the
 * network, so obvious client bugs fail fast with a readable error instead
 * of an opaque Postgres 23514 (check constraint violation).
 */
export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const payload = CreateIncidentSchema.parse(input);

  const { data: userData, error: userErr } = await supabase().auth.getUser();
  if (userErr || !userData.user) throw new Error('Not authenticated.');

  const { data, error } = await supabase()
    .rpc('create_incident', {
      p_type: payload.type,
      p_severity: payload.severity,
      p_title: payload.title,
      p_description: payload.description ?? null,
      p_lng: payload.location.lng,
      p_lat: payload.location.lat,
      p_elevation_m: payload.elevationM ?? null,
    })
    .single();

  if (error) throw error;

  // The RPC returns the `incidents` row whose `location` column serialises
  // as WKB hex. We already know the lng/lat since we just sent them, so we
  // override them on the DTO to avoid parsing PostGIS binary on the client.
  const row = data as Parameters<typeof rowToIncident>[0];
  return rowToIncident({ ...row, lng: payload.location.lng, lat: payload.location.lat });
}

/** Fetch visible incidents near a point using the SQL helper. */
export async function fetchNearbyIncidents(
  lng: number,
  lat: number,
  radiusMeters = 25_000,
): Promise<Incident[]> {
  const { data, error } = await supabase().rpc('nearby_incidents', {
    p_lng: lng,
    p_lat: lat,
    p_radius_m: radiusMeters,
  });

  if (error) throw error;
  return (data ?? []).map(rowToIncident);
}

/** Fetch every visible incident inside a lng/lat envelope. */
export async function fetchIncidentsInBbox(bbox: BBox): Promise<Incident[]> {
  const parsed = BBoxSchema.parse(bbox);
  const { data, error } = await supabase().rpc('incidents_in_bbox', {
    p_min_lng: parsed.minLng,
    p_min_lat: parsed.minLat,
    p_max_lng: parsed.maxLng,
    p_max_lat: parsed.maxLat,
  });

  if (error) throw error;
  return (data ?? []).map(rowToIncident);
}

/** Cast or update a user's vote for an incident. */
export async function castVote(incidentId: string, vote: Vote): Promise<void> {
  const parsedVote = VoteSchema.parse(vote);

  const { data: userData, error: userErr } = await supabase().auth.getUser();
  if (userErr || !userData.user) throw new Error('Not authenticated.');

  const { error } = await supabase()
    .from('incident_votes')
    .upsert(
      { incident_id: incidentId, user_id: userData.user.id, vote: parsedVote },
      { onConflict: 'incident_id,user_id' },
    );

  if (error) throw error;
}

/** Remove a user's existing vote. */
export async function removeVote(incidentId: string): Promise<void> {
  const { data: userData } = await supabase().auth.getUser();
  if (!userData.user) return;

  const { error } = await supabase()
    .from('incident_votes')
    .delete()
    .eq('incident_id', incidentId)
    .eq('user_id', userData.user.id);

  if (error) throw error;
}

/**
 * Read the current user's vote for an incident. Returns `null` when the
 * user is anonymous or has not voted yet. Used to hydrate the vote
 * buttons with the right selected state when the detail panel opens.
 */
export async function fetchUserVote(incidentId: string): Promise<Vote | null> {
  const { data: userData } = await supabase().auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase()
    .from('incident_votes')
    .select('vote')
    .eq('incident_id', incidentId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data.vote === 1 ? 1 : -1;
}
