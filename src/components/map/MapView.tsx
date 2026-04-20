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
import { fetchNearbyIncidents } from '@/lib/incidents/api';
import { useMapStore } from '@/store/useMapStore';
import { useRealtimeIncidents } from '@/hooks/useRealtimeIncidents';
import { useGeolocation } from '@/hooks/useGeolocation';
import { IncidentMarkers } from './IncidentMarkers';
import { IncidentDetailsPanel } from '@/components/incidents/IncidentDetailsPanel';

maptilersdk.config.apiKey = MAPTILER_KEY;

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maptilersdk.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const setIncidents = useMapStore((s) => s.setIncidents);
  const { position } = useGeolocation();

  useRealtimeIncidents();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maptilersdk.Map({
      container: containerRef.current,
      style: DEFAULT_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 45,
      attributionControl: true,
    });

    map.addControl(new maptilersdk.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(
      new maptilersdk.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'bottom-right',
    );

    map.on('load', () => {
      map.addSource(TERRAIN_SOURCE.id, TERRAIN_SOURCE.spec);
      map.setTerrain({ source: TERRAIN_SOURCE.id, exaggeration: TERRAIN_EXAGGERATION });
      setMapReady(true);
    });

    mapRef.current = map;

    // Load incidents around the default center immediately so the map is
    // never empty even if the user denies geolocation.
    fetchNearbyIncidents(DEFAULT_CENTER[0], DEFAULT_CENTER[1], 100_000)
      .then(setIncidents)
      .catch((err) => console.error('Failed to load incidents', err));

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [setIncidents]);

  useEffect(() => {
    if (!position) return;
    mapRef.current?.flyTo({ center: [position.lng, position.lat], zoom: 12 });

    fetchNearbyIncidents(position.lng, position.lat)
      .then(setIncidents)
      .catch((err) => console.error('Failed to load incidents', err));
  }, [position, setIncidents]);

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" />
      {mapReady && mapRef.current ? <IncidentMarkers map={mapRef.current} /> : null}
      <IncidentDetailsPanel />
    </div>
  );
}
