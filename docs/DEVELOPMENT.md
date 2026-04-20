# Montana — Development Guide

This document is the single source of truth for architecture, conventions, data model and the phased roadmap. It is meant to be read both by humans and by coding assistants working on the repository; keep it accurate and up to date when you change the system.

> TL;DR: **Next.js + Supabase (Postgres + PostGIS) + MapTiler**. Everything is free-tier friendly. No custom backend: RLS policies and Postgres triggers encode the business rules.

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

### Non-goals for the MVP

- Video uploads, comments, push notifications, admin moderation panel, user reputation beyond a simple counter.
- Fully offline-first PWA. We ship a minimal offline queue for incident submissions only.

---

## 2. Architecture at a glance

```
┌──────────────────────┐        ┌────────────────────────────────┐
│  Next.js (Vercel)    │        │  Supabase                      │
│                      │        │                                │
│  App Router pages ───┼──HTTPS─▶  Auth (GoTrue)                 │
│  Server Actions ─────┼─────────▶ Postgres + PostGIS            │
│  Route Handlers ─────┼─────────▶ Storage (incident-media)      │
│  Client (RSC + CSR)  │        │  Realtime (postgres_changes)   │
│      ▲               │        └────────────────────────────────┘
│      │ MapTiler SDK  │
│      ▼               │
│  MapTiler tiles/DEM  │
└──────────────────────┘
```

Key points:

- The browser talks to Supabase directly using the **anon** key. Every access is gated by **RLS**.
- The Next.js backend is only used when we need privileged logic (e.g. moderation endpoints later) or SSR/SEO for public pages.
- Realtime is a first-class citizen: clients subscribe once and the Zustand store mirrors the DB.

---

## 3. Repository layout

```
src/
├─ app/                       # Next.js App Router
│  ├─ layout.tsx              # Root HTML shell
│  ├─ page.tsx                # Home: header + map
│  ├─ globals.css             # BEM component styles + Tailwind layers
│  └─ auth/                   # Magic-link sign-in page + OAuth callback
├─ components/
│  ├─ layout/                 # SiteHeader, SignOutButton
│  ├─ map/                    # MapView, IncidentMarkers, FilterPanel
│  ├─ incidents/              # IncidentCard, VoteButtons, IncidentForm,
│  │                          # IncidentDetailsPanel, ReportIncidentButton/Dialog
│  └─ ui/                     # Generic primitives (add as needed)
├─ hooks/
│  ├─ useGeolocation.ts
│  ├─ useRealtimeIncidents.ts
│  └─ useCurrentUser.ts       # Reactive auth state for client components
├─ lib/
│  ├─ supabase/               # client / server / middleware helpers
│  ├─ mapbox/config.ts        # API key, default view, terrain source (MapTiler)
│  ├─ incidents/
│  │  ├─ api.ts               # createIncident, fetchIncidentsInBbox, cast/removeVote…
│  │  ├─ mappers.ts           # DB row ↔ Incident DTO (handles WKB hex)
│  │  ├─ schemas.ts           # Zod schemas + inferred types (single source of truth)
│  │  └─ tile-cache.ts        # Slippy-tile helpers for bbox dedup
│  └─ utils/
│     ├─ geolocation.ts
│     ├─ image-compression.ts
│     └─ offline-queue.ts
├─ store/useMapStore.ts       # Zustand: incidents Map, selection, filters, report flow
├─ types/incident.ts          # Shared domain types and label maps
└─ middleware.ts              # Refreshes Supabase session cookies
supabase/
├─ migrations/
│  ├─ 00001_initial_schema.sql
│  ├─ 00002_rls_policies.sql
│  ├─ 00003_voting_triggers.sql
│  └─ 00004_storage.sql
└─ config.toml
```

### Conventions

