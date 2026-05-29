import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_BASEMAP_ID,
  type BasemapId,
} from '@/lib/mapbox/basemaps';

/**
 * Camera snapshot persisted across reloads so the user lands exactly
 * where they left the map on their previous visit. Stored without
 * bearing / pitch on purpose — those are far less commonly touched and
 * a 0° North reset on F5 is the standard expectation in mapping apps
 * (Google Maps, Komoot, Strava do this too).
 */
export interface ViewportSnapshot {
  lng: number;
  lat: number;
  zoom: number;
}

interface MapPreferencesState {
  /** Active basemap. Persisted across reloads. */
  basemapId: BasemapId;
  /** Whether the hillshade overlay is currently active. */
  hillshadeEnabled: boolean;
  /** Last camera position the user was looking at. `null` on first
   *  ever visit. */
  lastViewport: ViewportSnapshot | null;
  setBasemap: (id: BasemapId) => void;
  toggleHillshade: () => void;
  setLastViewport: (snapshot: ViewportSnapshot) => void;
}

/** Storage key — exported so callers can read the persisted blob
 *  synchronously (before Zustand's async rehydration tick) to avoid
 *  the "default-then-flip" UX flash when the map first renders. */
export const MAP_PREFS_STORAGE_KEY = 'montana:map-prefs';

/**
 * Synchronously read the persisted viewport from localStorage without
 * waiting for Zustand to rehydrate. Returns `null` when no viewport is
 * stored, the payload is corrupt, or we're on the server.
 *
 * The `MapView` init effect calls this so MapLibre can be instantiated
 * with the user's last camera position in one go. Going through the
 * store would either require a render cycle (flash of the default
 * center) or a `useEffect` chained on hydration (flash of jumpTo).
 */
export function readPersistedViewport(): ViewportSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MAP_PREFS_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as {
      state?: { lastViewport?: unknown };
    };
    const v = payload.state?.lastViewport;
    if (
      v &&
      typeof v === 'object' &&
      typeof (v as ViewportSnapshot).lng === 'number' &&
      typeof (v as ViewportSnapshot).lat === 'number' &&
      typeof (v as ViewportSnapshot).zoom === 'number' &&
      Number.isFinite((v as ViewportSnapshot).lng) &&
      Number.isFinite((v as ViewportSnapshot).lat) &&
      Number.isFinite((v as ViewportSnapshot).zoom)
    ) {
      return v as ViewportSnapshot;
    }
  } catch {
    /* corrupt payload — fall through to null */
  }
  return null;
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
      lastViewport: null,
      setBasemap: (id) => set({ basemapId: id }),
      toggleHillshade: () =>
        set((state) => ({ hillshadeEnabled: !state.hillshadeEnabled })),
      setLastViewport: (snapshot) => set({ lastViewport: snapshot }),
    }),
    {
      name: MAP_PREFS_STORAGE_KEY,
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
        lastViewport: state.lastViewport,
      }),
    },
  ),
);
