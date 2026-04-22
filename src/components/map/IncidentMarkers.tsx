'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maptilersdk from '@maptiler/sdk';
import { useMapStore } from '@/store/useMapStore';
import type { Incident, IncidentType, SeverityLevel } from '@/types/incident';
import { getExpiryInfo } from '@/lib/incidents/expiry';
import { useClock } from '@/hooks/useClock';
import { glyphSvg } from './markerIcons';
import { incidentMatchesFilters } from '@/lib/incidents/filters';

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

// Clustering configuration. All tuneables live here so behaviour changes
// are one-line edits instead of a hunt through the hook body.
const SOURCE_ID = 'incidents-src';
// Hidden GL layers whose sole purpose is to force MapLibre to tile the
// clustered source. `querySourceFeatures` only returns features from
// tiles that an active layer is consuming; without these, the whole
// source sits dormant and the DOM pipeline has nothing to render.
const GHOST_CLUSTER_LAYER_ID = 'incidents-ghost-clusters';
const GHOST_POINT_LAYER_ID = 'incidents-ghost-points';
const CLUSTER_MAX_ZOOM = 12; // beyond this, every point renders individually
const CLUSTER_RADIUS = 50; // px — typical supercluster default

const SEVERITY_WEIGHT: Record<SeverityLevel, number> = {
  mild: 0,
  moderate: 1,
  severe: 2,
};

/** Serialisable cluster feature picked out of the source for rendering. */
interface ClusterView {
  clusterId: number;
  lng: number;
  lat: number;
  pointCount: number;
  /** 0 = mild, 1 = moderate, 2 = severe — drives the bubble colour. */
  maxSev: number;
}

/**
 * Renders every incident on the map, grouping dense areas into cluster
 * bubbles.
 *
 * Architecture:
 *
 *   - A GeoJSON source (`incidents-src`) with `cluster: true` feeds
 *     MapLibre's supercluster worker. It's the tiling engine: no GL
 *     layers hang off it.
 *   - We poll the source on every relevant event (`sourcedata`,
 *     `moveend`, `zoomend`) and render *every* feature — clusters and
 *     unclustered leaves alike — as DOM `maptilersdk.Marker`s.
 *
 * Why DOM over GL cluster layers? The MapTiler SDK's layer-scoped
 * `click` and `mouseenter` events don't reliably fire on circle
 * layers added after the initial style load, so cluster bubbles were
 * unclickable. DOM markers use native browser clicks which always work,
 * and they also keep the custom glyph / validated ring / expiring
 * opacity we already had on individual incident markers.
 */
