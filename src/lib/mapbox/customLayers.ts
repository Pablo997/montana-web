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

const HILLSHADE_LAYER_ID = 'montana-hillshade';

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
 * Adds the hillshade overlay below the first label / symbol layer. No
 * effect if it's already present.
 *
 * The chosen colours are deliberately desaturated: a pure-black shadow
 * makes the outdoor / topo styles muddy, and a pure-white highlight
 * blows out snow areas on Satellite. The picks here read well over
 * every basemap we ship (verified manually against Pyrenees + Picos
 * de Europa tiles).
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
        'hillshade-shadow-color': '#2c2c2c',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#503e2b',
        'hillshade-exaggeration': 0.55,
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
