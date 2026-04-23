-- =============================================================================
-- Author-edit audit
-- -----------------------------------------------------------------------------
-- When the author of an incident rewrites the title or description via the
-- UI (see `updateIncident` in `src/lib/incidents/api.ts`), that change is
-- invisible to moderators today: the update goes through plain RLS, not
-- through a SECURITY DEFINER RPC, so nothing ever lands in the audit log.
--
-- That's a real moderation gap. A common abuse pattern on community maps is
--   1. post something innocuous to collect upvotes,
--   2. once the incident reaches `validated`, edit it to spam / misleading
--      content that now carries the weight of a validated status.
-- Without an audit trail, a moderator reviewing a later report has no way
-- to see that the current content is not what the voters actually saw.
--
-- Fix: a lightweight `AFTER UPDATE` trigger on `public.incidents` that
-- writes a `moderation_actions` row whenever the editor is the row's own
-- author. Admin edits travel through the existing `admin_*` RPCs and are
-- logged explicitly there, so excluding `auth.uid() <> new.user_id` here
-- keeps the feed free of duplicates.
--
-- The diff is stored in `meta` as JSON so we don't have to schema-evolve
-- `moderation_actions` every time we expose a new editable field.
-- =============================================================================

-- Extend the allowed action vocabulary. `drop constraint` + `add constraint`
-- is the cleanest path on Postgres; `alter ... add check if not exists`
-- doesn't exist and re-using the same name without dropping first would
-- fail.
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
      'author_edit_incident'
    )
  );

-- -----------------------------------------------------------------------------
-- Trigger function
-- -----------------------------------------------------------------------------
-- `security definer` because RLS on `moderation_actions` forbids direct
-- inserts from `authenticated`. The function owner (postgres role) owns
-- the table, so the insert succeeds.
--
-- We compare both fields with `is distinct from` so NULL → value and
-- value → NULL both count as changes (normal `<>` would miss those).
create or replace function public.log_author_edit_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_changes jsonb := '{}'::jsonb;
begin
  -- Skip when the editor is not the author. Admin removals already
  -- emit their own audit rows via `admin_remove_incident`; bypassing
  -- them here avoids double-logging.
  if v_actor is null or v_actor <> new.user_id then
    return new;
  end if;

  if new.title is distinct from old.title then
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('from', old.title, 'to', new.title)
    );
  end if;

  if new.description is distinct from old.description then
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_object(
        'from', old.description,
        'to', new.description
      )
    );
  end if;

  -- Nothing the moderation team cares about changed (e.g. the trigger
  -- fired because `status` was flipped elsewhere and the UPDATE
  -- statement touched title/description with the same values).
  if v_changes = '{}'::jsonb then
    return new;
  end if;

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, meta
  ) values (
    v_actor, 'author_edit_incident', 'incident', new.id, v_changes
  );

  return new;
end;
$$;

-- Drop + recreate so migrations stay idempotent during dev.
drop trigger if exists incidents_log_author_edit on public.incidents;
create trigger incidents_log_author_edit
  after update of title, description on public.incidents
  for each row execute function public.log_author_edit_incident();