export function IncidentMarkers({ map }: Props) {
  const incidentMarkers = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const clusterMarkers = useRef<Map<number, maptilersdk.Marker>>(new Map());

  const incidents = useMapStore((s) => s.incidents);
  const filters = useMapStore((s) => s.filters);
  const select = useMapStore((s) => s.select);
  const now = useClock(60_000);

  const [unclusteredIds, setUnclusteredIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [clusterViews, setClusterViews] = useState<ClusterView[]>([]);

  const visibleIncidents = useMemo(() => {
    const list: Incident[] = [];
    incidents.forEach((incident) => {
      if (incidentMatchesFilters(incident, filters, now)) list.push(incident);
    });
    return list;
  }, [incidents, filters, now]);

  // 1) Make sure the clustering source exists, plus the two "ghost"
  // layers that keep the source alive in the tile pipeline. Without
  // those layers, MapLibre never bothers to load the tiles and
  // `querySourceFeatures` always returns an empty array.
  useEffect(() => {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS,
        // Aggregate max severity so the cluster bubble can colour itself
        // red when any incident inside is severe.
        clusterProperties: {
          maxSev: ['max', ['get', 'severityWeight']],
        },
      });
    }

    if (!map.getLayer(GHOST_CLUSTER_LAYER_ID)) {
      map.addLayer({
        id: GHOST_CLUSTER_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': 1,
          'circle-opacity': 0,
          'circle-stroke-width': 0,
        },
      });
    }

    if (!map.getLayer(GHOST_POINT_LAYER_ID)) {
      map.addLayer({
        id: GHOST_POINT_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 1,
          'circle-opacity': 0,
          'circle-stroke-width': 0,
        },
      });
    }
  }, [map]);

  // 2) Feed the filtered incidents into the source. MapLibre reclusters
  // on each `setData` call.
  useEffect(() => {
    const source = map.getSource(SOURCE_ID) as
      | (maptilersdk.GeoJSONSource & { setData: (d: unknown) => void })
      | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: visibleIncidents.map((incident) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [incident.location.lng, incident.location.lat],
        },
        properties: {
          id: incident.id,
          severity: incident.severity,
          severityWeight: SEVERITY_WEIGHT[incident.severity],
        },
      })),
    });
  }, [map, visibleIncidents]);

  // 3) Recompute cluster views + unclustered IDs whenever the source
  // retiles or the viewport settles. All queries are batched into a
  // single `requestAnimationFrame` so a burst of `sourcedata` events
  // during a pan doesn't thrash React.
  useEffect(() => {
    let raf: number | null = null;

    const recompute = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        try {
          const feats = map.querySourceFeatures(SOURCE_ID);
          const nextIds = new Set<string>();
          const nextClusters: ClusterView[] = [];
          // Clusters can be duplicated across tiles (same supercluster
          // returned from two neighbouring tiles); dedupe by cluster_id.
          const seenClusters = new Set<number>();

          for (const f of feats) {
            const props = f.properties ?? {};
            if (f.geometry?.type !== 'Point') continue;
            const [lng, lat] = f.geometry.coordinates;

            if (props.cluster === true || typeof props.point_count === 'number') {
              const clusterId = props.cluster_id as number | undefined;
              if (clusterId == null || seenClusters.has(clusterId)) continue;
              seenClusters.add(clusterId);
              nextClusters.push({
                clusterId,
                lng,
                lat,
                pointCount: Number(props.point_count ?? 0),
                maxSev: Number(props.maxSev ?? 0),
              });
            } else {
              const id = props.id;
              if (typeof id === 'string') nextIds.add(id);
            }
          }

          setUnclusteredIds((prev) =>
            setEquals(prev, nextIds) ? prev : nextIds,
          );
          setClusterViews((prev) =>
            clusterListEquals(prev, nextClusters) ? prev : nextClusters,
          );
        } catch {
          /* source may not be ready yet */
        }
      });
    };

    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId !== SOURCE_ID) return;
      if (!e.isSourceLoaded) return;
      recompute();
    };

    map.on('sourcedata', onSourceData);
    map.on('moveend', recompute);
    map.on('zoomend', recompute);
    recompute();

    return () => {
      map.off('sourcedata', onSourceData);
      map.off('moveend', recompute);
      map.off('zoomend', recompute);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [map]);

  // 4) Incident (leaf) marker reconciliation.
  useEffect(() => {
    const active = new Set<string>();

    visibleIncidents.forEach((incident) => {
      if (!unclusteredIds.has(incident.id)) return;
      active.add(incident.id);
      const existing = incidentMarkers.current.get(incident.id);
      if (existing) {
        existing.setLngLat([incident.location.lng, incident.location.lat]);
        updateIncidentElement(existing.getElement(), incident, now);
      } else {
        const el = document.createElement('button');
        el.className = 'map-marker';
        updateIncidentElement(el, incident, now);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          select(incident.id);
        });
        const marker = new maptilersdk.Marker({ element: el })
          .setLngLat([incident.location.lng, incident.location.lat])
          .addTo(map);
        incidentMarkers.current.set(incident.id, marker);
      }
    });

    incidentMarkers.current.forEach((marker, id) => {
      if (!active.has(id)) {
        marker.remove();
        incidentMarkers.current.delete(id);
      }
    });
  }, [visibleIncidents, unclusteredIds, map, select, now]);

  // 5) Cluster marker reconciliation. Same pattern: one <button> per
  // cluster, positioned by MapLibre at the cluster centroid. Click →
  // ask supercluster for the zoom where it breaks apart → flyTo.
  useEffect(() => {
    const active = new Set<number>();

    clusterViews.forEach((cluster) => {
      active.add(cluster.clusterId);
      const existing = clusterMarkers.current.get(cluster.clusterId);
      if (existing) {
        existing.setLngLat([cluster.lng, cluster.lat]);
        updateClusterElement(existing.getElement(), cluster);
      } else {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'map-cluster';
        updateClusterElement(el, cluster);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          expandCluster(map, cluster);
        });
        const marker = new maptilersdk.Marker({ element: el })
          .setLngLat([cluster.lng, cluster.lat])
          .addTo(map);
        clusterMarkers.current.set(cluster.clusterId, marker);
      }
    });

    clusterMarkers.current.forEach((marker, id) => {
      if (!active.has(id)) {
        marker.remove();
        clusterMarkers.current.delete(id);
      }
    });
  }, [clusterViews, map]);

  return null;
}

