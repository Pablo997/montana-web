# Montana

Real-time, crowd-validated map of incidents and points of interest for people in the mountains.

Montana lets hikers, trail runners and climbers report hazards (blocked trails, fallen trees, accidents, weather events) and useful waypoints (water sources, shelters, viewpoints) on a live map. Other users validate or dismiss reports through up/down votes, so the map self-moderates: incidents with enough positive votes become *validated*, and those with enough negative votes are automatically hidden. When a new incident lands inside a user's area of interest, they receive a Web Push notification.

> Status: launched MVP. See [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for the full technical guide.

---

## Features

- Interactive 3D terrain map (MapTiler Outdoor + terrain DEM).
- Report incidents with type, severity, title, description and up to 3 compressed photos.
- Up / down voting with automatic status transitions driven by database triggers.
- Real-time updates via Supabase Realtime — markers move/appear/disappear live.
- Geospatial queries powered by PostGIS (`ST_DWithin`, `nearby_incidents` RPC).
- **Web Push notifications** for new incidents inside a user-defined radius and severity threshold. Center can be picked on the map.
- **Installable PWA** with offline-friendly shell and a dedicated `/offline` fallback.
- Mountain-friendly UX: cached geolocation, offline submission queue, compressed photo uploads, client-side EXIF stripping.
- Row Level Security end-to-end; privileged tasks run inside SECURITY DEFINER RPCs or Edge Functions.
- Abuse guardrails: rate-limited writes, EXIF stripping, per-user incident creation cap.
- Observability via Sentry with PII scrubbing.

## Tech stack

| Layer        | Choice                                                |
| ------------ | ----------------------------------------------------- |
| Framework    | Next.js 14 (App Router) + TypeScript                  |
| Map          | MapTiler SDK + MapTiler Terrain DEM                   |
| Database     | PostgreSQL + PostGIS (Supabase)                       |
| Auth         | Supabase Auth (magic link; Google OAuth optional)     |
| Email (SMTP) | Resend via Supabase Auth custom SMTP                  |
| Storage      | Supabase Storage (incident media)                     |
| Real-time    | Supabase Realtime (postgres_changes)                  |
| Push         | Web Push (VAPID) + Supabase Edge Function + `pg_cron` |
| PWA / SW     | Custom `public/sw.js` (cache-first + offline fallback)|
| State        | Zustand                                               |
| Styling      | Tailwind + BEM component classes                      |
| Monitoring   | `@sentry/nextjs`                                      |
| Tests        | Vitest (unit/component) + Playwright (E2E smokes)     |
| CI           | GitHub Actions (lint, type-check, unit, E2E)          |
| Hosting      | Vercel (app) + Supabase (data / auth / functions)     |

Everything fits inside the free tiers for the MVP. See the development guide for the scaling path.

## Getting started

### 1. Prerequisites

- Node.js ≥ 20
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (`npm i -g supabase`)
- A MapTiler account (free, no credit card) for an API key
- Docker (only if you want to run Supabase locally)

### 2. Clone and install

```bash
git clone https://github.com/Pablo997/montana-web.git
cd montana-web
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to the client.
- `NEXT_PUBLIC_MAPTILER_KEY` — API key from [MapTiler Cloud](https://cloud.maptiler.com/account/keys/).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — public VAPID key for Web Push. Generate with `npm run vapid:generate`; keep the private key out of the browser bundle.

Optional:

- `NEXT_PUBLIC_SITE_URL` — canonical site URL used by `<metadataBase>`, OG tags, `robots.txt`, `sitemap.xml` and JSON-LD. Set it to your production domain (e.g. `https://montana.app`). Falls back to `https://$VERCEL_URL` on preview deploys and `http://localhost:3000` in dev, but those fallbacks shouldn't reach production — set it explicitly.
- `NEXT_PUBLIC_SENTRY_DSN` — enables error reporting. Leave empty in dev.
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — required only on the build host (CI / Vercel) if you want uploaded source maps so stack traces point at original TS lines. Without them builds still succeed, they just ship minified frames to Sentry.
- `SENTRY_RELEASE` — overrides the auto-detected release name. Defaults to `VERCEL_GIT_COMMIT_SHA` when absent. Same value is reflected by `/api/health` so you can tell which deploy a probe hit.
- `NEXT_PUBLIC_VALIDATION_THRESHOLD`, `NEXT_PUBLIC_DISMISSAL_THRESHOLD` — UI overrides of the DB defaults (5 / 5).

### 4. Set up the database

Using Supabase Cloud:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or locally:

```bash
supabase start
supabase db reset
```

The migrations under `supabase/migrations/` create the PostGIS schema, RLS policies, voting triggers, storage bucket, push subscriptions, and the cron job that drives Web Push delivery.

### 5. Set up Web Push (production only)

1. Generate a VAPID keypair and put the public key in `.env.local`:

   ```bash
   npm run vapid:generate
   ```

2. Deploy the Edge Function:

   ```bash
   npx supabase functions deploy push-notify --no-verify-jwt
   ```

3. Set the function secrets:

   ```bash
   npx supabase secrets set \
     VAPID_PUBLIC_KEY="..." \
     VAPID_PRIVATE_KEY="..." \
     VAPID_SUBJECT="mailto:you@example.com" \
     PUSH_CRON_SECRET="$(openssl rand -hex 32)"
   ```

4. In the Supabase SQL Editor, seed the cron config table so `pg_cron` knows where to POST:

   ```sql
   insert into private.push_cron_config (id, notify_url, cron_secret)
   values (
     1,
     'https://<your-project-ref>.supabase.co/functions/v1/push-notify',
     '<same PUSH_CRON_SECRET as above>'
   )
   on conflict (id) do update set
     notify_url = excluded.notify_url,
     cron_secret = excluded.cron_secret,
     updated_at = now();
   ```

5. Configure custom SMTP (Resend is cheapest free option) in Supabase → Auth → SMTP Settings so the default 3-per-hour email limit doesn't throttle sign-ins.

### 6. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

> Push notifications and the service worker are **disabled in dev** on purpose (they fight Next.js HMR). Test push with `npm run build && npm run start` or on a preview deployment.

## Project structure

```
montana/
├─ src/
│  ├─ app/                  # Next.js App Router (layout, pages, route handlers)
│  ├─ components/           # UI split by feature
│  │  ├─ layout/            # FloatingHeader, UserMenu, footer, consent
│  │  ├─ map/               # MapView, IncidentMarkers, FilterPanel, …
│  │  ├─ incidents/         # IncidentForm, IncidentDetailsPanel, VoteButtons, …
│  │  ├─ push/              # NotificationSettings modal (push subscription UI)
│  │  └─ pwa/               # RegisterServiceWorker, OfflineIndicator
│  ├─ hooks/                # Reusable client hooks
│  ├─ lib/
│  │  ├─ supabase/          # Browser, server and middleware clients
│  │  ├─ mapbox/            # Map configuration and constants (MapTiler)
│  │  ├─ incidents/         # Data access, mappers, Zod schemas, tile cache
│  │  ├─ geo/               # Platform detection + geolocation permission messages
│  │  ├─ push/              # Client subscribe/unsubscribe, pick-on-map channel
│  │  └─ utils/             # Image compression, offline queue, geolocation, …
│  ├─ store/                # Zustand stores
│  ├─ types/                # Shared TS types
│  └─ middleware.ts         # Supabase session refresh on every request
├─ public/
│  └─ sw.js                 # Service worker (cache strategies + push listeners)
├─ supabase/
│  ├─ migrations/           # SQL migrations (schema, RLS, triggers, push, cron, …)
│  └─ functions/
│     └─ push-notify/       # Edge Function that fans out Web Push
├─ scripts/
│  └─ generate-vapid-keys.ts
├─ tests/
│  └─ e2e/                  # Playwright smoke tests
├─ docs/
│  └─ DEVELOPMENT.md        # Full technical spec
└─ .github/workflows/ci.yml # GitHub Actions (lint, types, unit, E2E)
```

## Scripts

| Command                | What it does                                          |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Start Next.js dev server (no service worker)          |
| `npm run build`        | Production build                                      |
| `npm run start`        | Run the production build                              |
| `npm run lint`         | ESLint                                                |
| `npm run format`       | Prettier                                              |
| `npm run type-check`   | `tsc --noEmit`                                        |
| `npm test`             | Vitest unit/component tests                           |
| `npm run test:watch`   | Vitest watch mode                                     |
| `npm run test:ui`      | Vitest UI                                             |
| `npm run test:e2e`     | Playwright smoke tests (requires `npm run build`)     |
| `npm run test:e2e:ui`  | Playwright UI mode                                    |
| `npm run db:push`      | Apply pending migrations to the linked project        |
| `npm run db:reset`     | Reset local DB and re-run migrations                  |
| `npm run db:types`     | Regenerate TS types from the local DB schema          |
| `npm run vapid:generate` | Generate a VAPID keypair for Web Push                |

## Deployment

- **App**: push to GitHub, import into Vercel, add environment variables, deploy. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must be present on Production **and** Preview so push works on preview deployments.
- **Database / auth / storage**: Supabase hosted project. Apply migrations with `supabase db push` from your local clone.
- **Edge Function**: `supabase functions deploy push-notify --no-verify-jwt` (auth is handled by the `PUSH_CRON_SECRET` bearer).
- **Cron**: `pg_cron` job created by the migrations runs every minute and pulls its target URL + secret from `private.push_cron_config`.
- **Media**: the `incident-media` bucket is public-read but write-restricted via RLS to the authenticated author.

## Observability

- **Error reporting**: `@sentry/nextjs` is wired on client, server and edge runtimes. PII is scrubbed (`sendDefaultPii: false`, `beforeSend` strips IP, headers, geo). The current user's id is attached as anonymous user context via `useCurrentUser` so Sentry can dedup issues per user without storing email / username.
- **Server-side helpers**: reach for `captureServerError(err, { tag, extras })` from `src/lib/observability/sentry.ts` in API routes and server actions instead of `console.error`. It never throws and tags events so Issues can be filtered by `op:admin.banUser`, `op:api.me.delete`, etc. Admin server actions already route infrastructure failures through it while keeping domain errors (`NOT_ADMIN`, `CANNOT_BAN_SELF`, ...) silent.
- **Release tracking**: on Vercel, `VERCEL_GIT_COMMIT_SHA` is auto-picked up and tagged on every event + upload target for source maps. Set `SENTRY_RELEASE` manually for non-Vercel hosts. Source map uploads require `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` during `next build`.
- **Uptime probe**: `GET /api/health` round-trips a cheap RPC (`health_ping()`) so external monitors (BetterUptime, Uptime Kuma, Pingdom) get a 200 only when Next.js *and* Supabase are both reachable. `/api/ping` stays as a pure Next.js-only probe used by the offline indicator.

## SEO

- **`robots.txt`** and **`sitemap.xml`** are generated dynamically by `app/robots.ts` and `app/sitemap.ts`. The sitemap exposes the home page, legal pages, and every incident whose status is `pending`, `validated` or `resolved`. Dismissed and expired incidents are excluded so moderated content never ends up in search results. The sitemap is cached for an hour via `export const revalidate = 3600`.
- **Canonical URLs + metadataBase**: `NEXT_PUBLIC_SITE_URL` drives the canonical and absolute OG URLs. Per-page metadata (e.g. `/me`, `/admin/*`, `/auth/*`) opts out of indexing via `robots: { index: false }`.
- **Open Graph image**: `app/opengraph-image.tsx` renders the default 1200×630 card at the edge using `next/og`. Per-incident pages fall back to the first attached photo.
- **Structured data**: each incident page embeds a JSON-LD `Event` (`schema.org`) with coordinates, elevation, status and photos so search engines can render a rich card. The helper (`src/lib/seo/jsonld.ts`) escapes any `</script>` sequence in user-supplied fields before injection.

## Contributing

Main is protected: all changes go through a pull request, and CI (lint, type-check, unit tests, Playwright smokes) must be green before merge. Before opening a PR please read the development guide and keep your changes consistent with the conventions there (BEM for CSS, English code & comments, feature-scoped folders).

## License

MIT
