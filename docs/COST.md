# Cost & Quota Audit

This doc tracks the moving parts of Montana that scale with traffic and **cost real money** outside of Vercel. If you're staring at a surprise invoice from MapTiler or thinking "why is Supabase warning me about row egress", start here.

## TL;DR

| Provider | Free tier | At 1.5 k sessions/month | Risk |
|---|---|---|---|
| MapTiler tiles | **100 k req** | ~250–400 k req | 🔴 **Likely to exceed** |
| MapTiler geocoding | **100 k req** | ~5–10 k req | 🟢 Headroom |
| Supabase RPCs | unlimited on free tier (rate-limited per IP) | ~30–60 k req | 🟡 OK, watch egress |
| Supabase Realtime | 200 concurrent / 2 M messages | ~200 concurrent worst case | 🟢 OK |
| Supabase Storage | 1 GB | grows linearly with photos | 🟡 Watch |
| Vercel Edge requests | 100 k function invocations | ~10–30 k | 🟢 OK |

Numbers assume 500 monthly visitors × 3 sessions × 5 minutes of active map use. Halve them for passive users, double for power users — but the **single biggest cost driver is map tiles**, by an order of magnitude.

## MapTiler

### Tiles (the big one)

Every basemap pan, zoom, or change requests new vector tiles from `https://api.maptiler.com/maps/<style>/{z}/{x}/{y}.pbf` (or `.png` for raster). The cost model is **1 request per tile**.

**Per-session math**:

- First paint at z=6: ~25 tiles to cover the viewport.
- Pan / zoom over 5 minutes: ~150–300 additional tiles.
- Switching basemap: full re-fetch = +25–50 tiles per swap.
- Hillshade overlay: doubles tile load for the visible area (separate raster source).
- **Realistic active session: 200–400 tiles.**

**Mitigations in place**:

- `maxZoom: 18` cap in `MapView.tsx`. The default of 22 quadruples tile count per level — wasted on outdoor imagery whose native resolution doesn't go past z=18 anyway. See the in-code comment for the user-experience justification.
- `/nearby` list surface loads **zero** tiles — users on slow connections or low quota can browse incidents without touching the map at all.
- Curated 6-basemap list (`basemaps.ts`). Each addition is a new style URL the user might warm — keeping the list short bounds the worst-case footprint.
- Basemap preference persists per user (`useMapPreferencesStore`), so returning visitors don't pay for the basemap discovery dance every session.
- Browser-level HTTP cache hits do NOT count against MapTiler quota. Tiles are served with `Cache-Control: max-age=86400` upstream, so an idle-tab refresh is free.

**What's NOT mitigated yet**:

- No service-worker cross-origin cache for tiles. Possible but invasive (would need a custom strategy in `public/sw.js` and CORS allowance from MapTiler). Defer until quota actually bites.
- No regional rate-limit. A bot scraping the map could burn the whole monthly budget in an hour. Address with a Vercel WAF rule (paid tier) or a soft-cap server-side proxy if it becomes a real risk.

### Geocoding

Used by `SearchBar` for forward geocoding. Free tier: **100 k requests/month**.

**Per-session math**:

- 220 ms debounce + 2-character minimum (`SearchBar.tsx`).
- Average user types 4–6 chars before settling → 1 search produces 2–3 requests after debounce.
- Typical session: **0–5 searches** (most users never touch the bar).
- **Realistic session: ≤ 10 requests.**

**Mitigations in place**:

- Debounce + `AbortController` per keystroke so superseded queries never reach the server (`SearchBar.tsx`).
- LRU + TTL cache (`geocodeCache.ts`):
  - 50 entries × ~3 KB = ~150 KB heap ceiling.
  - 5-minute TTL — long enough to catch backspace/retype loops, short enough that MapTiler ranking updates show through within a session.
  - Keyed by `(locale, proximity bucketed to 0.1°, query lowercased)` — micro-pans don't bust the cache; locale switches do.
  - Caches empty results too, so dead queries (`zzzz`) never round-trip twice.
- "Recents" list in `useSearchHistoryStore` re-uses results without hitting the API at all.

### Soft-caps to set in the MapTiler dashboard

Account → Account settings → Limits:

1. **Daily tile request alert** at 3 k/day (= 90 k/month, just under free tier).
2. **Daily geocoding alert** at 3 k/day.
3. **Hard cap** at 130 % of the alert thresholds so a runaway scenario can't 10x the bill before you notice. Lost requests render as gray tiles — users see breakage rather than you seeing a bill.

## Supabase

### RPCs

All client-side data flows through PL/pgSQL functions (RPCs), never raw `.from('table')`. Hot paths:

