'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type IncidentType,
  type SeverityLevel,
} from '@/types/incident';
import {
  DEFAULT_FILTERS,
  countVisible,
  filtersAreActive,
  type MapFilters,
  type MaxAgeHours,
} from '@/lib/incidents/filters';

// Re-export for callers that used to import from here. The actual
// implementation lives in `@/lib/incidents/filters` now so it can be
// unit-tested without a React tree.
export { incidentMatchesFilters } from '@/lib/incidents/filters';

const ALL_TYPES = Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[];

type SeverityFilter = 'any' | SeverityLevel;

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'mild', label: SEVERITY_LABELS.mild },
  { value: 'moderate', label: `${SEVERITY_LABELS.moderate}+` },
  { value: 'severe', label: `${SEVERITY_LABELS.severe} only` },
];

const AGE_OPTIONS: { value: MaxAgeHours; label: string }[] = [
  { value: null, label: 'Any time' },
  { value: 24, label: '24h' },
  { value: 72, label: '3d' },
  { value: 168, label: '7d' },
  { value: 720, label: '30d' },
];

/**
 * Collapsible filter panel rendered on top of the map.
 *
 * All filtering happens client-side against the in-memory store: the list
 * of incidents loaded for the viewport is already small (bounded by
 * `p_limit` in `incidents_in_bbox`), so there is no reason to re-hit the
 * network when the user toggles a chip.
 */
export function FilterPanel() {
  const filters = useMapStore((s) => s.filters);
  const setFilters = useMapStore((s) => s.setFilters);
  const visibleCount = useMapStore((s) => countVisible(s.incidents, s.filters));
  const totalCount = useMapStore((s) => s.incidents.size);

  const [open, setOpen] = useState(false);
  // Local draft so typing doesn't re-filter on every keystroke while the
  // user is still composing the query. Committed to the store on a
  // 200ms debounce (fast enough to feel live, slow enough to avoid
  // re-rendering hundreds of markers per keypress).
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Keep the draft in sync if the store gets reset from somewhere else
  // (e.g. "Reset" button or an external handler).
  useEffect(() => {
    setQueryDraft(filters.query);
  }, [filters.query]);

  useEffect(() => {
    if (queryDraft === filters.query) return;
    const id = setTimeout(() => {
      setFilters({ query: queryDraft });
    }, 200);
    return () => clearTimeout(id);
  }, [queryDraft, filters.query, setFilters]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeTypeSet = useMemo(
    () => new Set(filters.types ?? ALL_TYPES),
    [filters.types],
  );

  const toggleType = (type: IncidentType) => {
    const next = new Set(activeTypeSet);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    // Null means "all types" → keeps the store lean.
    setFilters({
      types: next.size === ALL_TYPES.length ? null : (Array.from(next) as IncidentType[]),
    });
  };

  const setSeverity = (value: SeverityFilter) => {
    setFilters({ minSeverity: value === 'any' ? null : value });
  };

  const setAge = (value: MaxAgeHours) => {
    setFilters({ maxAgeHours: value });
  };

  const reset = () => {
    setQueryDraft('');
    setFilters({ ...DEFAULT_FILTERS });
  };

  const activeCount = computeActiveCount(filters);
  const severityValue: SeverityFilter = filters.minSeverity ?? 'any';

  return (
    <div className="filter-panel" ref={panelRef}>
      <button
        type="button"
        className="filter-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span>Filters</span>
        {activeCount > 0 ? (
          <span className="filter-panel__badge">{activeCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="filter-panel__dropdown" role="dialog" aria-label="Map filters">
          <section className="filter-panel__section">
            <label className="filter-panel__search">
              <span className="filter-panel__heading">Search</span>
              <input
                type="search"
                className="filter-panel__search-input"
                placeholder="Title or description…"
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                autoComplete="off"
              />
            </label>
          </section>

          <section className="filter-panel__section">
            <h3 className="filter-panel__heading">Type</h3>
            <div className="filter-panel__chips">
              {ALL_TYPES.map((type) => {
                const active = activeTypeSet.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    className={`chip${active ? ' chip--active' : ''}`}
                    onClick={() => toggleType(type)}
                    aria-pressed={active}
                  >
                    {INCIDENT_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="filter-panel__section">
            <h3 className="filter-panel__heading">Severity</h3>
            <div className="filter-panel__radio-row">
              {SEVERITY_OPTIONS.map((opt) => (
                <label key={opt.value} className="filter-panel__radio">
                  <input
                    type="radio"
                    name="severity"
                    value={opt.value}
                    checked={severityValue === opt.value}
                    onChange={() => setSeverity(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="filter-panel__section">
            <h3 className="filter-panel__heading">Reported in</h3>
            <div className="filter-panel__chips">
              {AGE_OPTIONS.map((opt) => {
                const active = filters.maxAgeHours === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={`chip${active ? ' chip--active' : ''}`}
                    onClick={() => setAge(opt.value)}
                    aria-pressed={active}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="filter-panel__section">
            <label className="filter-panel__check">
              <input
                type="checkbox"
                checked={filters.onlyValidated}
                onChange={(e) => setFilters({ onlyValidated: e.target.checked })}
              />
              <span>Validated only</span>
            </label>
          </section>

          <footer className="filter-panel__footer">
            <span className="filter-panel__count">
              {visibleCount} of {totalCount} shown
            </span>
            <button
              type="button"
              className="button"
              onClick={reset}
              disabled={!filtersAreActive(filters)}
            >
              Reset
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

/** Number of filter slots that differ from their default (for the badge). */
function computeActiveCount(filters: MapFilters): number {
  return (
    (filters.types ? 1 : 0) +
    (filters.minSeverity ? 1 : 0) +
    (filters.onlyValidated ? 1 : 0) +
    (filters.query.trim().length > 0 ? 1 : 0) +
    (filters.maxAgeHours !== null ? 1 : 0)
  );
}
