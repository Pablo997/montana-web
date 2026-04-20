'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type IncidentType,
  type SeverityLevel,
} from '@/types/incident';

const ALL_TYPES = Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[];

type SeverityFilter = 'any' | SeverityLevel;

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'mild', label: SEVERITY_LABELS.mild },
  { value: 'moderate', label: `${SEVERITY_LABELS.moderate}+` },
  { value: 'severe', label: `${SEVERITY_LABELS.severe} only` },
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
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const reset = () => {
    setFilters({ types: null, minSeverity: null, onlyValidated: false });
  };

  const activeCount =
    (filters.types ? 1 : 0) +
    (filters.minSeverity ? 1 : 0) +
    (filters.onlyValidated ? 1 : 0);

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
            <button type="button" className="button" onClick={reset} disabled={activeCount === 0}>
              Reset
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function countVisible(
  incidents: Map<string, { type: IncidentType; severity: SeverityLevel; status: string }>,
  filters: {
    types: IncidentType[] | null;
    minSeverity: SeverityLevel | null;
    onlyValidated: boolean;
  },
): number {
  let count = 0;
  incidents.forEach((incident) => {
    if (incidentMatchesFilters(incident, filters)) count += 1;
  });
  return count;
}

/** Exported for reuse by the map layer so we filter markers the same way. */
export function incidentMatchesFilters(
  incident: { type: IncidentType; severity: SeverityLevel; status: string },
  filters: {
    types: IncidentType[] | null;
    minSeverity: SeverityLevel | null;
    onlyValidated: boolean;
  },
): boolean {
  if (filters.types && !filters.types.includes(incident.type)) return false;
  if (filters.onlyValidated && incident.status !== 'validated') return false;
  if (filters.minSeverity) {
    const order: Record<SeverityLevel, number> = { mild: 0, moderate: 1, severe: 2 };
    if (order[incident.severity] < order[filters.minSeverity]) return false;
  }
  return true;
}
