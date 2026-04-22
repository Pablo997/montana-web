-- =============================================================================
-- Ban enforcement on write paths
-- -----------------------------------------------------------------------------
-- Centralises the "banned users cannot create content" rule. We tighten
-- the existing RLS policies (incident insert, vote insert/update) and add
-- an early check inside `report_incident`. Read access stays unchanged —
-- banned users keep seeing the map so they know what's going on.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Incidents: banned users cannot create
-- -----------------------------------------------------------------------------
drop policy if exists "incidents_insert_authenticated" on public.incidents;
create policy "incidents_insert_authenticated"
  on public.incidents for insert
  with check (
    auth.uid() = user_id
    and not public.is_banned(auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Incident votes: banned users cannot vote (insert or update)
-- -----------------------------------------------------------------------------
drop policy if exists "incident_votes_upsert_self" on public.incident_votes;
create policy "incident_votes_upsert_self"
  on public.incident_votes for insert
  with check (
    auth.uid() = user_id
    and not public.is_banned(auth.uid())
    and exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and i.user_id <> auth.uid()
        and i.status in ('pending', 'validated')
    )
  );

drop policy if exists "incident_votes_update_self" on public.incident_votes;
create policy "incident_votes_update_self"
  on public.incident_votes for update
  using (
    auth.uid() = user_id
    and not public.is_banned(auth.uid())
  );

-- -----------------------------------------------------------------------------
-- report_incident(): reject banned reporters
-- -----------------------------------------------------------------------------
-- Rewrite of the function added in 00019. The only change is the early
-- `is_banned` check; the rest of the body is a verbatim copy so behaviour
-- is unchanged for legitimate users.
create or replace function public.report_incident(
  p_incident_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_author uuid;
  v_recent int;
  v_existing uuid;
  v_new_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if public.is_banned(v_user) then
    raise exception 'USER_BANNED' using errcode = '42501';
  end if;

  select user_id into v_author from public.incidents where id = p_incident_id;
  if v_author is null then
    raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_author = v_user then
    raise exception 'CANNOT_REPORT_OWN' using errcode = 'P0001';
  end if;

  select count(*) into v_recent
  from public.incident_reports
  where reporter_user_id = v_user
    and created_at > now() - interval '24 hours';
  if v_recent >= 10 then
    raise exception 'REPORT_RATE_LIMIT' using errcode = 'P0001', hint = '10';
  end if;

  select id into v_existing
  from public.incident_reports
  where incident_id = p_incident_id
    and reporter_user_id = v_user
    and status = 'open'
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.incident_reports (incident_id, reporter_user_id, reason, details)
  values (p_incident_id, v_user, p_reason, p_details)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.report_incident(uuid, text, text) to authenticated;
