-- =============================================================================
-- Audit log coverage for incident_updates
-- -----------------------------------------------------------------------------
-- Follow-up comments are a real abuse vector:
--   * Post something innocuous, wait for the incident to reach
--     `validated`, then flood the thread with spam/harassment that now
--     carries the weight of a validated incident card.
--   * Delete the spam the moment someone reports it, so the moderator
--     opens the thread and finds a blank queue.
--
-- Both create and delete are therefore worth logging. The stored body
-- is truncated to 200 chars so the activity feed stays readable even
-- when someone pastes a 500-char wall of text.
-- =============================================================================

-- Extend the allowed action vocabulary. Same pattern as migration
-- 00031: drop the old CHECK constraint, add a fresh one. Postgres has
-- no "add value to check constraint" primitive.
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
      'author_delete_update'
    )
  );

-- -----------------------------------------------------------------------------
-- Trigger helper: log create
-- -----------------------------------------------------------------------------
create or replace function public.log_incident_update_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_preview text := left(new.body, 200);
begin
  -- Defensive null-check: triggers fire in every context, and the
  -- audit row has NOT NULL on actor_id. If the insert ever happens
  -- outside a user session (admin SQL console, migrations) we skip
  -- logging rather than crash the insert.
  if v_actor is null then
    return new;
  end if;

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, meta
  ) values (
    v_actor,
    'author_create_update',
    'incident',
    new.incident_id,
    jsonb_build_object(
      'update_id', new.id,
      'body_preview', v_preview
    )
  );

  return new;
end;
$$;

drop trigger if exists incident_updates_log_create on public.incident_updates;
create trigger incident_updates_log_create
  after insert on public.incident_updates
  for each row execute function public.log_incident_update_created();

-- -----------------------------------------------------------------------------
-- Trigger helper: log delete
-- -----------------------------------------------------------------------------
-- BEFORE DELETE so `OLD.body` is still around to snapshot. We attribute
-- to `auth.uid()` rather than `old.user_id` so an admin-initiated
-- delete (once that RPC exists) records the admin as the actor while
-- still pointing at the original incident target for correlation.
create or replace function public.log_incident_update_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), old.user_id);
  v_preview text := left(old.body, 200);
begin
  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, meta
  ) values (
    v_actor,
    'author_delete_update',
    'incident',
    old.incident_id,
    jsonb_build_object(
      'update_id', old.id,
      'original_author_id', old.user_id,
      'body_preview', v_preview
    )
  );

  return old;
end;
$$;

drop trigger if exists incident_updates_log_delete on public.incident_updates;
create trigger incident_updates_log_delete
  before delete on public.incident_updates
  for each row execute function public.log_incident_update_deleted();
