-- =============================================================================
-- Admin RPCs
-- -----------------------------------------------------------------------------
-- The single client-facing surface used by the `/admin` panel. Each function:
--   * starts with `ensure_admin()` so it fails closed for non-admins,
--   * writes to `moderation_actions` in the same transaction as the state
--     change (no partial audit trails),
--   * returns shapes the Next.js server components consume directly.
--
-- We could have done this as REST calls through the service-role key, but
-- keeping it in Postgres means RLS, typing and auditing all live next to
-- the data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admin_stats() — small JSON overview for the panel header
-- -----------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_open_reports int;
  v_banned int;
  v_incidents_today int;
  v_actions_24h int;
begin
  perform public.ensure_admin();

  select count(*) into v_open_reports
  from public.incident_reports where status = 'open';

  select count(*) into v_banned
  from public.user_bans
  where expires_at is null or expires_at > now();

  select count(*) into v_incidents_today
  from public.incidents
  where created_at >= date_trunc('day', now());

  select count(*) into v_actions_24h
  from public.moderation_actions
  where created_at > now() - interval '24 hours';

  return jsonb_build_object(
    'openReports', v_open_reports,
    'bannedUsers', v_banned,
    'incidentsToday', v_incidents_today,
    'actions24h', v_actions_24h
  );
end;
$$;