- **Language**: all code, comments and docs in English.
- **CSS**: BEM naming for component classes (`.block__element--modifier`) on top of Tailwind utilities. Keep one stylesheet per area in `globals.css` for the MVP; split into co-located `.css` files only when it starts to hurt.
- **Imports**: use the `@/` alias (configured in `tsconfig.json`) for everything under `src/`.
- **Server vs client**: prefer Server Components for pages, move to `"use client"` only for interactive UI (map, forms, hooks).
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. Never import it from a client component.
- **Types**: after any migration, run `npm run db:types` to regenerate `src/types/database.ts` (not checked in until first migration is applied; safe to regenerate).
- **Validation**: every payload that crosses a trust boundary (form → RPC, future HTTP handler) goes through a Zod schema in `src/lib/incidents/schemas.ts`. Infer TS types from there instead of writing them by hand so form input and RPC signature can never drift.

---

## 4. Data model

### Enums

- `incident_type`: `accident`, `trail_blocked`, `detour`, `water_source`, `shelter`, `point_of_interest`, `wildlife`, `weather_hazard`, `other`.
- `severity_level`: `mild`, `moderate`, `severe`.
- `incident_status`: `pending`, `validated`, `resolved`, `dismissed`.

### Tables

| Table              | Key columns                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `profiles`         | `id` (FK `auth.users`), `username`, `avatar_url`, `reputation`              |
| `incidents`        | `id`, `user_id`, `type`, `severity`, `status`, `title`, `description`, `location` (`geography(Point, 4326)`), `elevation_m`, counters, `created_at`, `updated_at`, `expires_at` |
| `incident_media`   | `incident_id`, `storage_path`, `mime_type`, `width`, `height`               |
| `incident_votes`   | PK (`incident_id`, `user_id`), `vote` ∈ {−1, 1}                              |

### Important SQL objects

- `recompute_incident_score(incident_id)` — recalculates counters and transitions `status` based on thresholds.
- Trigger `incident_votes_after_write` — runs the above after every vote insert/update/delete.
- `nearby_incidents(lng, lat, radius_m, types?, min_severity?)` — returns visible incidents inside a radius; use this instead of writing PostGIS queries in the client.
- `create_incident(...)` — inserts an incident from plain `lng/lat`, sets `user_id = auth.uid()`.

### Row Level Security (summary)

- `profiles`: read-all, write-only-self.
- `incidents`: read visible (`status <> 'dismissed'`); insert as `auth.uid()`; update only own `pending` rows; delete own.
- `incident_media`: read-all; insert/delete must belong to an incident authored by the caller.
- `incident_votes`: read-all; insert/update/delete scoped to the voter; cannot vote on your own incident; cannot vote on `dismissed` rows.
- Storage bucket `incident-media`: public read; authenticated write into `<user_id>/...` prefix.

### Tuning thresholds

Thresholds live as Postgres settings so they can be changed without a migration:

```sql
select set_config('montana.validation_threshold', '7', false);
select set_config('montana.dismissal_threshold',  '4', false);
```

To persist across restarts, `ALTER DATABASE postgres SET montana.validation_threshold = '7'`.

---

## 5. Client architecture

### State

- `useMapStore` (Zustand): `Map<id, Incident>`, `selectedId`, `filters`, and mutators.
- Populated by `fetchNearbyIncidents` on load and kept in sync by `useRealtimeIncidents`.

### Map rendering

- `MapView` owns the `maptilersdk.Map` instance. Terrain source and DEM are added on `load`.
- `IncidentMarkers` diff-renders one DOM marker per incident, color-coded by severity. Clicking selects the incident in the store, which opens `IncidentDetailsPanel`.

### Forms

- `IncidentForm` collects input, compresses photos on the client and calls `createIncident`. If the network is down, the payload goes to `offlineQueue` (localStorage) and is flushed on `online` events via `registerOfflineQueueFlush`.

### Realtime

- Single Supabase channel on the `incidents` table. `useRealtimeIncidents` applies every change to the store so all open tabs converge within sub-second latency.

