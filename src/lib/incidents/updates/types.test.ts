import { describe, it, expect } from 'vitest';
import { mapIncidentUpdate } from './types';

describe('mapIncidentUpdate', () => {
  it('converts snake_case DB row to camelCase DTO', () => {
    const dto = mapIncidentUpdate({
      id: 'abc',
      incident_id: 'def',
      user_id: 'user-1',
      username: 'alice',
      body: 'Still there.',
      created_at: '2026-04-23T10:00:00.000Z',
    });
    expect(dto).toEqual({
      id: 'abc',
      incidentId: 'def',
      userId: 'user-1',
      username: 'alice',
      body: 'Still there.',
      createdAt: '2026-04-23T10:00:00.000Z',
    });
  });

  it('preserves null username for deleted profile fk', () => {
    const dto = mapIncidentUpdate({
      id: 'abc',
      incident_id: 'def',
      user_id: 'user-1',
      username: null,
      body: 'Still there.',
      created_at: '2026-04-23T10:00:00.000Z',
    });
    expect(dto.username).toBeNull();
  });
});
