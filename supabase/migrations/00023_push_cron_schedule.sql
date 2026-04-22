-- =============================================================================
-- Schedule the push-notify edge function
-- -----------------------------------------------------------------------------
-- We fan out notifications from a scheduled pg_cron job rather than from a
-- trigger on `incidents` because:
--   * Triggers hold the transaction open while making HTTP calls, which
--     in turn blocks the write of the incident itself. Moving the work
--     to a cron keeps inserts fast and decouples failures.
--   * The cron cursor (public.push_cron_state) lets us resume cleanly
--     across cold starts and retries without tracking delivery state
--     on the incidents table itself.
--
-- Configuration: the job reads two values from `ALTER DATABASE … SET`:
--   * app.settings.push_notify_url      — full URL of the edge function
--                                         (https://<ref>.supabase.co/functions/v1/push-notify)
--   * app.settings.push_cron_secret     — matches PUSH_CRON_SECRET in the
--                                         edge function env.
--
-- Set them once per environment; they're NOT in migrations because they
-- are per-deployment. See README for the exact SQL Editor snippet.
-- =============================================================================

-- Supabase ships the `pg_cron` and `pg_net` extensions pre-installed,
-- but enabling them is idempotent and keeps fresh projects working.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Unschedule a previous run of this job (if any) before re-adding it,
-- so re-running the migration is idempotent. cron.unschedule() throws
-- if the job doesn't exist, hence the exception handler.
do $$
begin
  perform cron.unschedule('push-notify-tick');
exception when others then
  null;
end;
$$;

-- Every minute is a good trade-off for a community reporting app: the
-- push arrives within ~30s on average, and we stay well within the
-- edge function and pg_net call budgets on the free tier.
select cron.schedule(
  'push-notify-tick',
  '* * * * *',
  $cron$
  select
    net.http_post(
      url := current_setting('app.settings.push_notify_url', true),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.push_cron_secret', true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
  where current_setting('app.settings.push_notify_url', true) is not null
    and current_setting('app.settings.push_cron_secret', true) is not null;
  $cron$
);
