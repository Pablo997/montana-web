import { describe, expect, it } from 'vitest';
import { mapNotificationRow, type NotificationRow } from './client';

const completeRow: NotificationRow = {
  id: 'n-1',
  incident_id: 'i-1',
  read_at: null,
  created_at: '2026-05-27T10:00:00Z',
  incident_title: 'Rockfall on yellow trail',
  incident_type: 'trail_blocked',
  incident_severity: 'moderate',
  incident_status: 'pending',
  incident_lat: 38.6,
  incident_lng: -0.45,
};

describe('mapNotificationRow', () => {
  it('maps a complete row into the UI shape', () => {
    const result = mapNotificationRow(completeRow);
    expect(result).toEqual({
      id: 'n-1',
      incidentId: 'i-1',
      readAt: null,
      createdAt: '2026-05-27T10:00:00Z',
      incident: {
        title: 'Rockfall on yellow trail',
        type: 'trail_blocked',
        severity: 'moderate',
        status: 'pending',
        location: { lat: 38.6, lng: -0.45 },
      },
    });
  });

  it('preserves a non-null readAt', () => {
    const result = mapNotificationRow({
      ...completeRow,
      read_at: '2026-05-27T11:00:00Z',
    });
    expect(result?.readAt).toBe('2026-05-27T11:00:00Z');
  });

  it('drops a row missing the joined incident title', () => {
    // The RPC's SQL join filters these out (incident moderated away
    // between insert and read), but a stale view definition or
    // permission glitch could in theory let one through. Defensive
    // drop avoids a runtime crash on `.title` in the renderer.
    expect(
      mapNotificationRow({ ...completeRow, incident_title: null }),
    ).toBeNull();
  });

  it('drops a row missing coordinates', () => {
    expect(
      mapNotificationRow({ ...completeRow, incident_lat: null }),
    ).toBeNull();
    expect(
      mapNotificationRow({ ...completeRow, incident_lng: null }),
    ).toBeNull();
  });

  it('drops a row missing severity or type', () => {
    expect(
      mapNotificationRow({ ...completeRow, incident_severity: null }),
    ).toBeNull();
    expect(
      mapNotificationRow({ ...completeRow, incident_type: null }),
    ).toBeNull();
  });
});