---

## 6. Mountain-specific considerations

Mountain users have peculiar constraints. Bake these in from day one.

1. **Spotty connectivity**. Treat failed writes as the norm. The offline queue covers incident submissions; for reads we rely on cached tiles (MapTiler SDK handles this with its own cache).
2. **Slow GPS fixes under tree canopy / valleys**. Always pass `maximumAge: 30000` and show the last known position while waiting for a better fix.
3. **Battery**. Avoid continuous `watchPosition`; use `GeolocateControl` which the user opts into explicitly.
4. **Elevation context**. Show `elevation_m` on incident cards and render terrain with `setTerrain({ exaggeration: 1.3 })` so users can interpret vertical relief at a glance.
5. **Map style**. `outdoor-v2` (MapTiler) includes contour lines, hiking trails and natural POIs that match the audience.
6. **Photo weight**. Limit to 3 photos per incident, compress client-side to ≤ 1 MB WebP with `browser-image-compression`. This keeps storage and bandwidth small enough for the free tier even at thousands of reports.
7. **Accuracy matters more than recency in the field**. Status badges and vote counts must be visible at a glance; we render severity with a consistent color scale (yellow / orange / red).
8. **Safety**. Users are in the field; keep critical flows reachable in ≤ 2 taps (report, cancel, vote).

---

## 7. Phased roadmap

Each phase is a working slice of product. Do not move to the next phase until the current one is deployed and tested.

### Phase 0 — Scaffolding (done)

Repository structure, Next.js + TS + Tailwind, Supabase migrations, base components and BEM stylesheet.

**Exit criteria**: `npm run dev` shows the header and an empty MapTiler map.

### Phase 1 — Auth + incidents read path

- Set up a Supabase project and apply migrations (`supabase db push`).
- Wire Supabase Auth (email magic link first, Google OAuth second).
- Build a trivial sign-in page under `app/auth/sign-in/page.tsx`.
- Seed a handful of incidents via SQL so the map has something to show.
- Load and render `nearby_incidents` around the user's current location.

**Exit criteria**: anonymous users can see pre-seeded markers on the map.

### Phase 2 — Create incident

- `IncidentForm` wired to `create_incident` RPC.
- Long-press / "+" button on the map to pick a location (or use current GPS).
- Optimistic insert into the Zustand store.
- Offline queue integration (already scaffolded).

**Exit criteria**: signed-in users can add incidents and see them on every open tab in real time.

### Phase 3 — Voting and automatic validation

- `VoteButtons` calling `castVote` / `removeVote`.
- Trigger already recomputes counters and flips `status`; verify end-to-end.
- Show transition animations on the marker when it becomes `validated` or gets `dismissed`.
- Enforce "no self-vote" in the UI in addition to RLS.

**Exit criteria**: an incident with ≥ 5 upvotes flips to `validated`; ≥ 5 downvotes removes it from the map within a second on all clients.

### Phase 4 — Photo uploads

- Add upload helper: compress → `supabase.storage.from('incident-media').upload('<user>/<incident>/<uuid>.webp', file)`.
- Persist rows in `incident_media` after upload finishes.
- Render a thumbnail grid in `IncidentCard`.
- Enforce MAX_PHOTOS and MIME allowlist on the client; storage RLS enforces the write prefix.

**Exit criteria**: incidents can carry up to 3 photos and render them without blowing the 1 GB storage budget.

### Phase 5 — Filters and UX polish

- Filter bar (type, severity, only validated) plugged into the store.
- Empty states, loading skeletons, accessibility pass (keyboard nav, ARIA labels).
- Metadata / Open Graph images for shared incident URLs.

**Exit criteria**: usable on a phone screen with one hand.

### Phase 6 — Launch MVP

