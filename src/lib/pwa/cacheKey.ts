/**
 * URL normalization for service-worker caching.
 *
 * Some upstreams (MapTiler in particular) rewrite volatile query
 * params on every page load — `mtsid` for session tracking, `v` for
 * cache-busting style revisions, `session` as a generic uniquifier.
 * If we keyed the SW cache by the full URL, every reload would
 * create a new entry for the same underlying tile, exploding the
 * cache and leaving the map blank when offline despite hundreds of
 * entries already stored.
 *
 * This module is the single source of truth for that normalization.
 * The SW (`public/sw.js`) mirrors this logic in plain JS because it
 * can't import TS modules; keep both in sync when adding new params.
 * The TS version exists so we can unit-test the behaviour.
 */

export const VOLATILE_QUERY_PARAMS = ['mtsid', 'session', 'v'] as const;

/**
 * Returns a normalized URL string with volatile query params stripped.
 * Param order and remaining params are preserved. If nothing needs
 * stripping, returns the input unchanged (reference equal).
 */
export function normalizeCacheUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  let changed = false;
  for (const param of VOLATILE_QUERY_PARAMS) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }
  return changed ? url.toString() : rawUrl;
}
