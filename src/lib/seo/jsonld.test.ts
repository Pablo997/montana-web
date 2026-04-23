import { describe, expect, it } from 'vitest';
import { incidentJsonLdString, incidentToJsonLd } from './jsonld';
import type { Incident } from '@/types/incident';

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'abc-123',
    userId: 'u-1',
    type: 'accident',
    severity: 'moderate',
    status: 'pending',
    title: 'Rockfall on Summit Path',
    description: 'A large boulder blocks the middle section of the trail.',
    location: { lat: 42.123, lng: -1.456 },
    elevationM: 1580,
    upvotes: 3,
    downvotes: 0,
    score: 3,
    mediaCount: 1,
    userVote: null,
    createdAt: '2026-04-19T09:30:00Z',
    updatedAt: '2026-04-19T10:00:00Z',
    expiresAt: null,
    ...overrides,
  };
}

describe('incidentToJsonLd', () => {
  it('emits the canonical JSON-LD shape for an active incident', () => {
    const ld = incidentToJsonLd(incident());
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('Event');
    expect(ld.name).toBe('Rockfall on Summit Path');
    expect(ld.description).toBe(
      'A large boulder blocks the middle section of the trail.',
    );
    expect(ld.url).toMatch(/\/incidents\/abc-123$/);
    expect(ld.startDate).toBe('2026-04-19T09:30:00Z');
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(ld.location.geo.latitude).toBe(42.123);
    expect(ld.location.geo.longitude).toBe(-1.456);
    expect(ld.location.geo.elevation).toBe(1580);
    expect(ld.endDate).toBeUndefined();
  });

  it('omits description when it is null', () => {
    const ld = incidentToJsonLd(incident({ description: null }));
    expect(ld.description).toBeUndefined();
  });

  it('omits elevation when not known', () => {
    const ld = incidentToJsonLd(incident({ elevationM: null }));
    expect(ld.location.geo.elevation).toBeUndefined();
  });

  it('marks resolved incidents as cancelled events with an endDate', () => {
    const ld = incidentToJsonLd(incident({ status: 'resolved' }));
    expect(ld.eventStatus).toBe('https://schema.org/EventCancelled');
    expect(ld.endDate).toBe('2026-04-19T10:00:00Z');
  });

  it('includes image URLs when provided', () => {
    const ld = incidentToJsonLd(incident(), [
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
    ]);
    expect(ld.image).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
    ]);
  });

  it('omits the image key entirely when no photos are passed', () => {
    const ld = incidentToJsonLd(incident());
    expect(ld.image).toBeUndefined();
  });
});

describe('incidentJsonLdString', () => {
  it('returns a valid JSON string for script tag injection', () => {
    const s = incidentJsonLdString(incident());
    expect(() => JSON.parse(s)).not.toThrow();
    const parsed = JSON.parse(s);
    expect(parsed['@type']).toBe('Event');
  });

  it('does NOT break out of a <script> context', () => {
    // Inject a would-be breakout in the title and confirm the
    // serialiser quotes it safely.
    const s = incidentJsonLdString(
      incident({ title: '</script><script>alert(1)</script>' }),
    );
    expect(s).not.toContain('</script>');
  });
});
