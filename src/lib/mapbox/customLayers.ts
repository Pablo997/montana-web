import type * as maptilersdk from '@maptiler/sdk';
import {
  MAPTILER_KEY,
  TERRAIN_DEM_SOURCE_ID,
  TERRAIN_EXAGGERATION,
} from './config';

/**
 * Idempotent helpers that re-establish the custom sources / layers we
 * need on top of any basemap style. They exist as standalone functions
 * (not inside `MapView`) because `map.setStyle()` wipes everything we
 * added on top of the previous style, so the same setup has to run
 * twice: once on initial `load`, and again on every `styledata` event
 * that follows a style swap.
 *
 * Design notes:
 *
 *   * Every helper short-circuits when the artefact already exists. We
 *     intentionally don't `getStyle().sources.dem` etc. — those checks
 *     get brittle under timing edge cases. The cheaper test is the
 *     public `getSource()` / `getLayer()` API.
 *
 *   * The hillshade layer is inserted **below** the first symbol layer
 *     of the active style. Adding to the top covers labels with grey
 *     pixels and looks awful on Satellite + Hybrid where you most
 *     want the relief. Symbol layers carry all the labelling, so
 *     finding the first one and inserting before it is the
 *     standard MapLibre recipe.
 */

export const HILLSHADE_LAYER_ID = 'montana-hillshade';

// IDs of the GeoJSON incident source and its two ghost layers. They
// live here — the home of every artefact Montana adds on top of a
// basemap — so the style-swap transform can preserve them without the
// lib layer importing from the `IncidentMarkers` React component.
export const INCIDENTS_SOURCE_ID = 'incidents-src';
export const INCIDENTS_GHOST_CLUSTER_LAYER_ID = 'incidents-ghost-clusters';
export const INCIDENTS_GHOST_POINT_LAYER_ID = 'incidents-ghost-points';

// Minimal structural view of a MapLibre style — enough to relocate our
// own sources / layers across a swap without depending on the SDK's
// (unexported) `StyleSpecification` type.
type StyleLike = {
  sources?: Record<string, unknown>;
  layers?: Array<{ id: string }>;
  [key: string]: unknown;
};

// What we carry across a basemap swap. We deliberately preserve the
// incident source + ghost layers (the bit that races on remount) and
// the shared DEM source (saves a redundant tiles.json fetch), but NOT
// the hillshade layer: `applyHillshade` re-inserts it *below the first
// symbol layer* of the new style, and a preserved copy would land on
// top of the labels instead.
const PRESERVED_SOURCE_IDS = [TERRAIN_DEM_SOURCE_ID, INCIDENTS_SOURCE_ID];
const PRESERVED_LAYER_IDS = [
  INCIDENTS_GHOST_CLUSTER_LAYER_ID,
  INCIDENTS_GHOST_POINT_LAYER_ID,
];

/**
 * `setStyle({ transformStyle })` hook that carries Montana's own
 * sources + layers across a basemap swap.
 *
 * MapLibre wipes every custom source / layer when a new style loads.
 * The canonical fix is this transform: it merges the incoming basemap
 * with the artefacts we injected on top of the previous one, in the
 * same frame the style is applied.
 *
 * Why this beats remounting the marker layer: re-adding the source
 * from a React effect after the swap *races* the `styledata` event. In
 * production (no StrictMode, faster effects) `styledata` can fire
 * before the child effect binds its listener, so the source never gets
 * recreated and the icons vanish until a full reload. Preserving the
 * source through the transform means it never disappears — there is no
 * window to race.
 *
 * The GeoJSON `data` and cluster config ride along automatically
 * because `getStyle()` serialises them inline into `previous`.
 */
export function transformStyleKeepingMontanaLayers(
  previous: StyleLike | undefined,
  next: StyleLike | undefined,
): StyleLike {
  if (!next) return previous ?? { sources: {}, layers: [] };
  if (!previous) return next;

  const sources: Record<string, unknown> = { ...(next.sources ?? {}) };
  for (const id of PRESERVED_SOURCE_IDS) {
    const prevSource = previous.sources?.[id];
    if (prevSource) sources[id] = prevSource;
  }

  const carriedLayers = (previous.layers ?? []).filter((layer) =>
    PRESERVED_LAYER_IDS.includes(layer.id),
  );

  return {
    ...next,
    sources,
    layers: [...(next.layers ?? []), ...carriedLayers],
  };
}

