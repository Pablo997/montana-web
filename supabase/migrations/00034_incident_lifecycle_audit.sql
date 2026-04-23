-- =============================================================================
-- Lifecycle audit for incidents + account deletion
-- -----------------------------------------------------------------------------
-- Closes the remaining gaps in the moderation audit trail:
--
--   * author_create_incident  — someone posts a new incident. We keep
--     a snapshot of title / type / severity so a moderator reviewing
--     a later removal / ban can see what was published.
--   * author_resolve_incident — author flips status to `resolved`.
--     Useful lifecycle context when investigating a report that was
--     filed before the author resolved it.
--   * author_delete_incident  — author hard-deletes their own row.
--     Without this, deletion leaves *no* trace since the incident
--     table is nuked on cascade.
--   * account_deleted         — user exercises GDPR right-to-erasure
--     via `delete_my_account`. One-shot, high-signal event.
--
-- Report creation deliberately stays out of this trail: reports are
-- already a first-class table with its own admin UI, logging them
-- twice would flood the feed without adding information.
--
-- As a prerequisite we also make `moderation_actions.actor_id` nullable
-- so the existing FK action (`on delete set null`) stops contradicting
-- the NOT NULL constraint. Otherwise, once a user deletes their account
-- their own audit rows would block the cascade — catastrophic for
-- GDPR compliance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Allow orphaned audit rows. Drop the NOT NULL; keep the FK with
-- `on delete set null` so historical actions survive the actor.
-- -----------------------------------------------------------------------------
alter table public.moderation_actions
  alter column actor_id drop not null;

-- -----------------------------------------------------------------------------
-- Extend the allowed action vocabulary.
-- -----------------------------------------------------------------------------
alter table public.moderation_actions
  drop constraint if exists moderation_actions_action_check;

alter table public.moderation_actions
  add constraint moderation_actions_action_check
  check (
    action in (
      'dismiss_report',
      'remove_incident',
      'restore_incident',
      'ban_user',
      'unban_user',
      'author_edit_incident',
      'author_create_update',
      'author_delete_update',
      'author_create_incident',
      'author_resolve_incident',
      'author_delete_incident',
      'account_deleted'
    )
  );

-- -----------------------------------------------------------------------------
-- AFTER INSERT ON incidents — log author_create_incident
-- -----------------------------------------------------------------------------
-- Skipped when auth.uid() is null (migrations, server-side seeds) so
-- we never crash on shell-initiated inserts.
create or replace function public.log_incident_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return new;
  end if;

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, meta
  ) values (
    v_actor,
    'author_create_incident',
    'incident',
    new.id,
    jsonb_build_object(
      'title', new.title,
      'type', new.type::text,
      'severity', new.severity::text
    )
  );

  return new;
end;
$$;

drop trigger if exists incidents_log_create on public.incidents;
create trigger incidents_log_create
  after insert on public.incidents
  for each row execute function public.log_incident_created();

-- -----------------------------------------------------------------------------
-- AFTER UPDATE OF status ON incidents — log author_resolve_incident
-- -----------------------------------------------------------------------------
-- Fires only when the caller is the row's author AND the new status is
-- `resolved` AND it wasn't already resolved (prevents duplicate rows on
-- accidental double-clicks).
create or replace function public.log_incident_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or v_actor <> new.user_id then
    return new;
  end if;
  if new.status::text <> 'resolved' or old.status::text = 'resolved' then
    return new;
  end if;

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, meta
  ) values (
    v_actor,
    'author_resolve_incident',
    'incident',
    new.id,
    jsonb_build_object(
      'title', new.title,
      'previous_status', old.status::text
    )
  );

  return new;
end;
$$;

drop trigger if exists incidents_log_resolve on public.incidents;
create trigger incidents_log_resolve
  after update of status on public.incidents
  for each row execute function public.log_incident_resolved();

-- -----------------------------------------------------------------------------
-- BEFORE DELETE ON incidents — log author_delete_incident
-- -----------------------------------------------------------------------------
-- BEFORE DELETE so OLD.* is still available for the snapshot. Admin
-- deletes should not go through this path (they use
-- `admin_remove_incident`, which does a soft-delete via status). If in
-- the future we expose an admin hard-delete, route it through its own
-- action name — not this one — so the feed stays unambiguous.
create or replace function public.log_incident_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), old.user_id);
  v_preview text := left(coalesce(old.description, ''), 200);
begin
  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, meta
  ) values (
    v_actor,
    'author_delete_incident',
    'incident',
    old.id,
    jsonb_build_object(
      'title', old.title,
      'type', old.type::text,
      'severity', old.severity::text,
      'status', old.status::text,
      'original_author_id', old.user_id,
      'description_preview', nullif(v_preview, '')
    )
  );

  return old;
end;
$$;

drop trigger if exists incidents_log_delete on public.incidents;
create trigger incidents_log_delete
  before delete on public.incidents
  for each row execute function public.log_incident_deleted();

-- -----------------------------------------------------------------------------
-- Rewire delete_my_account to emit an `account_deleted` audit row
-- -----------------------------------------------------------------------------
-- The INSERT happens *before* the cascade so the FK to profiles is
-- still satisfied at write time. When the cascade fires a moment later
-- the row survives with actor_id nullified (thanks to the drop NOT NULL
-- above), preserving the trail.
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

  select count(*) into incident_count
  from public.incidents
  where user_id = uid;

  -- Log BEFORE the cascade. The `meta` snapshot gives a moderator
  -- some way to recognise the user after the profile row is gone.
  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, meta
  ) values (
    uid,
    'account_deleted',
    'user',
    uid,
    jsonb_build_object(
      'incidents_deleted', incident_count,
      'username', (select username from public.profiles where id = uid)
    )
  );

  delete from storage.objects
  where owner = uid;

  delete from auth.users where id = uid;

  return incident_count;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
