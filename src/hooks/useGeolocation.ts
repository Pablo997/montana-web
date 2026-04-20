'use client';

import { useEffect, useState } from 'react';
import { getCurrentPosition } from '@/lib/utils/geolocation';
import type { LatLng } from '@/types/incident';

interface GeoState {
  position: LatLng | null;
  accuracy: number | null;
  altitude: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(auto = true): GeoState & { refresh: () => void } {
  const [state, setState] = useState<GeoState>({
    position: null,
    accuracy: null,
    altitude: null,
    error: null,
    loading: auto,
  });

  const refresh = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    getCurrentPosition()
      .then((pos) =>
        setState({
          position: { lat: pos.lat, lng: pos.lng },
          accuracy: pos.accuracy,
          altitude: pos.altitude,
          error: null,
          loading: false,
        }),
      )
      .catch((err: GeolocationPositionError | Error) =>
        setState((s) => ({
          ...s,
          loading: false,
          error: 'message' in err ? err.message : 'Unknown geolocation error.',
        })),
      );
  };

  useEffect(() => {
    if (auto) refresh();
  }, [auto]);

  return { ...state, refresh };
}
