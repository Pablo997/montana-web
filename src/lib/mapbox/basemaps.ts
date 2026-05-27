import { MapStyle } from '@maptiler/sdk';
import type { ReferenceMapStyle, MapStyleVariant } from '@maptiler/client';

/**
 * The set of basemaps Montana exposes to the user. Curated rather
 * than exhaustive: every MapTiler reference style has a place
 * somewhere, but a 12-item picker dilutes the UX. These six cover
 * every outdoor use case we can articulate:
 *
 *   * `outdoor`   — default. Hiking-tuned topo with POIs, trails,
 *                   shaded relief baked in.
 *   * `topo`      — denser contour lines, fewer labels. Best for
 *                   navigation / orientation off-trail.
 *   * `satellite` — pure imagery. Identifies real-world terrain
 *                   features the symbolised maps abstract away
 *                   (recent burns, snow cover, scree fields).
 *   * `hybrid`    — satellite + place labels. Compromise pick.
 *   * `streets`   — fallback for urban approaches and trailheads.
 *   * `winter`    — ski-piste / snowsports styling. Optional but
 *                   cheap to include given the audience overlap.
 *
 * Keep this list in sync with `messages/*.json -> map.basemap.*`
 * — the `id` IS the i18n key suffix.
 */

export type BasemapId =
  | 'outdoor'
  | 'topo'
  | 'satellite'
  | 'hybrid'
  | 'streets'
  | 'winter';

/**
 * The runtime type of `MapStyle.OUTDOOR_V4` is `ReferenceMapStyle`
 * (an opaque branded object that MapTiler's `styleToStyle` resolves
 * at map creation time). We accept either Reference or Variant so a
 * future preset that points at a specific variant (e.g. dark-mode
 * topo) still type-checks.
 */
export interface Basemap {
  id: BasemapId;
  style: ReferenceMapStyle | MapStyleVariant;
}

export const BASEMAPS: ReadonlyArray<Basemap> = [
  { id: 'outdoor', style: MapStyle.OUTDOOR },
  { id: 'topo', style: MapStyle.TOPO },
  { id: 'satellite', style: MapStyle.SATELLITE },
  { id: 'hybrid', style: MapStyle.HYBRID },
  { id: 'streets', style: MapStyle.STREETS },
  { id: 'winter', style: MapStyle.WINTER },
];

export const DEFAULT_BASEMAP_ID: BasemapId = 'outdoor';

/**
 * Returns the Basemap entry for an id, falling back to the default
 * when the id is unknown or null. The default branch protects us
 * against future renames in localStorage payloads.
 */
export function getBasemap(id: string | null | undefined): Basemap {
  return (
    BASEMAPS.find((b) => b.id === id) ??
    (BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP_ID) as Basemap)
  );
}
