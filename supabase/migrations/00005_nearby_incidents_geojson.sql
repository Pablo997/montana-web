-- ----------------------------------------------------------------------------
-- Replace nearby_incidents so it returns lng/lat as plain doubles.
-- The previous version returned the raw geography column which PostgREST
-- serialises as WKB hex, forcing the client to parse binary.
-- ----------------------------------------------------------------------------

drop function if exists public.nearby_incidents(
  double precision,
  double precision,
  integer,
  incident_type[],
  severity_level
);

create or replace function public.nearby_incidents(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer default 25000,
  p_types incident_type[] default null,
  p_min_severity severity_level default null
)
returns table (
  id uuid,
  user_id uuid,
  type incident_type,
  severity severity_level,
  status incident_status,
  title text,
  description text,
  lng double precision,
  lat double precision,
  elevation_m numeric,
  upvotes integer,
  downvotes integer,
  score integer,
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
