'use client';

import { useEffect, useRef, useState } from 'react';
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
} from '@/lib/mapbox/customLayers';
import { useMapPreferencesStore } from '@/store/useMapPreferencesStore';
import { fetchIncidentsInBbox, type BBox } from '@/lib/incidents/api';
import { bboxForTiles, tilesForBbox } from '@/lib/incidents/tile-cache';
import { useMapStore } from '@/store/useMapStore';
import { useRealtimeIncidents } from '@/hooks/useRealtimeIncidents';
import { IncidentMarkers } from './IncidentMarkers';
import { FilterPanel } from './FilterPanel';
import { BasemapSwitcher } from './BasemapSwitcher';
import { MapEmptyState } from './MapEmptyState';
import { IncidentDetailsPanel } from '@/components/incidents/IncidentDetailsPanel';
import { ReportIncidentButton } from '@/components/incidents/ReportIncidentButton';
import { ReportIncidentDialog } from '@/components/incidents/ReportIncidentDialog';
import { buildPermissionDeniedMessage } from '@/lib/geo/permissionMessage';
import {
  resolvePick as resolvePushCenterPick,
  useIsPickingPushCenter,
} from '@/lib/push/pickMode';
import type { LatLng } from '@/types/incident';

maptilersdk.config.apiKey = MAPTILER_KEY;

export function MapView() {
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

    const map = new maptilersdk.Map({
      container: containerRef.current,
      style: getBasemap(initialBasemapRef.current).style,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 45,
      // MapTiler SDK auto-mounts these by default; we opt out so they don't
      // end up duplicated alongside the ones we place ourselves.
      navigationControl: false,
      geolocateControl: false,
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
      const viewport: BBox = {
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth(),
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

    map.on('load', () => {
      applyTerrain(map);
      setMapReady(true);
      loadVisibleIncidents();
    });

    map.on('moveend', onMoveEnd);

    mapRef.current = map;

    return () => {
      if (debounceId) clearTimeout(debounceId);
      map.off('moveend', onMoveEnd);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Basemap swap. `setStyle()` wipes every custom source and layer,
  // so we wait for the `styledata` event MapLibre fires once the new
  // style finishes loading, then re-attach terrain + hillshade. The
  // IncidentMarkers component re-mounts through its `key` prop below
  // and rebuilds its own GeoJSON source from scratch.
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

    setMapReady(false);
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

    // `style.load` is MapLibre's "the new style spec is fully parsed
    // and applied" event — fires exactly once per `setStyle()` call.
    // It's the right hook for re-attaching our custom sources / layers:
    //
    //   * `styledata` fires repeatedly during a style swap (once per
    //     source ready) and `isStyleLoaded()` flickers between true
    //     and false during the same window, which previously made
    //     `IncidentMarkers` race the parser and crash with
    //     "Style is not done loading" when it tried to add its
    //     GeoJSON source.
    //   * `idle` would also work but only fires once tiles are
    //     loaded, which can be seconds later on a slow network — we
    //     don't want to hold `mapReady` that long.
    map.once('style.load', () => {
      applyTerrain(map);
      if (hillshadeEnabledRef.current) applyHillshade(map);
      setMapReady(true);
    });
    map.setStyle(nextStyle);
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

        // Simple dot marker; re-used across subsequent presses instead
        // of stacking new DOM elements on the map.
        if (userMarkerRef.current) {
          userMarkerRef.current.setLngLat([lng, lat]);
        } else {
          const el = document.createElement('div');
          el.style.width = '16px';
          el.style.height = '16px';
          el.style.borderRadius = '50%';
          el.style.background = '#2f8f6f';
          el.style.border = '3px solid #fff';
          el.style.boxShadow = '0 0 0 2px rgba(47, 143, 111, 0.35)';
          userMarkerRef.current = new maptilersdk.Marker({
            element: el,
            anchor: 'center',
          })
            .setLngLat([lng, lat])
            .addTo(map);
        }
      },
      (err) => {
        setLocating(false);
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
        // `key` forces a full remount whenever the basemap changes.
        // `setStyle` wipes the GeoJSON source IncidentMarkers
        // registers, so the cleanest reset is a fresh mount that
        // re-runs all the source / ghost-layer setup from scratch.
        <IncidentMarkers key={basemapId} map={mapRef.current} />
      ) : null}

      <div className="map__overlay map__overlay--top-left">
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
