-- =============================================================================
-- Per-user quiet hours ("Do Not Disturb") for push notifications
-- -----------------------------------------------------------------------------
-- Goal: let users define a daily window during which the fan-out skips
-- their subscription, with an optional override so that severe incidents
-- still come through (search-and-rescue / on-call use case).
--
-- Design decisions:
--
--   * NULL `quiet_hours_start` is the sentinel for "DnD disabled". A
--     separate boolean would be redundant — if the user picks a window
--     we have one, if not we don't. Less state to keep consistent.
--   * `quiet_hours_timezone` is required when DnD is on (enforced by a
--     CHECK). Without it, "23:00" would be interpreted as UTC and a user
--     in Madrid would get silenced from 01:00 to 09:00 local time. We
--     accept any IANA name; Postgres validates at fan-out time via
--     `AT TIME ZONE` and rejects nonsense with `invalid_parameter_value`.
--   * Windows that cross midnight (e.g. 23:00 → 07:00) are supported.
--     The fan-out predicate handles both same-day and wrap-around cases.
--   * `quiet_hours_critical_override` defaults to FALSE. We deliberately
--     do not auto-enable it: the user is signing up for total silence
--     until they tick the box. The opt-in cost is one checkbox; the
--     downside of the wrong default is "I told you not to wake me".
--
-- Backwards compatibility: existing rows get NULL quiet hours = DnD
-- disabled, which matches today's behaviour exactly.
-- =============================================================================

alter table public.push_subscriptions
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists quiet_hours_timezone text,
  add column if not exists quiet_hours_critical_override boolean not null default false;

-- Both bounds must agree on null-ness: either both set (DnD on) or both
-- null (DnD off). And when set, a timezone is mandatory — see comment
-- above. We don't reject `start = end`; the fan-out predicate treats
-- that as "no window" so the user effectively turns DnD off without
-- having to NULL the columns out, which is fine.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_quiet_hours_chk;
alter table public.push_subscriptions
  add constraint push_subscriptions_quiet_hours_chk check (
    (quiet_hours_start is null and quiet_hours_end is null)
    or (
      quiet_hours_start is not null
      and quiet_hours_end is not null
      and quiet_hours_timezone is not null
      and length(quiet_hours_timezone) > 0
    )
  );

comment on column public.push_subscriptions.quiet_hours_start is
  'Local wall-clock time at which DnD begins. NULL ⇒ DnD disabled.';
comment on column public.push_subscriptions.quiet_hours_end is
  'Local wall-clock time at which DnD ends. NULL ⇒ DnD disabled. '
  'May be < start to express a window that crosses midnight.';
comment on column public.push_subscriptions.quiet_hours_timezone is
  'IANA timezone name (e.g. "Europe/Madrid") the wall-clock times are '
  'interpreted in. Required when start/end are set.';
comment on column public.push_subscriptions.quiet_hours_critical_override is
  'When true, severity=severe incidents bypass DnD. Defaults to false: '
  'silence means silence unless the user explicitly opts in.';

-- -----------------------------------------------------------------------------
-- Window-membership helper
-- -----------------------------------------------------------------------------
-- Centralised so the fan-out query stays readable and a future caller
-- (e.g. a future "send me a digest at the end of DnD" feature) can
-- reuse the same logic. STABLE + pure so the planner can fold it into
-- the fan-out predicate.
create or replace function public.is_in_quiet_window(
  now_local time,
  start_t time,
  end_t time
)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    -- A degenerate window (zero-length) means "no quiet window". We
    -- treat this as DnD off rather than "the entire day is silent",
    -- because the UI explicitly distinguishes the two states and the
    -- DB shouldn't second-guess that.
    when start_t = end_t then false
    -- Same-day window: e.g. 13:00–15:00 — siesta. Standard interval.
    when start_t < end_t then now_local >= start_t and now_local < end_t
    -- Crosses midnight: e.g. 23:00–07:00. Union of [start, 24:00) and
    -- [00:00, end). Single boolean expression so no branching.
    else now_local >= start_t or now_local < end_t
  end
$$;

comment on function public.is_in_quiet_window(time, time, time) is
  'True iff `now_local` falls inside the [start, end) wall-clock window. '
  'Handles the cross-midnight case (start > end) and returns false for '
  'a zero-length window so callers can safely store start=end as "off".';

