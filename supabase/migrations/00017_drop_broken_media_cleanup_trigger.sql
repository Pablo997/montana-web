-- =============================================================================
-- Drop the broken incident_media_cleanup_storage trigger
-- -----------------------------------------------------------------------------
-- The trigger introduced in migration 00011 deletes rows from
-- `storage.objects` inside a BEFORE DELETE on `public.incident_media`.
-- Supabase has since started blocking direct SQL deletes on storage
-- tables with the error:
--   "Direct deletion from storage tables is not allowed. Use the Storage
--    API instead."
--
-- That turns *any* cascading delete that reaches `incident_media` into
-- a hard failure — including:
--   - Deleting a single incident from the author-actions menu.
--   - Deleting an account (auth.users → profiles → incidents →
--     incident_media via ON DELETE CASCADE).
--
-- The fix is to stop relying on this trigger and clean storage
-- explicitly from client code via the Storage API. See:
--   - `deleteIncident` in src/lib/incidents/api.ts
--   - `/api/me/delete` route handler
-- =============================================================================

drop trigger if exists incident_media_cleanup_storage on public.incident_media;
drop function if exists public.on_incident_media_deleted_cleanup_storage();
