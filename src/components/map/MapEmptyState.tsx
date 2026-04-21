'use client';

import { useMapStore } from '@/store/useMapStore';
import { incidentMatchesFilters } from './FilterPanel';

/**
 * Soft banner shown when the current viewport + active filters resolve
 * to zero markers. Discrimi­nates between:
 *   - "No incidents here yet" → nothing loaded at all.
 *   - "No incidents match your filters" → markers exist but are hidden.
 *
 * We intentionally keep it as an overlay (not a modal) so the user can
 * still pan the map, report a new incident, or relax filters without
 * dismissing anything.
 */
export function MapEmptyState() {
  const incidents = useMapStore((s) => s.incidents);
  const filters = useMapStore((s) => s.filters);
  const setFilters = useMapStore((s) => s.setFilters);

  const totalLoaded = incidents.size;
  let visibleAfterFilters = 0;
  incidents.forEach((incident) => {
    if (incidentMatchesFilters(incident, filters)) visibleAfterFilters += 1;
  });

  if (visibleAfterFilters > 0) return null;

  const filtersActive =
    filters.types !== null || filters.minSeverity !== null || filters.onlyValidated;

  if (totalLoaded > 0 && filtersActive) {
    return (
      <div className="map-empty" role="status">
        <p className="map-empty__text">No incidents match your filters.</p>
        <button
          type="button"
          className="button"
          onClick={() =>
            setFilters({ types: null, minSeverity: null, onlyValidated: false })
          }
        >
          Reset filters
        </button>
      </div>
    );
  }

  return (
    <div className="map-empty" role="status">
      <p className="map-empty__text">
        No incidents in this area yet. Tap the <strong>Report</strong> button to
        add the first one.
      </p>
    </div>
  );
}
