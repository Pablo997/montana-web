import type { SearchResult } from './geocoding';

/**
 * Small LRU cache for geocoding queries.
 *
 * Why a cache exists at all:
 *
 *   * `SearchBar` debounces by 220 ms but the user STILL types the
 *     same query repeatedly (delete, retype, switch tabs, come
 *     back). Each repeat is currently a fresh MapTiler request.
 *     With the free tier at 100 k geocoding requests/month, a 30 %
 *     hit rate translates directly into 30 % more headroom — and
 *     it costs us nothing because the answers are deterministic
 *     for the same (query, locale, proximity-rounded) tuple.
 *
 *   * The cache lives in module scope (closure on import), not in
 *     a store or localStorage. We DON'T want it to survive a hard
 *     reload — Mapbox / MapTiler occasionally retunes ranking and
 *     a perma-cache would freeze users on stale results.
 *
 * Why LRU and not just a Map:
 *
 *   * A naked `Map` would grow without bound. A user opening the
 *     bar 50 times during a long session would pin all 50 result
 *     sets in memory. 50 results × ~3 KB each = 150 KB of JS heap
 *     for a feature that nobody asked us to remember.
 *
 *   * LRU evicts the least-recently-used entry on overflow. 50
 *     entries is enough to cover a realistic single session and
 *     keeps the heap footprint trivial (~150 KB).
 *
 * Why TTL on top of LRU:
 *
 *   * Even within a session, MapTiler results CAN change (a new
 *     POI gets added, a place gets renamed). 5 minutes is the
 *     usual sweet spot for "feels live, not wasteful". We trade a
 *     tiny correctness window for ~half the request volume on
 *     queries the user re-issues quickly (typo → backspace →
 *     retype is the classic pattern).
 *
 * What the key includes:
 *
 *   * Query string (trimmed, lowercased — geocoders are case-
 *     insensitive on input).
 *   * Locale — "Madrid" in `es` returns "Madrid, Comunidad de
 *     Madrid" but in `en` may return "Madrid, Spain". Mixing them
 *     would feed the wrong subtitle into the dropdown.
 *   * Proximity bucketed to 0.1°. We deliberately round so a user
 *     panning the map by tens of metres doesn't invalidate every
 *     cached entry. 0.1° ≈ 11 km — wide enough to absorb idle
 *     scrolling, narrow enough that the proximity bias still
 *     matters at the city scale.
 */

const MAX_ENTRIES = 50;
const TTL_MS = 5 * 60 * 1000;

interface Entry {
  results: SearchResult[];
  expiresAt: number;
}

const store = new Map<string, Entry>();

function makeKey(
  query: string,
  locale: string,
  proximity: [number, number] | undefined,
): string {
  const q = query.trim().toLowerCase();
  const prox = proximity
    ? // Bucket to 0.1° (~11 km). See module doc for the rationale.
      `${proximity[0].toFixed(1)},${proximity[1].toFixed(1)}`
    : 'none';
  return `${locale}|${prox}|${q}`;
}

/**
 * Returns a cached result set if present and still fresh. The
 * lookup also bumps LRU recency (Map preserves insertion order, so
 * we delete + re-set to move the entry to the back).
 */
export function getCachedGeocode(
  query: string,
  locale: string,
  proximity: [number, number] | undefined,
): SearchResult[] | null {
  const key = makeKey(query, locale, proximity);
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    // Stale — evict eagerly so the next caller takes the network
    // path. Returning the stale rows would mean we never refresh.
    store.delete(key);
    return null;
  }
  // Recency bump: remove + re-insert puts the key at the back of
  // the iteration order, which is what `evict()` reads.
  store.delete(key);
  store.set(key, hit);
  return hit.results;
}

/**
 * Stores a freshly-fetched result set. Evicts the oldest entry
 * if the cache is full. Empty result sets are cached too — they
 * represent "no match for this query" and we should not retry the
 * server for the answer the user just got.
 */
export function setCachedGeocode(
  query: string,
  locale: string,
  proximity: [number, number] | undefined,
  results: SearchResult[],
): void {
  const key = makeKey(query, locale, proximity);
  if (store.size >= MAX_ENTRIES) {
    // Map iteration order = insertion order. The first key is the
    // least-recently-used after the recency bumps in `get()`.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { results, expiresAt: Date.now() + TTL_MS });
}

/** Test helper. Production code should not need this. */
export function _resetGeocodeCacheForTests(): void {
  store.clear();
}
