export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

/** Default map style — outdoors shows contour lines and hiking-friendly POIs. */
export const DEFAULT_MAP_STYLE = 'mapbox://styles/mapbox/outdoors-v12';

/** Fallback center if the user denies geolocation (Pyrenees roughly). */
export const DEFAULT_CENTER: [number, number] = [0.5, 42.65];
export const DEFAULT_ZOOM = 8;

export const TERRAIN_SOURCE = {
  id: 'mapbox-dem',
  spec: {
    type: 'raster-dem' as const,
    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    tileSize: 512,
    maxzoom: 14,
  },
};

export const TERRAIN_EXAGGERATION = 1.3;
