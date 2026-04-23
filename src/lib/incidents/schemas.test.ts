import { describe, it, expect } from 'vitest';
import {
  BBoxSchema,
  CreateIncidentSchema,
  LatLngSchema,
  UpdateIncidentSchema,
  VoteSchema,
} from './schemas';

/**
 * These schemas are the trust boundary between the browser and
 * Supabase. Every field that reaches the DB must be validated here,
 * so we test the edge of each constraint explicitly — an "approx"
 * test isn't enough when the downstream error is a CHECK constraint
 * violation from Postgres 300ms later.
 */

describe('LatLngSchema', () => {
  it('accepts a valid WGS84 point', () => {
    expect(LatLngSchema.parse({ lat: 42.5, lng: -3.7 })).toEqual({
      lat: 42.5,
      lng: -3.7,
    });
  });

  it('accepts the exact bounds', () => {
    expect(() => LatLngSchema.parse({ lat: 90, lng: 180 })).not.toThrow();
    expect(() => LatLngSchema.parse({ lat: -90, lng: -180 })).not.toThrow();
  });

  it('rejects out-of-range latitude', () => {
    expect(() => LatLngSchema.parse({ lat: 91, lng: 0 })).toThrow();
    expect(() => LatLngSchema.parse({ lat: -91, lng: 0 })).toThrow();
  });

  it('rejects out-of-range longitude', () => {
    expect(() => LatLngSchema.parse({ lat: 0, lng: 181 })).toThrow();
    expect(() => LatLngSchema.parse({ lat: 0, lng: -181 })).toThrow();
  });

  it('rejects NaN and Infinity', () => {
    expect(() => LatLngSchema.parse({ lat: NaN, lng: 0 })).toThrow();
    expect(() => LatLngSchema.parse({ lat: 0, lng: Infinity })).toThrow();
  });
});

describe('CreateIncidentSchema', () => {
  const validInput = {
    type: 'trail_blocked',
    severity: 'moderate',
    title: 'Landslide blocking the path',
    description: 'Large rocks across the trail at 2km marker.',
    location: { lat: 42.5, lng: -3.7 },
  };

  it('accepts a minimally valid payload', () => {
    expect(CreateIncidentSchema.parse(validInput)).toMatchObject({
      type: 'trail_blocked',
      severity: 'moderate',
      title: 'Landslide blocking the path',
    });
  });

  it('rejects titles shorter than 3 characters', () => {
    const result = CreateIncidentSchema.safeParse({ ...validInput, title: 'ab' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/at least 3/);
    }
  });

  it('trims whitespace before enforcing minLength', () => {
    // "  ab  " → "ab" → fails. Users who accidentally pad with spaces
    // shouldn't bypass the 3-char rule.
    const result = CreateIncidentSchema.safeParse({ ...validInput, title: '  ab  ' });
    expect(result.success).toBe(false);
  });

  it('rejects titles longer than 120 chars', () => {
    const result = CreateIncidentSchema.safeParse({
      ...validInput,
      title: 'x'.repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it('normalises empty descriptions to undefined', () => {
    // The SQL column is nullable; we want to send `undefined`, not
    // the empty string, so PostgREST omits the key rather than
    // writing "".
    const parsed = CreateIncidentSchema.parse({ ...validInput, description: '   ' });
    expect(parsed.description).toBeUndefined();
  });

  it('rejects unknown incident types', () => {
    const result = CreateIncidentSchema.safeParse({
      ...validInput,
      type: 'ufo_sighting',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown severity levels', () => {
    const result = CreateIncidentSchema.safeParse({
      ...validInput,
      severity: 'catastrophic',
    });
    expect(result.success).toBe(false);
  });

  it('rejects elevation outside earthly bounds', () => {
    expect(
      CreateIncidentSchema.safeParse({ ...validInput, elevationM: -501 }).success,
    ).toBe(false);
    expect(
      CreateIncidentSchema.safeParse({ ...validInput, elevationM: 9001 }).success,
    ).toBe(false);
  });
});

describe('BBoxSchema', () => {
  it('accepts a well-formed bbox', () => {
    expect(() =>
      BBoxSchema.parse({ minLng: -10, minLat: 40, maxLng: 10, maxLat: 50 }),
    ).not.toThrow();
  });

  it('rejects inverted bboxes', () => {
    const result = BBoxSchema.safeParse({
      minLng: 10,
      minLat: 40,
      maxLng: -10, // inverted
      maxLat: 50,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/min must be <= max/);
    }
  });
});

describe('UpdateIncidentSchema', () => {
  it('accepts a valid title + description', () => {
    const parsed = UpdateIncidentSchema.parse({
      title: 'Trail is clear again',
      description: 'Crew cleared the debris this morning.',
    });
    expect(parsed.title).toBe('Trail is clear again');
    expect(parsed.description).toBe('Crew cleared the debris this morning.');
  });

  it('normalises empty and whitespace-only descriptions to null', () => {
    // The UI binds a <textarea> value, so we must treat "" and "   " as
    // "clear the field" instead of persisting blank strings.
    expect(
      UpdateIncidentSchema.parse({ title: 'Okay', description: '' }).description,
    ).toBeNull();
    expect(
      UpdateIncidentSchema.parse({ title: 'Okay', description: '   ' }).description,
    ).toBeNull();
    expect(
      UpdateIncidentSchema.parse({ title: 'Okay', description: null }).description,
    ).toBeNull();
  });

  it('rejects titles shorter than 3 after trimming', () => {
    const result = UpdateIncidentSchema.safeParse({
      title: '  ab ',
      description: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects descriptions longer than 2000', () => {
    const result = UpdateIncidentSchema.safeParse({
      title: 'Valid title',
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('does NOT accept location or type — frozen on purpose', () => {
    // If somebody adds `location` to the form tomorrow the schema will
    // strip it, not forward it. The comment in the schema explains why
    // (votes cast against the old meaning would become misleading).
    const parsed = UpdateIncidentSchema.parse({
      title: 'Ok title',
      description: null,
      location: { lat: 0, lng: 0 },
      type: 'accident',
    });
    expect('location' in parsed).toBe(false);
    expect('type' in parsed).toBe(false);
  });
});

describe('VoteSchema', () => {
  it('accepts +1 and -1', () => {
    expect(VoteSchema.parse(1)).toBe(1);
    expect(VoteSchema.parse(-1)).toBe(-1);
  });

  it('rejects 0 and other integers', () => {
    expect(VoteSchema.safeParse(0).success).toBe(false);
    expect(VoteSchema.safeParse(2).success).toBe(false);
    expect(VoteSchema.safeParse('1').success).toBe(false);
  });
});
