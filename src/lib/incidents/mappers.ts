import type { Incident } from '@/types/incident';

type IncidentRow = {
  id: string;
  user_id: string;
  type: Incident['type'];
  severity: Incident['severity'];
  status: Incident['status'];
  title: string;
  description: string | null;
  location: unknown;
  elevation_m: number | null;
  upvotes: number;
  downvotes: number;
  score: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

/** Extracts lng/lat from a PostGIS geography(Point) encoded as GeoJSON. */
function extractPoint(geo: unknown): { lat: number; lng: number } {
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
    location: extractPoint(row.location),
    elevationM: row.elevation_m,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    score: row.score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
