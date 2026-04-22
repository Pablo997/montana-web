-- =============================================================================
-- admin_list_incidents()
-- -----------------------------------------------------------------------------
-- Lets the `/admin/incidents` tab browse every incident in the system,
-- including the dismissed / resolved ones that the public map hides.
--
-- Intentionally kept separate from the existing `/admin` (reports) flow:
--   - The reports queue is reactive — moderators react to user flags.
--   - This endpoint is proactive — moderators can audit the map at any time,
--     spot problematic content before anyone reports it, and act on it.
--
-- Filters:
--   * p_status: exact status match, NULL = all.
--   * p_search: case-insensitive substring match on title / description.
--   * p_limit / p_offset: standard pagination with a hard cap at 200.
-- =============================================================================

create or replace function public.admin_list_incidents(
  p_status text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  title text,
  type public.incident_type,
  severity public.severity_level,
  status public.incident_status,
  author_id uuid,
  author_username text,
  open_reports_count int,
  score int,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform public.ensure_admin();

  return query
  with filtered as (
    select i.*
    from public.incidents i
    where (p_status is null or i.status::text = p_status)
      and (
        v_search is null
        or i.title ilike '%' || v_search || '%'
        or coalesce(i.description, '') ilike '%' || v_search || '%'
      )
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
    f.user_id,
    p.username,
    coalesce(ra.open_count, 0),
    f.score,
    f.created_at,
    (select n from total)
  from filtered f
  left join public.profiles p on p.id = f.user_id
  left join reports_agg ra on ra.incident_id = f.id
  order by f.created_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.admin_list_incidents(text, text, int, int) to authenticated;
