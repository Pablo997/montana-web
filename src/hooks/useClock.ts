'use client';

import { useEffect, useState } from 'react';

/**
 * Returns the current timestamp, re-rendering at most once per `intervalMs`.
 *
 * Used by anything that displays relative time (e.g. "expires in 3h")
 * so labels refresh without having to poll `Date.now()` inside a render
 * path. A single coarse tick at 60s is enough for expiry badges and
 * avoids thrashing React reconciliation.
 */
export function useClock(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
