/*
 * Montana service worker.
 *
 * Written as a plain ES-module-free script (matches how browsers
 * prefer to parse SWs) so we can host it verbatim from /public and
 * skip Webpack. The rules here are intentionally conservative: when
 * in doubt we go network-first, because a stale incident report can
 * be literally dangerous in the mountains.
 *
 * Cache layout (one bucket per class so we can invalidate
 * independently):
 *   - SHELL_CACHE : small HTML docs used as fallbacks when nav fails.
 *   - ASSET_CACHE : Next.js immutable JS/CSS from /_next/static/*.
 *   - TILE_CACHE  : MapTiler vector tiles (LRU-capped so a long trip
 *                   through many tiles doesn't fill the phone).
 *
 * Bumping CACHE_VERSION forces a clean sweep on the next activate.
 * Use it whenever the strategy changes (not when deploying the app;
 * that's handled automatically by Next's hashed filenames).
 */

// Bump on any strategy change (or when a previous deploy shipped
// a broken static asset that needs evicting from every installed
// client). The `activate` handler below deletes every cache whose
// name doesn't end in this suffix, so a version bump is a hard
// reset across the whole bucket.
const CACHE_VERSION = 'v6';
const SHELL_CACHE = `montana-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `montana-assets-${CACHE_VERSION}`;
const TILE_CACHE = `montana-tiles-${CACHE_VERSION}`;

const TILE_CACHE_MAX_ENTRIES = 400;

// Flip this to `true` to trace offline behaviour from the page's
// DevTools console (SW logs are merged with the page console in
// modern Chrome, prefixed with `[sw]`). Off by default because it
// gets noisy fast on busy pages — every tile fetch logs a line.
const DEBUG = false;
const log = (...args) => {
  if (DEBUG) console.log('[sw]', ...args);
};

// Hostnames that serve map resources. We match with endsWith() so
// every regional/functional subdomain (api.maptiler.com,
// tiles.maptiler.com, cloud.maptiler.com…) gets the same treatment
// through a single rule. The `tile.openstreetmap.org` entry is a
// safety net for the attribution widget that occasionally fetches
// OSM branding even when we're on a MapTiler style.
const MAP_HOSTS = ['maptiler.com', 'maptiler.io', 'openstreetmap.org'];

// URLs we never touch from the SW, even if intercepted:
//   - /monitoring is the Sentry tunnel. Caching it would swallow
//     error reports silently.
//   - /api/* is all business logic (auth, Supabase RPCs via our
//     wrappers). Those MUST go over the network every time or the
//     user sees ghost data.
//   - /_next/data/* is Next.js's own RSC payload endpoint; Next
//     already has its own cache-busting for these.
function shouldBypass(url) {
  return (
    url.pathname.startsWith('/monitoring') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/')
  );
}

// Query params that MapTiler (and similar providers) rewrite on
// every page load even though the underlying resource is the same.
// If we keyed the cache by the full URL the cache would miss on
// every session → offline map is blank despite 300+ entries stored.
// Real-world culprits seen so far:
//   - mtsid   : MapTiler session id, rotated each load.
//   - session : generic "make this request unique" param.
//   - v       : cache-busting version used by some style files.
// The `key` param is intentionally preserved because it identifies
// the tenant and affects the returned resource.
const VOLATILE_QUERY_PARAMS = ['mtsid', 'session', 'v'];

// Returns a Request whose URL has the volatile params stripped.
// This is what we feed to `cache.match` and `cache.put` so two
// sessions of the same asset share a cache entry. The *original*
// request is still used for the network fetch, so the server keeps
// getting whatever it expects.
function cacheKeyFor(request) {
  const url = new URL(request.url);
  let changed = false;
  for (const param of VOLATILE_QUERY_PARAMS) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }
  if (!changed) return request;
  return new Request(url.toString(), { method: 'GET' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Use `Promise.allSettled` + individual `cache.add` calls so
      // that a transient failure on any single URL (e.g. the map
      // route 500ing during deploy) doesn't abort the whole SW
      // install. `cache.addAll` is atomic and brittle by design.
      //
      // We pre-cache the root route too so the offline map has an
      // HTML shell to load even before the user has visited the
      // site with an active SW. Without this, the very first
      // offline reload would 404 into /offline.
      const results = await Promise.allSettled([
        cache.add('/'),
        cache.add('/offline'),
        cache.add('/icons/icon.svg'),
      ]);
      log('install precache results', results.map((r) => r.status));
    })(),
  );
  // Take over immediately on next reload instead of waiting for all
  // tabs to close. Safe because we version caches.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const deleted = keys.filter((k) => !k.endsWith(CACHE_VERSION));
      await Promise.all(deleted.map((k) => caches.delete(k)));
      log('activate: deleted old caches', deleted);
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------
// The edge function encrypts notification payloads with the per-subscription
// p256dh/auth keys and POSTs them to the push service. The browser delivers
// the plaintext to us as a `push` event, where we MUST show a user-visible
// notification (a "silent" push will burn the permission token).
//
// Payload shape (kept in sync with the edge function):
//   {
//     title: string,
//     body: string,
//     tag: string,       // incident id, so repeated updates collapse
//     url: string,       // deep link to the incident detail
//     type?: string,     // incident type, used to pick an icon if we add one
//     severity?: string,
//   }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    // `event.data` can be empty on Safari's "wake-up" pings; we still
    // have to show a notification or the permission gets revoked, so
    // fall back to a generic one rather than bail out.
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'Nearby incident';
  const options = {
    body: data.body || 'Open Montana to see the latest reports.',
    // `tag` collapses notifications with the same id so a rapidly
    // updated incident doesn't spam the shade.
    tag: data.tag || 'montana-incident',
    // Renotify only matters when `tag` matches a previously shown
    // notification; forcing true means the user sees an update
    // (haptic, sound) instead of a silent replace.
    renotify: Boolean(data.tag),
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    // Carry the URL through so `notificationclick` knows where to go
    // without re-parsing anything from the body.
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  // Try to focus an already-open tab on the same origin instead of
  // opening a new one every time — matches the behaviour users expect
  // from chat apps and keeps tab sprawl down.
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        const clientUrl = new URL(client.url);
        const targetParsed = new URL(targetUrl, self.location.origin);
        if (clientUrl.origin === targetParsed.origin && 'focus' in client) {
          await client.focus();
          // Same-origin navigation without a reload; smoother than
          // openWindow because the SPA stays mounted.
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (shouldBypass(url)) {
    log('bypass', url.pathname);
    return;
  }

  // Map resources (MapTiler + OSM): cache-first with LRU. Tiles and
  // style assets are effectively immutable per URL (versioning is
  // baked into the path), so aggressive caching is safe. We
  // normalize the cache key so volatile session params (`mtsid`
  // etc.) don't explode the cache into one entry per page load.
  if (MAP_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(
      cacheFirstLRU(request, cacheKeyFor(request), TILE_CACHE, TILE_CACHE_MAX_ENTRIES, 'map'),
    );
    return;
  }

  // Hashed Next.js assets: immutable by build, cache-first forever.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstLRU(request, request, ASSET_CACHE, 500, 'asset'));
    return;
  }

  // Navigations: network-first so pages stay up-to-date when online,
  // with the offline page as fallback when everything fails. Also
  // opportunistically caches the response so a user who lands once
  // can revisit while offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Everything else (fonts, icons, images hosted on our origin):
  // stale-while-revalidate — fast from cache, refreshed in the
  // background.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
});

// `request`  - the real fetch we send to the network (with full
//               session params so the origin accepts it).
// `cacheKey` - the Request used for cache storage/lookup. For most
//               assets it's the same as `request`, but for MapTiler
//               it's a normalized copy so entries from different
//               sessions collide on purpose.
async function cacheFirstLRU(request, cacheKey, cacheName, maxEntries, label) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey);
  if (cached) {
    log(label, 'HIT', request.url);
    // Touch: re-put so the entry is the newest in iteration order.
    // Cheap LRU without maintaining a separate timestamp index.
    cache.put(cacheKey, cached.clone()).catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    // `opaque` covers no-cors responses (MapLibre sometimes falls
    // back to these). `ok` is the 2xx happy path. We deliberately
    // skip redirects and errors so broken deploys don't poison the
    // cache.
    if (response.ok || response.type === 'opaque') {
      cache.put(cacheKey, response.clone()).catch(() => {});
      trimCache(cache, maxEntries);
    }
    log(label, 'MISS', request.url, response.status);
    return response;
  } catch (err) {
    log(label, 'OFFLINE-MISS', request.url);
    // Mirror network-first's safety: on total failure, return any
    // stale match rather than throwing (which would surface as a
    // broken tile on the map).
    return cached ?? Response.error();
  }
}

async function networkFirstWithOfflineFallback(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      log('nav OFFLINE-HIT', request.url);
      return cached;
    }
    log('nav OFFLINE-MISS → /offline', request.url);
    const offline = await cache.match('/offline');
    return offline ?? Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  return cached ?? (await networkPromise) ?? Response.error();
}

// Keep the cache under `maxEntries` by evicting from the front of
// the keys list (oldest insert order, which `cacheFirstLRU`
// maintains by re-putting on every hit). Fire-and-forget to avoid
// blocking the response.
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}
