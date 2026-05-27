import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SearchResult } from '@/lib/mapbox/geocoding';

/**
 * Recently selected geocoding results. Persisted to localStorage so
 * a user who searches "Benasque" today still gets it as the first
 * suggestion next week without typing.
 *
 * Capacity is intentionally small (8 entries): the dropdown shows
 * the recents only when the query is empty, and any longer list
 * stops being "recent" and starts being clutter. LRU eviction:
 * adding an existing id moves it to the front; new entries push
 * the oldest off the end.
 *
 * We persist the trimmed `RecentSearch` shape rather than the full
 * `SearchResult` because the API may add fields over time that
 * we don't want to round-trip through localStorage indefinitely.
 */

export interface RecentSearch {
  id: string;
  title: string;
  subtitle: string;
  center: [number, number];
  /** Either the geocoded bbox (preferred for fitBounds) or null
   * (then the consumer falls back to `flyTo(center, suggestedZoom)`). */
  bbox: [number, number, number, number] | null;
  suggestedZoom: number;
}

interface SearchHistoryState {
  recents: RecentSearch[];
  addRecent: (result: SearchResult) => void;
  clearRecents: () => void;
}

const MAX_RECENTS = 8;

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      recents: [],
      addRecent: (result) =>
        set((state) => {
          const entry: RecentSearch = {
            id: result.id,
            title: result.title,
            subtitle: result.subtitle,
            center: result.center,
            bbox: result.bbox,
            suggestedZoom: result.suggestedZoom,
          };
          // Remove any existing copy so the new add moves to the top.
          const filtered = state.recents.filter((r) => r.id !== entry.id);
          return { recents: [entry, ...filtered].slice(0, MAX_RECENTS) };
        }),
      clearRecents: () => set({ recents: [] }),
    }),
    {
      name: 'montana:search-history',
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? (undefined as unknown as Storage) : window.localStorage,
      ),
      partialize: (state) => ({ recents: state.recents }),
    },
  ),
);
