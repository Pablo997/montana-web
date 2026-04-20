-- ----------------------------------------------------------------------------
-- Denormalised media counter on `incidents`.
--
-- The details panel needs to know "does this incident have photos?" before
-- deciding whether to mount the gallery, otherwise every selection causes
-- a skeleton flash for the majority of incidents that have no attachments.
--
-- We keep it as a real column (instead of computing it in each RPC as a
-- subquery) so that:
--   1. Supabase Realtime fires an `UPDATE` on `incidents` when the count
--      changes, letting every connected client re-render without an
--      explicit refetch.
--   2. The two existing read RPCs don't have to scan `incident_media`
--      per row.
--
-- A trigger on `incident_media` keeps the counter in sync on INSERT /
-- DELETE. It's marked SECURITY DEFINER so it can update counters across
-- RLS boundaries (same rationale as the vote aggregation trigger in
-- `00008_voting_security_definer.sql`).
-- ----------------------------------------------------------------------------

alter table public.incidents
  add column if not exists media_count integer not null default 0;

-- Backfill: match the denormalised counter with reality for rows that
-- existed before this migration was applied.
update public.incidents i
set media_count = sub.c
from (
  select incident_id, count(*)::integer as c
  from public.incident_media
  group by incident_id
) sub
where sub.incident_id = i.id
  and i.media_count is distinct from sub.c;

create or replace function public.on_incident_media_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.incidents
      set media_count = media_count + 1,
          updated_at = now()
      where id = new.incident_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.incidents
      set media_count = greatest(0, media_count - 1),
          updated_at = now()
      where id = old.incident_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists incident_media_count_after_write on public.incident_media;
create trigger incident_media_count_after_write
  after insert or delete on public.incident_media
  for each row execute function public.on_incident_media_change();

-- Rebuild the two read RPCs so they expose the new column. Signature
-- changes (new output column) require dropping the previous version.

drop function if exists public.nearby_incidents(
  double precision, double precision, integer,
  public.incident_type[], public.severity_level
);

create or replace function public.nearby_incidents(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer default 25000,
  p_types public.incident_type[] default null,
  p_min_severity public.severity_level default null
)
returns table (
  id uuid,
  user_id uuid,
  type public.incident_type,
  severity public.severity_level,
  status public.incident_status,
  title text,
  description text,
  lng double precision,
  lat double precision,
  elevation_m numeric,
  upvotes integer,
  downvotes integer,
  score integer,
  media_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
)
language sql
stable
as $$
  select
    i.id,
    i.user_id,
    i.type,
    i.severity,
    i.status,
    i.title,
    i.description,
    st_x(i.location::geometry) as lng,
    st_y(i.location::geometry) as lat,
    i.elevation_m,
    i.upvotes,
    i.downvotes,
    i.score,
    i.media_count,
    i.created_at,
    i.updated_at,
    i.expires_at
  from public.incidents i
  where i.status in ('pending', 'validated')
    and st_dwithin(
      i.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
    and (p_types is null or i.type = any(p_types))
    and (
      p_min_severity is null
      or (p_min_severity = 'mild')
      or (p_min_severity = 'moderate' and i.severity in ('moderate', 'severe'))
      or (p_min_severity = 'severe' and i.severity = 'severe')
    )
  order by i.created_at desc
  limit 500;
$$;

drop function if exists public.incidents_in_bbox(
  double precision, double precision, double precision, double precision,
  public.incident_type[], public.severity_level, integer
);

create or replace function public.incidents_in_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_types public.incident_type[] default null,
  p_min_severity public.severity_level default null,
  p_limit integer default 500
)
returns table (
  id uuid,
  user_id uuid,
  type public.incident_type,
  severity public.severity_level,
  status public.incident_status,
  title text,
  description text,
  lng double precision,
  lat double precision,
  elevation_m numeric,
  upvotes integer,
  downvotes integer,
  score integer,
  media_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
)
language sql
stable
as $$
  select
    i.id,
    i.user_id,
    i.type,
    i.severity,
    i.status,
    i.title,
    i.description,
    st_x(i.location::geometry) as lng,
    st_y(i.location::geometry) as lat,
    i.elevation_m,
    i.upvotes,
    i.downvotes,
    i.score,
    i.media_count,
    i.created_at,
    i.updated_at,
    i.expires_at
  from public.incidents i
  where i.status in ('pending', 'validated')
    and st_intersects(
      i.location,
      st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    )
    and (p_types is null or i.type = any(p_types))
    and (
      p_min_severity is null
      or (p_min_severity = 'mild')
      or (p_min_severity = 'moderate' and i.severity in ('moderate', 'severe'))
      or (p_min_severity = 'severe' and i.severity = 'severe')
    )
  order by i.created_at desc
  limit p_limit;
$$;

grant execute on function public.nearby_incidents(
  double precision, double precision, integer,
  public.incident_type[], public.severity_level
) to anon, authenticated;

grant execute on function public.incidents_in_bbox(
  double precision, double precision, double precision, double precision,
  public.incident_type[], public.severity_level, integer
) to anon, authenticated;
