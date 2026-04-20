import type { Incident } from '@/types/incident';

type IncidentRow = {
  id: string;
  user_id: string;
  type: Incident['type'];
  severity: Incident['severity'];
  status: Incident['status'];
  title: string;
  description: string | null;
  location?: unknown;
  lng?: number | null;
  lat?: number | null;
  elevation_m: number | null;
  upvotes: number;
  downvotes: number;
  score: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

/** Extracts lng/lat from either flat columns or a PostGIS GeoJSON object. */
function extractPoint(row: IncidentRow): { lat: number; lng: number } {
  if (typeof row.lng === 'number' && typeof row.lat === 'number') {
    return { lat: row.lat, lng: row.lng };
  }
  const geo = row.location;
  if (
    geo &&
    typeof geo === 'object' &&
    'coordinates' in geo &&
    Array.isArray((geo as { coordinates: unknown }).coordinates)
  ) {
    const [lng, lat] = (geo as { coordinates: number[] }).coordinates;
    return { lat, lng };
  }
  return { lat: 0, lng: 0 };
}

export function rowToIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    location: extractPoint(row),
    elevationM: row.elevation_m,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    score: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
