-- =============================================================================
-- User consents + account deletion
-- -----------------------------------------------------------------------------
-- GDPR / LOPDGDD require the data controller to demonstrate consent
-- (art. 7.1 GDPR). We keep a durable, server-side record of every
-- consent acceptance so we can prove *when*, *which version* and by
-- *whom* a user accepted the policies. localStorage alone would not
-- survive device changes and cannot be trusted as evidence.
--
-- `delete_my_account()` implements the right to erasure (art. 17 GDPR).
-- It runs as SECURITY DEFINER because `auth.users` can only be mutated
-- by privileged roles. User-owned rows in public.* cascade via their
-- existing FK constraints (ON DELETE CASCADE) when we drop the auth
-- row. Storage objects are also removed in the same transaction so
-- no orphan media is left behind.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_consents table
-- -----------------------------------------------------------------------------
create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Version of the policy bundle accepted. Bump this string in the
  -- client whenever Privacy / Terms / Cookies get a material change
  -- so we can require re-acceptance.
  version text not null,
  accepted_at timestamptz not null default now(),
  user_agent text,
  ip_address inet
);

create unique index if not exists user_consents_user_version_uidx
  on public.user_consents (user_id, version);

alter table public.user_consents enable row level security;

-- Users can read their own consent history (subject access, art. 15).
drop policy if exists user_consents_select_own on public.user_consents;
create policy user_consents_select_own
  on public.user_consents for select
  using (auth.uid() = user_id);

-- Inserts are done through the SECURITY DEFINER RPC below. Direct
-- client inserts are forbidden so user_agent / ip_address can't be
-- spoofed easily.
drop policy if exists user_consents_insert_blocked on public.user_consents;
create policy user_consents_insert_blocked
  on public.user_consents for insert
  with check (false);

-- -----------------------------------------------------------------------------
-- 2. record_consent RPC
-- -----------------------------------------------------------------------------
create or replace function public.record_consent(
  p_version text,
  p_user_agent text default null
)
returns public.user_consents
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  result public.user_consents;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_version is null or length(trim(p_version)) = 0 then
    raise exception 'Version is required' using errcode = '22023';
  end if;

  insert into public.user_consents (user_id, version, user_agent)
  values (uid, p_version, p_user_agent)
  on conflict (user_id, version) do update
    set accepted_at = public.user_consents.accepted_at
  returning * into result;

  return result;
end;
$$;

revoke all on function public.record_consent(text, text) from public;
grant execute on function public.record_consent(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. delete_my_account RPC
-- -----------------------------------------------------------------------------
-- Hard-deletes the authenticated user's account plus every row that
-- references their user_id. Incident media in Storage is removed
-- first so the objects don't outlive their DB metadata.
--
-- The function returns the number of incidents deleted so the UI can
-- show a confirmation toast.
create or replace function public.delete_my_account()
returns integer
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  uid uuid := auth.uid();
  incident_count integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Count incidents for the response before we wipe them.
  select count(*) into incident_count
  from public.incidents
  where user_id = uid;

  -- Remove all storage objects owned by this user. The `owner`
  -- column in storage.objects tracks the uploader's auth.uid().
  delete from storage.objects
  where owner = uid;

  -- Dropping the auth.users row cascades to every public table that
  -- has `on delete cascade` on its user_id FK (incidents, votes,
  -- user_consents, moderation_actions, ...). If a future table
  -- forgets the cascade, this delete will raise and we'll notice
  -- immediately instead of silently leaving orphans.
  delete from auth.users where id = uid;

  return incident_count;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