/**
 * The MapTiler SDK ships MapLibre's type definitions internally but
 * doesn't re-export `RasterDEMSourceSpecification`. We use a `const`
 * with `as const` on the type literal so MapLibre infers the discriminated
 * `'raster-dem'` variant correctly when this is passed to `addSource`.
 */
function demSourceSpec() {
  return {
    type: 'raster-dem' as const,
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
    tileSize: 512,
    maxzoom: 14,
  };
}

/**
 * Ensures the shared DEM source is registered. Both `applyTerrain` and
 * `applyHillshade` call this; you don't normally invoke it directly,
 * but it's exported so callers can pre-warm the source (e.g. on map
 * `load` even if neither feature is currently active).
 */
export function ensureDemSource(map: maptilersdk.Map): void {
  if (!map.getSource(TERRAIN_DEM_SOURCE_ID)) {
    map.addSource(TERRAIN_DEM_SOURCE_ID, demSourceSpec());
  }
}

/**
 * Installs the 3D terrain extrusion using the shared DEM source. Safe
 * to call repeatedly: MapLibre treats `setTerrain` with the same spec
 * as a no-op.
 */
export function applyTerrain(map: maptilersdk.Map): void {
  ensureDemSource(map);
  map.setTerrain({
    source: TERRAIN_DEM_SOURCE_ID,
    exaggeration: TERRAIN_EXAGGERATION,
  });
}

/**
 * Adds the hillshade overlay just below the first label / symbol
 * layer. No-op if it's already present.
 *
 * Tuning notes:
 *
 *   * `exaggeration: 1.0` — full strength on purpose. Outdoor and
 *     Topo basemaps already include a baked-in hillshade, so a
 *     subtle layer on top is invisible. Pushing to 1.0 makes the
 *     toggle a real visual change on every basemap (most noticeable
 *     on Satellite and Streets where there's no baked relief).
 *   * Warm-shadow colour (`#3b2b1a`) borrowed from cartographic
 *     conventions for outdoor / topographic styling: pure black
 *     looks like a UI artefact, warm brown reads as "natural
 *     terrain". The matching accent extends the effect to slopes
 *     that face neither sun nor shadow.
 *   * `findFirstSymbolLayer` places us below labels but ABOVE all
 *     fill / raster layers in the basemap (including the satellite
 *     imagery and the existing hillshade in Outdoor / Topo). The
 *     additive blend is what gives the user a perceptible change.
 */
export function applyHillshade(map: maptilersdk.Map): void {
  ensureDemSource(map);
  if (map.getLayer(HILLSHADE_LAYER_ID)) return;
  const beforeId = findFirstSymbolLayer(map);
  map.addLayer(
    {
      id: HILLSHADE_LAYER_ID,
      type: 'hillshade',
      source: TERRAIN_DEM_SOURCE_ID,
      paint: {
        'hillshade-shadow-color': '#3b2b1a',
        'hillshade-highlight-color': 'rgba(255, 245, 230, 0.85)',
        'hillshade-accent-color': '#6e4a26',
        'hillshade-exaggeration': 1,
      },
    },
    beforeId,
  );
}

/**
 * Removes the hillshade overlay if present. Leaves the DEM source
 * alone because terrain may still depend on it; removing it would
 * collapse the 3D extrusion on the next render.
 */
export function removeHillshade(map: maptilersdk.Map): void {
  if (map.getLayer(HILLSHADE_LAYER_ID)) {
    map.removeLayer(HILLSHADE_LAYER_ID);
  }
}

/**
 * Returns the id of the first symbol (= label) layer in the active
 * style, or undefined when the style has none (rare — happens on
 * label-free variants). When undefined, MapLibre appends to the top
 * of the stack, which is acceptable for those styles because there
 * are no labels to bury.
 */
function findFirstSymbolLayer(map: maptilersdk.Map): string | undefined {
  const layers = map.getStyle().layers ?? [];
  for (const layer of layers) {
    if (layer.type === 'symbol') return layer.id;
  }
  return undefined;
}