async function expandCluster(map: maptilersdk.Map, cluster: ClusterView) {
  // Always fly to the centroid so the user gets immediate visual
  // feedback even if we can't figure out the exact expansion zoom.
  const fallbackZoom = Math.min(map.getZoom() + 2, 18);
  const fly = (zoom: number) => {
    map.flyTo({ center: [cluster.lng, cluster.lat], zoom });
  };

  const source = map.getSource(SOURCE_ID) as
    | { getClusterExpansionZoom?: unknown }
    | undefined;
  const expand = source?.getClusterExpansionZoom;
  if (typeof expand !== 'function') {
    fly(fallbackZoom);
    return;
  }

  // MapLibre's API is inconsistent across versions:
  //   - MapLibre 2.x / Mapbox GL: callback-based, returns undefined.
  //   - MapLibre 3.x (used by modern MapTiler SDK): returns a Promise,
  //     no callback support.
  // Try the promise form first (the silent failure mode of the old code
  // was passing a callback to the promise API — the callback was just
  // dropped and the promise was unawaited, so nothing happened). If the
  // promise form doesn't apply, fall back to the callback signature.
  try {
    const ret = (expand as (id: number) => unknown).call(
      source,
      cluster.clusterId,
    );
    if (ret && typeof (ret as Promise<number>).then === 'function') {
      const zoom = await (ret as Promise<number>);
      fly(typeof zoom === 'number' ? zoom : fallbackZoom);
      return;
    }
  } catch {
    /* fall through to callback form */
  }

  try {
    (
      expand as (
        id: number,
        cb: (err: Error | null, zoom: number) => void,
      ) => void
    ).call(source, cluster.clusterId, (err, zoom) => {
      fly(err || typeof zoom !== 'number' ? fallbackZoom : zoom);
    });
  } catch {
    fly(fallbackZoom);
  }
}

function clusterColor(maxSev: number): string {
  if (maxSev >= 2) return '#d93025';
  if (maxSev >= 1) return '#f28b30';
  return '#2f8f6f';
}

function clusterSize(count: number): number {
  if (count >= 50) return 56;
  if (count >= 10) return 46;
  return 36;
}

function updateClusterElement(el: HTMLElement, cluster: ClusterView) {
  const size = clusterSize(cluster.pointCount);
  const color = clusterColor(cluster.maxSev);

  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = '50%';
  el.style.background = color;
  el.style.border = '2px solid #ffffff';
  el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
  el.style.color = '#ffffff';
  el.style.cursor = 'pointer';
  el.style.display = 'grid';
  el.style.placeItems = 'center';
  el.style.padding = '0';
  el.style.fontWeight = '600';
  el.style.fontSize = cluster.pointCount >= 100 ? '0.85rem' : '0.95rem';
  el.style.userSelect = 'none';

  el.textContent = formatCount(cluster.pointCount);
  el.setAttribute(
    'aria-label',
    `Cluster of ${cluster.pointCount} incidents — tap to zoom in`,
  );
}

/** Mapbox-style abbreviation: 1000 → 1k, 1500 → 1.5k, 10000 → 10k. */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return k < 10 ? `${k.toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(k)}k`;
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Shallow equality on the fields used for rendering — avoids nuking DOM
 * markers on every `moveend` when nothing actually changed. */
function clusterListEquals(a: ClusterView[], b: ClusterView[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((c) => [c.clusterId, c] as const));
  for (const c of b) {
    const prev = byId.get(c.clusterId);
    if (!prev) return false;
    if (
      prev.lng !== c.lng ||
      prev.lat !== c.lat ||
      prev.pointCount !== c.pointCount ||
      prev.maxSev !== c.maxSev
    ) {
      return false;
    }
  }
  return true;
}

function updateIncidentElement(el: HTMLElement, incident: Incident, now: number) {
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
