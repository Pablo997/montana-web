import { describe, expect, it } from 'vitest';
import {
  mapMyIncidentRow,
  mapStats,
  type MyIncidentRawRow,
} from './types';

describe('mapMyIncidentRow', () => {
  const raw: MyIncidentRawRow = {
    id: 'i-1',
    title: 'Rockfall',
    type: 'accident',
    severity: 'severe',
    status: 'validated',
    score: 5,
    upvotes: 6,
    downvotes: 1,
    media_count: 2,
    open_reports_count: 0,
    created_at: '2026-04-20T12:00:00Z',
    expires_at: null,
    total_count: 7,
  };

  it('converts snake_case fields into camelCase', () => {
    const out = mapMyIncidentRow(raw);
    expect(out.mediaCount).toBe(2);
    expect(out.openReportsCount).toBe(0);
    expect(out.expiresAt).toBeNull();
  });

  it('coerces count fields coming back as strings (bigint safety)', () => {
    const bigintLike: MyIncidentRawRow = {
      ...raw,
      total_count: '42' as unknown as number,
    };
    expect(mapMyIncidentRow(bigintLike).totalCount).toBe(42);
  });

  it('defaults counters to zero when the DB returns null', () => {
    const partial: MyIncidentRawRow = {
      ...raw,
      score: null as unknown as number,
      open_reports_count: null as unknown as number,
    };
    const out = mapMyIncidentRow(partial);
    expect(out.score).toBe(0);
    expect(out.openReportsCount).toBe(0);
  });
});

describe('mapStats', () => {
  it('returns a zeroed shape for null / non-object inputs', () => {
    expect(mapStats(null)).toEqual({
      total: 0,
      validated: 0,
      pending: 0,
      dismissed: 0,
      resolved: 0,
      scoreSum: 0,
      openReports: 0,
    });
    expect(mapStats(undefined)).toEqual({
      total: 0,
      validated: 0,
      pending: 0,
      dismissed: 0,
      resolved: 0,
      scoreSum: 0,
      openReports: 0,
    });
    expect(mapStats('nope')).toEqual({
      total: 0,
      validated: 0,
      pending: 0,
      dismissed: 0,
      resolved: 0,
      scoreSum: 0,
      openReports: 0,
    });
  });

  it('passes valid fields through', () => {
    expect(
      mapStats({
        total: 10,
        validated: 4,
        pending: 3,
        dismissed: 1,
        resolved: 2,
        scoreSum: 15,
        openReports: 1,
      }),
    ).toEqual({
      total: 10,
      validated: 4,
      pending: 3,
      dismissed: 1,
      resolved: 2,
      scoreSum: 15,
      openReports: 1,
    });
  });

  it('tolerates missing fields by defaulting to 0', () => {
    expect(mapStats({ total: 5 })).toEqual({
      total: 5,
      validated: 0,
      pending: 0,
      dismissed: 0,
      resolved: 0,
      scoreSum: 0,
      openReports: 0,
    });
  });
});
