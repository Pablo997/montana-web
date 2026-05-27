-- =============================================================================
-- Expose `notification_id` on the push fan-out
-- -----------------------------------------------------------------------------
-- The Edge Function ships one push per (subscription, incident) match.
-- We want the SW that handles the resulting `notificationclick` to be
-- able to mark the corresponding in-app feed entry as read so the bell
-- badge stays consistent with what the user just acted on.
--
-- The cleanest way to thread the right notification.id through is from
-- the database itself: LEFT JOIN the existing fan-out against the
-- `notifications` table on (user_id, incident_id). At the point the
-- Edge Function calls this RPC, `enqueue_inapp_notifications` has
-- already inserted the rows for THIS batch, so the join resolves to a
-- non-null id in the happy path.
--
-- LEFT JOIN (not INNER) is on purpose:
--   * If the enqueue failed for any reason (table missing, RLS quirk,
--     deploy ordering), pushes should still go out — they just won't
--     carry a notification_id and the SW will fall back to opening
--     the URL without the mark-read round-trip. Strictly better than
--     dropping the push entirely.
--   * Same applies if the user has push enabled but their in-app
--     subscription got pruned by a future feature.
-- =============================================================================

drop function if exists public.push_fanout_for_incidents(uuid[]);

create or replace function public.push_fanout_for_incidents(
  incident_ids uuid[]
)
returns table (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  incident_id uuid,
  incident_title text,
  incident_type text,
  incident_severity text,
  incident_lat double precision,
  incident_lng double precision,
  -- New: nullable. Populated when the matching in-app notification
  -- row exists at fan-out time, which is the normal case because the
  -- Edge Function enqueues feed rows BEFORE calling this RPC.
  notification_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with sev_rank(level, rank) as (
    values ('mild'::text, 1), ('moderate', 2), ('severe', 3)
  ),
  candidates as (
    select
      ps.id as subscription_id,
      ps.user_id,
      ps.endpoint,
      ps.p256dh,
      ps.auth,
      i.id as incident_id,
      i.title,
      i.type::text as type,
      i.severity::text as severity,
      i.created_at,
      st_y(i.location::geometry) as lat,
      st_x(i.location::geometry) as lng,
      sr_inc.rank as severity_rank
    from public.push_subscriptions ps
    join public.incidents i on i.id = any(incident_ids)
    join sev_rank sr_sub on sr_sub.level = ps.min_severity
    join sev_rank sr_inc on sr_inc.level = i.severity::text
    where ps.enabled
      and ps.center is not null
      and i.user_id <> ps.user_id
      and i.status in ('pending', 'validated')
      and sr_inc.rank >= sr_sub.rank
      and st_dwithin(ps.center, i.location, ps.radius_km * 1000)
      and (
        ps.last_push_at is null
        or ps.last_push_at + make_interval(secs => ps.min_push_interval_seconds) <= now()
      )
      -- Quiet hours gate (unchanged from migration 00036).
      and (
        ps.quiet_hours_start is null
        or (
          ps.quiet_hours_critical_override
          and i.severity::text = 'severe'
        )
        or not public.is_in_quiet_window(
          (now() at time zone coalesce(ps.quiet_hours_timezone, 'UTC'))::time,
          ps.quiet_hours_start,
          ps.quiet_hours_end
        )
      )
  ),
  picked as (
    -- Per-tick coalescing identical to 00025: at most one push per sub,
    -- favouring the most severe and tie-breaking by newest.
    select distinct on (subscription_id)
      subscription_id, user_id,
      endpoint, p256dh, auth,
      incident_id, title, type, severity, lat, lng
    from candidates
    order by subscription_id, severity_rank desc, created_at desc
  )
  select
    p.subscription_id,
    p.endpoint, p.p256dh, p.auth,
    p.incident_id, p.title, p.type, p.severity, p.lat, p.lng,
    n.id as notification_id
  from picked p
  left join public.notifications n
    on n.user_id = p.user_id
   and n.incident_id = p.incident_id
$$;

grant execute on function public.push_fanout_for_incidents(uuid[]) to service_role;