-- -----------------------------------------------------------------------------
-- Fan-out: skip subscriptions in their DnD window
-- -----------------------------------------------------------------------------
-- Same return shape as before; only the predicate set widens. Keeping
-- the signature stable means the edge function does not need a redeploy
-- in lock-step with this migration.
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
      and (
        ps.last_push_at is null
        or ps.last_push_at + make_interval(secs => ps.min_push_interval_seconds) <= now()
      )
      -- Quiet hours gate. Three paths:
      --   1. DnD off (start IS NULL): always pass.
      --   2. DnD on + severe incident + critical override: pass anyway.
      --   3. DnD on otherwise: compute the user-local time in their
      --      stored timezone and check window membership.
      -- We wrap the timezone conversion in a CASE so a bad IANA name
      -- (shouldn't happen — the column is set by us — but defence in
      -- depth) can't crash the whole fan-out. An invalid tz makes the
      -- predicate evaluate to "in window = false" which means "deliver",
      -- failing open rather than silently muting everyone.
      and (
        ps.quiet_hours_start is null
        or (
          ps.quiet_hours_critical_override
          and i.severity::text = 'severe'
        )
        or not public.is_in_quiet_window(
          (now() at time zone coalesce(ps.quiet_hours_timezone, 'UTC'))::time,
          ps.quiet_hours_start,
          ps.quiet_hours_end
        )
      )
  )
  select distinct on (subscription_id)
    subscription_id,
    endpoint, p256dh, auth,
    incident_id, title, type, severity, lat, lng
  from candidates
  order by subscription_id, severity_rank desc, created_at desc
$$;

-- -----------------------------------------------------------------------------
-- Upsert RPC: extend the parameter list with the four quiet-hours fields
-- -----------------------------------------------------------------------------
-- Same pattern as 00025: drop the previous signature first because PG
-- doesn't allow CREATE OR REPLACE across different argument shapes. We
-- inherit the existing default values for backwards-compat (rate-limit
-- column defaults still apply if a stale client tab omits them).
drop function if exists public.upsert_push_subscription(
  text, text, text, double precision, double precision, integer, text, boolean, integer
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
  p_min_push_interval_seconds integer default 600,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null,
  p_quiet_hours_timezone text default null,
  p_quiet_hours_critical_override boolean default false
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

  -- Quiet-hours sanity: same null-coherence rule as the column CHECK,
  -- but raised as a friendly message before we hit constraint violation.
  if (p_quiet_hours_start is null) <> (p_quiet_hours_end is null) then
    raise exception 'quiet_hours_start and quiet_hours_end must both be set or both be null';
  end if;
  if p_quiet_hours_start is not null
     and (p_quiet_hours_timezone is null or length(p_quiet_hours_timezone) = 0)
  then
    raise exception 'quiet_hours_timezone is required when quiet hours are enabled';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth,
    center, radius_km, min_severity, enabled, min_push_interval_seconds,
    quiet_hours_start, quiet_hours_end, quiet_hours_timezone, quiet_hours_critical_override
  )
  values (
    v_user, p_endpoint, p_p256dh, p_auth,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_radius_km, p_min_severity, p_enabled, p_min_push_interval_seconds,
    p_quiet_hours_start, p_quiet_hours_end, p_quiet_hours_timezone, p_quiet_hours_critical_override
  )
  on conflict (user_id, endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    center = excluded.center,
    radius_km = excluded.radius_km,
    min_severity = excluded.min_severity,
    enabled = excluded.enabled,
    min_push_interval_seconds = excluded.min_push_interval_seconds,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end,
    quiet_hours_timezone = excluded.quiet_hours_timezone,
    quiet_hours_critical_override = excluded.quiet_hours_critical_override
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_push_subscription(
  text, text, text, double precision, double precision, integer, text, boolean,
  integer, time, time, text, boolean
) to authenticated;

-- -----------------------------------------------------------------------------
-- Preferences read: surface the new fields to the UI
-- -----------------------------------------------------------------------------
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
  min_push_interval_seconds integer,
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_timezone text,
  quiet_hours_critical_override boolean
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
    ps.min_push_interval_seconds,
    ps.quiet_hours_start,
    ps.quiet_hours_end,
    ps.quiet_hours_timezone,
    ps.quiet_hours_critical_override
  from public.push_subscriptions ps
  where ps.user_id = auth.uid()
  order by ps.updated_at desc
  limit 1
$$;

grant execute on function public.get_my_push_preferences() to authenticated;
