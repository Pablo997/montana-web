-- =============================================================================
-- Incident creation rate-limit
-- -----------------------------------------------------------------------------
-- Prevents abuse and accidental flooding (stuck UI retrying, bots, etc.)
-- by enforcing per-user quotas directly in Postgres. The BEFORE INSERT
-- trigger is the single source of truth so every write path (SDK, REST,
-- direct SQL) is guarded.
--
-- Limits (tunable via pg settings, see `app.rate_limit_hourly` /
-- `app.rate_limit_daily`; defaults fall back to these literals):
--   - 5 incidents per hour per user
--   - 30 incidents per day per user
--
-- Anonymous inserts (user_id is null) are allowed to bypass the check;
-- RLS already forbids them in the public schema.
-- =============================================================================

create or replace function public.enforce_incident_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hourly_limit integer := coalesce(
    nullif(current_setting('app.rate_limit_hourly', true), '')::int,
    5
  );
  daily_limit integer := coalesce(
    nullif(current_setting('app.rate_limit_daily', true), '')::int,
    30
  );
  hourly_count integer;
  daily_count integer;
begin
  if new.user_id is null then
    return new;
  end if;

  select count(*) into hourly_count
  from public.incidents
  where user_id = new.user_id
    and created_at > now() - interval '1 hour';

  if hourly_count >= hourly_limit then
    raise exception 'RATE_LIMIT_HOURLY'
      using
        errcode = 'P0001',
        hint = hourly_limit::text;
  end if;

  select count(*) into daily_count
  from public.incidents
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';

  if daily_count >= daily_limit then
    raise exception 'RATE_LIMIT_DAILY'
      using
        errcode = 'P0001',
        hint = daily_limit::text;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_rate_limit on public.incidents;
create trigger enforce_rate_limit
  before insert on public.incidents
  for each row execute function public.enforce_incident_rate_limit();
