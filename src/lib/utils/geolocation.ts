import type { LatLng } from '@/types/incident';

interface GetPositionOptions {
  timeoutMs?: number;
  maximumAgeMs?: number;
  highAccuracy?: boolean;
}

/**
 * Promise wrapper around navigator.geolocation with mountain-friendly
 * defaults: accept a cached fix up to 30s old so the user is not left
 * staring at a spinner while GPS locks on under poor sky view.
 */
export function getCurrentPosition({
  timeoutMs = 15000,
  maximumAgeMs = 30000,
  highAccuracy = true,
}: GetPositionOptions = {}): Promise<LatLng & { accuracy: number; altitude: number | null }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not available in this environment.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
        }),
      (err) => reject(err),
      {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs,
      },
    );
  });
}
