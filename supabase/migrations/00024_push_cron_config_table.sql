-- =============================================================================
-- Switch the push cron over to a config table
-- -----------------------------------------------------------------------------
-- Supabase's managed Postgres does NOT grant the `role_superuser`
-- privilege that `ALTER DATABASE … SET app.settings.*` requires, so
-- the approach in 00023 doesn't actually work on hosted projects.
--
-- Instead we keep the cron values in a one-row private table. Only
-- service_role can read/write it, so the secret is as protected as
-- any other DB secret we already trust Supabase with. The cron job
-- runs under the `postgres` role which can read the table directly.
-- =============================================================================

create schema if not exists private;

-- Single-row config. CHECK (id = 1) keeps us from accidentally
-- ending up with multiple rows after a botched re-insert.
create table if not exists private.push_cron_config (
  id smallint primary key default 1 check (id = 1),
  notify_url text not null,
  cron_secret text not null,
  updated_at timestamptz not null default now()
);

-- Lock it down. RLS isn't the primary defence (the table lives in a
-- schema anon/authenticated can't reach), but we enable it + forbid
-- all policies so even a future misconfig can't leak the secret.
alter table private.push_cron_config enable row level security;
revoke all on schema private from anon, authenticated;
revoke all on private.push_cron_config from anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.push_cron_config to service_role;

-- Re-schedule the cron to read from the table. Keeping the jobname
-- the same as 00023 so `cron.unschedule` replaces the old one.
do $$
begin
  perform cron.unschedule('push-notify-tick');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'push-notify-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := cfg.notify_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  from private.push_cron_config cfg
  where cfg.id = 1;
  $cron$
);
