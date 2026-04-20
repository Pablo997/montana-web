-- ----------------------------------------------------------------------------
-- Embed the caller's current vote inside incident read RPCs.
--
-- Before this migration the client had to issue a second request
-- (`fetch_user_vote`) every time the details panel opened, which caused a
-- visible flash on the vote buttons: they rendered in their "unvoted"
-- neutral state for one frame, then transitioned to green/red once the
-- hydration query resolved.
--
-- By joining against `incident_votes` inside the already-running RPCs we
-- piggy-back on the viewport fetch: zero extra round trips and zero
-- flicker. Anonymous callers get `null` because `auth.uid()` is null.
--
-- Each new `user_vote` column returns smallint (1 | -1 | null) to keep
-- the payload tiny.
-- ----------------------------------------------------------------------------

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
  user_vote smallint,
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
    v.vote as user_vote,
    i.created_at,
    i.updated_at,
    i.expires_at
  from public.incidents i
  left join public.incident_votes v
    on v.incident_id = i.id
   and v.user_id = auth.uid()
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
  user_vote smallint,
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
    v.vote as user_vote,
    i.created_at,
    i.updated_at,
    i.expires_at
  from public.incidents i
  left join public.incident_votes v
    on v.incident_id = i.id
   and v.user_id = auth.uid()
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
