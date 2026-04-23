import { describe, expect, it } from 'vitest';
import {
  InvalidIncidentLocationError,
  rowToIncident,
  safeRowToIncident,
} from './mappers';

// Minimal valid shape of an `incidents` row as returned by our RPCs.
// Individual tests override whichever fields they're exercising.
function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'id-1',
    user_id: 'u-1',
    type: 'accident' as const,
    severity: 'moderate' as const,
    status: 'pending' as const,
    title: 't',
    description: null,
    lng: 2.5,
    lat: 42.1,
    elevation_m: null,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    media_count: 0,
    user_vote: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    expires_at: null,
    ...overrides,
  };
}

describe('rowToIncident — coordinate resolution', () => {
  it('uses flat lng/lat columns when present (RPC shape)', () => {
    const inc = rowToIncident(baseRow());
    expect(inc.location).toEqual({ lat: 42.1, lng: 2.5 });
  });

  it('falls back to a GeoJSON Point object', () => {
    const inc = rowToIncident(
      baseRow({
        lng: undefined,
        lat: undefined,
        location: { type: 'Point', coordinates: [2.5, 42.1] },
      }),
    );
    expect(inc.location).toEqual({ lat: 42.1, lng: 2.5 });
  });

  it('throws InvalidIncidentLocationError when no coords are resolvable', () => {
    // This is exactly the shape the realtime payload delivers when
    // the replication decoder omits the geography column — the bug
    // that was planting markers in the top-left of the viewport.
    expect(() =>
      rowToIncident(
        baseRow({
          lng: undefined,
          lat: undefined,
          location: undefined,
        }),
      ),
    ).toThrow(InvalidIncidentLocationError);
  });

  it('does NOT silently emit a null-island fallback', () => {
    // Guard-rail: previously the mapper returned { lat: 0, lng: 0 }.
    // If that behaviour ever sneaks back in, this test fails loudly.
    try {
      rowToIncident(
        baseRow({ lng: undefined, lat: undefined, location: undefined }),
      );
      // If we got here we fell back to null-island — that's the bug.
      expect('unreachable').toBe('threw InvalidIncidentLocationError');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidIncidentLocationError);
    }
  });
});

describe('safeRowToIncident', () => {
  it('returns null instead of throwing on bad coords', () => {
    expect(
      safeRowToIncident(
        baseRow({ lng: undefined, lat: undefined, location: undefined }),
      ),
    ).toBeNull();
  });

  it('returns the incident on valid coords', () => {
    expect(safeRowToIncident(baseRow())).not.toBeNull();
  });
});
