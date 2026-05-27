import { MAPTILER_KEY } from './config';

/**
 * Thin client over the MapTiler Geocoding REST API. We deliberately
 * skip the official `@maptiler/client` package: it pulls another
 * 50-ish KB into the bundle and our usage is one endpoint with five
 * query params. A `fetch` wrapper is enough.
 *
 * Docs: https://docs.maptiler.com/cloud/api/geocoding/
 */

/** Shape that the UI actually consumes. Decoupled from the raw API
 * response so a future provider swap (e.g. self-hosted Nominatim) is
 * a one-file change. */
export interface SearchResult {
  /** Stable id used as the React key and for deduping recents. */
  id: string;
  /** Short label — the place's primary name. */
  title: string;
  /** Long label with parent context ("Benasque, Aragón, España"). */
  subtitle: string;
  /** `[lng, lat]` — the order MapLibre expects on `setCenter` / `flyTo`. */
  center: [number, number];
  /**
   * Optional bounding box of the feature (`[minLng, minLat, maxLng,
   * maxLat]`). When present, callers should `fitBounds` instead of
   * `flyTo` — gives a much better camera framing for cities / valleys
   * than a one-size-fits-all zoom.
   */
  bbox: [number, number, number, number] | null;
  /**
   * Suggested zoom for `flyTo` when the result has no bbox. Derived
   * from the MapTiler `place_type` (country → 4, region → 7,
   * settlement → 13, poi → 15) so a "Picos de Europa" search frames
   * the range, while "Refugio de Cabrones" zooms in.
   */
  suggestedZoom: number;
  /** First entry from MapTiler's `place_type` array. Useful for
   * categorising results in the UI ("city", "poi", "address" etc.). */
  placeType: string | null;
}

/** Optional bias parameters that nudge the geocoder towards the
 * current viewport. */
export interface GeocodeOptions {
  /**
   * `[lng, lat]` of the map centre. Promotes results near this
   * point in the result ranking but does NOT exclude faraway
   * matches — searching "Madrid" from the Pyrenees still returns
   * Madrid; it just ranks closer matches first. This is the
   * intended UX: users expect a global search, with their
   * location as a tie-breaker.
   *
   * (We deliberately do NOT pass `bbox` because MapTiler treats
   * `bbox` as a hard restriction, not a bias. Restricting to the
   * viewport made the search feel broken — places visible on the
   * map *now* would show up, anything off-screen wouldn't.)
   */
  proximity?: [number, number];
  /** ISO codes prioritising local results. Defaults to the IATA
   * region around our primary user base. */
  countries?: string[];
  /** UI locale for translated place names ("es", "en"). */
  language?: string;
  /** Hard ceiling on returned features. MapTiler accepts 1–10. */
  limit?: number;
  /** Cancel signal — callers wire this to an AbortController so the
   * stream of in-flight requests gets cancelled when the user keeps
   * typing. Stale responses arriving out of order would otherwise
   * flash old results in the dropdown. */
  signal?: AbortSignal;
}

const DEFAULT_LIMIT = 6;
const DEFAULT_COUNTRIES = ['es', 'fr', 'pt', 'ad', 'it'];

/**
 * Issues a forward-geocoding request. Returns parsed `SearchResult`s
 * on success, throws on:
 *
 *   * Network error (caller should display a generic "try again"
 *     state — don't expose the underlying message to users).
 *   * `AbortError` when the caller-supplied signal aborts. Callers
 *     should ignore this case (it's the happy-path debounce
 *     cancellation, not an error).
 *
 * Empty queries short-circuit to `[]` without a network round-trip.
 */
export async function geocodePlaces(
  query: string,
  options: GeocodeOptions = {},
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!MAPTILER_KEY) {
    // Surfaces during local dev when the env var is missing. A
    // silent empty list would be confusing — better to log once and
    // fall through so the UI keeps working.
    console.warn('[geocoding] NEXT_PUBLIC_MAPTILER_KEY is not set');
    return [];
  }

  const params = new URLSearchParams();
  params.set('key', MAPTILER_KEY);
  params.set('limit', String(options.limit ?? DEFAULT_LIMIT));
  params.set('language', options.language ?? 'es');
  if (options.proximity) {
    params.set('proximity', options.proximity.join(','));
  }
  const countries = options.countries ?? DEFAULT_COUNTRIES;
  if (countries.length > 0) {
    params.set('country', countries.join(','));
  }

  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
    trimmed,
  )}.json?${params.toString()}`;

  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Geocoding request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return parseFeatureCollection(payload);
}

/**
 * Pure parser exposed for tests. Defensive against partial / missing
 * fields — the MapTiler API has been known to omit `bbox` on
 * point-of-interest features even though the docs claim it's
 * always present.
 */
export function parseFeatureCollection(payload: unknown): SearchResult[] {
  if (!isRecord(payload)) return [];
  const features = payload.features;
  if (!Array.isArray(features)) return [];

  const results: SearchResult[] = [];
  for (const raw of features) {
    const parsed = parseFeature(raw);
    if (parsed) results.push(parsed);
  }
  return results;
}

function parseFeature(raw: unknown): SearchResult | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;

  const center = parseLngLat(raw.center);
  if (!center) return null;

  const title = pickString(raw.text, raw.place_name) ?? '';
  if (!title) return null;

  const subtitle = composeSubtitle(raw);
  const bbox = parseBbox(raw.bbox);
  const placeType = pickPlaceType(raw.place_type);

  return {
    id,
    title,
    subtitle,
    center,
    bbox,
    suggestedZoom: suggestZoomForPlaceType(placeType),
    placeType,
  };
}

/** Pulls the first context entry beyond the immediate `text`,
 * stitched into a one-line breadcrumb. Falls back to MapTiler's
 * `place_name` (already comma-joined) when the context array is
 * missing. */
function composeSubtitle(raw: Record<string, unknown>): string {
  const context = Array.isArray(raw.context) ? raw.context : null;
  if (context) {
    const parts: string[] = [];
    for (const ctx of context) {
      if (!isRecord(ctx)) continue;
      const text = pickString(ctx.text);
      if (text) parts.push(text);
    }
    if (parts.length > 0) return parts.join(', ');
  }
  const placeName = pickString(raw.place_name);
  if (placeName) {
    // `place_name` looks like "Benasque, Aragón, España" — strip the
    // first segment because it duplicates the title above.
    const [, ...rest] = placeName.split(',').map((s) => s.trim());
    if (rest.length > 0) return rest.join(', ');
  }
  return '';
}

function parseLngLat(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function parseBbox(
  value: unknown,
): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const nums = value.slice(0, 4).map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
}

function pickPlaceType(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() !== '') return c.trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rough zoom mapping for places that came back without a bbox. The
 * numbers are tuned against the MapTiler `place_type` taxonomy:
 *
 *   country / continent  →  4
 *   region / subregion   →  7
 *   place / municipality →  12
 *   address              →  16
 *   poi / venue          →  15
 *
 * Anything we don't recognise gets a sensible default mid-range
 * zoom so the user still sees *something* useful instead of being
 * dumped at world view.
 */
function suggestZoomForPlaceType(placeType: string | null): number {
  switch (placeType) {
    case 'country':
    case 'continent':
      return 4;
    case 'region':
    case 'subregion':
    case 'county':
    case 'province':
      return 7;
    case 'place':
    case 'municipality':
    case 'city':
    case 'town':
    case 'village':
    case 'locality':
    case 'neighbourhood':
      return 12;
    case 'address':
    case 'postcode':
      return 16;
    case 'poi':
    case 'venue':
      return 15;
    default:
      return 11;
  }
}
