# Montana — Development Guide

This document is the single source of truth for architecture, conventions, data model and the phased roadmap. It is meant to be read both by humans and by coding assistants working on the repository; keep it accurate and up to date when you change the system.

> TL;DR: **Next.js + Supabase (Postgres + PostGIS) + MapTiler + Web Push**. Everything is free-tier friendly. No custom backend: RLS policies and Postgres triggers encode the business rules; a single Edge Function handles outbound push.

---

## 1. Product overview

Montana is a community-moderated map of mountain incidents and points of interest.

- Authenticated users create incidents at a geographic point.
- Each incident has a `type` (e.g. `accident`, `trail_blocked`, `water_source`) and a `severity` (`mild` / `moderate` / `severe`).
- Any authenticated user (except the author) can cast an up- or down-vote.
- A Postgres trigger recomputes the vote counters and transitions `status` automatically:
  - `pending → validated` once upvotes reach `validation_threshold` (default 5).
  - `pending | validated → dismissed` once downvotes reach `dismissal_threshold` (default 5).
- The map is always live: Supabase Realtime streams every `INSERT / UPDATE / DELETE` on `public.incidents` to connected clients.
- Users can opt in to **Web Push notifications** for new incidents inside a geographic radius + severity filter. Delivery is driven by `pg_cron` → `net.http_post` → a single Supabase Edge Function.

### Non-goals for the MVP

- Video uploads, comments, admin moderation panel, user reputation beyond a simple counter, tile prefetch of a chosen area.
- Full offline-first editing. We ship an offline queue for *new* incidents only, plus a cached shell + `/offline` fallback.

---

## 2. Architecture at a glance

```
┌──────────────────────┐        ┌────────────────────────────────┐
│  Next.js (Vercel)    │        │  Supabase                      │
│                      │        │                                │
│  App Router pages ───┼──HTTPS─▶  Auth (GoTrue, custom SMTP)    │
│  Route Handlers ─────┼─────────▶ Postgres + PostGIS            │
│  Client (RSC + CSR)  │        │  Storage (incident-media)      │
│      ▲               │        │  Realtime (postgres_changes)   │
│      │ MapTiler SDK  │        │  Edge Function: push-notify    │
│      ▼               │        │  pg_cron + pg_net (cron tick)  │
│  MapTiler tiles/DEM  │        └────────────────────────────────┘
│                      │
│  Service Worker ─────┼── Web Push ◀── push services (FCM/Mozilla/Apple)
└──────────────────────┘
```

Key points:

- The browser talks to Supabase directly using the **anon** key. Every access is gated by **RLS**.
- The Next.js backend is used for privileged logic (account deletion, ping) and SSR/SEO for public pages.
- Realtime is a first-class citizen: clients subscribe once and the Zustand store mirrors the DB.
- Push delivery is a **pull-from-cron** pipeline: a minute-level `pg_cron` job POSTs to the Edge Function, which picks unread incidents, joins them with matching subscriptions spatially, and dispatches. Triggers were deliberately avoided so incident inserts never block on HTTP.

---

## 3. Repository layout

