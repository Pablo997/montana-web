-- ----------------------------------------------------------------------------
-- list_nearby_incidents — RPC for the public "Nearby" list page.
--
-- This is intentionally a SEPARATE function from `nearby_incidents`, not a
-- modification of it. The existing function powers the push notification
-- fan-out and is wired into a `pg_cron` job — changing its return shape would
-- silently break the cron without an obvious failure mode. A second RPC with
-- the extra columns the list UI needs (distance, media count) keeps the cost
-- of the new feature localised to the new caller.
--
-- Returns:
--   * The same core incident columns as `nearby_incidents` (so the client-side
--     `rowToIncident` mapper works without changes).
--   * `media_count` — needed to decide whether to show a photo thumbnail
--     without a second round-trip per row.
--   * `distance_m` — server-computed great-circle distance (PostGIS does the
--     heavy lifting). Sorted ASCENDING so the closest results come first;
--     this is what differentiates the list view from the map (which sorts
--     by recency).
--
-- Why a hard `p_limit` ceiling:
--   * The list view doesn't paginate (yet). Returning 500+ rows would inflate
--     the JSON payload and dwarf any tile/RPC savings we get from showing
--     this page instead of the map.
--   * 50 is enough to cover the "next handful of incidents" use case and
--     keeps the payload < 50 KB even with descriptions and titles.
-- ----------------------------------------------------------------------------

create or replace function public.list_nearby_incidents(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer default 50000,
  p_limit integer default 50
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
  media_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  distance_m double precision
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
    coalesce(i.media_count, 0) as media_count,
    i.created_at,
    i.updated_at,
    i.expires_at,
    st_distance(
      i.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    ) as distance_m
  from public.incidents i
  where i.status in ('pending', 'validated')
    and st_dwithin(
      i.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  order by distance_m asc, i.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

-- Both anon and authenticated need access. The list view is one of the few
-- "browse without an account" surfaces; gating it behind auth would defeat
-- the whole point of having a low-friction discovery page.
grant execute on function public.list_nearby_incidents(
  double precision, double precision, integer, integer
) to anon, authenticated;

comment on function public.list_nearby_incidents is
  'Public RPC powering the /nearby list page. Returns incidents within radius '
  'ordered by distance ASC, including the per-row distance in metres and '
  'media_count for thumbnail decisions. Separate from nearby_incidents to '
  'avoid coupling the cron-driven push fan-out to a UI return shape.';
