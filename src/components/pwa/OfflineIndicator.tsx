'use client';

import { useEffect, useState } from 'react';

/**
 * Small floating pill that appears when the browser reports the
 * network as unreachable.
 *
 * `navigator.onLine` alone is unreliable: after a hard reload while
 * DevTools is in "Offline" mode (or on some OS/network stacks) it can
 * transiently report `true` before the `offline` event would fire, so
 * the indicator would never appear. We augment it with an active
 * probe: a tiny no-cache HEAD request to a same-origin endpoint. If
 * that fails, we are offline regardless of what the flag says, and
 * we re-probe on an interval so we recover once the network is back.
 *
 * Deliberately a client component: server-rendering it would default
 * to "online" during SSR and then flicker on hydration.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Probes the network with a tiny HEAD request. Used as a safety
    // net for the initial render (when `navigator.onLine` can lie
    // after a reload) and on an interval (to recover if either
    // `online`/`offline` event is missed). We deliberately do NOT
    // call this from the event handlers themselves: those events
    // are instant and trustworthy, and probing right after them
    // races with the OS bringing the network stack back up, which
    // would flip the indicator back to "offline" for a moment.
    const probe = async () => {
      try {
        const res = await fetch('/api/ping', {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };

    setOnline(navigator.onLine);
    if (navigator.onLine) {
      // Flag says online; verify once in case it's lying (common
      // after a hard reload while DevTools "Offline" is toggled on).
      void probe();
    }

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Self-healing sweep: if we missed an event or the browser lied
    // about a state change, the next probe will correct us. 20s is
    // a trade-off between responsiveness and battery/data.
    const interval = window.setInterval(probe, 20_000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-indicator" role="status" aria-live="polite">
      <span className="offline-indicator__dot" aria-hidden />
      Offline — showing cached map only
    </div>
  );
}
