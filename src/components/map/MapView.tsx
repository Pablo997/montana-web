'use client';

import { useEffect, useRef, useState } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import '@maptiler/sdk/style.css';
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
  MAPTILER_KEY,
  TERRAIN_EXAGGERATION,
  TERRAIN_SOURCE,
} from '@/lib/mapbox/config';
import { fetchIncidentsInBbox, type BBox } from '@/lib/incidents/api';
import { bboxForTiles, tilesForBbox } from '@/lib/incidents/tile-cache';
import { useMapStore } from '@/store/useMapStore';
import { useRealtimeIncidents } from '@/hooks/useRealtimeIncidents';
import { IncidentMarkers } from './IncidentMarkers';
import { FilterPanel } from './FilterPanel';
import { MapEmptyState } from './MapEmptyState';
import { IncidentDetailsPanel } from '@/components/incidents/IncidentDetailsPanel';
import { ReportIncidentButton } from '@/components/incidents/ReportIncidentButton';
import { ReportIncidentDialog } from '@/components/incidents/ReportIncidentDialog';
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
  const selectedId = useMapStore((s) => s.selectedId);
  const incidents = useMapStore((s) => s.incidents);
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maptilersdk.Map({
      container: containerRef.current,
      style: DEFAULT_MAP_STYLE,
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
      map.addSource(TERRAIN_SOURCE.id, TERRAIN_SOURCE.spec);
      map.setTerrain({ source: TERRAIN_SOURCE.id, exaggeration: TERRAIN_EXAGGERATION });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (navigator.permissions as any)?.query?.({
        name: 'geolocation',
      });
      if (res?.state) permissionState = res.state as PermissionState;
    } catch {
      /* older browsers: keep 'unknown', proceed to direct call */
    }

    if (permissionState === 'denied') {
      setLocating(false);
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      setGeoError(
        isIOS
          ? 'Safari has this site marked as "Deny". Tap "aA" on the URL bar → Website Settings → Location → Ask. Then reload.'
          : isAndroid
            ? 'Chrome has this site marked as "Blocked". Tap the padlock on the URL bar → Permissions → Location → Allow.'
            : 'Your browser has this site marked as blocked for location. Open the site settings (padlock icon) and allow it.',
      );
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
        const ua = navigator.userAgent;
        const isIOS = /iP(hone|ad|od)/.test(ua);
        const isAndroid = /Android/.test(ua);
        const msg =
          err.code === 1
            ? isIOS
              ? 'Safari denied location for this site. Tap "aA" on the URL bar → Website Settings → Location → Ask.'
              : isAndroid
                ? 'Chrome denied location for this site. Tap the padlock on the URL bar → Permissions → Location → Allow.'
                : 'Location blocked. Open the site settings (padlock icon) and allow location.'
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
      {mapReady && mapRef.current ? <IncidentMarkers map={mapRef.current} /> : null}

      <div className="map__overlay map__overlay--top-left">
        <FilterPanel />
      </div>

      <div className="map__overlay map__overlay--bottom-right">
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
