-- =============================================================================
-- In-app notification center
-- -----------------------------------------------------------------------------
-- Goal: complement push notifications with a persistent feed inside the
-- app (bell icon + dropdown). Users who missed a push (device offline,
-- DnD on, cooldown skipped them) can still catch up from here.
--
-- Architecture:
--
--   * One row per (user, incident) pair worth surfacing. Deduped by
--     UNIQUE constraint: even if the cron tick reprocesses the same
--     incident, the user only ever sees one entry.
--   * Inserted alongside the push fan-out (via the new `enqueue_inapp_
--     notifications` RPC the Edge Function calls). The two audiences
--     differ — in-app skips the cooldown + DnD filters because the
--     feed IS how users recover those — so this is a separate RPC, not
--     a side effect of the push fan-out.
--   * Body is not stored. We join against `incidents` at read time so
--     edits / moderation propagate automatically (and we don't have
--     to keep the row in sync with title/severity changes). The cost
--     is one join per fetch, which is negligible at the page sizes a
--     bell-dropdown ever shows.
--   * `read_at` is per-row. We don't track "seen" separately because
--     the dropdown counts the badge from `where read_at is null`, and
--     adding a third state would not help any product story we have.
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  -- One entry per (user, incident). If the same incident lands in
  -- multiple cron ticks (shouldn't, but) we still get exactly one
  -- bell entry — the ON CONFLICT in the enqueue RPC turns the dup
  -- into a no-op rather than a constraint violation bubbling up.
  constraint notifications_user_incident_uniq unique (user_id, incident_id)
);

-- Hot-path index for the dropdown query: "give me my N latest". The
-- composite ordering matches the WHERE + ORDER BY in
-- `get_my_notifications`, so the planner can satisfy both with one
-- index scan and no sort.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Badge query lives on the same composite when read_at is null. A
-- partial index keeps the unread set tiny even after years of rows.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Same shape as `push_subscriptions`: each user owns their own rows,
-- the Edge Function uses service_role for inserts.
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications
  for select
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No INSERT policy for users: rows are only ever created by the
-- SECURITY DEFINER RPC below. A user creating a notification for
-- themselves would be harmless but pointless, and disallowing it
-- keeps the audit clean.

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- Add to the supabase_realtime publication so the bell dropdown can
-- subscribe to INSERTs and update the unread badge in real time
-- without polling. RLS gates the per-user filter on the client side.
-- Wrapped in a DO block because `alter publication ... add table`
-- raises if the table is already a member (and Supabase platforms
-- vary on what's pre-registered).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Enqueue RPC: called by the Edge Function on every cron tick
-- -----------------------------------------------------------------------------
-- Inserts one notification row per (subscription_owner, incident)
-- pair whose subscription's radius + severity filters match. Differs
-- from `push_fanout_for_incidents` in three places:
--
--   1. No cooldown / DnD filter — the feed is precisely the safety
--      net for missed pushes; honouring those again would defeat its
--      purpose.
--   2. Groups by user_id (not by subscription), because a user may
--      have multiple devices but only wants one entry per incident
--      in the bell dropdown.
--   3. Inserts with ON CONFLICT DO NOTHING so a re-tick of the same
--      incident batch is a safe no-op.
--
-- Returns the IDs of newly created notifications so the Edge Function
-- can log / report them.
create or replace function public.enqueue_inapp_notifications(
  incident_ids uuid[]
)
returns table (
  notification_id uuid,
  user_id uuid,
  incident_id uuid
)
language sql
security definer
set search_path = public
as $$
  with sev_rank(level, rank) as (
    values ('mild'::text, 1), ('moderate', 2), ('severe', 3)
  ),
  candidates as (
    -- Distinct users (not subs) whose stored area-of-interest matches
    -- one of these incidents. A user with several devices still gets
    -- ONE row per incident.
    select distinct
      ps.user_id,
      i.id as incident_id
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
  )
  insert into public.notifications (user_id, incident_id)
  select c.user_id, c.incident_id from candidates c
  on conflict (user_id, incident_id) do nothing
  returning id, user_id, incident_id
$$;

comment on function public.enqueue_inapp_notifications(uuid[]) is
  'Insert one notification per (user, incident) match for the in-app '
  'feed. Skips cooldown/DnD on purpose: the dropdown is the recovery '
  'channel for pushes the user missed. Returns inserted IDs.';

-- -----------------------------------------------------------------------------
-- Read RPCs for the UI
-- -----------------------------------------------------------------------------
-- Paginated feed of the current user's notifications, joined against
-- the latest incident state. Filters out incidents that have been
-- moderated away or expired — the bell shouldn't link to a dead URL.
--
-- `p_before` is a keyset cursor: pass the `created_at` of the last
-- row you got to load the next page. Cheaper than OFFSET and stable
-- under concurrent inserts.
create or replace function public.get_my_notifications(
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  id uuid,
  incident_id uuid,
  read_at timestamptz,
  created_at timestamptz,
  incident_title text,
  incident_type text,
  incident_severity text,
  incident_status text,
  incident_lat double precision,
  incident_lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.incident_id,
    n.read_at,
    n.created_at,
    i.title,
    i.type::text,
    i.severity::text,
    i.status::text,
    st_y(i.location::geometry),
    st_x(i.location::geometry)
  from public.notifications n
  join public.incidents i on i.id = n.incident_id
  where n.user_id = auth.uid()
    -- Hide notifications for incidents the moderation team / lifecycle
    -- cron removed from the public map. The row stays in the table
    -- (so unread counts don't shift around) but it won't render.
    and i.status in ('pending', 'validated', 'resolved')
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

-- Lightweight badge query. We could `select count(*)` in the UI but
-- this RPC lets us add filters later (e.g. "unread for incidents in
-- last 7 days") without breaking the client signature.
create or replace function public.count_unread_notifications()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.notifications n
  join public.incidents i on i.id = n.incident_id
  where n.user_id = auth.uid()
    and n.read_at is null
    and i.status in ('pending', 'validated', 'resolved')
$$;

-- -----------------------------------------------------------------------------
-- Write RPCs
-- -----------------------------------------------------------------------------
-- Bulk mark-as-read: takes an array of IDs and stamps `read_at` on
-- the ones owned by the caller. Wraps in one UPDATE so the round-trip
-- cost is constant regardless of how many bell entries the user just
-- expanded.
create or replace function public.mark_notifications_read(
  p_ids uuid[]
)
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
    set read_at = now()
    where user_id = auth.uid()
      and id = any(p_ids)
      and read_at is null
    returning id
  )
  select count(*)::int from updated
$$;

-- "Clear all" shortcut for the dropdown footer. Same as above but
-- with no ID filter. Kept separate so we can audit / rate-limit if
-- abused (a malicious client could thrash this endpoint, but the
-- update is bounded by the user's unread set so worst case is one
-- table scan per call).
create or replace function public.mark_all_notifications_read()
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
    set read_at = now()
    where user_id = auth.uid()
      and read_at is null
    returning id
  )
  select count(*)::int from updated
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- service_role uses these via the Edge Function (enqueue path).
-- authenticated uses the read + mark RPCs from the browser. anon is
-- shut out entirely.
revoke all on public.notifications from anon;
grant select, update on public.notifications to authenticated;

grant execute on function public.enqueue_inapp_notifications(uuid[]) to service_role;
grant execute on function public.get_my_notifications(integer, timestamptz) to authenticated;
grant execute on function public.count_unread_notifications() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
