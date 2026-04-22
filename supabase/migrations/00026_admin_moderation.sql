-- =============================================================================
-- Admin moderation
-- -----------------------------------------------------------------------------
-- Infrastructure for a small set of trusted moderators to:
--   1. Review pending `incident_reports` and act on them (dismiss / remove
--      the incident / ban the reporter or author).
--   2. Ban abusive users so they can no longer vote, report or create
--      incidents. Bans can be permanent (NULL expires_at) or timed.
--   3. Keep an auditable trail of every moderation action (who did what,
--      when, on which target).
--
-- Design notes:
--   - The admin flag lives on `public.profiles.is_admin`. RPCs exposed to
--     the `authenticated` role re-check it on every call via `public.is_admin()`
--     so we don't rely on the UI to hide buttons.
--   - Ban enforcement is centralised in `public.is_banned()` and called from
--     the write-path RPCs (`report_incident`, `vote_incident`). New write
--     paths added later only need to add the one-line check.
--   - Audit entries are written from inside `SECURITY DEFINER` helpers to
--     guarantee that "action happened" and "action was logged" are the
--     same transaction — you can't act without leaving a trail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Admin flag on profiles
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Partial index keeps it cheap: admins are a tiny fraction of the table.
create index if not exists profiles_is_admin_idx
  on public.profiles (id)
  where is_admin = true;

-- -----------------------------------------------------------------------------
-- User bans
-- -----------------------------------------------------------------------------
-- One active row per banned user. A historical trail is kept in
-- `moderation_actions` instead of this table to keep the lookup path O(1).
-- `expires_at IS NULL` means the ban is permanent.
create table if not exists public.user_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  banned_at timestamptz not null default now(),
  banned_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz
);

create index if not exists user_bans_expires_idx
  on public.user_bans (expires_at)
  where expires_at is not null;

alter table public.user_bans enable row level security;

-- Users see their own ban row (so the UI can explain why writes fail).
-- No insert / update / delete for regular users; admins go through RPCs.
drop policy if exists "user_bans_select_own" on public.user_bans;
create policy "user_bans_select_own"
  on public.user_bans
  for select
  to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
-- Append-only record of every moderation action. `target_kind` + `target_id`
-- keep the schema polymorphic: we don't want a separate table per action type.
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete set null,
  action text not null check (
    action in (
      'dismiss_report',
      'remove_incident',
      'restore_incident',
      'ban_user',
      'unban_user'
    )
  ),
  target_kind text not null check (
    target_kind in ('report', 'incident', 'user')
  ),
  target_id uuid not null,
  reason text check (char_length(reason) <= 1000),
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_created_idx
  on public.moderation_actions (created_at desc);
create index if not exists moderation_actions_target_idx
  on public.moderation_actions (target_kind, target_id);
create index if not exists moderation_actions_actor_idx
  on public.moderation_actions (actor_id);

alter table public.moderation_actions enable row level security;

-- Admins read; nobody writes directly (all inserts go via SECURITY DEFINER).
drop policy if exists "moderation_actions_admin_select" on public.moderation_actions;
create policy "moderation_actions_admin_select"
  on public.moderation_actions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

-- `is_admin(uid)` — returns true when the given user (defaulting to the
-- current session) is flagged as admin. Marked `stable` so it's cheap to
-- call repeatedly inside a single statement.
create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = p_uid),
    false
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- `is_banned(uid)` — returns true when the user has an active ban, i.e.
-- a row in `user_bans` whose `expires_at` is either NULL or in the future.
create or replace function public.is_banned(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_bans
    where user_id = p_uid
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function public.is_banned(uuid) to authenticated;

-- `ensure_admin()` — raises if the caller is not an admin. Kept as a
-- single helper so every admin RPC has a uniform error path.
create or replace function public.ensure_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
end;
$$;
