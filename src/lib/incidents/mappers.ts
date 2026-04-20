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

/** Parses a PostGIS EWKB hex-encoded Point (SRID 4326). */
function parseWkbHexPoint(hex: string): { lng: number; lat: number } | null {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  // EWKB Point with SRID: 1 byte order + 4 bytes type+flags + 4 bytes SRID
  // + 8 bytes X + 8 bytes Y = 25 bytes = 50 hex chars.
  if (clean.length < 50) return null;

  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const readLEDouble = (start: number) => {
    for (let i = 0; i < 8; i++) {
      view.setUint8(i, parseInt(clean.substring(start + i * 2, start + i * 2 + 2), 16));
    }
    return view.getFloat64(0, true);
  };

  const lng = readLEDouble(18);
  const lat = readLEDouble(34);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

/** Extracts lng/lat from flat columns, GeoJSON, or PostGIS WKB hex. */
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
  if (typeof geo === 'string') {
    const parsed = parseWkbHexPoint(geo);
    if (parsed) return { lat: parsed.lat, lng: parsed.lng };
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
