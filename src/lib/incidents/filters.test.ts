import { describe, it, expect } from 'vitest';
import type { Incident } from '@/types/incident';
import {
  DEFAULT_FILTERS,
  filtersAreActive,
  incidentMatchesFilters,
  type MapFilters,
} from './filters';

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'id-1',
    userId: 'u-1',
    type: 'trail_blocked',
    severity: 'moderate',
    status: 'validated',
    title: 'Fallen tree near summit',
    description: 'Big pine across the path',
    location: { lat: 42.1, lng: -1.2 },
    elevationM: 1800,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    mediaCount: 0,
    userVote: null,
    createdAt: '2025-01-01T12:00:00.000Z',
    updatedAt: '2025-01-01T12:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

function mergeFilters(overrides: Partial<MapFilters>): MapFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe('incidentMatchesFilters — defaults', () => {
  it('accepts every incident with default filters', () => {
    expect(incidentMatchesFilters(makeIncident(), DEFAULT_FILTERS)).toBe(true);
  });
});

describe('incidentMatchesFilters — type / severity / status', () => {
  it('filters by type whitelist', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ type: 'accident' }),
        mergeFilters({ types: ['wildlife', 'shelter'] }),
      ),
    ).toBe(false);
  });

  it('accepts incidents in the type whitelist', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ type: 'wildlife' }),
        mergeFilters({ types: ['wildlife', 'shelter'] }),
      ),
    ).toBe(true);
  });

  it('enforces minSeverity ordering', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ severity: 'mild' }),
        mergeFilters({ minSeverity: 'moderate' }),
      ),
    ).toBe(false);
    expect(
      incidentMatchesFilters(
        makeIncident({ severity: 'severe' }),
        mergeFilters({ minSeverity: 'moderate' }),
      ),
    ).toBe(true);
  });

  it('onlyValidated rejects non-validated statuses', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ status: 'pending' }),
        mergeFilters({ onlyValidated: true }),
      ),
    ).toBe(false);
  });
});

describe('incidentMatchesFilters — time range', () => {
  const now = Date.parse('2025-01-10T12:00:00.000Z');

  it('accepts incidents inside the window', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ createdAt: '2025-01-10T06:00:00.000Z' }),
        mergeFilters({ maxAgeHours: 24 }),
        now,
      ),
    ).toBe(true);
  });

  it('rejects incidents older than the window', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ createdAt: '2025-01-08T06:00:00.000Z' }),
        mergeFilters({ maxAgeHours: 24 }),
        now,
      ),
    ).toBe(false);
  });

  it('rejects unparseable createdAt under a window', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ createdAt: 'not-a-date' as unknown as string }),
        mergeFilters({ maxAgeHours: 24 }),
        now,
      ),
    ).toBe(false);
  });

  it('ignores time when maxAgeHours is null', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ createdAt: '1999-01-01T00:00:00.000Z' }),
        DEFAULT_FILTERS,
        now,
      ),
    ).toBe(true);
  });
});

describe('incidentMatchesFilters — query', () => {
  it('matches against the title case-insensitively', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ title: 'Rock Fall on North Face' }),
        mergeFilters({ query: 'north' }),
      ),
    ).toBe(true);
  });

  it('matches against the description case-insensitively', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ description: 'Snowfield is icy early morning' }),
        mergeFilters({ query: 'ICY' }),
      ),
    ).toBe(true);
  });

  it('rejects when the query is not present', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ title: 'Bear sighting', description: 'at the river' }),
        mergeFilters({ query: 'avalanche' }),
      ),
    ).toBe(false);
  });

  it('trims the query and treats whitespace-only as no filter', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ title: 'Anything' }),
        mergeFilters({ query: '   ' }),
      ),
    ).toBe(true);
  });

  it('handles null description gracefully', () => {
    expect(
      incidentMatchesFilters(
        makeIncident({ description: null, title: 'Shelter' }),
        mergeFilters({ query: 'shelter' }),
      ),
    ).toBe(true);
  });
});

describe('filtersAreActive', () => {
  it('returns false for default filters', () => {
    expect(filtersAreActive(DEFAULT_FILTERS)).toBe(false);
  });

  it('returns true when any slot is customised', () => {
    expect(filtersAreActive(mergeFilters({ types: ['accident'] }))).toBe(true);
    expect(filtersAreActive(mergeFilters({ minSeverity: 'severe' }))).toBe(true);
    expect(filtersAreActive(mergeFilters({ onlyValidated: true }))).toBe(true);
    expect(filtersAreActive(mergeFilters({ query: 'bear' }))).toBe(true);
    expect(filtersAreActive(mergeFilters({ maxAgeHours: 24 }))).toBe(true);
  });

  it('treats whitespace-only query as inactive', () => {
    expect(filtersAreActive(mergeFilters({ query: '   ' }))).toBe(false);
  });
});