grant execute on function public.admin_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- admin_list_reports()
-- -----------------------------------------------------------------------------
-- Paginated list of reports joined with the incident and reporter so the
-- queue can render with a single round-trip. Defaults to `status='open'`;
-- pass NULL to see everything.
create or replace function public.admin_list_reports(
  p_status text default 'open',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  report_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reporter_id uuid,
  reporter_username text,
  incident_id uuid,
  incident_title text,
  incident_status public.incident_status,
  incident_type public.incident_type,
  incident_severity public.severity_level,
  incident_created_at timestamptz,
  incident_author_id uuid,
  incident_author_username text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.ensure_admin();

  return query
  with filtered as (
    select r.*
    from public.incident_reports r
    where p_status is null or r.status = p_status
  ),
  total as (select count(*) as n from filtered)
  select
    r.id,
    r.reason,
    r.details,
    r.status,
    r.created_at,
    r.reviewed_at,
    r.reporter_user_id,
    rp.username,
    r.incident_id,
    i.title,
    i.status,
    i.type,
    i.severity,
    i.created_at,
    i.user_id,
    ap.username,
    (select n from total)
  from filtered r
  join public.incidents i on i.id = r.incident_id
  left join public.profiles rp on rp.id = r.reporter_user_id
  left join public.profiles ap on ap.id = i.user_id
  order by r.created_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.admin_list_reports(text, int, int) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_dismiss_report()
-- -----------------------------------------------------------------------------
-- Marks a report as dismissed ("no action"). Idempotent when called on an
-- already-dismissed report — the audit row is still written so you can
-- see that the moderator reviewed it again.
create or replace function public.admin_dismiss_report(
  p_report_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.ensure_admin();

  if not exists (select 1 from public.incident_reports where id = p_report_id) then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.incident_reports
  set status = 'dismissed',
      reviewed_at = now(),
      reviewed_by = v_actor
  where id = p_report_id;

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, reason
  ) values (
    v_actor, 'dismiss_report', 'report', p_report_id, p_reason
  );
end;
$$;

grant execute on function public.admin_dismiss_report(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_remove_incident()
-- -----------------------------------------------------------------------------
-- Sets the incident to `dismissed` (hidden from the map) and flips every
-- open report on it to `actioned`. We deliberately don't hard-delete so
-- the audit trail keeps pointing at a real row.
create or replace function public.admin_remove_incident(
  p_incident_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_exists bool;
begin
  perform public.ensure_admin();

  select exists (select 1 from public.incidents where id = p_incident_id)
    into v_exists;
  if not v_exists then
    raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.incidents
  set status = 'dismissed'
  where id = p_incident_id
    and status not in ('dismissed', 'resolved');

  update public.incident_reports
  set status = 'actioned',
      reviewed_at = now(),
      reviewed_by = v_actor
  where incident_id = p_incident_id
    and status = 'open';

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, reason
  ) values (
    v_actor, 'remove_incident', 'incident', p_incident_id, p_reason
  );
end;
$$;

grant execute on function public.admin_remove_incident(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_restore_incident()
-- -----------------------------------------------------------------------------
-- Reverses a previous `remove` (or a community auto-dismissal). Flips the
-- status back to `pending` so the map layer picks it up again.
create or replace function public.admin_restore_incident(
  p_incident_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.ensure_admin();

  update public.incidents
  set status = 'pending'
  where id = p_incident_id
    and status = 'dismissed';

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, reason
  ) values (
    v_actor, 'restore_incident', 'incident', p_incident_id, p_reason
  );
end;
$$;

grant execute on function public.admin_restore_incident(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_ban_user()
-- -----------------------------------------------------------------------------
-- Creates (or refreshes) a ban row for the user. `p_duration` is optional:
-- NULL → permanent, otherwise the ban expires `now() + p_duration`.
-- Admins cannot ban themselves — small safety net against foot-guns.
create or replace function public.admin_ban_user(
  p_user_id uuid,
  p_reason text,
  p_duration interval default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_expires timestamptz := case when p_duration is null then null else now() + p_duration end;
begin
  perform public.ensure_admin();

  if p_user_id = v_actor then
    raise exception 'CANNOT_BAN_SELF' using errcode = 'P0001';
  end if;

  -- Can't ban another admin by accident: removing the admin flag first is a
  -- deliberate, separate action.
  if public.is_admin(p_user_id) then
    raise exception 'CANNOT_BAN_ADMIN' using errcode = 'P0001';
  end if;

  insert into public.user_bans (user_id, reason, banned_by, expires_at)
  values (p_user_id, p_reason, v_actor, v_expires)
  on conflict (user_id) do update
    set reason = excluded.reason,
        banned_by = excluded.banned_by,
        banned_at = now(),
        expires_at = excluded.expires_at;

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, reason, meta
  ) values (
    v_actor,
    'ban_user',
    'user',
    p_user_id,
    p_reason,
    jsonb_build_object('expiresAt', v_expires)
  );
end;
$$;

grant execute on function public.admin_ban_user(uuid, text, interval) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_unban_user()
-- -----------------------------------------------------------------------------
create or replace function public.admin_unban_user(
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.ensure_admin();

  delete from public.user_bans where user_id = p_user_id;

  insert into public.moderation_actions (
    actor_id, action, target_kind, target_id, reason
  ) values (
    v_actor, 'unban_user', 'user', p_user_id, p_reason
  );
end;
$$;

grant execute on function public.admin_unban_user(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_list_bans()
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_bans(
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  user_id uuid,
  username text,
  reason text,
  banned_at timestamptz,
  banned_by uuid,
  banned_by_username text,
  expires_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.ensure_admin();

  return query
  with total as (
    select count(*) as n from public.user_bans
    where expires_at is null or expires_at > now()
  )
  select
    b.user_id,
    up.username,
    b.reason,
    b.banned_at,
    b.banned_by,
    bp.username,
    b.expires_at,
    (select n from total)
  from public.user_bans b
  left join public.profiles up on up.id = b.user_id
  left join public.profiles bp on bp.id = b.banned_by
  where b.expires_at is null or b.expires_at > now()
  order by b.banned_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.admin_list_bans(int, int) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_list_actions()
-- -----------------------------------------------------------------------------
-- Paginated audit feed. Joins actor profile for rendering; target_kind /
-- target_id are left for the client to resolve on demand (keeps this RPC
-- cheap even for long histories).
create or replace function public.admin_list_actions(
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  actor_id uuid,
  actor_username text,
  action text,
  target_kind text,
  target_id uuid,
  reason text,
  meta jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.ensure_admin();

  return query
  with total as (select count(*) as n from public.moderation_actions)
  select
    a.id,
    a.actor_id,
    p.username,
    a.action,
    a.target_kind,
    a.target_id,
    a.reason,
    a.meta,
    a.created_at,
    (select n from total)
  from public.moderation_actions a
  left join public.profiles p on p.id = a.actor_id
  order by a.created_at desc
  limit greatest(1, least(p_limit, 500))
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.admin_list_actions(int, int) to authenticated;
