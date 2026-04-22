-- =============================================================================
-- Content moderation: user reports + auto-expiry
-- -----------------------------------------------------------------------------
-- Two independent but related capabilities:
--   1. `incident_reports` lets any authenticated user flag an incident for
--      review (spam, harassment, false info, …). An auto-hide trigger
--      dismisses an incident once enough independent reports accumulate,
--      buying time for a human review without blocking UX.
--   2. `expire_stale_incidents()` bulk-updates incidents past their
--      `expires_at`. Designed to be scheduled via pg_cron (see bottom of
--      file) so the map never shows ghost incidents.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- incident_reports
-- -----------------------------------------------------------------------------
create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  -- Free-text + check constraint instead of a dedicated enum: the list is
  -- likely to evolve (new legal categories, i18n-driven labels) and enum
  -- changes are expensive. A small CHECK gives us the same safety with
  -- none of the migration friction.
  reason text not null check (
    reason in ('spam', 'harassment', 'false_info', 'inappropriate', 'personal_data', 'other')
  ),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (
    status in ('open', 'reviewed', 'dismissed', 'actioned')
  ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

-- Prevents a single reporter from flooding the same incident with open
-- reports. Filtered index so once a report is reviewed the user can
-- submit a fresh one if the situation changes.
create unique index if not exists incident_reports_open_uniq
  on public.incident_reports (incident_id, reporter_user_id)
  where status = 'open';

create index if not exists incident_reports_incident_idx
  on public.incident_reports (incident_id);

create index if not exists incident_reports_status_idx
  on public.incident_reports (status);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.incident_reports enable row level security;

drop policy if exists "reports_insert_own" on public.incident_reports;
create policy "reports_insert_own"
  on public.incident_reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_user_id);

drop policy if exists "reports_select_own" on public.incident_reports;
create policy "reports_select_own"
  on public.incident_reports
  for select
  to authenticated
  using (auth.uid() = reporter_user_id);

-- No update/delete policies on purpose: the only legitimate writer after
-- creation is platform admin, which goes through the service role and
-- bypasses RLS by design.

-- -----------------------------------------------------------------------------
-- report_incident(): single entry-point for clients
-- -----------------------------------------------------------------------------
-- Goes through an RPC instead of a direct insert so we can:
--   * enforce "cannot report your own incident" (RLS can't see the incident row),
--   * enforce a daily cap per user (10 reports / 24h) to deter brigading,
--   * swallow duplicate-open reports silently (return existing id),
--   * keep the trigger payload server-generated (reporter = auth.uid()).
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

  select user_id into v_author from public.incidents where id = p_incident_id;
  if v_author is null then
    raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_author = v_user then
    raise exception 'CANNOT_REPORT_OWN' using errcode = 'P0001';
  end if;

  -- Global reporter quota: 10 / 24h. Cheap guardrail against a compromised
  -- account or a malicious script trying to mass-silence incidents.
  select count(*) into v_recent
  from public.incident_reports
  where reporter_user_id = v_user
    and created_at > now() - interval '24 hours';
  if v_recent >= 10 then
    raise exception 'REPORT_RATE_LIMIT' using errcode = 'P0001', hint = '10';
  end if;

  -- Idempotent: if the user already has an open report for this incident,
  -- return its id instead of raising. Keeps the UI simple (the same
  -- button always "succeeds").
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

-- -----------------------------------------------------------------------------
-- Auto-hide on reports
-- -----------------------------------------------------------------------------
-- When 5 distinct users report the same incident, we pre-emptively flip
-- it to `dismissed` so it drops off the map pending human review. We do
-- not delete the row: admin can restore by flipping status back to
-- `pending` / `validated` after reviewing.
--
-- Threshold chosen conservatively to avoid brigading: 5 independent
-- reports is already a strong signal for a community this size; tune
-- downwards once the user base grows.
create or replace function public.maybe_autohide_incident_on_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open int;
  v_current public.incident_status;
begin
  select count(*) into v_open
  from public.incident_reports
  where incident_id = new.incident_id and status = 'open';

  if v_open >= 5 then
    select status into v_current from public.incidents where id = new.incident_id;
    if v_current not in ('dismissed', 'resolved', 'expired') then
      update public.incidents
      set status = 'dismissed'
      where id = new.incident_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists autohide_incident_on_report on public.incident_reports;
create trigger autohide_incident_on_report
  after insert on public.incident_reports
  for each row execute function public.maybe_autohide_incident_on_report();

-- -----------------------------------------------------------------------------
-- expire_stale_incidents(): meant to be scheduled
-- -----------------------------------------------------------------------------
-- Flips any incident past its `expires_at` to status='expired'. Skips
-- already-terminal states to avoid churn. Returns the number of rows
-- affected for observability (pg_cron logs captures it automatically).
create or replace function public.expire_stale_incidents()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update public.incidents
  set status = 'expired'
  where expires_at is not null
    and expires_at < now()
    and status not in ('expired', 'dismissed', 'resolved');
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.expire_stale_incidents() to service_role;

-- -----------------------------------------------------------------------------
-- Schedule via pg_cron (optional, idempotent)
-- -----------------------------------------------------------------------------
-- `pg_cron` is pre-installed on Supabase but must be enabled per-project
-- under Database → Extensions. The DO block degrades gracefully when the
-- extension isn't enabled yet so the migration never blocks deploys.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Unschedule any previous version before re-creating so repeated
    -- migrations don't accumulate stale jobs.
    if exists (select 1 from cron.job where jobname = 'montana_expire_incidents') then
      perform cron.unschedule('montana_expire_incidents');
    end if;

    perform cron.schedule(
      'montana_expire_incidents',
      '*/15 * * * *',   -- every 15 minutes
      $cron$ select public.expire_stale_incidents(); $cron$
    );
  end if;
end;
$$;
