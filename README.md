# Montana

Real-time, crowd-validated map of incidents and points of interest for people in the mountains.

Montana lets hikers, trail runners and climbers report hazards (blocked trails, fallen trees, accidents, weather events) and useful waypoints (water sources, shelters, viewpoints) on a live map. Other users validate or dismiss reports through up/down votes, so the map self-moderates: incidents with enough positive votes become *validated*, and those with enough negative votes are automatically hidden.

> Status: early MVP. See [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for the full technical guide and phased roadmap.

---

## Features

- Interactive terrain map with 3D elevation (Mapbox Outdoors + terrain DEM).
- Report incidents with type, severity, title, description and photos.
- Up / down voting with automatic status transitions driven by database triggers.
- Real-time updates via Supabase Realtime — markers move/appear/disappear live.
- Geospatial queries powered by PostGIS (`ST_DWithin`, `nearby_incidents` RPC).
- Mountain-friendly UX: cached geolocation, offline submission queue, compressed photo uploads.
- Row Level Security end-to-end; no custom backend to maintain.

## Tech stack

| Layer       | Choice                                    |
| ----------- | ----------------------------------------- |
| Framework   | Next.js 14 (App Router) + TypeScript      |
| Map         | Mapbox GL JS + Mapbox Terrain DEM         |
| Database    | PostgreSQL + PostGIS (Supabase)           |
| Auth        | Supabase Auth (OAuth / magic link)        |
| Storage     | Supabase Storage (incident media)         |
| Real-time   | Supabase Realtime (postgres_changes)      |
| State       | Zustand                                   |
| Styling     | Tailwind + BEM component classes          |
| Hosting     | Vercel (app) + Supabase (data / auth)     |

Everything fits inside the free tiers for the MVP. See the development guide for the scaling path.

## Getting started

### 1. Prerequisites

- Node.js ≥ 20
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (`npm i -g supabase`)
- A Mapbox account (free) for an access token
- Docker (only if you want to run Supabase locally)

### 2. Clone and install

```bash
git clone https://github.com/<you>/montana.git
cd montana
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to the client.
- `NEXT_PUBLIC_MAPBOX_TOKEN` — public token from [Mapbox account](https://account.mapbox.com/access-tokens/).

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

The migrations under `supabase/migrations/` create the PostGIS schema, RLS policies, voting triggers and the storage bucket for incident media.

### 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

## Project structure

```
montana/
├─ src/
│  ├─ app/                 # Next.js App Router (layout, pages, route handlers)
│  ├─ components/          # UI split by feature
│  │  ├─ layout/
│  │  ├─ map/
│  │  ├─ incidents/
│  │  └─ ui/
│  ├─ hooks/               # Reusable client hooks (geolocation, realtime, ...)
│  ├─ lib/
│  │  ├─ supabase/         # Browser, server and middleware clients
│  │  ├─ mapbox/           # Map configuration and constants
│  │  ├─ incidents/        # Data access (`api.ts`) and row ↔ DTO mappers
│  │  └─ utils/            # Image compression, offline queue, geolocation
│  ├─ store/               # Zustand stores
│  ├─ types/               # Shared TS types
│  └─ middleware.ts        # Supabase session refresh on every request
├─ supabase/
│  ├─ migrations/          # SQL migrations (schema, RLS, triggers, storage)
│  └─ config.toml          # Local CLI project config
├─ docs/
│  └─ DEVELOPMENT.md       # Full technical spec + phased roadmap
└─ ...
```

## Scripts

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Start Next.js dev server                        |
| `npm run build`    | Production build                                |
| `npm run start`    | Run the production build                        |
| `npm run lint`     | ESLint                                          |
| `npm run format`   | Prettier                                        |
| `npm run type-check` | `tsc --noEmit`                                 |
| `npm run db:push`  | Apply pending migrations to the linked project  |
| `npm run db:reset` | Reset local DB and re-run migrations            |
| `npm run db:types` | Regenerate TS types from the local DB schema    |

## Deployment

- **App**: push to GitHub, import into Vercel, add environment variables, deploy.
- **Database / auth / storage**: Supabase hosted project.
- **Media**: the `incident-media` bucket is public-read but write-restricted via RLS to the authenticated author.

## Contributing

Issues and pull requests are welcome. Before opening a PR please read the development guide and keep your changes consistent with the conventions there (BEM for CSS, English code & comments, feature-scoped folders).

## License

MIT
