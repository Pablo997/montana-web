# Cost & Quota Audit

What scales with traffic and costs money outside Vercel.

## TL;DR

| Provider | Free tier | ~1.5k sessions/mo | Risk |
|---|---|---|---|
| MapTiler tiles | 100 k req | ~250–400 k | 🔴 Likely over |
| MapTiler geocoding | 100 k req | ~5–10 k | 🟢 OK |
| Supabase RPCs | rate-limited | ~30–60 k | 🟡 Watch egress |
| Supabase Realtime | 200 concurrent | low | 🟢 OK |
| Vercel Analytics | 2.5 k events (Hobby) | ~5 k sampled | 🟡 Pro if growing |

Assumption: 500 visitors × 3 sessions × ~5 min map use.

## MapTiler tiles

1 request = 1 tile. Active session: **200–400 tiles** (pan/zoom, basemap swap, hillshade).

**Mitigations:**
- `maxZoom: 18` in `MapView.tsx`
- `/nearby` loads **zero** tiles (list-only surface)
- Browser HTTP cache for tiles (does not count against quota)

**Dashboard:** MapTiler → Limits → alert ~3k tiles/day, hard cap ~130% of that.

## MapTiler geocoding

`SearchBar`: 220 ms debounce, min 2 chars, `AbortController` on keystroke.

**Mitigations:**
- LRU cache (`geocodeCache.ts`): 50 entries, 5 min TTL, proximity bucketed 0.1°
- Recents in `useSearchHistoryStore` (no API)

## Supabase

| RPC | When | /session |
|---|---|---|
| `incidents_in_bbox` | map `moveend` (250 ms debounce) | 20–40 |
| `list_nearby_incidents` | `/nearby` explicit fetch | 0–3 |
| `count_unread_notifications` | auth mount | 1 |

**Mitigations:** z=7 tile cache (`tile-cache.ts`), realtime keeps store fresh without refetch.

**Apply migration `00040_list_nearby_incidents.sql`** before `/nearby` works in prod.

## Vercel Analytics

See [`docs/ANALYTICS.md`](ANALYTICS.md) for sampling rates.

## Bill alert runbook

1. Identify provider from the email.
2. Spike → bot or regression; steady → growth → upgrade or more caching.
3. MapTiler overage → confirm `maxZoom`, promote `/nearby`, check geocode cache hit rate.
4. Update this doc with real numbers once you have a month of data.