| RPC | Trigger | Per session |
|---|---|---|
| `incidents_in_bbox` | `moveend` (debounced 250 ms) | 20–40 |
| `list_nearby_incidents` | `/nearby` explicit fetch (user taps "use my location") | 0–3 |
| `health_ping` | External uptime probe | 1 per minute (constant) |
| `count_unread_notifications` | Initial mount, authenticated only | 1 |
| `get_my_notifications` | Bell dropdown opened | 0–1 |
| `is_admin` | Admin-page mount | 0 (rare) |
| `nearby_incidents` | Push subscription setup | 0–1 |
| `create_incident` + `upsert_push_subscription` + … | One-shot user actions | ≤ 5 |

**Apply migration `00040_list_nearby_incidents.sql`** before `/nearby` works in prod. This RPC is separate from `nearby_incidents` (used by push/cron).

**Mitigations in place**:

- Slippy-tile cache for `incidents_in_bbox` (`tile-cache.ts`). Already-fetched z=7 tiles are skipped — a user panning back over the same area pays nothing.
- Realtime subscription keeps the local store consistent, so we never re-fetch to "check for updates".
- Server-side pagination on `my_incidents` and `admin_list_*` (default page size 20).

### Realtime channels

Two long-lived channels per authenticated session: `incidents-stream` (everyone) and `notifications-<uid>` (the user's own row).

- Channel count cap on free tier: **200 concurrent across the whole project**. At < 100 simultaneous users we're nowhere near.
- Message cap: **2 M/month**. Every INSERT/UPDATE/DELETE on `incidents` and `notifications` fans out. At realistic publication volumes (≤ 100 incidents/day, ≤ 500 notifications/day) we're at ~30 k messages/month.

Both channels clean up correctly on unmount (verified in `useRealtimeIncidents.ts` and `useNotifications.ts`). No known leaks.

### Storage

`incident-media` bucket. Each photo is compressed client-side via `browser-image-compression` before upload (target ~150 KB).

- 1 GB free tier → ~6 700 photos. At our current rate (early access), years of headroom.
- Auto-cleanup: when an incident is hard-deleted, a Postgres trigger queues the media path for deletion via Edge Function. See `supabase/migrations/00028_*`.

### Soft-caps to set in the Supabase dashboard

Project Settings → Usage:

1. **Database egress alert** at 60 % of monthly quota. Cheap insurance against an N+1 query that ships in a future commit.
2. **API request alert** at 80 % of monthly quota.
3. **Auth user alert** at 80 % of MAU limit.

For paid tiers, also set the **hard spending cap** at the Organization level: Settings → Billing → "Spending Cap". Without it, an overage on egress can multiply the bill by 5–10x.

## Vercel

Custom analytics events were sampled in `feat/analytics-events` precisely to stay under the Hobby cap — see [`docs/ANALYTICS.md`](ANALYTICS.md) for the per-event rates.

Function invocations: only `auth/callback`, `api/health`, `api/ping`, `api/notifications/mark-read`, and `monitoring/*` (Sentry tunnel) run as serverless functions. Everything else is rendered statically or via the Edge runtime. Aggregate invocations stay well below the 100 k Hobby cap unless a bot starts hitting `api/health` directly.

## Sentry

`@sentry/nextjs` is configured with `sendDefaultPii: false` and a custom `beforeSend` filter that drops noisy errors. Free tier: **5 k errors / 10 k traces / 100 replays per month**.

If error volume creeps up:

1. Filter known noise in `sentry.client.config.ts` → `beforeSend` (e.g. `NetworkError` from extensions).
2. Lower `tracesSampleRate` from the current 0.1 if traces dominate the quota.
3. Disable replays entirely (`replaysSessionSampleRate: 0`) if they break the budget.

## Adding a new external dependency

Before merging a feature that calls a third-party API in the user's hot path:

1. **Measure** the per-session request count from a real Playwright run (`npm run start` → manual session → DevTools Network).
2. **Project** monthly volume at 10x your current MAU (today's "no problem" becomes tomorrow's "what happened to the budget").
3. **Cache** at the source — request dedup is always cheaper than serving the same response twice.
4. **Update this file** with a row in the TL;DR table and a per-section breakdown so the next engineer can find it.

## Runbook: "We exceeded a quota / got a bill alert"

1. **Identify which provider**. Email subject + Vercel/Supabase/MapTiler dashboard.
2. **Check the dashboard usage chart** for the time window — sudden spike = bot or regression; steady ramp = organic growth.
3. If sudden spike:
   - Inspect Vercel logs for the IP/user-agent burst window.
   - Add a temporary block via Vercel WAF or a Supabase RLS allowlist.
4. If steady ramp:
   - Open this doc's mitigation list — anything not yet implemented is the next move.
   - MapTiler overage → confirm `maxZoom: 18`, promote `/nearby`, check geocode cache hit rate.
   - Consider upgrading the provider tier. Both MapTiler and Supabase have linear pricing past the free tier; the first paid step is usually $25/mo and unblocks 2-10x the headroom.
5. Update the relevant table in this file with the new numbers.
