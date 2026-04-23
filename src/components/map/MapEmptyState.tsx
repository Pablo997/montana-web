'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMapStore } from '@/store/useMapStore';
import {
  DEFAULT_FILTERS,
  filtersAreActive,
  incidentMatchesFilters,
} from '@/lib/incidents/filters';

/**
 * Soft banner shown when the current viewport + active filters resolve
 * to zero markers. Discrimi­nates between:
 *   - "No incidents here yet" → nothing loaded at all.
 *   - "No incidents match your filters" → markers exist but are hidden.
 *
 * We intentionally keep it as an overlay (not a modal) so the user can
 * still pan the map, report a new incident, or relax filters without
 * dismissing anything. The "empty area" variant is dismissible — once
 * the user gets the hint we shouldn't keep cluttering the map on every
 * new viewport that happens to be empty.
 */

// Bumping the version forces the banner to reappear for users who had
// already dismissed the previous copy.
const DISMISS_STORAGE_KEY = 'montana.map-empty.dismissed.v1';

export function MapEmptyState() {
  const t = useTranslations('map.emptyState');
  const incidents = useMapStore((s) => s.incidents);
  const filters = useMapStore((s) => s.filters);
  const setFilters = useMapStore((s) => s.setFilters);

  const [dismissed, setDismissed] = useState(false);

  // Read the persisted dismissal on mount so the banner doesn't flash
  // on every page reload once the user has closed it.
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_STORAGE_KEY) === '1') {
        setDismissed(true);
      }
    } catch {
      /* private mode or storage disabled: treat as not dismissed */
    }
  }, []);

  const totalLoaded = incidents.size;
  let visibleAfterFilters = 0;
  incidents.forEach((incident) => {
    if (incidentMatchesFilters(incident, filters)) visibleAfterFilters += 1;
  });

  if (visibleAfterFilters > 0) return null;

  // Filter-mismatch variant is always shown: it carries an actionable
  // "Reset filters" button and disappears the moment the filters are
  // relaxed, so dismissing it doesn't add much.
  if (totalLoaded > 0 && filtersAreActive(filters)) {
    return (
      <div className="map-empty" role="status">
        <p className="map-empty__text">{t('filtersMismatch')}</p>
        <button
          type="button"
          className="button"
          onClick={() => setFilters({ ...DEFAULT_FILTERS })}
        >
          {t('resetFilters')}
        </button>
      </div>
    );
  }

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="map-empty" role="status">
      <p className="map-empty__text">
        {t.rich('areaEmpty', {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
      <button
        type="button"
        className="map-empty__close"
        aria-label={t('dismiss')}
        onClick={handleDismiss}
      >
        ×
      </button>
    </div>
  );
}
