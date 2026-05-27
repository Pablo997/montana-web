import { beforeEach, describe, expect, it } from 'vitest';
import { useSearchHistoryStore } from './useSearchHistoryStore';
import type { SearchResult } from '@/lib/mapbox/geocoding';

function makeResult(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: overrides.id ?? 'place.1',
    title: overrides.title ?? 'Title',
    subtitle: overrides.subtitle ?? 'Subtitle',
    center: overrides.center ?? [0, 0],
    bbox: overrides.bbox ?? null,
    suggestedZoom: overrides.suggestedZoom ?? 12,
    placeType: overrides.placeType ?? 'place',
  };
}

describe('useSearchHistoryStore', () => {
  beforeEach(() => {
    useSearchHistoryStore.setState({ recents: [] });
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('montana:search-history');
    }
  });

  it('starts empty', () => {
    expect(useSearchHistoryStore.getState().recents).toEqual([]);
  });

  it('adds entries to the front of the list', () => {
    const { addRecent } = useSearchHistoryStore.getState();
    addRecent(makeResult({ id: '1', title: 'A' }));
    addRecent(makeResult({ id: '2', title: 'B' }));

    const recents = useSearchHistoryStore.getState().recents;
    expect(recents.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('moves an existing entry back to the front on re-add', () => {
    const { addRecent } = useSearchHistoryStore.getState();
    addRecent(makeResult({ id: '1' }));
    addRecent(makeResult({ id: '2' }));
    addRecent(makeResult({ id: '3' }));
    addRecent(makeResult({ id: '1' }));

    const recents = useSearchHistoryStore.getState().recents;
    expect(recents.map((r) => r.id)).toEqual(['1', '3', '2']);
  });

  it('caps the list at 8 entries', () => {
    const { addRecent } = useSearchHistoryStore.getState();
    for (let i = 0; i < 12; i++) {
      addRecent(makeResult({ id: `id-${i}` }));
    }
    expect(useSearchHistoryStore.getState().recents).toHaveLength(8);
    expect(useSearchHistoryStore.getState().recents[0].id).toBe('id-11');
  });

  it('clearRecents empties the list', () => {
    const { addRecent, clearRecents } = useSearchHistoryStore.getState();
    addRecent(makeResult({ id: '1' }));
    clearRecents();
    expect(useSearchHistoryStore.getState().recents).toEqual([]);
  });
});
