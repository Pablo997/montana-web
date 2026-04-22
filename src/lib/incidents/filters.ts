import type {
  Incident,
  IncidentType,
  SeverityLevel,
} from '@/types/incident';

/**
 * Time-range presets shown in the filter panel. Values are in hours
 * and match what you'd expect on a mountain product — most users care
 * about the last day or two, with a weekly fallback for planning.
 */
export type MaxAgeHours = 24 | 72 | 168 | 720 | null;

export interface MapFilters {
  /** `null` = all types allowed. */
  types: IncidentType[] | null;
  /** Minimum severity; `null` = any. `moderate` excludes `mild`, etc. */
  minSeverity: SeverityLevel | null;
  /** If true, only `validated` incidents are shown. */
  onlyValidated: boolean;
  /** Free-text substring match against title + description. */
  query: string;
  /** Maximum age of the incident in hours; `null` = no limit. */
  maxAgeHours: MaxAgeHours;
}

export const DEFAULT_FILTERS: MapFilters = {
  types: null,
  minSeverity: null,
  onlyValidated: false,
  query: '',
  maxAgeHours: null,
};

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  mild: 0,
  moderate: 1,
  severe: 2,
};

/** Slim view of an Incident — only the fields the filter reads. Keeps
 * tests and callers from having to pass the full object when a partial
 * is enough. */
export type FilterableIncident = Pick<
  Incident,
  'type' | 'severity' | 'status' | 'title' | 'description' | 'createdAt'
>;

/**
 * True when the incident matches all active filters. Unspecified /
 * `null` filter slots are treated as "no restriction" so the default
 * (fully-empty) filter always returns true.
 *
 * `now` is injected so tests can freeze time and so the same clock is
 * used across a render pass (avoids flicker when the real clock ticks
 * between the call from the marker layer and the empty-state banner).
 */
export function incidentMatchesFilters(
  incident: FilterableIncident,
  filters: MapFilters,
  now: number = Date.now(),
): boolean {
  if (filters.types && !filters.types.includes(incident.type)) return false;
  if (filters.onlyValidated && incident.status !== 'validated') return false;

  if (filters.minSeverity) {
    if (
      SEVERITY_ORDER[incident.severity] <
      SEVERITY_ORDER[filters.minSeverity]
    ) {
      return false;
    }
  }

  if (filters.maxAgeHours != null) {
    const ageMs = now - Date.parse(incident.createdAt);
    const limitMs = filters.maxAgeHours * 3_600_000;
    // `NaN` (invalid date) falls into the reject branch: we'd rather
    // hide a weird row than show it under the wrong time bucket.
    if (!Number.isFinite(ageMs) || ageMs > limitMs) return false;
  }

  if (filters.query.trim().length > 0) {
    const needle = filters.query.trim().toLowerCase();
    const haystack = `${incident.title} ${incident.description ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

/** True when at least one filter differs from its default value. */
export function filtersAreActive(filters: MapFilters): boolean {
  return (
    filters.types !== null ||
    filters.minSeverity !== null ||
    filters.onlyValidated ||
    filters.query.trim().length > 0 ||
    filters.maxAgeHours !== null
  );
}

/** Count how many incidents from the map survive the current filters. */
export function countVisible(
  incidents: Map<string, FilterableIncident>,
  filters: MapFilters,
  now: number = Date.now(),
): number {
  let count = 0;
  incidents.forEach((incident) => {
    if (incidentMatchesFilters(incident, filters, now)) count += 1;
  });
  return count;
}
