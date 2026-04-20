import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { rowToIncident } from './mappers';
import type { CreateIncidentInput, Incident } from '@/types/incident';

const supabase = () => createSupabaseBrowserClient();

/**
 * Insert a new incident. Location is passed through a PostGIS helper so the
 * RPC accepts plain lng/lat instead of WKT strings. Returns the created row.
 */
export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const { data: userData, error: userErr } = await supabase().auth.getUser();
  if (userErr || !userData.user) throw new Error('Not authenticated.');

  const { data, error } = await supabase()
    .rpc('create_incident', {
      p_type: input.type,
      p_severity: input.severity,
      p_title: input.title,
      p_description: input.description ?? null,
      p_lng: input.location.lng,
      p_lat: input.location.lat,
      p_elevation_m: input.elevationM ?? null,
    })
    .single();

  if (error) throw error;
  return rowToIncident(data as never);
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

/** Cast or update a user's vote for an incident. */
export async function castVote(incidentId: string, vote: 1 | -1): Promise<void> {
  const { data: userData, error: userErr } = await supabase().auth.getUser();
  if (userErr || !userData.user) throw new Error('Not authenticated.');

  const { error } = await supabase()
    .from('incident_votes')
    .upsert(
      { incident_id: incidentId, user_id: userData.user.id, vote },
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
