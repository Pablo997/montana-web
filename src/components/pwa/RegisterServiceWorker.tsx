'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker on the client once the page is idle.
 *
 * Important design decisions:
 *
 * 1. **Production-only.** In dev, Next.js hot-reloads constantly and
 *    a stale SW cache causes the most confusing bugs the framework
 *    can produce. We also preemptively unregister any existing SW
 *    when running in dev so a developer who previously had prod
 *    cached doesn't get stuck on stale code.
 *
 * 2. **Registered from layout root**, not from page.tsx, because we
 *    want it active on /auth, /privacy, /offline — every route — and
 *    duplicating the call would lead to race conditions during
 *    client-side navigation.
 *
 * 3. **`requestIdleCallback` wrapper.** SW registration triggers a
 *    bunch of install/fetch work; deferring it to idle keeps the
 *    first meaningful paint snappy.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // Defensive: unregister any old SW so the developer doesn't
      // get served stale prod bundles locally. This is a no-op when
      // there's nothing registered.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      // Snapshot whether a SW was already controlling the page at
      // script execution. If it wasn't and activation happens during
      // this session, we force a one-time reload so that subsequent
      // tile/asset fetches (MapLibre, Next chunks) flow through the
      // SW and populate the offline caches. Without this the first
      // visit after install never warms the tile cache, which makes
      // the map blank the first time the user goes offline.
      const wasControlled = Boolean(navigator.serviceWorker.controller);

      // Separate flag so the `controllerchange` listener below
      // (which fires on UPDATES, i.e. a new SW replacing an
      // existing one after a version bump) doesn't trigger a
      // second redundant reload in the first-install path.
      let reloaded = false;
      const safeReload = () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Skip on first install — that path is handled explicitly
        // below so we can control the reload timing precisely. This
        // listener is for subsequent updates (CACHE_VERSION bump,
        // strategy changes pushed in a new deploy).
        if (!wasControlled) return;
        safeReload();
      });

      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          if (wasControlled) return;

          const reloadWhenActive = (worker: ServiceWorker) => {
            if (worker.state === 'activated') {
              safeReload();
              return;
            }
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated') safeReload();
            });
          };

          // The newly-registered worker lives in one of three
          // slots depending on its lifecycle stage at this instant.
          const pending =
            registration.installing ?? registration.waiting ?? registration.active;
          if (pending) reloadWhenActive(pending);
        })
        .catch((err) => {
          // A failed SW registration shouldn't break the app —
          // Sentry already captures runtime errors globally, so we
          // just log here for local debugging.
          console.warn('[sw] registration failed', err);
        });
    };

    // `requestIdleCallback` isn't in Safari < 16.4, so fall back to
    // a 1s setTimeout which is indistinguishable for our purposes.
    const ric =
      'requestIdleCallback' in window
        ? (cb: () => void) =>
            (window as typeof window & {
              requestIdleCallback: (cb: IdleRequestCallback) => number;
            }).requestIdleCallback(cb)
        : (cb: () => void) => window.setTimeout(cb, 1000);

    ric(register);
  }, []);

  return null;
}
