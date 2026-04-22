-- =============================================================================
-- UPSERT RPC for push subscriptions
-- -----------------------------------------------------------------------------
-- The client sends lat/lng as numbers; Postgres stores a geography(Point).
-- Doing the conversion server-side keeps the browser from needing to know
-- anything about WKT/SRID and means we can validate the inputs with
-- PostgreSQL CHECK semantics rather than leaning on TS alone.
--
-- The RPC is the ONLY write path the client uses: `push_subscriptions`
-- has RLS that allows owner inserts, but funnelling through one RPC
-- simplifies observability, lets us evolve the shape without a
-- coordinated TS/SQL release, and keeps the geography conversion in
-- one place.
-- =============================================================================

create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer,
  p_min_severity text,
  p_enabled boolean default true
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.push_subscriptions;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Cheap server-side guardrails. Full domain validation lives in the
  -- column CHECKs (radius 1–500, severity enum, …) but a couple of
  -- friendly messages here beat a raw constraint violation bubbling
  -- up to the client.
  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 500 then
    raise exception 'radius_km must be between 1 and 500';
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'lat/lng out of range';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth,
    center, radius_km, min_severity, enabled
  )
  values (
    v_user, p_endpoint, p_p256dh, p_auth,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_radius_km, p_min_severity, p_enabled
  )
  on conflict (user_id, endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    center = excluded.center,
    radius_km = excluded.radius_km,
    min_severity = excluded.min_severity,
    enabled = excluded.enabled
  returning * into v_row;

  return v_row;
end;
$$;

-- Companion read RPC for the UI: returns the current subscription for
-- this user (if any) so the preferences panel can pre-populate.
-- Returns NULL for unsubscribed users, letting the client distinguish
-- "never opted in" from "opted in but disabled".
create or replace function public.get_my_push_subscription()
returns public.push_subscriptions
language sql
stable
security definer
set search_path = public
as $$
  select ps.*
  from public.push_subscriptions ps
  where ps.user_id = auth.uid()
  order by ps.updated_at desc
  limit 1
$$;

-- Deletes every subscription this user has. Used when the browser's
-- pushManager reports no subscription (logout, permission revoked).
-- Full wipe rather than targeted delete because endpoints can change
-- silently and we'd rather re-subscribe than accumulate stale rows.
create or replace function public.delete_my_push_subscriptions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where user_id = auth.uid()
$$;

grant execute on function public.upsert_push_subscription(
  text, text, text, double precision, double precision, integer, text, boolean
) to authenticated;
grant execute on function public.get_my_push_subscription() to authenticated;
grant execute on function public.delete_my_push_subscriptions() to authenticated;
