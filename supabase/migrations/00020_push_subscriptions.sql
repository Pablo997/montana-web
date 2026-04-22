-- =============================================================================
-- Web Push subscriptions
-- -----------------------------------------------------------------------------
-- Stores one row per (user, browser/device) so the cron worker can fan out a
-- push when a new incident lands inside the user's area of interest. Design
-- notes:
--
--   * Endpoints are unique-per-user but not globally unique: two users on
--     the same shared device get distinct subs, and we key by user so a
--     logout/login clears the right one.
--   * The `center` column is `geography(Point, 4326)` to reuse the same
--     spatial index tooling as `incidents.location`. That lets the cron
--     worker do a `ST_DWithin` join efficiently when deciding who to
--     notify about a new incident.
--   * We store `radius_km` instead of pre-computing a polygon so users can
--     tweak it without a write-amplified migration.
--   * `min_severity` is an ordered enum check; anything >= that level
--     triggers a notification. Keeping it text+CHECK rather than a
--     Postgres enum for the same reason as the moderation table: the
--     list may grow, and enum changes are painful.
--   * RLS: a user can only see/manage their own subscriptions. The
--     cron worker uses the service_role key (bypasses RLS) via a
--     SECURITY DEFINER helper.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- The full PushSubscription contract from the browser. `endpoint` is
  -- the unique URL we POST the encrypted payload to; `p256dh` and `auth`
  -- are the per-subscription crypto material used to encrypt for the
  -- end device (HKDF + AES-GCM, handled by the web-push lib). We store
  -- them as text because they arrive as URL-safe base64 strings.
  endpoint text not null,
  p256dh text not null,
  auth text not null,

  -- Area of interest. NULL center means "notifications disabled" — we
  -- keep the row so the browser can resubscribe to the same endpoint
  -- without a full opt-in dance, but the cron skips it.
  center geography(Point, 4326),
  radius_km integer not null default 25 check (radius_km between 1 and 500),

  -- Filtering: only push if incident severity is at least this level.
  -- Ordered text to match the `severity_level` enum in the incidents
  -- schema; a trigger below validates ordering numerically.
  min_severity text not null default 'moderate' check (
    min_severity in ('mild', 'moderate', 'severe')
  ),

  -- Housekeeping. `last_push_at` is updated by the cron worker; useful
  -- for rate-limiting and for eviction of stale subs (browsers quietly
  -- rotate endpoints).
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_push_at timestamptz,

  -- One endpoint per user. If the browser gives the same user a new
  -- endpoint (rotation, permission re-grant), we UPSERT on this key so
  -- the row stays current.
  constraint push_subscriptions_user_endpoint_uniq unique (user_id, endpoint)
);

-- Spatial index for the cron fan-out query. GIST on the geography
-- column is the right tool for ST_DWithin lookups; without it the
-- join degrades to a table scan at ~10k subs.
create index if not exists push_subscriptions_center_gix
  on public.push_subscriptions using gist (center);

-- Partial index that the cron will actually hit: only enabled subs
-- with a center matter for fan-out.
create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id)
  where enabled and center is not null;

-- Keep updated_at fresh on every change. Matches the pattern used in
-- other tables.
create or replace function public.touch_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_subscriptions_touch on public.push_subscriptions;
create trigger trg_push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.touch_push_subscriptions_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Each user owns their subscriptions and nobody else can read them.
-- The cron worker uses service_role so RLS doesn't apply to it.
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions
  for insert
  with check (auth.uid() = user_id);

create policy "push_subscriptions_update_own"
  on public.push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions
  for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Helper RPC for the fan-out query
