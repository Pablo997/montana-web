export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

/** Fallback center if the user denies geolocation (Pyrenees roughly). */
export const DEFAULT_CENTER: [number, number] = [0.5, 42.65];
export const DEFAULT_ZOOM = 8;

/**
 * Shared raster-dem source used by BOTH terrain (3D extrusion) and
 * the optional hillshade overlay. Kept here (not in `customLayers`)
 * so the id is import-safe from server contexts that build URLs
 * referencing it without touching MapLibre.
 */
export const TERRAIN_DEM_SOURCE_ID = 'maptiler-dem';

export const TERRAIN_EXAGGERATION = 1.3;
