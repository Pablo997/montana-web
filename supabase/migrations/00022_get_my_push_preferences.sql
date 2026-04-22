-- =============================================================================
-- Flat read RPC for the preferences UI
-- -----------------------------------------------------------------------------
-- `get_my_push_subscription` (added in 00021) returns the raw row,
-- which leaks the PostGIS hex blob in `center`. Decoding that in the
-- browser is painful, so we expose a second RPC that does the
-- ST_X/ST_Y split server-side and hands back plain numbers.
-- =============================================================================

create or replace function public.get_my_push_preferences()
returns table (
  id uuid,
  lat double precision,
  lng double precision,
  radius_km integer,
  min_severity text,
  enabled boolean,
  last_push_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ps.id,
    st_y(ps.center::geometry),
    st_x(ps.center::geometry),
    ps.radius_km,
    ps.min_severity,
    ps.enabled,
    ps.last_push_at
  from public.push_subscriptions ps
  where ps.user_id = auth.uid()
  order by ps.updated_at desc
  limit 1
$$;

grant execute on function public.get_my_push_preferences() to authenticated;
