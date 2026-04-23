-- =============================================================================
-- Incident updates (short-form follow-up comments)
-- -----------------------------------------------------------------------------
-- A community map about mountain incidents is only half useful without a
-- way to follow up. People need to say things like:
--
--   "I passed by this morning, the path is cleared."
--   "Still there at 16:00, bear moved 200 m east."
--   "Snow conditions worse than reported."
--
-- We deliberately keep this simpler than full-blown comments:
--   * No threading / replies — a flat chronological stream.
--   * Plain text only, 500 chars max, no markdown / images.
--     Images belong on the incident itself (see `incident_media`).
--   * Author can delete their own update. Admins can remove anyone's
--     via the existing moderation flow (covered by its own migration
--     if/when we expose `admin_remove_update`).
--
-- Rate limiting: five updates per user per incident per rolling 24h
-- window. Prevents a single agitated user from drowning a thread while
-- still letting conscientious observers post "10:00", "12:00", "14:00"
-- check-ins through the day.
-- =============================================================================

create table if not exists public.incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Thread lookup by incident is the dominant query pattern
-- (open details panel → list all updates newest last).
create index if not exists incident_updates_incident_created_idx
  on public.incident_updates (incident_id, created_at asc);

-- Per-author lookup (used by `/me` and admin when proving abuse).
create index if not exists incident_updates_user_idx
  on public.incident_updates (user_id);

alter table public.incident_updates enable row level security;

-- -----------------------------------------------------------------------------
-- Read policy
-- -----------------------------------------------------------------------------
-- Everyone can read every update, matching the public nature of the
-- incident map itself. If we ever hide incidents behind auth we'll
-- need to join against `incidents.status` here.
drop policy if exists "incident_updates_select_all" on public.incident_updates;
create policy "incident_updates_select_all"
  on public.incident_updates for select
  to public
  using (true);

-- -----------------------------------------------------------------------------
-- Write policies
-- -----------------------------------------------------------------------------
-- Insert: authenticated + not banned + author of the insert.
-- (Rate limit is enforced by a BEFORE INSERT trigger below so that a
-- single SELECT `count(*)` inside the policy is avoided on every row.)
drop policy if exists "incident_updates_insert_authenticated" on public.incident_updates;
create policy "incident_updates_insert_authenticated"
  on public.incident_updates for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not public.is_banned(auth.uid())
  );

-- Delete: only the author. Admin removal goes through a future
-- `admin_remove_update` RPC (SECURITY DEFINER) so it bypasses RLS and
-- leaves its own audit trail.
drop policy if exists "incident_updates_delete_own" on public.incident_updates;
create policy "incident_updates_delete_own"
  on public.incident_updates for delete
  to authenticated
  using (auth.uid() = user_id);

-- We intentionally do NOT expose UPDATE. Editing a follow-up comment
-- invalidates the chronology — if a user wants to correct something,
-- they post a new update. This is the same reasoning that freezes
-- `type` / `location` on `UpdateIncidentSchema`.

-- -----------------------------------------------------------------------------
-- Rate-limit trigger
-- -----------------------------------------------------------------------------
-- 5 updates per (user, incident) per rolling 24h. Raises a P0001 with
-- a stable message so the API layer can translate it to a friendly UX
-- error.
create or replace function public.enforce_incident_update_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_count int;
  v_limit int := 5;
begin
  select count(*)
    into v_count
    from public.incident_updates
   where user_id = new.user_id
     and incident_id = new.incident_id
     and created_at > now() - interval '24 hours';

  if v_count >= v_limit then
    raise exception 'RATE_LIMIT_UPDATES'
      using hint = v_limit::text,
            errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists incident_updates_rate_limit on public.incident_updates;
create trigger incident_updates_rate_limit
  before insert on public.incident_updates
  for each row execute function public.enforce_incident_update_rate_limit();

-- -----------------------------------------------------------------------------
-- Bump parent incident `updated_at` when a follow-up is posted.
-- -----------------------------------------------------------------------------
-- Lets clients that rely on `updated_at` (list sort, realtime diff
-- heuristics) know that something changed about the incident without
-- having to subscribe to a separate table.
create or replace function public.on_incident_update_change()
returns trigger
language plpgsql
as $$
begin
  update public.incidents
     set updated_at = now()
   where id = coalesce(new.incident_id, old.incident_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists incident_updates_bump_parent on public.incident_updates;
create trigger incident_updates_bump_parent
  after insert or delete on public.incident_updates
  for each row execute function public.on_incident_update_change();

-- -----------------------------------------------------------------------------
-- Read helper: list updates for an incident, newest first, with author.
-- -----------------------------------------------------------------------------
-- Keeps the client from having to join `profiles` itself and makes the
-- endpoint trivially RLS-safe: the helper is `security invoker` so the
-- caller's SELECT policies decide what they can see.
create or replace function public.list_incident_updates(
  p_incident_id uuid,
  p_limit int default 100
)
returns table (
  id uuid,
  incident_id uuid,
  user_id uuid,
  username text,
  body text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    u.id,
    u.incident_id,
    u.user_id,
    p.username,
    u.body,
    u.created_at
  from public.incident_updates u
  left join public.profiles p on p.id = u.user_id
  where u.incident_id = p_incident_id
  order by u.created_at asc
  limit greatest(1, least(p_limit, 500));
$$;

grant execute on function public.list_incident_updates(uuid, int) to anon, authenticated;
