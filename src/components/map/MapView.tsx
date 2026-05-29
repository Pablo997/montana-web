'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import * as maptilersdk from '@maptiler/sdk';
import '@maptiler/sdk/style.css';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAPTILER_KEY,
} from '@/lib/mapbox/config';
import { getBasemap } from '@/lib/mapbox/basemaps';
import {
  applyHillshade,
  applyTerrain,
  removeHillshade,
  transformStyleKeepingMontanaLayers,
} from '@/lib/mapbox/customLayers';
import {
  readPersistedViewport,
  useMapPreferencesStore,
} from '@/store/useMapPreferencesStore';
import { fetchIncidentsInBbox, type BBox } from '@/lib/incidents/api';
import { bboxForTiles, tilesForBbox } from '@/lib/incidents/tile-cache';
import { useMapStore } from '@/store/useMapStore';
import { useRealtimeIncidents } from '@/hooks/useRealtimeIncidents';
import { IncidentMarkers } from './IncidentMarkers';
import { MapEmptyState } from './MapEmptyState';
import { ReportIncidentButton } from '@/components/incidents/ReportIncidentButton';
import { buildPermissionDeniedMessage } from '@/lib/geo/permissionMessage';
import {
  resolvePick as resolvePushCenterPick,
  useIsPickingPushCenter,
} from '@/lib/push/pickMode';
import type { LatLng } from '@/types/incident';
import type { PickedPlace } from './SearchBar';

// Map overlays that are NOT needed for the first paint of the map
// itself. Splitting them out of the initial bundle saves ~50-150 kB
// of JS that the user otherwise downloads before they can interact:
//
//   * SearchBar           — only used when the user types a place
//   * FilterPanel         — only opened on click; pulls a chip grid
//                            and the global filter store
//   * BasemapSwitcher     — only opened on click; pulls 6 style refs
//   * IncidentDetailsPanel — only mounted when a marker is selected
//   * ReportIncidentDialog — only mounted when the user reports an
//                            incident; transitively imports the
//                            image-compression + offline-queue libs
//
// `ssr: false` everywhere because these are all client-only overlays
// that read from zustand stores or interact with MapLibre directly.
// They render `null` on the server anyway.
const SearchBar = dynamic(
  () => import('./SearchBar').then((m) => m.SearchBar),
  { ssr: false },
);
const FilterPanel = dynamic(
  () => import('./FilterPanel').then((m) => m.FilterPanel),
  { ssr: false },
);
const BasemapSwitcher = dynamic(
  () => import('./BasemapSwitcher').then((m) => m.BasemapSwitcher),
  { ssr: false },
);
const IncidentDetailsPanel = dynamic(
  () =>
    import('@/components/incidents/IncidentDetailsPanel').then(
      (m) => m.IncidentDetailsPanel,
    ),
  { ssr: false },
);
const ReportIncidentDialog = dynamic(
  () =>
    import('@/components/incidents/ReportIncidentDialog').then(
      (m) => m.ReportIncidentDialog,
    ),
  { ssr: false },
);

maptilersdk.config.apiKey = MAPTILER_KEY;

