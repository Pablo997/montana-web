import type { SearchResult } from './geocoding';

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
    ? `${proximity[0].toFixed(1)},${proximity[1].toFixed(1)}`
    : 'none';
  return `${locale}|${prox}|${q}`;
}

export function getCachedGeocode(
  query: string,
  locale: string,
  proximity: [number, number] | undefined,
): SearchResult[] | null {
  const key = makeKey(query, locale, proximity);
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, hit);
  return hit.results;
}

export function setCachedGeocode(
  query: string,
  locale: string,
  proximity: [number, number] | undefined,
  results: SearchResult[],
): void {
  const key = makeKey(query, locale, proximity);
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { results, expiresAt: Date.now() + TTL_MS });
}

export function _resetGeocodeCacheForTests(): void {
  store.clear();
}
