export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

/** Outdoor style with contour lines and hiking POIs. */
export const DEFAULT_MAP_STYLE = 'outdoor-v2';

/** Fallback center if the user denies geolocation (Pyrenees roughly). */
export const DEFAULT_CENTER: [number, number] = [0.5, 42.65];
export const DEFAULT_ZOOM = 8;

export const TERRAIN_SOURCE = {
  id: 'maptiler-dem',
  spec: {
    type: 'raster-dem' as const,
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
    tileSize: 512,
    maxzoom: 14,
  },
};

export const TERRAIN_EXAGGERATION = 1.3;
