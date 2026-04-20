/**
 * Slippy-tile helpers used to memoise bbox fetches.
 *
 * The map may fire `moveend` dozens of times in a session — we only want to
 * hit Supabase for regions we have not already hydrated. We split the world
 * into fixed z=7 tiles (~313 km wide at the equator) and keep a `Set` of the
 * tile IDs whose incidents we already loaded.
 *
 * Realtime keeps that cache consistent: new inserts/updates/deletes come
 * through `postgres_changes`, so the local cache never drifts from the DB.
 */
import type { BBox } from './api';

export const TILE_ZOOM = 7;

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  );
}

function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan((Math.exp(n) - Math.exp(-n)) / 2);
}

/** Returns the list of `z/x/y` tile keys that cover a given bbox. */
export function tilesForBbox(bbox: BBox, z = TILE_ZOOM): string[] {
  const xMin = lngToTileX(bbox.minLng, z);
  const xMax = lngToTileX(bbox.maxLng, z);
  // Latitude grows south-to-north while tile Y grows north-to-south, hence
  // the inversion between min/max here.
  const yMin = latToTileY(bbox.maxLat, z);
  const yMax = latToTileY(bbox.minLat, z);

  const keys: string[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      keys.push(`${z}/${x}/${y}`);
    }
  }
  return keys;
}

/** Returns the bbox that tightly encloses the given tile keys. */
export function bboxForTiles(keys: string[]): BBox | null {
  if (keys.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const key of keys) {
    const [zStr, xStr, yStr] = key.split('/');
    const z = Number(zStr);
    const x = Number(xStr);
    const y = Number(yStr);

    const west = tileXToLng(x, z);
    const east = tileXToLng(x + 1, z);
    const north = tileYToLat(y, z);
    const south = tileYToLat(y + 1, z);

    if (west < minLng) minLng = west;
    if (east > maxLng) maxLng = east;
    if (south < minLat) minLat = south;
    if (north > maxLat) maxLat = north;
  }

  return { minLng, minLat, maxLng, maxLat };
}