export function MapView() {
  const t = useTranslations('map');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maptilersdk.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mergeIncidents = useMapStore((s) => s.mergeIncidents);
  const pickingLocation = useMapStore((s) => s.pickingLocation);
  const setReportLocation = useMapStore((s) => s.setReportLocation);
  const cancelPickingLocation = useMapStore((s) => s.cancelPickingLocation);
  const pickingPushCenter = useIsPickingPushCenter();
  const selectedId = useMapStore((s) => s.selectedId);
  const incidents = useMapStore((s) => s.incidents);
  const basemapId = useMapPreferencesStore((s) => s.basemapId);
  const hillshadeEnabled = useMapPreferencesStore((s) => s.hillshadeEnabled);
  // Mobile-friendly geolocation flow: the browser Geolocation API
  // refuses to re-prompt for permission on iOS Safari once it's been
  // denied, so we avoid firing it on mount (silent failure) and only
  // resolve a fix when the user explicitly taps the GeolocateControl.
  // This variable surfaces the resulting error to the UI so the user
  // understands why the map didn't move. It auto-clears after a few
  // seconds to avoid clutter.
  const [geoError, setGeoError] = useState<string | null>(null);

  // Deep-link / programmatic selection: whenever the selection changes
  // to a known incident, pan to it. Skip if the marker is already
  // within the current viewport so regular map clicks don't jitter.
  const selectedIncident = selectedId ? incidents.get(selectedId) ?? null : null;
  const selectedLng = selectedIncident?.location.lng ?? null;
  const selectedLat = selectedIncident?.location.lat ?? null;

  useRealtimeIncidents();

  // Stable ref so the moveend handler is only wired up once.
  const mergeIncidentsRef = useRef(mergeIncidents);
  mergeIncidentsRef.current = mergeIncidents;

  // `basemapId` is intentionally NOT in the deps below. We snapshot
  // the value once at mount-time so the initial style matches the
  // user's last preference, and from then on every style swap goes
  // through `map.setStyle()` in the dedicated effect further down.
  // Re-running the entire init effect on basemap change would tear
  // down and recreate the map (losing camera position, animation
  // state, all the markers IncidentMarkers tracks, etc.).
  const initialBasemapRef = useRef(basemapId);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Restore the user's last camera position synchronously. We read
    // localStorage directly (bypassing Zustand's async rehydration)
    // so MapLibre instantiates at the right place in one shot — no
    // "Pyrenees default, then flyTo" flash on F5.
    const savedViewport = readPersistedViewport();
    const initialCenter: [number, number] = savedViewport
      ? [savedViewport.lng, savedViewport.lat]
      : DEFAULT_CENTER;
    const initialZoom = savedViewport ? savedViewport.zoom : DEFAULT_ZOOM;

    const map = new maptilersdk.Map({
      container: containerRef.current,
      style: getBasemap(initialBasemapRef.current).style,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 45,
      // MapTiler SDK auto-mounts these by default; we opt out so they don't
      // end up duplicated alongside the ones we place ourselves.
      navigationControl: false,
      geolocateControl: false,
      // Cap the zoom at 18 instead of the MapLibre default of 22.
      //
      // Why this matters for cost: tile count quadruples per zoom
      // level. Hitting z=22 in the corner of the map for a couple
      // of seconds asks MapTiler for ~16x more tiles than z=20 for
      // the same area. For an outdoor / mountain app there's no
      // useful information past z=18 anyway — MapTiler's topo /
      // satellite imagery doesn't have higher native resolution
      // outside dense urban cores, so the user sees the same blur
      // either way and we just burn quota.
      //
      // 18 is also the threshold where individual house outlines
      // become legible on the streets style, which is the natural
      // ceiling for "I'm checking where I parked" UX.
      maxZoom: 18,
      // Globe projection. MapLibre 5 interpolates automatically between
      // a flat (Mercator) view when zoomed in and a 3D sphere when
      // zoomed out — so close-up navigation is unaffected, but zooming
      // all the way out shows the whole planet as a globe instead of a
      // stretched Mercator plane. This is the correct model for a
      // *global* app and fixes two artefacts in one move:
      //   * the black bands top/bottom (Mercator can't tile past ±85°
      //     latitude) — there's no void to expose on a sphere; and
      //   * the world repeating sideways on pan — a sphere has a single
      //     continuous surface, no antimeridian seam.
      // The `projection` option persists across `setStyle()` basemap
      // swaps, so we set it once here.
      //
      // We deliberately skip the SDK's `space` (starfield cubemap) and
      // `halo` (atmosphere shader) extras: both pull remote assets and
      // add per-frame GPU cost on every load — disproportionate for an
      // incident app (see docs/COST.md) and heavy enough to make the
      // software-WebGL CI runner time out on UI interactions. The flat
      // canvas background behind the globe already removes the black
      // bands; the decorative glow isn't worth the cost.
      projection: 'globe',
      // Floor the zoom at 1 so the globe can be seen in full when the
      // user zooms all the way out, without letting it shrink to a
      // fiddly speck.
      minZoom: 1,
    });

    // Only zoom / compass go through MapTiler's control layer. The
    // geolocate button is rendered as a regular React element below
    // so we can call `navigator.geolocation` directly inside its
    // onClick handler — iOS Safari refuses to raise the permission
    // prompt when the call is buried inside the SDK's internal event
    // wiring, even though it's technically a user gesture.
    map.addControl(new maptilersdk.NavigationControl({ visualizePitch: true }), 'top-right');

    // Tile IDs whose incidents have already been hydrated. Realtime keeps
    // these consistent with the DB, so we never need to refetch them.
    const hydratedTiles = new Set<string>();

    const loadVisibleIncidents = () => {
      const bounds = map.getBounds();
      // Clamp longitudes to [-180, 180]. When the user zooms out far
      // enough MapLibre wraps the world and returns west < -180 or
      // east > 180 (the camera shows multiple copies of the globe).
      // The bbox we send to PostGIS must stay in the canonical WGS84
      // range or the Zod schema rejects the payload before the RPC
      // even fires, leaving the map blank. Lat is unaffected because
      // the projection caps at ±85.05 well before the legal range.
      const viewport: BBox = {
        minLng: Math.max(-180, bounds.getWest()),
        minLat: Math.max(-90, bounds.getSouth()),
        maxLng: Math.min(180, bounds.getEast()),
        maxLat: Math.min(90, bounds.getNorth()),
      };

      const missing = tilesForBbox(viewport).filter((key) => !hydratedTiles.has(key));
      if (missing.length === 0) return;

      const fetchBbox = bboxForTiles(missing) ?? viewport;

      // Optimistically mark tiles as hydrated so a rapid `moveend` burst
      // doesn't dispatch duplicate RPCs for the same region.
      missing.forEach((key) => hydratedTiles.add(key));

      fetchIncidentsInBbox(fetchBbox)
        .then((list) => mergeIncidentsRef.current(list))
        .catch((err) => {
          console.error('Failed to load incidents', err);
          missing.forEach((key) => hydratedTiles.delete(key));
        });
    };

    // Debounce `moveend` so we don't spam the RPC while the user pans/zooms.
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const onMoveEnd = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(loadVisibleIncidents, 250);
    };

    // Persist viewport so F5 restores the same camera position. Heavier
    // debounce than the RPC loader because a localStorage write is
    // cheap but still synchronous on the main thread — 600 ms keeps
    // even a fast pan-zoom session to single-digit writes per minute.
    let savePosId: ReturnType<typeof setTimeout> | null = null;
    const onMoveEndSave = () => {
      if (savePosId) clearTimeout(savePosId);
      savePosId = setTimeout(() => {
        const c = map.getCenter();
        useMapPreferencesStore.getState().setLastViewport({
          lng: c.lng,
          lat: c.lat,
          zoom: map.getZoom(),
        });
      }, 600);
    };

    map.on('load', () => {
      applyTerrain(map);
      setMapReady(true);
      loadVisibleIncidents();
    });

    map.on('moveend', onMoveEnd);
    map.on('moveend', onMoveEndSave);

    // Brand fade-while-interacting. We set a data flag on the root
    // element on `movestart` and clear it on `moveend`. The
    // FloatingHeader's CSS keys its opacity off that flag, so the
    // logo + wordmark fade out while the user is panning/zooming
    // and fade back in once the gesture stops. Same UX pattern
    // Google Maps and Apple Maps use to keep on-map labels
    // discoverable without occluding the view during interaction.
    const setInteracting = (on: boolean) => {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      if (on) root.dataset.mapInteracting = 'true';
      else delete root.dataset.mapInteracting;
    };
    const onMoveStart = () => setInteracting(true);
    const onMoveEndFade = () => setInteracting(false);
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEndFade);

    mapRef.current = map;

    return () => {
      if (debounceId) clearTimeout(debounceId);
      if (savePosId) clearTimeout(savePosId);
      map.off('moveend', onMoveEnd);
      map.off('moveend', onMoveEndSave);
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEndFade);
      setInteracting(false);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Basemap swap. `setStyle()` wipes every custom source and layer,
  // so we re-attach terrain + hillshade once the new style finishes
  // loading. `IncidentMarkers` re-mounts via the `key={basemapId}`
  // prop below and rebuilds its own GeoJSON source from scratch using
  // the same retry-with-styledata-and-idle pattern as this effect.
  //
  // Crucially we do NOT toggle `mapReady` during the swap. Doing so
  // unmounted `IncidentMarkers` for the entire transition, and on
  // basemaps where `isStyleLoaded()` never flipped back to `true`
  // (a MapLibre 5 quirk on certain MapTiler styles) the component
  // would never remount and the icons disappeared until a full F5.
  // Keeping `mapReady` latched after the initial `load` lets the
  // markers layer ride out the swap on its own.
  //
  // We diff against `appliedBasemapRef` because the prefs store gets
  // hydrated from localStorage during the first commit; if we didn't
  // diff, that hydration would trigger a redundant `setStyle()` with
  // the same id as the initial style, throwing away the freshly-built
  // tile cache for no reason.
  const appliedBasemapRef = useRef(basemapId);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedBasemapRef.current === basemapId) return;
    appliedBasemapRef.current = basemapId;

    const nextStyle = getBasemap(basemapId).style;

    // Detach 3D terrain BEFORE the style swap. MapLibre keeps a
    // reference to the active terrain config and tries to render it
    // against the outgoing style for one frame after `setStyle()`
    // — the new painter doesn't yet have the terrain shader compiled,
    // so it crashes with the cryptic
    // `Cannot read properties of undefined (reading 'shaderPreludeCode')`.
    // Setting terrain to null releases the reference so the swap
    // happens against a flat painter, then we re-apply terrain once
    // the new style is parsed.
    try {
      map.setTerrain(null);
    } catch {
      /* not all SDK versions accept null here — defensive only */
    }

    // `transformStyle` carries our incident source + ghost layers (and
    // the DEM source) into the new style atomically, so the marker
    // layer never observes a frame without its source. This removes the
    // production-only race that made icons vanish on swap: previously we
    // remounted `IncidentMarkers` via `key={basemapId}` and re-added the
    // source from an effect, but that effect could bind its `styledata`
    // listener *after* MapLibre had already fired it (no StrictMode +
    // faster effects in prod), so the source was never recreated.
    //
    // Terrain (3D) and hillshade are NOT part of the style's
    // source/layer graph in the way `setTerrain` works, so we still
    // re-attach them once the swap settles. `isStyleLoaded()` is
    // unreliable right after `setStyle()`, hence the retry on both
    // `styledata` (per source) and `idle` (once everything settles).
    let done = false;
    const reapply = () => {
      if (done) return;
      if (!map.isStyleLoaded()) return;
      done = true;
      map.off('styledata', reapply);
      map.off('idle', reapply);
      try {
        applyTerrain(map);
      } catch {
        /* style may have been swapped again before we finished */
      }
      if (hillshadeEnabledRef.current) {
        try {
          applyHillshade(map);
        } catch {
          /* ditto */
        }
      }
    };
    map.on('styledata', reapply);
    map.on('idle', reapply);
    // Cast via `unknown`: our `transformStyle` works on a deliberately
    // loose structural `StyleLike` (we only touch `sources`/`layers`),
    // which doesn't satisfy the SDK's full `StyleSpecification` (it
    // requires `version` etc.). The runtime shape is correct.
    map.setStyle(nextStyle, {
      transformStyle: transformStyleKeepingMontanaLayers,
    } as unknown as Parameters<typeof map.setStyle>[1]);

    return () => {
      map.off('styledata', reapply);
      map.off('idle', reapply);
    };
  }, [basemapId]);

  // The `styledata` callback above closes over a stale value of
  // `hillshadeEnabled` if we read it directly. Mirror it in a ref so
  // the post-swap re-attach always sees the latest user preference.
  const hillshadeEnabledRef = useRef(hillshadeEnabled);
  useEffect(() => {
    hillshadeEnabledRef.current = hillshadeEnabled;
  }, [hillshadeEnabled]);

  // Hillshade toggle. Independent of basemap swap because the user
  // can toggle it on the current style without changing the basemap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (hillshadeEnabled) {
      applyHillshade(map);
    } else {
      removeHillshade(map);
    }
  }, [hillshadeEnabled, mapReady]);

  // Auto-dismiss the geolocation error banner after a few seconds so
  // it doesn't linger on top of the map once the user has read it.
  useEffect(() => {
    if (!geoError) return;
    const id = setTimeout(() => setGeoError(null), 6000);
    return () => clearTimeout(id);
  }, [geoError]);

  const [locating, setLocating] = useState(false);
  const userMarkerRef = useRef<maptilersdk.Marker | null>(null);

  // Shared with `/nearby`. If the key is `'1'` we know the user has
  // accepted the geolocation prompt at least once on this device, so
  // we can replay the request silently on subsequent visits.
  // Duplicated string (not imported) on purpose: the nearby module is
  // dynamically split out of the initial bundle and we don't want to
  // pull it back in just to share a constant.
  const AUTO_LOCATE_STORAGE_KEY = 'montana:nearby-auto-locate';

  /** Draws / moves the green dot for the user's current position.
   *  Shared between the manual "Locate me" button and the silent
   *  auto-locate on mount. */
  const placeUserMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([lng, lat]);
      return;
    }
    const el = document.createElement('div');
    el.style.width = '16px';
    el.style.height = '16px';
    el.style.borderRadius = '50%';
    el.style.background = '#2f8f6f';
    el.style.border = '3px solid #fff';
    el.style.boxShadow = '0 0 0 2px rgba(47, 143, 111, 0.35)';
    userMarkerRef.current = new maptilersdk.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);
  }, []);

  // Auto-centre on the user's location at first load, but ONLY when:
  //
  //   1. There is NO persisted viewport (= absolute first visit, or
  //      the user wiped storage). After the first session the saved
  //      viewport always wins — F5 returning the user to wherever
  //      they last looked beats "snap to me" every time, and matches
  //      what Google Maps / Komoot / Strava do.
  //   2. We have strong evidence of prior consent: Permissions API
  //      says `granted`, or a localStorage flag from a previous fix.
  //
  // We never auto-prompt on `prompt`/`unknown` — that's the anti-pattern
  // iOS Safari penalises. Silent failures are fine (we keep the
  // viewport from step 1) so the map stays usable even when GPS
  // is denied / off.
  useEffect(() => {
    if (!mapReady) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    // Respect the restored camera position: if we already opened the
    // map at the user's last viewport, jumping to GPS would feel like
    // the app overruling them.
    if (readPersistedViewport()) return;

    let cancelled = false;

    const tryAutoLocate = async () => {
      let shouldAuto = false;
      const perms = navigator.permissions;
      if (perms && typeof perms.query === 'function') {
        try {
          const res = await perms.query({ name: 'geolocation' as PermissionName });
          shouldAuto = res.state === 'granted';
        } catch {
          /* fall through to localStorage check */
        }
      }
      if (!shouldAuto) {
        try {
          shouldAuto = localStorage.getItem(AUTO_LOCATE_STORAGE_KEY) === '1';
        } catch {
          /* storage disabled — give up silently */
        }
      }
      if (!shouldAuto || cancelled) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const map = mapRef.current;
          if (!map) return;
          const { latitude: lat, longitude: lng } = pos.coords;
          map.jumpTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 12) });
          placeUserMarker(lng, lat);
        },
        () => {
          // Silent failure on purpose. The user can still tap the
          // locate button to get a real error message if they want
          // to debug. Clear the flag on hard denial so we stop
          // auto-prompting until they consent again.
          try {
            localStorage.removeItem(AUTO_LOCATE_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        },
        { enableHighAccuracy: false, timeout: 8_000, maximumAge: 5 * 60_000 },
      );
    };

    void tryAutoLocate();
    return () => {
      cancelled = true;
    };
    // Mount-only after mapReady flips: re-running on placeUserMarker
    // identity changes would re-jump the camera on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  const handleLocate = async () => {
    const map = mapRef.current;
    if (!map) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Your browser does not expose the location API.');
      return;
    }

    setGeoError(null);
    setLocating(true);

    // Read the current permission state so we can give the user an
    // accurate explanation. iOS Safari ≥16 supports this; older
    // versions (and some Android stock browsers) throw — silence the
    // throw and fall back to calling getCurrentPosition directly so
    // the normal error-code path still runs.
    let permissionState: PermissionState | 'unknown' = 'unknown';
    try {
      const perms: Permissions | undefined = navigator.permissions;
      if (perms && typeof perms.query === 'function') {
        const res = await perms.query({ name: 'geolocation' as PermissionName });
        permissionState = res.state;
      }
    } catch {
      /* older browsers: keep 'unknown', proceed to direct call */
    }

    if (permissionState === 'denied') {
      setLocating(false);
      setGeoError(buildPermissionDeniedMessage(navigator.userAgent, permissionState));
      return;
    }

    // Direct call, synchronous with the click → keeps iOS Safari happy
    // about the user-gesture requirement.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13) });
        placeUserMarker(lng, lat);
        // Remember consent so future loads can auto-centre silently.
        try {
          localStorage.setItem(AUTO_LOCATE_STORAGE_KEY, '1');
        } catch {
          /* private mode / storage disabled — no memory, fine */
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          try {
            localStorage.removeItem(AUTO_LOCATE_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
        const msg =
          err.code === 1
            ? buildPermissionDeniedMessage(navigator.userAgent)
            : err.code === 2
              ? 'Location unavailable. Move outdoors or enable Wi-Fi / GPS.'
              : 'Could not get your location. Try again in a moment.';
        setGeoError(msg);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedLng == null || selectedLat == null) return;
    const bounds = map.getBounds();
    const alreadyVisible =
      selectedLng >= bounds.getWest() &&
      selectedLng <= bounds.getEast() &&
      selectedLat >= bounds.getSouth() &&
      selectedLat <= bounds.getNorth();
    if (alreadyVisible) return;
    map.flyTo({ center: [selectedLng, selectedLat], zoom: Math.max(map.getZoom(), 13) });
  }, [selectedLng, selectedLat]);

  // Location-picking mode: next click on the map becomes the incident location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickingLocation) return;

    const canvas = map.getCanvas();
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';

    const onClick = (e: maptilersdk.MapMouseEvent) => {
      const loc: LatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      setReportLocation(loc);
    };

    map.once('click', onClick);

    return () => {
      canvas.style.cursor = prevCursor;
      map.off('click', onClick);
    };
  }, [pickingLocation, setReportLocation]);

  // Push-notification center picking: mirrors the flow above but
  // resolves a promise via the pickMode singleton instead of touching
  // the report store. Separate effect so the two picks never collide;
  // if both were active the first to fire would resolve the wrong one.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickingPushCenter) return;

    const canvas = map.getCanvas();
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';

    const onClick = (e: maptilersdk.MapMouseEvent) => {
      resolvePushCenterPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolvePushCenterPick(null);
    };

    map.once('click', onClick);
    window.addEventListener('keydown', onKey);

    return () => {
      canvas.style.cursor = prevCursor;
      map.off('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickingPushCenter]);

  // Default incident location when the user hits Report without
  // picking a spot on the map. We use the current map centre (which
  // will match the user's location if they pressed the GeolocateControl
  // first) instead of forcing a browser permission prompt up front.
  const fallbackLocation: LatLng = mapRef.current
    ? (() => {
        const c = mapRef.current.getCenter();
        return { lat: c.lat, lng: c.lng };
      })()
    : { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] };

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" />
      {mapReady && mapRef.current ? (
        // No `key={basemapId}` on purpose: the basemap-swap effect
        // preserves the incident source via `transformStyle`, so the
        // marker layer must stay mounted across swaps. Remounting it
        // re-introduced the prod race where the source was never
        // recreated and icons disappeared.
        <IncidentMarkers map={mapRef.current} />
      ) : null}

      <div className="map__overlay map__overlay--top-left">
        <SearchBar
          getMapContext={() => {
            const map = mapRef.current;
            if (!map) return { center: null };
            const c = map.getCenter();
            return { center: [c.lng, c.lat] };
          }}
          onSelect={(place: PickedPlace) => {
            const map = mapRef.current;
            if (!map) return;
            // Prefer the geocoder's bbox when present — `fitBounds`
            // frames the whole feature (city centre / valley / range)
            // far better than a hard-coded zoom level.
            if (place.bbox) {
              map.fitBounds(
                [
                  [place.bbox[0], place.bbox[1]],
                  [place.bbox[2], place.bbox[3]],
                ],
                { padding: 60, duration: 800 },
              );
            } else {
              map.flyTo({
                center: place.center,
                zoom: place.suggestedZoom,
                duration: 800,
              });
            }
          }}
        />
      </div>

      {/* Incident filters live in the *bottom*-left so they're not
          adjacent to the place-search bar above. Two pieces of
          filtering UI side by side led users to assume the chips
          were narrowing the search dropdown (they aren't — they
          filter map markers). Putting filters at the opposite end
          of the map breaks that association and reinforces that
          they belong to the map / incident layer. */}
      <div className="map__overlay map__overlay--bottom-left">
        <FilterPanel />
      </div>

      <div className="map__overlay map__overlay--bottom-right">
        <BasemapSwitcher />
        <button
          type="button"
          className="map__locate"
          onClick={handleLocate}
          disabled={locating}
          aria-label="Center map on my location"
          title="Center map on my location"
        >
          {locating ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="map__locate-spinner"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-6.2-8.55" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3.2" fill="currentColor" />
              <circle cx="12" cy="12" r="7" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
            </svg>
          )}
        </button>
        {/* Companion entry point for the text-first /nearby list. The
            icon and aria-label sit next to the locate / report controls
            because all three answer variants of "what's around me?"; we
            want users to find them without scanning the whole UI. The
            list view is critical for slow-connection / a11y scenarios
            (see /nearby page header for the full rationale). */}
        <Link
          href="/nearby"
          className="map__locate map__list-toggle"
          aria-label={t('listToggleAriaLabel')}
          title={t('listToggleTitle')}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="1" fill="currentColor" />
            <circle cx="4" cy="12" r="1" fill="currentColor" />
            <circle cx="4" cy="18" r="1" fill="currentColor" />
          </svg>
        </Link>
        <ReportIncidentButton fallbackLocation={fallbackLocation} />
      </div>

      {mapReady ? <MapEmptyState /> : null}

      {pickingLocation ? (
        <div className="map__pick-banner" role="status">
          <span>Tap the map to pick the incident location</span>
          <button type="button" className="button" onClick={cancelPickingLocation}>
            Cancel
          </button>
        </div>
      ) : null}

      {pickingPushCenter ? (
        <div className="map__pick-banner" role="status">
          <span>Tap the map to set your alert center</span>
          <button
            type="button"
            className="button"
            onClick={() => resolvePushCenterPick(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {geoError ? (
        <div className="map__geo-error" role="alert">
          <span>{geoError}</span>
          <button
            type="button"
            className="map__geo-error-close"
            aria-label="Dismiss"
            onClick={() => setGeoError(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      <IncidentDetailsPanel />
      <ReportIncidentDialog />
    </div>
  );
}
