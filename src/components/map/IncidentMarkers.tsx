'use client';

import { useEffect, useRef } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import { useMapStore } from '@/store/useMapStore';
import type { Incident, SeverityLevel } from '@/types/incident';

interface Props {
  map: maptilersdk.Map;
}

const SEVERITY_COLOR: Record<SeverityLevel, string> = {
  mild: '#f5c518',
  moderate: '#f28b30',
  severe: '#d93025',
};

/**
 * Keeps one Mapbox marker per incident in the store, creating/updating/
 * removing them as the store changes. Uses DOM markers so we can style
 * them with BEM CSS rather than symbol layers.
 */
export function IncidentMarkers({ map }: Props) {
  const markers = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const incidents = useMapStore((s) => s.incidents);
  const select = useMapStore((s) => s.select);

  useEffect(() => {
    const active = new Set<string>();

    incidents.forEach((incident) => {
      active.add(incident.id);
      const existing = markers.current.get(incident.id);
      if (existing) {
        existing.setLngLat([incident.location.lng, incident.location.lat]);
        updateMarkerElement(existing.getElement(), incident);
      } else {
        const el = document.createElement('button');
        el.className = 'map-marker';
        updateMarkerElement(el, incident);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          select(incident.id);
        });
        const marker = new maptilersdk.Marker({ element: el })
          .setLngLat([incident.location.lng, incident.location.lat])
          .addTo(map);
        markers.current.set(incident.id, marker);
      }
    });

    // Remove markers for incidents no longer in the store
    markers.current.forEach((marker, id) => {
      if (!active.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [incidents, map, select]);

  return null;
}

function updateMarkerElement(el: HTMLElement, incident: Incident) {
  const color = SEVERITY_COLOR[incident.severity];
  el.style.width = '22px';
  el.style.height = '22px';
  el.style.borderRadius = '50%';
  el.style.background = color;
  el.style.border = '2px solid #0f1412';
  el.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.15)';
  el.style.cursor = 'pointer';
  el.setAttribute('aria-label', `${incident.type} — ${incident.severity}`);
  el.dataset.status = incident.status;
}
