import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_BASEMAP_ID,
  type BasemapId,
} from '@/lib/mapbox/basemaps';

interface MapPreferencesState {
  /** Active basemap. Persisted across reloads. */
  basemapId: BasemapId;
  /** Whether the hillshade overlay is currently active. */
  hillshadeEnabled: boolean;
  setBasemap: (id: BasemapId) => void;
  toggleHillshade: () => void;
}

/**
 * Map appearance preferences. Persisted to localStorage so a user
 * landing on the satellite view from one device sees it again on
 * their next session. We deliberately keep this client-only (no
 * Supabase round-trip) — the data is too volatile to deserve a DB
 * write per toggle, and a stale device-local preference is far better
 * UX than a one-second pop where the map flips style after auth
 * loads.
 *
 * Hydration model:
 *   * SSR rendering of any component that reads this store sees the
 *     hard-coded defaults below.
 *   * On the client, the persist middleware rehydrates from
 *     localStorage during the first commit, after which React
 *     re-renders consumers.
 *   * The `MapView` initialises MapLibre inside a `useEffect`, which
 *     runs post-hydration, so the *map itself* never observes the
 *     stale default. The basemap-picker UI may briefly highlight the
 *     default before swapping, which is acceptable.
 *
 * Versioning:
 *   * Bump `version` whenever the shape of persisted state changes in
 *     a way the old payload cannot satisfy. The `migrate` function is
 *     a stub today; add a real migration when we extend the shape.
 */
export const useMapPreferencesStore = create<MapPreferencesState>()(
  persist(
    (set) => ({
      basemapId: DEFAULT_BASEMAP_ID,
      hillshadeEnabled: false,
      setBasemap: (id) => set({ basemapId: id }),
      toggleHillshade: () =>
        set((state) => ({ hillshadeEnabled: !state.hillshadeEnabled })),
    }),
    {
      name: 'montana:map-prefs',
      version: 1,
      // `createJSONStorage(() => localStorage)` is a no-op on the
      // server because the factory is invoked lazily. Without the
      // factory wrapper, importing this module from a Server
      // Component would throw on the localStorage reference.
      // `createJSONStorage` returns `undefined` (a no-op store) when
      // the factory returns `undefined`, which is exactly what we
      // want during SSR: no read, no write, no hydration mismatch.
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? (undefined as unknown as Storage) : window.localStorage,
      ),
      // Skip serialising the setters into localStorage — only the
      // raw state slice should round-trip.
      partialize: (state) => ({
        basemapId: state.basemapId,
        hillshadeEnabled: state.hillshadeEnabled,
      }),
    },
  ),
);
