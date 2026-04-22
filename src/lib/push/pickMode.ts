'use client';

import { useEffect, useState } from 'react';
import type { LatLng } from '@/types/incident';

/**
 * Tiny pub/sub singleton coordinating the "pick a point on the map"
 * flow between the notification-settings modal and the MapView.
 *
 * Why not reuse the existing `pickingLocation` flag from `useMapStore`?
 * That flag is dedicated to the incident-reporting flow — it interacts
 * with `reportOpen`, `cancelPickingLocation` re-opens the report
 * dialog, etc. Overloading it for push-center picks would entangle
 * two unrelated UX threads. A standalone channel is cheaper than
 * untangling Zustand state later.
 *
 * Contract:
 *   - NotificationSettings (or its parent) calls `requestPick()` and
 *     awaits the returned Promise.
 *   - MapView observes `useIsPickingPushCenter()` to turn on its
 *     crosshair + banner + one-shot click listener.
 *   - On click, MapView calls `resolvePick(coords)`.
 *   - On cancel (Esc, banner close, flow abandoned), any listener
 *     calls `resolvePick(null)` and the awaiter knows to bail.
 */

type Listener = (coords: LatLng | null) => void;
type StatusListener = (active: boolean) => void;

let pending: Listener | null = null;
const statusListeners = new Set<StatusListener>();

function setActive(active: boolean) {
  statusListeners.forEach((l) => l(active));
}

/**
 * Enters pick mode. Resolves to the picked coords or `null` if the
 * user cancelled. Only one pick can be in flight at a time — calling
 * this twice cancels the first one to avoid dangling promises.
 */
export function requestPick(): Promise<LatLng | null> {
  if (pending) {
    pending(null);
    pending = null;
  }
  return new Promise((resolve) => {
    pending = resolve;
    setActive(true);
  });
}

export function resolvePick(coords: LatLng | null): void {
  if (!pending) return;
  const cb = pending;
  pending = null;
  setActive(false);
  cb(coords);
}

/** React-friendly status hook for the MapView. */
export function useIsPickingPushCenter(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    statusListeners.add(setActive);
    return () => {
      statusListeners.delete(setActive);
    };
  }, []);
  return active;
}
