import type { LatLng } from '@/types/incident';

export type GeoFix = LatLng & { accuracy: number; altitude: number | null };

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
}: GetPositionOptions = {}): Promise<GeoFix> {
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

interface WatchBestFixOptions {
  /** Total listening window in ms. Stops early if we hit `targetAccuracy`. */
  windowMs?: number;
  /** Stop as soon as a fix with `accuracy <= targetAccuracy` arrives (meters). */
  targetAccuracy?: number;
  /** Called on every improved fix so the UI can show live progress. */
  onProgress?: (fix: GeoFix) => void;
}

/**
 * Opens a short `watchPosition` session and resolves with the best fix
 * received within the window (lowest `accuracy` wins). Rejects only if
 * no fix is received before `windowMs` elapses.
 *
 * Why: `getCurrentPosition` almost always returns the first (worst) fix
 * the GPS/Wi-Fi stack produces. Listening for a few seconds lets the
 * chip refine its solution and typically drops accuracy from 30-50 m
 * down to 3-10 m outdoors.
 */
export function watchBestFix({
  windowMs = 6000,
  targetAccuracy = 10,
  onProgress,
}: WatchBestFixOptions = {}): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not available in this environment.'));
      return;
    }

    let best: GeoFix | null = null;
    let settled = false;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: GeoFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
        };
        if (!best || fix.accuracy < best.accuracy) {
          best = fix;
          onProgress?.(fix);
        }
        if (fix.accuracy <= targetAccuracy) finish();
      },
      (err) => {
        if (settled) return;
        if (best) finish();
        else {
          settled = true;
          navigator.geolocation.clearWatch(id);
          reject(err);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: windowMs },
    );

    const timer = setTimeout(finish, windowMs);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      navigator.geolocation.clearWatch(id);
      if (best) resolve(best);
      else reject(new Error('No geolocation fix received within the window.'));
    }
  });
}
