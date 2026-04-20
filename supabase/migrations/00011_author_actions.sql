-- ----------------------------------------------------------------------------
-- Author actions: let the reporter resolve or delete their own incidents.
--
-- The original `incidents_update_own_pending` policy froze the row as soon
-- as it received enough upvotes to become `validated`, which made it
-- impossible for the author to ever mark it as `resolved`. We widen the
-- policy to cover the full lifecycle — the author remains the only role
-- allowed to mutate their own incidents, and status transitions are
-- controlled from the API surface (`resolveIncident`).
--
-- Auto-dismissal on sustained downvotes already exists in
-- `00003_voting_triggers.sql` via `dismissal_threshold` (defaults to 5
-- downvotes). No additional trigger is needed here.
-- ----------------------------------------------------------------------------

drop policy if exists "incidents_update_own_pending" on public.incidents;

create policy "incidents_update_own"
  on public.incidents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Storage cleanup on media deletion.
--
-- Deleting an incident cascades into `incident_media`, but the blobs
-- referenced by `storage_path` would otherwise remain in the bucket
-- forever. This trigger removes the object alongside the row so both
-- the explicit "delete photo" flow (future) and the cascade from an
-- incident deletion keep Storage in sync.
--
-- SECURITY DEFINER + search_path hardening: `storage.objects` enforces
-- its own RLS and the caller may not have matching policies at the
-- moment the cascade fires (e.g. the incident row is already gone),
-- so we elevate the privileges to the function owner for this single
-- targeted delete.
-- ----------------------------------------------------------------------------

create or replace function public.on_incident_media_deleted_cleanup_storage()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
   where bucket_id = 'incident-media'
     and name = old.storage_path;
  return old;
end;
$$;

drop trigger if exists incident_media_cleanup_storage on public.incident_media;
create trigger incident_media_cleanup_storage
  before delete on public.incident_media
  for each row execute function public.on_incident_media_deleted_cleanup_storage();
