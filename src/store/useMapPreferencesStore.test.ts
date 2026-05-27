import { beforeEach, describe, expect, it } from 'vitest';
import { useMapPreferencesStore } from './useMapPreferencesStore';
import { DEFAULT_BASEMAP_ID } from '@/lib/mapbox/basemaps';

describe('useMapPreferencesStore', () => {
  beforeEach(() => {
    // Reset to defaults between tests. Persist middleware writes to
    // localStorage which jsdom keeps live across tests, so we
    // manually clear both the in-memory state and the storage key.
    useMapPreferencesStore.setState({
      basemapId: DEFAULT_BASEMAP_ID,
      hillshadeEnabled: false,
    });
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('montana:map-prefs');
    }
  });

  it('starts with the default basemap and hillshade off', () => {
    const state = useMapPreferencesStore.getState();
    expect(state.basemapId).toBe(DEFAULT_BASEMAP_ID);
    expect(state.hillshadeEnabled).toBe(false);
  });

  it('updates the active basemap', () => {
    useMapPreferencesStore.getState().setBasemap('satellite');
    expect(useMapPreferencesStore.getState().basemapId).toBe('satellite');
  });

  it('toggles hillshade on and off', () => {
    useMapPreferencesStore.getState().toggleHillshade();
    expect(useMapPreferencesStore.getState().hillshadeEnabled).toBe(true);
    useMapPreferencesStore.getState().toggleHillshade();
    expect(useMapPreferencesStore.getState().hillshadeEnabled).toBe(false);
  });
});
