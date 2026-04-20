-- ============================================================================
-- Montana · Initial schema
-- Enables PostGIS and creates the core domain tables, enums and indexes.
-- ============================================================================

create extension if not exists "postgis";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type incident_type as enum (
  'accident',
  'trail_blocked',
  'detour',
  'water_source',
  'shelter',
  'point_of_interest',
  'wildlife',
  'weather_hazard',
  'other'
);

create type severity_level as enum ('mild', 'moderate', 'severe');

create type incident_status as enum (
  'pending',    -- just created, awaiting community validation
  'validated',  -- reached positive vote threshold
  'resolved',   -- reported as no longer present by the community
  'dismissed'   -- reached negative vote threshold; hidden from map
);

-- ----------------------------------------------------------------------------
-- Profiles (extends auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  reputation integer not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Incidents
-- ----------------------------------------------------------------------------
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type incident_type not null,
  severity severity_level not null default 'moderate',
  status incident_status not null default 'pending',
  title text not null check (char_length(title) between 3 and 120),
  description text check (char_length(description) <= 2000),
  location geography(Point, 4326) not null,
  elevation_m numeric(6, 1),
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create index incidents_location_gix on public.incidents using gist (location);
create index incidents_status_idx on public.incidents (status);
create index incidents_type_idx on public.incidents (type);
create index incidents_created_at_idx on public.incidents (created_at desc);

-- ----------------------------------------------------------------------------
-- Media attached to an incident
-- ----------------------------------------------------------------------------
create table public.incident_media (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create index incident_media_incident_idx on public.incident_media (incident_id);

-- ----------------------------------------------------------------------------
-- Votes (one per user per incident)
-- ----------------------------------------------------------------------------
create table public.incident_votes (
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (incident_id, user_id)
);

create index incident_votes_user_idx on public.incident_votes (user_id);

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger incidents_set_updated_at
before update on public.incidents
for each row execute function public.set_updated_at();
