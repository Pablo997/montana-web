-- ----------------------------------------------------------------------------
-- Viewport-based incident lookup.
--
-- `incidents_in_bbox` returns every visible incident whose location falls
-- inside the given lng/lat envelope. The client calls it on map `moveend`
-- so we only hydrate what the user can actually see.
--
-- Coordinates are WGS84 (SRID 4326). `ST_MakeEnvelope(min_lng, min_lat,
-- max_lng, max_lat, 4326)` is cast to geography for the intersect test so
-- it uses the GIST index on `incidents.location`.
-- ----------------------------------------------------------------------------

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

grant execute on function public.incidents_in_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  public.incident_type[],
  public.severity_level,
  integer
) to anon, authenticated;
