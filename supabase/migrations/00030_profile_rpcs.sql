-- =============================================================================
-- Profile / "my stuff" RPCs
-- -----------------------------------------------------------------------------
-- The public `incidents_select_visible` RLS policy hides dismissed rows
-- from *everyone*, including the author. That's the right default for
-- the map, but makes a "my incidents" page impossible — the user would
-- never see the row that got moderated away.
--
-- These RPCs run as SECURITY DEFINER and filter strictly by `auth.uid()`,
-- so the author gets the full picture of their own content while RLS
-- stays intact for every other query path.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- my_stats() — small overview rendered above the list
-- -----------------------------------------------------------------------------
create or replace function public.my_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_total int;
  v_validated int;
  v_pending int;
  v_dismissed int;
  v_resolved int;
  v_score_sum int;
  v_open_reports int;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (where status = 'validated'),
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'dismissed'),
    count(*) filter (where status = 'resolved'),
    coalesce(sum(score), 0)
  into v_total, v_validated, v_pending, v_dismissed, v_resolved, v_score_sum
  from public.incidents
  where user_id = v_user;

  -- Reports currently open on the user's own content — a soft "are people
  -- upset with you?" indicator so the profile page can surface a warning.
  select count(*) into v_open_reports
  from public.incident_reports r
  join public.incidents i on i.id = r.incident_id
  where i.user_id = v_user and r.status = 'open';

  return jsonb_build_object(
    'total', v_total,
    'validated', v_validated,
    'pending', v_pending,
    'dismissed', v_dismissed,
    'resolved', v_resolved,
    'scoreSum', v_score_sum,
    'openReports', v_open_reports
  );
end;
$$;

grant execute on function public.my_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- my_incidents() — paginated list of the caller's own incidents
-- -----------------------------------------------------------------------------
-- Returns every status by default (including dismissed / expired) so the
-- user can audit their own history. `p_status` filters to a single state.
-- `open_reports_count` is aggregated per row so the UI can warn the user
-- that a given incident is currently being flagged.
create or replace function public.my_incidents(
  p_status text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  title text,
  type public.incident_type,
  severity public.severity_level,
  status public.incident_status,
  score int,
  upvotes int,
  downvotes int,
  media_count int,
  open_reports_count int,
  created_at timestamptz,
  expires_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select i.*
    from public.incidents i
    where i.user_id = v_user
      and (p_status is null or i.status::text = p_status)
  ),
  total as (select count(*) as n from filtered),
  reports_agg as (
    select r.incident_id, count(*)::int as open_count
    from public.incident_reports r
    where r.status = 'open'
    group by r.incident_id
  )
  select
    f.id,
    f.title,
    f.type,
    f.severity,
    f.status,
    f.score,
    f.upvotes,
    f.downvotes,
    f.media_count,
    coalesce(ra.open_count, 0),
    f.created_at,
    f.expires_at,
    (select n from total)
  from filtered f
  left join reports_agg ra on ra.incident_id = f.id
  order by f.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.my_incidents(text, int, int) to authenticated;
