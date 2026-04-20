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
import { readImageDimensions } from '@/lib/utils/image-compression';
import type { Incident, IncidentMedia } from '@/types/incident';

export type { BBox, CreateIncidentInput, Vote } from './schemas';

const MEDIA_BUCKET = 'incident-media';

const supabase = () => createSupabaseBrowserClient();

/**
 * Returns the signed-in user's id without hitting `/auth/v1/user`.
 *
 * `getSession()` reads the JWT straight from localStorage, so pairing it
 * with authorization decisions on the *client* is both fast and safe:
 * every subsequent DB call still carries that JWT, and PostgREST + RLS
 * are the real authority. We only pay a network round-trip when the
 * session is stale and the SDK auto-refreshes it.
 */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

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

  if (!(await currentUserId())) throw new Error('Not authenticated.');

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

  const userId = await currentUserId();
  if (!userId) throw new Error('Not authenticated.');

  const { error } = await supabase()
    .from('incident_votes')
    .upsert(
      { incident_id: incidentId, user_id: userId, vote: parsedVote },
      { onConflict: 'incident_id,user_id' },
    );

  if (error) throw error;
}

/** Remove a user's existing vote. */
export async function removeVote(incidentId: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const { error } = await supabase()
    .from('incident_votes')
    .delete()
    .eq('incident_id', incidentId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Upload a single photo for an incident to Storage and register it in
 * `public.incident_media`. The caller is responsible for compressing the
 * file beforehand (see `compressImage`).
 *
 * Paths follow the convention enforced by the Storage RLS policy:
 *   `<user_id>/<incident_id>/<uuid>.<ext>`
 *
 * Failures during the DB insert are best-effort cleaned up by deleting
 * the already-uploaded object, so we don't leave orphaned blobs in the
 * bucket when the row can't be persisted.
 */
export async function uploadIncidentMedia(
  incident: Pick<Incident, 'id' | 'userId'>,
  file: File,
): Promise<IncidentMedia> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Not authenticated.');
  if (userId !== incident.userId) {
    // Storage RLS would reject anyway; fail here with a readable error.
    throw new Error('Cannot attach media to another user\'s incident.');
  }

  const ext = (file.name.split('.').pop() ?? 'webp').toLowerCase();
  const path = `${userId}/${incident.id}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase()
    .storage.from(MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'image/webp',
      cacheControl: '3600',
      upsert: false,
    });
  if (upErr) throw upErr;

  const { width, height } = await readImageDimensions(file);

  const { data, error } = await supabase()
    .from('incident_media')
    .insert({
      incident_id: incident.id,
      storage_path: path,
      mime_type: file.type || 'image/webp',
      width,
      height,
    })
    .select('id, incident_id, storage_path, mime_type, width, height')
    .single();

  if (error || !data) {
    // Roll back the orphan blob. Ignore cleanup errors — RLS or network
    // hiccups are strictly worse if we also fail here.
    await supabase().storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
    throw error ?? new Error('Failed to register media.');
  }

  return mediaRowToDto(data);
}

/** List every media entry attached to an incident, oldest first. */
export async function fetchIncidentMedia(incidentId: string): Promise<IncidentMedia[]> {
  const { data, error } = await supabase()
    .from('incident_media')
    .select('id, incident_id, storage_path, mime_type, width, height, created_at')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mediaRowToDto);
}

type IncidentMediaRow = {
  id: string;
  incident_id: string;
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
};

function mediaRowToDto(row: IncidentMediaRow): IncidentMedia {
  const { data } = supabase().storage.from(MEDIA_BUCKET).getPublicUrl(row.storage_path);
  return {
    id: row.id,
    incidentId: row.incident_id,
    storagePath: row.storage_path,
    publicUrl: data.publicUrl,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
  };
}
