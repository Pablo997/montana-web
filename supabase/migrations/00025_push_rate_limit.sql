-- =============================================================================
-- Per-subscription push rate limit + per-tick coalescing
-- -----------------------------------------------------------------------------
-- Problem we are solving:
--   1. When a cluster of incidents lands in the same 60s cron tick inside a
--      user's radius, the current fan-out emits one push per incident. With
--      the onboarding banner live and more users subscribed, this turns into
--      a notification storm and a fast-track to "never again".
--   2. Even across ticks, some users prefer a conservative cadence ("don't
--      ping me more than once an hour") even if many incidents qualify.
--
-- Fix:
--   * New `min_push_interval_seconds` column on `push_subscriptions`
--     (default 10 minutes) configurable per user. The fan-out skips
--     subscriptions whose `last_push_at` is inside the cooldown window.
--   * Within a single tick, coalesce the candidate set to at most one push
--     per subscription using `distinct on (subscription_id)`, choosing the
--     most severe incident and tie-breaking by newest.
--
-- The cron cadence itself is unchanged; this is purely a tightening of the
-- fan-out query, backwards compatible with existing rows (default value
-- kicks in) and with the edge function (same return columns).
-- =============================================================================

alter table public.push_subscriptions
  add column if not exists min_push_interval_seconds integer
    not null
    default 600
    check (min_push_interval_seconds between 60 and 86400);

comment on column public.push_subscriptions.min_push_interval_seconds is
  'Minimum seconds that must elapse between two successful pushes to this '
  'subscription. Enforced at fan-out time by push_fanout_for_incidents.';

-- -----------------------------------------------------------------------------
-- Fan-out query with cooldown + per-tick coalescing
-- -----------------------------------------------------------------------------
-- Return shape is unchanged; only the candidate selection changed. Keeping
-- the signature stable lets us ship the SQL before the edge function
-- redeploy (or vice-versa) without a breaking window.
create or replace function public.push_fanout_for_incidents(
  incident_ids uuid[]
)
returns table (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  incident_id uuid,
  incident_title text,
  incident_type text,
  incident_severity text,
  incident_lat double precision,
  incident_lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with sev_rank(level, rank) as (
    values ('mild'::text, 1), ('moderate', 2), ('severe', 3)
  ),
  candidates as (
    select
      ps.id as subscription_id,
      ps.endpoint,
      ps.p256dh,
      ps.auth,
      i.id as incident_id,
      i.title,
      i.type::text as type,
      i.severity::text as severity,
      i.created_at,
      st_y(i.location::geometry) as lat,
      st_x(i.location::geometry) as lng,
      sr_inc.rank as severity_rank
    from public.push_subscriptions ps
    join public.incidents i on i.id = any(incident_ids)
    join sev_rank sr_sub on sr_sub.level = ps.min_severity
    join sev_rank sr_inc on sr_inc.level = i.severity::text
    where ps.enabled
      and ps.center is not null
      and i.user_id <> ps.user_id
      and i.status in ('pending', 'validated')
      and sr_inc.rank >= sr_sub.rank
      and st_dwithin(ps.center, i.location, ps.radius_km * 1000)
      -- Cross-tick cooldown: never push this sub again until the
      -- configured interval has elapsed since the last successful
      -- delivery. `last_push_at is null` means "never pushed"; let it
      -- through.
      and (
        ps.last_push_at is null
        or ps.last_push_at + make_interval(secs => ps.min_push_interval_seconds) <= now()
      )
  )
  -- Per-tick coalescing: of the incidents a sub qualifies for in THIS
  -- batch, keep only the most severe (tie-broken by newest). A cluster
  -- of near-simultaneous reports becomes one notification for the user,
  -- not ten. `mark_push_sent` bumps `last_push_at`, so the remaining
  -- rows fall under the cross-tick cooldown on the next run.
  select distinct on (subscription_id)
    subscription_id,
    endpoint, p256dh, auth,
    incident_id, title, type, severity, lat, lng
  from candidates
  order by subscription_id, severity_rank desc, created_at desc
$$;

-- -----------------------------------------------------------------------------
-- Upsert RPC: accept the new preference
-- -----------------------------------------------------------------------------
-- Postgres does not allow `create or replace function` across different
-- signatures, so we drop the old 8-arg version first and recreate with the
-- extended parameter list. The new parameter has a default so existing
-- clients (which pass 8 args) still resolve to the right overload *for
-- this release*; once all clients pass the 9th arg, the default keeps us
-- safe against a stale browser tab running the previous bundle.
drop function if exists public.upsert_push_subscription(
  text, text, text, double precision, double precision, integer, text, boolean
);

create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer,
  p_min_severity text,
  p_enabled boolean default true,
  p_min_push_interval_seconds integer default 600
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.push_subscriptions;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 500 then
    raise exception 'radius_km must be between 1 and 500';
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'lat/lng out of range';
  end if;
  if p_min_push_interval_seconds is null
     or p_min_push_interval_seconds < 60
     or p_min_push_interval_seconds > 86400
  then
    raise exception 'min_push_interval_seconds must be between 60 and 86400';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth,
    center, radius_km, min_severity, enabled, min_push_interval_seconds
  )
  values (
    v_user, p_endpoint, p_p256dh, p_auth,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_radius_km, p_min_severity, p_enabled, p_min_push_interval_seconds
  )
  on conflict (user_id, endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    center = excluded.center,
    radius_km = excluded.radius_km,
    min_severity = excluded.min_severity,
    enabled = excluded.enabled,
    min_push_interval_seconds = excluded.min_push_interval_seconds
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_push_subscription(
  text, text, text, double precision, double precision, integer, text, boolean, integer
) to authenticated;

-- -----------------------------------------------------------------------------
-- Preferences read: expose the new field so the UI can prepopulate
-- -----------------------------------------------------------------------------
-- `create or replace` refuses to change the RETURNS TABLE shape, so we
-- drop first. No parameters → zero-arg signature is unambiguous.
drop function if exists public.get_my_push_preferences();

create or replace function public.get_my_push_preferences()
returns table (
  id uuid,
  lat double precision,
  lng double precision,
  radius_km integer,
  min_severity text,
  enabled boolean,
  last_push_at timestamptz,
  min_push_interval_seconds integer
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
    ps.last_push_at,
    ps.min_push_interval_seconds
  from public.push_subscriptions ps
  where ps.user_id = auth.uid()
  order by ps.updated_at desc
  limit 1
$$;

-- Re-grant after the drop above: DROP FUNCTION also removes its ACLs.
grant execute on function public.get_my_push_preferences() to authenticated;