```
src/
├─ app/                       # Next.js App Router
│  ├─ layout.tsx              # Root HTML shell + SW registrar + offline pill
│  ├─ page.tsx                # Home: floating header + map
│  ├─ globals.css             # BEM component styles + Tailwind layers
│  ├─ manifest.ts             # Web App Manifest (PWA install)
│  ├─ offline/                # Offline fallback route served by the SW
│  ├─ incidents/[id]/         # Deep-link route (OG metadata + panel bootstrap)
│  ├─ auth/                   # Magic-link sign-in page + OAuth callback
│  ├─ api/
│  │  ├─ me/delete/           # GDPR erasure endpoint (service-role)
│  │  └─ ping/                # Edge route used by the offline indicator probe
│  ├─ privacy/ terms/ cookies/
├─ components/
│  ├─ layout/                 # FloatingHeader, UserMenu, LegalNotice, Footer
│  ├─ map/                    # MapView, IncidentMarkers, FilterPanel, empty state
│  ├─ incidents/              # IncidentCard, VoteButtons, IncidentForm,
│  │                          # IncidentDetailsPanel, ReportIncidentButton/Dialog,
│  │                          # IncidentDeepLinkBootstrap
│  ├─ push/                   # NotificationSettings modal (subscribe + preferences)
│  ├─ pwa/                    # RegisterServiceWorker, OfflineIndicator
│  └─ ui/                     # Generic primitives
├─ hooks/
│  ├─ useGeolocation.ts
│  ├─ useRealtimeIncidents.ts
│  └─ useCurrentUser.ts       # Reactive auth state for client components
├─ lib/
│  ├─ supabase/               # client / server / middleware helpers
│  ├─ mapbox/config.ts        # API key, default view, terrain source (MapTiler)
│  ├─ incidents/              # api.ts, mappers.ts, schemas.ts, tile-cache.ts
│  ├─ geo/permissionMessage.ts # Platform-aware permission-denied copy
│  ├─ push/
│  │  ├─ client.ts            # Subscribe/unsubscribe + preferences load
│  │  └─ pickMode.ts          # Pub/sub for "pick center on map" UX
│  ├─ pwa/cacheKey.ts         # URL normalisation used by the SW + unit tests
│  └─ utils/                  # image-compression, offline-queue, geolocation, …
├─ store/useMapStore.ts       # Zustand: incidents Map, selection, filters, report flow
├─ types/incident.ts          # Shared domain types and label maps
└─ middleware.ts              # Refreshes Supabase session cookies
public/
└─ sw.js                      # Service worker (caches + push + notificationclick)
supabase/
├─ migrations/
│  ├─ 00001_initial_schema.sql
│  ├─ 00002_rls_policies.sql
│  ├─ 00003_voting_triggers.sql
│  ├─ 00004_storage.sql
│  ├─ 00005..00019_*.sql      # Reporting, rate limits, EXIF, moderation, …
│  ├─ 00020_push_subscriptions.sql
│  ├─ 00021_push_subscription_upsert_rpc.sql
│  ├─ 00022_get_my_push_preferences.sql
│  ├─ 00023_push_cron_schedule.sql
│  └─ 00024_push_cron_config_table.sql
├─ functions/push-notify/     # Deno Edge Function (Web Push fan-out)
└─ config.toml
scripts/
└─ generate-vapid-keys.ts     # VAPID keypair helper
tests/
└─ e2e/                       # Playwright smoke tests
.github/workflows/ci.yml      # Lint / types / unit / E2E on PR + main
```

### Conventions

