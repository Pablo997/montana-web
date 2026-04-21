-- =============================================================================
-- Fix delete_my_account: storage cleanup moved to client
-- -----------------------------------------------------------------------------
-- Supabase now blocks direct DELETE against `storage.objects` from SQL
-- ("Direct deletion from storage tables is not allowed. Use the Storage
-- API instead."). The UserMenu client flow is responsible for calling
-- `supabase.storage.from(bucket).remove([...])` before invoking this
-- RPC; here we just wipe the database rows, which cascades via FK.
-- =============================================================================

create or replace function public.delete_my_account()
returns integer
language plpgsql
security definer
set search_path = public, auth
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

  -- Dropping the auth.users row cascades to every public table with
  -- an `on delete cascade` FK (profiles → incidents, incident_votes,
  -- user_consents, etc.). Storage objects are removed client-side
  -- BEFORE this call via the Storage API.
  delete from auth.users where id = uid;

  return incident_count;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
