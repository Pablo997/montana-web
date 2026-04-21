'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import { useMapStore } from '@/store/useMapStore';
import type { Incident, IncidentType, SeverityLevel } from '@/types/incident';
import { getExpiryInfo } from '@/lib/incidents/expiry';
import { useClock } from '@/hooks/useClock';
import { glyphSvg } from './markerIcons';
import { incidentMatchesFilters } from './FilterPanel';

interface Props {
  map: maptilersdk.Map;
}

const SEVERITY_COLOR: Record<SeverityLevel, string> = {
  mild: '#f5c518',
  moderate: '#f28b30',
  severe: '#d93025',
};

// Informational (non-hazard) types get their own semantic colour — shelter,
// water and POIs aren't threats, so painting them with severity reds is
// misleading at a glance.
const TYPE_OVERRIDE: Partial<Record<IncidentType, string>> = {
  water_source: '#2f8fd9',
  shelter: '#7b4c2a',
  point_of_interest: '#9b6cf2',
};

function bodyColor(incident: Incident): string {
  return TYPE_OVERRIDE[incident.type] ?? SEVERITY_COLOR[incident.severity];
}

/**
 * Keeps one MapTiler marker per incident in the store. Uses DOM markers
 * with inline styles only: no CSS classes on the root, no transitions,
 * no `will-change: transform`. MapLibre owns the root's `transform` to
 * position the marker every frame; any additional transform-touching CSS
 * introduces a zoom-dependent drift, especially combined with pitch +
 * setTerrain. The anchor is kept at the default `center` so the geographic
 * anchor is the visual centre of a symmetric circle, which is immune to
 * the terrain elevation offset that shifts bottom-anchored elements.
 */
export function IncidentMarkers({ map }: Props) {
  const markers = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const incidents = useMapStore((s) => s.incidents);
  const filters = useMapStore((s) => s.filters);
  const select = useMapStore((s) => s.select);
  const now = useClock(60_000);

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
  const color = bodyColor(incident);
  const expiry = getExpiryInfo(incident, now);

  el.style.width = '30px';
  el.style.height = '30px';
  el.style.borderRadius = '50%';
  el.style.background = color;
  el.style.border = '2px solid #ffffff';
  el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
  el.style.cursor = 'pointer';
  el.style.padding = '0';
  el.style.display = 'grid';
  el.style.placeItems = 'center';
  el.style.color = '#ffffff';
  el.style.opacity = expiry.isExpiringSoon ? '0.6' : '1';

  // Validated → swap the white stroke for a brand-coloured ring so the
  // community-confirmed incidents pop at a glance.
  if (incident.status === 'validated') {
    el.style.border = '2px solid #2f8f6f';
    el.style.boxShadow = '0 0 0 2px rgba(47,143,111,0.35), 0 2px 6px rgba(0,0,0,0.35)';
  }

  if (el.dataset.type !== incident.type) {
    el.innerHTML = glyphSvg(incident.type);
    el.dataset.type = incident.type;
  }

  el.classList.toggle('map-marker--expiring', expiry.isExpiringSoon);

  const label = [
    incident.type.replace('_', ' '),
    incident.severity,
    expiry.humanRemaining ? `expires in ${expiry.humanRemaining}` : null,
  ]
    .filter(Boolean)
    .join(' — ');
  el.setAttribute('aria-label', label);
  el.dataset.status = incident.status;
}