- **Language**: all code, comments and docs in English. Product copy is English-only for now.
- **CSS**: BEM naming for component classes (`.block__element--modifier`) on top of Tailwind utilities. Keep one stylesheet per area in `globals.css` for the MVP; split into co-located `.css` files only when it starts to hurt.
- **Imports**: use the `@/` alias (configured in `tsconfig.json`) for everything under `src/`.
- **Server vs client**: prefer Server Components for pages, move to `"use client"` only for interactive UI (map, forms, hooks).
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` and `PUSH_CRON_SECRET` are **server-only**. Never expose any of them to the client bundle (no `NEXT_PUBLIC_` prefix).
- **Types**: after any migration, run `npm run db:types` to regenerate `src/types/database.ts`.
- **Validation**: every payload that crosses a trust boundary (form → RPC, API route, Edge Function input) goes through a Zod schema in `src/lib/incidents/schemas.ts` (or a local one where it makes sense). Infer TS types from there so form input and RPC signature can never drift.
- **Migrations**: append-only. Never edit a migration that has been applied in production; add a new one.

---

## 4. Data model

### Enums

- `incident_type`: `accident`, `trail_blocked`, `detour`, `water_source`, `shelter`, `point_of_interest`, `wildlife`, `weather_hazard`, `other`.
- `severity_level`: `mild`, `moderate`, `severe`.
- `incident_status`: `pending`, `validated`, `resolved`, `dismissed`.

### Tables

| Table                       | Key columns                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `profiles`                  | `id` (FK `auth.users`), `username`, `avatar_url`, `reputation`              |
| `incidents`                 | `id`, `user_id`, `type`, `severity`, `status`, `title`, `description`, `location` (`geography(Point, 4326)`), `elevation_m`, counters, `created_at`, `updated_at`, `expires_at` |
| `incident_media`            | `incident_id`, `storage_path`, `mime_type`, `width`, `height`               |
| `incident_votes`            | PK (`incident_id`, `user_id`), `vote` ∈ {−1, 1}                              |
| `incident_reports`          | Abuse reports raised by users against incidents (moderation)                |
| `push_subscriptions`        | One row per (user, browser/device): endpoint, crypto keys, `center` (`geography`), `radius_km`, `min_severity`, `enabled`, `last_push_at` |
| `push_cron_state`           | Cursor the push cron has advanced to                                        |
| `private.push_cron_config`  | Runtime URL + shared secret the cron reads (service-role only)              |

### Important SQL objects

- `recompute_incident_score(incident_id)` — recalculates counters and transitions `status` based on thresholds.
- Trigger `incident_votes_after_write` — runs the above after every vote insert/update/delete.
- `nearby_incidents(lng, lat, radius_m, types?, min_severity?)` — returns visible incidents inside a radius.
- `create_incident(...)` — inserts an incident from plain `lng/lat`, sets `user_id = auth.uid()`.
- `get_incident_by_id(p_id)` — single incident lookup used by the deep-link route.
- `upsert_push_subscription(endpoint, p256dh, auth, lat, lng, radius_km, min_severity, enabled)` — the only write path the client uses; handles geography conversion.
- `get_my_push_preferences()` — flat read with lat/lng split out (avoids decoding WKB on the client).
- `delete_my_push_subscriptions()` — erase everything this user has subscribed from.
- `pick_new_incidents_for_push()` — cron cursor advancer: returns incident IDs since last scan and bumps the cursor atomically.
- `push_fanout_for_incidents(incident_ids)` — joins incidents with matching subscriptions spatially; returns the rows the Edge Function needs to send push payloads.
- `mark_push_sent(subscription_ids)` / `disable_push_subscription(subscription_id)` — bookkeeping after delivery.
- `pg_cron` job `push-notify-tick` — runs every minute, POSTs to the Edge Function using the config stored in `private.push_cron_config`.

### Row Level Security (summary)

- `profiles`: read-all, write-only-self.
- `incidents`: read visible (`status <> 'dismissed'`); insert as `auth.uid()`; update only own `pending` rows; delete own.
- `incident_media`: read-all; insert/delete must belong to an incident authored by the caller.
- `incident_votes`: read-all; insert/update/delete scoped to the voter; cannot vote on your own incident; cannot vote on `dismissed` rows.
- `incident_reports`: insert-own; read restricted to staff (service role) and the reporter.
- `push_subscriptions`: read/write-own only. Fan-out happens via `SECURITY DEFINER` RPCs called by the Edge Function with the service role.
- `private.push_cron_config`: service role only. `anon` / `authenticated` cannot touch the schema.
- Storage bucket `incident-media`: public read; authenticated write into `<user_id>/...` prefix.

### Tuning thresholds

Thresholds live as Postgres settings so they can be changed without a migration:

```sql
select set_config('montana.validation_threshold', '7', false);
select set_config('montana.dismissal_threshold',  '4', false);
```

To persist across restarts, `ALTER DATABASE postgres SET montana.validation_threshold = '7'` (requires elevated privileges; on hosted Supabase, use the dashboard or the `private` config pattern introduced in `00024` if you run into permission errors).

---

## 5. Client architecture

### State

- `useMapStore` (Zustand): `Map<id, Incident>`, `selectedId`, `filters`, report-flow flags, and mutators.
- Populated by `fetchIncidentsInBbox` on map move and kept in sync by `useRealtimeIncidents`.

### Map rendering

- `MapView` owns the `maptilersdk.Map` instance. Terrain source and DEM are added on `load`.
- `IncidentMarkers` diff-renders one DOM marker per incident, color-coded by severity. Clicking selects the incident in the store, which opens `IncidentDetailsPanel`.
- Two independent "pick a point" flows share the crosshair / banner UX but use separate state: incident report (Zustand) and push-notification center (`src/lib/push/pickMode.ts`).

### Forms

- `IncidentForm` collects input, strips EXIF, compresses photos on the client and calls `createIncident`. If the network is down, the payload goes to `offlineQueue` (localStorage) and is flushed on `online` events via `registerOfflineQueueFlush`.

### Realtime

- Single Supabase channel on the `incidents` table. `useRealtimeIncidents` applies every change to the store so all open tabs converge within sub-second latency.

### PWA / service worker

- `RegisterServiceWorker` registers `/sw.js` only in production; in dev it actively unregisters any leftover SW to keep Next.js HMR sane.
- `public/sw.js` implements:
  - Cache-first for static assets + map tiles (with URL normalisation via `src/lib/pwa/cacheKey.ts` so volatile tokens don't bust the cache).
  - Network-first for navigations with the `/offline` fallback.
  - `push` + `notificationclick` listeners: shows the notification and focuses an existing tab (or opens one) on the incident detail URL.
- `OfflineIndicator` combines `navigator.onLine`, `online`/`offline` events and an active `HEAD /api/ping` probe so the pill correctly reflects connectivity across refreshes and OS-level flakes.

### Push notifications

- `src/lib/push/client.ts` is the only client surface: `subscribe()`, `unsubscribe()`, `loadPreferences()`, `refreshSubscriptionStatus()`.
- `NotificationSettings` modal drives the full flow: permission prompt → `PushSubscription` → `upsert_push_subscription` RPC.
- Center can be set via geolocation *or* by picking a point on the map (`pickMode` module).
- `subscribe()` races `serviceWorker.ready` against a 4-second timeout so the UI fails fast in dev where the SW is intentionally absent.

---

## 6. Mountain-specific considerations

Mountain users have peculiar constraints. Bake these in from day one.

1. **Spotty connectivity**. Treat failed writes as the norm. The offline queue covers incident submissions; the SW caches the shell + tiles; Web Push delivery tolerates retries because cron re-drains every minute.
2. **Slow GPS fixes under tree canopy / valleys**. Always pass `maximumAge: 30000` and show the last known position while waiting for a better fix.
3. **Battery**. Avoid continuous `watchPosition`; use the explicit locate control instead.
4. **Elevation context**. Show `elevation_m` on incident cards and render terrain with `setTerrain({ exaggeration: 1.3 })`.
5. **Map style**. `outdoor-v2` (MapTiler) includes contour lines, hiking trails and natural POIs that match the audience.
6. **Photo weight**. Limit to 3 photos per incident, compress client-side to ≤ 1 MB WebP with `browser-image-compression`.
7. **Accuracy matters more than recency in the field**. Status badges and vote counts must be visible at a glance; severity uses a consistent color scale.
8. **Safety**. Users are in the field; critical flows (report, cancel, vote, open push) must be reachable in ≤ 2 taps.

---

## 7. Phased roadmap

Phases 0–6 are complete and deployed to production. Post-MVP items below are prioritised by "value per engineering hour".

### Phase 0 — Scaffolding ✅

Repository structure, Next.js + TS + Tailwind, Supabase migrations, base components and BEM stylesheet.

### Phase 1 — Auth + incidents read path ✅

- Supabase project + migrations applied.
- Magic-link auth, sign-in page, OAuth callback.
- `nearby_incidents` render around the user's current location.

### Phase 2 — Create incident ✅

- `IncidentForm` wired to `create_incident`.
- Pick location on map or use current GPS.
- Optimistic insert; offline queue on failure.

### Phase 3 — Voting and automatic validation ✅

- `VoteButtons` calling `castVote` / `removeVote`.
- DB trigger flips `status`; markers transition in real time.

### Phase 4 — Photo uploads ✅

- Client-side compression + EXIF stripping, `incident-media` storage, thumbnail grid.

### Phase 5 — Filters and UX polish ✅

- Filter bar, empty states, accessibility pass, OG metadata for shared incidents, floating header.

### Phase 6 — Launch MVP ✅

- Vercel + Supabase production.
- Vercel Analytics.
- Per-user rate limits, EXIF guard, incident reporting flow, privacy/terms/cookies pages, account deletion, Sentry.
- PWA + offline fallback.
- **Web Push for nearby incidents** (VAPID + Edge Function + `pg_cron`).
- Custom SMTP (Resend) to remove Supabase's default email throttling.
- GitHub Actions CI (lint, type-check, unit, E2E). Main is branch-protected.

### Phase 7 — Post-MVP (in progress / candidates)

Prioritise based on real user signal. Current candidates in rough priority order:

1. **Onboarding prompt for alerts** (first-login banner offering to enable push) — biggest activation lift.
2. **Per-user push rate limit** (e.g. ≥ 10 min between pushes to the same endpoint). Filter added to `push_fanout_for_incidents` via `last_push_at`.
3. **Share button** on incident detail (uses `navigator.share` on mobile, clipboard fallback).
4. **Public landing page** for logged-out visitors (currently the map loads for everyone).
5. **i18n** with `next-intl` (ES/EN).
6. **Google OAuth** as a second auth option alongside magic link.
7. **Comments + mentions**, **reputation-weighted votes**, **moderation dashboard** — only once volume justifies them.
8. **Video uploads** via Cloudflare Stream — out of scope until storage becomes a bottleneck.
9. **Migrate tiles** to MapLibre + OpenFreeMap if MapTiler pricing bites.

---

## 8. Testing & quality

- **Type safety**: `npm run type-check` must pass on CI.
- **Lint**: `npm run lint` with `next/core-web-vitals`.
- **Unit / component**: Vitest + Testing Library + jsdom. Run with `npm test` (watch mode via `npm run test:watch`). Current suite covers cache-key normalisation, geolocation permission copy, Zod schemas, offline indicator, push status helpers, and the `pickMode` pub/sub.
- **E2E smokes**: Playwright (`npm run test:e2e`). Covers home-page map render, sign-in consent gate, and legal-page reachability. Runs against `npm run build && npm run start`.
- **CI**: `.github/workflows/ci.yml` runs `quality` (lint + types + unit) and `e2e` (Playwright) on every PR and push to `main`. Main is branch-protected with both checks required.
- **DB tests**: SQL tests using `pgTAP` or plain `psql` scripts in `supabase/tests/` can be added when schema changes get riskier; not wired into CI yet.

---

## 9. Security checklist

- RLS is enabled on every table; add a policy **before** you add the table to the client.
- Service-role key never reaches the browser: `rg SUPABASE_SERVICE_ROLE_KEY src/app src/components` must be empty of client files.
- `VAPID_PRIVATE_KEY` and `PUSH_CRON_SECRET` are **only** in Supabase secrets, never in `.env.local` with `NEXT_PUBLIC_`.
- Validate user-supplied strings both in the DB (`CHECK` constraints) and in the client form.
- Per-user rate-limit on incident creation (enforced in DB).
- EXIF GPS stripped client-side before upload so we don't leak precise device coordinates when the reported point is intentionally fuzzy.
- MapTiler key is public but restricted to allowed HTTP referrers in the MapTiler Cloud dashboard.
- Push endpoints returning 404/410 are auto-disabled by the Edge Function (`disable_push_subscription`) so the subscriptions table can't accumulate dead rows.
- Sentry `beforeSend` strips emails/IPs and the incident geometry before shipping events.
- Account deletion is a single-click flow that cascades through FKs and wipes storage, mediated by `/api/me/delete` running with the service role.

---

## 10. Cost model

Based on April 2026 free tiers. Recompute before launching heavier features.

| Service             | Free tier                                          | Typical MVP usage                 |
| ------------------- | -------------------------------------------------- | --------------------------------- |
| Vercel Hobby        | 100 GB bandwidth / month                           | ~5–10 GB                          |
| Supabase Free       | 500 MB DB, 1 GB storage, 2 GB egress, 50K MAU      | Safe up to ~5–10K MAU             |
| Supabase Functions  | 500K invocations / month                           | 44K invocations (cron runs per month) |
| MapTiler            | 100,000 map loads / month                          | Good for a few thousand WAUs      |
| Resend              | 100 emails / day, 3,000 / month                    | Safe until ~3K sign-ins / month   |
| Domain              | ~$10 / year                                        | Optional                          |

Scale triggers to watch:

- DB size > 400 MB → upgrade to Supabase Pro ($25 / mo) or archive `dismissed` rows.
- Map loads approaching 90K → add client-side caching or move to MapLibre + OpenFreeMap.
- Storage approaching 900 MB → migrate media to Cloudflare R2.
- Cron invocations approaching 500K → drop the cron cadence from 1 min to 2–5 min, or coalesce pushes.

---

## 11. Working with AI assistants

This repo is optimised for pair-programming with tools like Cursor.

- Keep modules small and single-purpose; AI edits are safer on files < 300 lines.
- Co-locate types with the feature (`src/types/incident.ts`, `src/lib/incidents/...`).
- Migrations are numbered and append-only. Never edit a migration that has been applied in production; add a new one.
- When you change the DB schema: update the migration, regenerate `src/types/database.ts`, update `src/types/incident.ts`, update this guide.
- Prefer Server Actions or RPCs over raw SQL in the client so that the AI has a clear API surface to target.
- Add a test alongside any non-trivial new pure function; the unit layer is cheap and the suite runs in <3 s.

---

## 12. Glossary

- **RLS** — Row Level Security. Postgres feature that restricts rows a role can read/write.
- **RPC** — Remote Procedure Call. A Postgres function exposed via Supabase's REST/RT layer.
- **DEM** — Digital Elevation Model. Raster of per-pixel elevation used to render 3D terrain (MapTiler terrain-rgb-v2).
- **PostGIS** — Geospatial extension for Postgres. Provides the `geography` type and functions like `ST_DWithin`.
- **Magic link** — Passwordless email login flow used by Supabase Auth.
- **VAPID** — Voluntary Application Server Identification. The auth scheme Web Push uses; a keypair proves the origin of each push to the push service.
- **`pg_cron` / `pg_net`** — Postgres extensions used together to schedule jobs and make outbound HTTP calls from SQL.
- **SECURITY DEFINER** — Postgres function attribute that runs with the owner's privileges, bypassing the caller's RLS. Used for trusted helper RPCs.