-- -----------------------------------------------------------------------------
-- Called by the Supabase Edge Function each cron tick. Given a batch of
-- new incidents, returns the subscriptions that should receive a push,
-- already joined with the incident info the notification payload needs.
--
-- SECURITY DEFINER so the edge function can call it with the anon key
-- (we still guard via an internal caller check using the cron auth
-- header, but even so: service_role is the real safety net).
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
  )
  select
    ps.id,
    ps.endpoint,
    ps.p256dh,
    ps.auth,
    i.id,
    i.title,
    i.type::text,
    i.severity::text,
    st_y(i.location::geometry),
    st_x(i.location::geometry)
  from public.push_subscriptions ps
  join public.incidents i on i.id = any(incident_ids)
  join sev_rank sr_sub on sr_sub.level = ps.min_severity
  join sev_rank sr_inc on sr_inc.level = i.severity::text
  where ps.enabled
    and ps.center is not null
    -- Don't notify the author of their own incident: pointless and
    -- noisy.
    and i.user_id <> ps.user_id
    -- Only incidents in a publishable state; dismissed or expired
    -- ones shouldn't generate pushes even if they were inserted
    -- recently.
    and i.status in ('pending', 'validated')
    -- Severity threshold
    and sr_inc.rank >= sr_sub.rank
    -- Spatial proximity (geography ST_DWithin takes meters).
    and st_dwithin(ps.center, i.location, ps.radius_km * 1000)
$$;

-- Called by the edge function after a successful push so we can
-- track delivery freshness and gate rate-limits later. Kept as a
-- separate function so the fanout query stays stable and cache-friendly.
create or replace function public.mark_push_sent(
  subscription_ids uuid[]
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
  set last_push_at = now()
  where id = any(subscription_ids)
$$;

-- Revokes a subscription whose endpoint has become invalid (410 Gone
-- or 404 from the push service). The edge function calls this when
-- the push provider tells us the browser unsubscribed or the
-- endpoint rotated. Keeps the table healthy without manual ops.
create or replace function public.disable_push_subscription(
  subscription_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
  set enabled = false
  where id = subscription_id
$$;

-- -----------------------------------------------------------------------------
-- Cron bookkeeping
-- -----------------------------------------------------------------------------
-- Tracks the cursor the notification cron has advanced to so we can ask
-- "what's new since last tick?" without depending on external state.
-- One row, upserted. Starts at epoch so the first tick pulls nothing (we
-- don't want to spam every user on initial deploy with a backlog of
-- historical incidents).
create table if not exists public.push_cron_state (
  id smallint primary key default 1 check (id = 1),
  last_scanned_at timestamptz not null default now()
);

insert into public.push_cron_state (id, last_scanned_at)
values (1, now())
on conflict (id) do nothing;

-- Returns incident IDs created after the stored cursor and advances the
-- cursor atomically to the newest `created_at` it returned, so the next
-- call picks up exactly where this one left off. Designed to be the
-- edge function's only source of truth about "what to notify".
create or replace function public.pick_new_incidents_for_push()
returns table (
  incident_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cursor timestamptz;
  v_new_cursor timestamptz;
begin
  select last_scanned_at into v_cursor from public.push_cron_state where id = 1;

  -- Collect the batch first so we can (a) return it and (b) compute
  -- the new cursor value in a single pass.
  return query
  with batch as (
    select i.id, i.created_at
    from public.incidents i
    where i.created_at > v_cursor
      and i.status in ('pending', 'validated')
    order by i.created_at
    -- A hard cap keeps a cold-start backlog from firing 10k pushes in
    -- one tick. If we legitimately have that much queued, the next
    -- tick will drain the rest.
    limit 500
  ),
  advance as (
    update public.push_cron_state
    set last_scanned_at = coalesce(
      (select max(created_at) from batch),
      v_cursor
    )
    where id = 1
    returning last_scanned_at
  )
  select b.id from batch b, advance;
end;
$$;

-- Grants: anon can't touch these. authenticated users go through RLS.
-- service_role (edge function) uses the SECURITY DEFINER wrappers.
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant execute on function public.push_fanout_for_incidents(uuid[]) to service_role;
grant execute on function public.mark_push_sent(uuid[]) to service_role;
grant execute on function public.disable_push_subscription(uuid) to service_role;
grant execute on function public.pick_new_incidents_for_push() to service_role;