- Deploy to Vercel + Supabase production.
- Analytics (Vercel Analytics or Plausible — both free tiers).
- Basic abuse guardrails: per-user incident-per-hour limit via a Postgres function, Turnstile on sign-up.
- Privacy page, Terms page, feedback email.

**Exit criteria**: public URL, first real users, zero custom servers to maintain.

### Phase 7 — Post-MVP (data-driven)

Only start once Phase 6 has a few hundred real incidents. Candidates:

- PWA with tile prefetch for a user-selected area.
- Comments and @mentions.
- Push notifications for nearby validated incidents.
- Reputation score and trust-weighted votes.
- Moderation dashboard and reporting.
- Video uploads via Cloudflare Stream.
- Migrate tiles to MapLibre + OpenFreeMap if MapTiler pricing bites.

---

## 8. Testing & quality

For the MVP we favour a few high-value checks over exhaustive coverage.

- **Type safety**: `npm run type-check` must pass on CI.
- **Lint**: `npm run lint` with `next/core-web-vitals`.
- **DB tests**: SQL tests using `pgTAP` or plain `psql` scripts in `supabase/tests/` that exercise trigger transitions. Run them with `supabase db test`.
- **E2E**: Playwright, only for the critical path (sign-in → report → vote).
- **Manual QA checklist** lives in `docs/QA.md` (create when needed).

---

## 9. Security checklist

- RLS is enabled on every table; add a policy **before** you add the table to the client.
- Never ship the service-role key to the browser. Audit with `rg SUPABASE_SERVICE_ROLE_KEY src/app src/components`.
- Validate user-supplied strings both in the DB (`CHECK` constraints) and in the client form.
- Rate-limit incident creation per user (Phase 6).
- Strip EXIF GPS data on upload if it is more accurate than the reported location and the user did not intend to share it (consider in Phase 4).
- MapTiler key is public but restrict it to allowed HTTP referrers in the MapTiler Cloud dashboard.

---

## 10. Cost model

Based on Nov 2025 free tiers. Recompute before you launch.

| Service             | Free tier                         | Typical MVP usage       |
| ------------------- | --------------------------------- | ----------------------- |
| Vercel Hobby        | 100 GB bandwidth / month          | ~5–10 GB                |
| Supabase Free       | 500 MB DB, 1 GB storage, 2 GB egress, 50K MAU | Safe up to ~5–10K MAU with compressed images |
| MapTiler            | 100,000 map loads / month         | Good for a few thousand weekly actives |
| Domain              | ~$10 / year                       | Optional                |

Scale triggers to watch:

- DB size > 400 MB → upgrade to Supabase Pro ($25 / mo) or archive `dismissed` rows.
- Map loads approaching 90K → add client-side caching or move to MapLibre + OpenFreeMap.
- Storage approaching 900 MB → migrate media to Cloudflare R2 (generous free tier, S3-compatible).

---

## 11. Working with AI assistants

This repo is optimised for pair-programming with tools like Cursor.

- Keep modules small and single-purpose; AI edits are safer on files < 300 lines.
- Co-locate types with the feature (`src/types/incident.ts`, `src/lib/incidents/...`).
- Migrations are numbered and append-only. Never edit a migration that has been applied in production; add a new one.
- When you change the DB schema: update the migration, regenerate `src/types/database.ts`, update `src/types/incident.ts`, update this guide.
- Prefer Server Actions or RPCs over raw SQL in the client so that the AI has a clear API surface to target.

---

## 12. Glossary

- **RLS** — Row Level Security. Postgres feature that restricts rows a role can read/write.
- **RPC** — Remote Procedure Call. A Postgres function exposed via Supabase's REST/RT layer.
- **DEM** — Digital Elevation Model. Raster of per-pixel elevation used to render 3D terrain (MapTiler terrain-rgb-v2).
- **PostGIS** — Geospatial extension for Postgres. Provides the `geography` type and functions like `ST_DWithin`.
- **Magic link** — Passwordless email login flow used by Supabase Auth.
