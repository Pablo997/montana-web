import { describe, expect, it } from 'vitest';
import { parseFeatureCollection } from './geocoding';

describe('parseFeatureCollection', () => {
  it('returns [] for non-object payloads', () => {
    expect(parseFeatureCollection(null)).toEqual([]);
    expect(parseFeatureCollection(undefined)).toEqual([]);
    expect(parseFeatureCollection('not-json')).toEqual([]);
    expect(parseFeatureCollection([])).toEqual([]);
  });

  it('returns [] when features is missing or malformed', () => {
    expect(parseFeatureCollection({})).toEqual([]);
    expect(parseFeatureCollection({ features: null })).toEqual([]);
    expect(parseFeatureCollection({ features: 'oops' })).toEqual([]);
  });

  it('extracts a well-formed feature', () => {
    const out = parseFeatureCollection({
      features: [
        {
          id: 'place.123',
          text: 'Benasque',
          place_name: 'Benasque, Aragón, España',
          center: [0.522, 42.604],
          bbox: [0.51, 42.59, 0.54, 42.62],
          place_type: ['place'],
          context: [
            { text: 'Aragón' },
            { text: 'España' },
          ],
        },
      ],
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'place.123',
      title: 'Benasque',
      subtitle: 'Aragón, España',
      center: [0.522, 42.604],
      bbox: [0.51, 42.59, 0.54, 42.62],
      placeType: 'place',
    });
    expect(out[0].suggestedZoom).toBe(12);
  });

  it('falls back to place_name when context is absent', () => {
    const out = parseFeatureCollection({
      features: [
        {
          id: 'place.456',
          text: 'Refugio de Cabrones',
          place_name: 'Refugio de Cabrones, Cabrales, Asturias',
          center: [-4.83, 43.21],
          place_type: ['poi'],
        },
      ],
    });

    expect(out[0].subtitle).toBe('Cabrales, Asturias');
    expect(out[0].suggestedZoom).toBe(15);
    expect(out[0].bbox).toBeNull();
  });

  it('drops features with invalid coordinates', () => {
    const out = parseFeatureCollection({
      features: [
        { id: 'a', text: 'OK', center: [0, 0], place_type: ['place'] },
        { id: 'b', text: 'Bad lng', center: [999, 0], place_type: ['place'] },
        { id: 'c', text: 'Bad shape', center: ['x', 'y'], place_type: ['place'] },
        { id: 'd', text: 'No center', place_type: ['place'] },
      ],
    });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('drops features without an id or title', () => {
    const out = parseFeatureCollection({
      features: [
        { text: 'No id', center: [0, 0] },
        { id: 'x', center: [0, 0] },
      ],
    });
    expect(out).toEqual([]);
  });

  it('handles place_type as a plain string', () => {
    const out = parseFeatureCollection({
      features: [
        {
          id: 'p1',
          text: 'Andorra',
          place_name: 'Andorra',
          center: [1.5, 42.5],
          place_type: 'country',
        },
      ],
    });
    expect(out[0].placeType).toBe('country');
    expect(out[0].suggestedZoom).toBe(4);
  });
});
