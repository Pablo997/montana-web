import { describe, expect, it } from 'vitest';
import {
  mapActionRow,
  mapBanRow,
  mapReportRow,
  type AdminActionRawRow,
  type AdminBanRawRow,
  type AdminReportRawRow,
} from './types';

describe('mapReportRow', () => {
  const raw: AdminReportRawRow = {
    report_id: 'r-1',
    reason: 'spam',
    details: 'too many links',
    status: 'open',
    created_at: '2026-04-20T12:00:00Z',
    reviewed_at: null,
    reporter_id: 'u-1',
    reporter_username: 'alice',
    incident_id: 'i-1',
    incident_title: 'Rockfall',
    incident_status: 'pending',
    incident_type: 'accident',
    incident_severity: 'severe',
    incident_created_at: '2026-04-20T10:00:00Z',
    incident_author_id: 'u-2',
    incident_author_username: 'bob',
    total_count: 42,
  };

  it('converts snake_case fields into camelCase', () => {
    const result = mapReportRow(raw);
    expect(result.reportId).toBe('r-1');
    expect(result.reporterUsername).toBe('alice');
    expect(result.incidentTitle).toBe('Rockfall');
  });

  it('coerces total_count to a JS number', () => {
    // Postgres counts come back as bigints — node-postgres serialises them
    // as strings. The mapper must normalise so the UI can arithmetic them.
    const bigintLike: AdminReportRawRow = {
      ...raw,
      total_count: '42' as unknown as number,
    };
    expect(mapReportRow(bigintLike).totalCount).toBe(42);
  });
});

describe('mapBanRow', () => {
  const raw: AdminBanRawRow = {
    user_id: 'u-99',
    username: 'spammer',
    reason: 'mass flagging',
    banned_at: '2026-04-20T00:00:00Z',
    banned_by: 'u-admin',
    banned_by_username: 'mod',
    expires_at: null,
    total_count: 3,
  };

  it('maps permanent bans verbatim', () => {
    const result = mapBanRow(raw);
    expect(result.expiresAt).toBeNull();
    expect(result.bannedByUsername).toBe('mod');
  });
});

describe('mapActionRow', () => {
  it('preserves the meta jsonb unchanged', () => {
    const raw: AdminActionRawRow = {
      id: 'a-1',
      actor_id: 'u-admin',
      actor_username: 'mod',
      action: 'ban_user',
      target_kind: 'user',
      target_id: 'u-99',
      reason: 'spam',
      meta: { expiresAt: '2026-05-01T00:00:00Z' },
      created_at: '2026-04-20T00:00:00Z',
      total_count: 10,
    };
    expect(mapActionRow(raw).meta).toEqual({
      expiresAt: '2026-05-01T00:00:00Z',
    });
  });
});
