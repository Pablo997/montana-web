'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
  MAPBOX_TOKEN,
  TERRAIN_EXAGGERATION,
  TERRAIN_SOURCE,
} from '@/lib/mapbox/config';
import { fetchNearbyIncidents } from '@/lib/incidents/api';
import { useMapStore } from '@/store/useMapStore';
import { useRealtimeIncidents } from '@/hooks/useRealtimeIncidents';
import { useGeolocation } from '@/hooks/useGeolocation';
import { IncidentMarkers } from './IncidentMarkers';
import { IncidentDetailsPanel } from '@/components/incidents/IncidentDetailsPanel';

mapboxgl.accessToken = MAPBOX_TOKEN;

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const setIncidents = useMapStore((s) => s.setIncidents);
  const { position } = useGeolocation();

  useRealtimeIncidents();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: DEFAULT_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 45,
      attributionControl: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'bottom-right',
    );

    map.on('load', () => {
      map.addSource(TERRAIN_SOURCE.id, TERRAIN_SOURCE.spec);
      map.setTerrain({ source: TERRAIN_SOURCE.id, exaggeration: TERRAIN_EXAGGERATION });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      {mapRef.current ? <IncidentMarkers map={mapRef.current} /> : null}
      <IncidentDetailsPanel />
    </div>
  );
}
