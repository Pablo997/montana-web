-- =============================================================================
-- Health-check RPC
-- -----------------------------------------------------------------------------
-- `public.health_ping()` is a zero-dependency probe for the
-- /api/health route. The Next.js handler calls it without credentials
-- to confirm that the PostgREST ↔ PgBouncer ↔ Postgres pipeline is
-- actually round-tripping, not just that the platform's HTTP layer
-- is up.
--
-- It intentionally does not:
--   * Touch any public table (which would drag RLS into the check).
--   * Use `now()` directly via the REST API (PostgREST doesn't expose
--     arbitrary built-ins).
--   * Return anything leaky. The string `ok` is enough; timestamps
--     come from the Next.js handler so the monitor sees the time of
--     the Edge Function, not the DB.
--
-- Granted to `anon` because uptime monitors don't sign in. The
-- function is SECURITY INVOKER (the default) so an unauthenticated
-- caller only gets to execute the literal SELECT.
-- =============================================================================

create or replace function public.health_ping()
returns text
language sql
stable
as $$
  select 'ok'::text;
$$;

revoke all on function public.health_ping() from public;
grant execute on function public.health_ping() to anon, authenticated;
