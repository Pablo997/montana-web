import { describe, it, expect } from 'vitest';
import type { Incident } from '@/types/incident';
import {
  buildIncidentSharePayload,
  incidentPath,
} from './shareUrl';

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'abc-123',
    userId: 'user-1',
    type: 'trail_blocked',
    severity: 'moderate',
    status: 'validated',
    title: 'Fallen tree across trail',
    description: 'Big pine blocks the path near the summit.',
    location: { lat: 42.1, lng: -1.2 },
    elevationM: 1800,
    upvotes: 3,
    downvotes: 0,
    score: 3,
    mediaCount: 0,
    userVote: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

describe('incidentPath', () => {
  it('returns the canonical /incidents/:id path', () => {
    expect(incidentPath('abc-123')).toBe('/incidents/abc-123');
  });
});

describe('buildIncidentSharePayload', () => {
  it('builds an absolute URL from the origin', () => {
    const payload = buildIncidentSharePayload(
      makeIncident(),
      'https://montana.example',
    );
    expect(payload.url).toBe('https://montana.example/incidents/abc-123');
  });

  it('strips trailing slashes from the origin', () => {
    const payload = buildIncidentSharePayload(
      makeIncident(),
      'https://montana.example///',
    );
    expect(payload.url).toBe('https://montana.example/incidents/abc-123');
  });

  it('uses the incident title as the share title', () => {
    const payload = buildIncidentSharePayload(
      makeIncident({ title: 'Rock fall on north face' }),
      'https://montana.example',
    );
    expect(payload.title).toBe('Rock fall on north face');
  });

  it('packs type and severity labels into the text body', () => {
    const payload = buildIncidentSharePayload(
      makeIncident({ type: 'accident', severity: 'severe' }),
      'https://montana.example',
    );
    expect(payload.text).toBe('Accident · Severe');
  });

  it('works with localhost origins', () => {
    const payload = buildIncidentSharePayload(
      makeIncident({ id: 'local-xyz' }),
      'http://localhost:3000',
    );
    expect(payload.url).toBe('http://localhost:3000/incidents/local-xyz');
  });

  it('trims whitespace in the origin', () => {
    const payload = buildIncidentSharePayload(
      makeIncident(),
      '  https://montana.example  ',
    );
    expect(payload.url).toBe('https://montana.example/incidents/abc-123');
  });
});
