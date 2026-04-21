'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import { useMapStore } from '@/store/useMapStore';
import type { Incident, SeverityLevel } from '@/types/incident';
import { getExpiryInfo } from '@/lib/incidents/expiry';
import { useClock } from '@/hooks/useClock';
import { incidentMatchesFilters } from './FilterPanel';

interface Props {
  map: maptilersdk.Map;
}

const SEVERITY_COLOR: Record<SeverityLevel, string> = {
  mild: '#f5c518',
  moderate: '#f28b30',
  severe: '#d93025',
};

/**
 * Keeps one MapTiler marker per incident in the store, creating/updating/
 * removing them as the store changes. Uses DOM markers so we can style
 * them with BEM CSS rather than symbol layers.
 */
export function IncidentMarkers({ map }: Props) {
  const markers = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const incidents = useMapStore((s) => s.incidents);
  const filters = useMapStore((s) => s.filters);
  const select = useMapStore((s) => s.select);
  // Coarse 60s tick so "expiring soon" styling kicks in as time passes
  // without reloading the viewport.
  const now = useClock(60_000);

  // Recompute the visible slice whenever the store, filters or the
  // coarse clock change. The memo keeps the reference stable when
  // nothing actually moved so the effect below does not churn.
  const visibleIncidents = useMemo(() => {
    const list: Incident[] = [];
    incidents.forEach((incident) => {
      if (incidentMatchesFilters(incident, filters)) list.push(incident);
    });
    return list;
  }, [incidents, filters]);

  useEffect(() => {
    const active = new Set<string>();

    visibleIncidents.forEach((incident) => {
      active.add(incident.id);
      const existing = markers.current.get(incident.id);
      if (existing) {
        existing.setLngLat([incident.location.lng, incident.location.lat]);
        updateMarkerElement(existing.getElement(), incident, now);
      } else {
        const el = document.createElement('button');
        el.className = 'map-marker';
        updateMarkerElement(el, incident, now);
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

    // Remove markers for incidents filtered out or no longer in the store.
    markers.current.forEach((marker, id) => {
      if (!active.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [visibleIncidents, map, select, now]);

  return null;
}

function updateMarkerElement(el: HTMLElement, incident: Incident, now: number) {
  const color = SEVERITY_COLOR[incident.severity];
  const expiry = getExpiryInfo(incident, now);

  el.style.width = '22px';
  el.style.height = '22px';
  el.style.borderRadius = '50%';
  el.style.background = color;
  el.style.border = '2px solid #0f1412';
  el.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.15)';
  el.style.cursor = 'pointer';
  // Fade the marker proportionally to its remaining life once we enter
  // the "expiring soon" window; ensures at-a-glance triage.
  el.style.opacity = expiry.isExpiringSoon ? '0.55' : '1';
  el.classList.toggle('map-marker--expiring', expiry.isExpiringSoon);

  const label = [
    incident.type,
    incident.severity,
    expiry.humanRemaining ? `expires in ${expiry.humanRemaining}` : null,
  ]
    .filter(Boolean)
    .join(' — ');
  el.setAttribute('aria-label', label);
  el.dataset.status = incident.status;
}
