-- ----------------------------------------------------------------------------
-- Single-incident lookup RPC used for deep links (/incidents/[id]).
--
-- Mirrors the shape of `nearby_incidents` / `incidents_in_bbox` so the
-- client mapper (`rowToIncident`) works unchanged. Returns at most one
-- row; empty set means either the incident does not exist or it was
-- dismissed (hidden by RLS).
-- ----------------------------------------------------------------------------

create or replace function public.get_incident_by_id(p_id uuid)
returns table (
  id uuid,
  user_id uuid,
  type public.incident_type,
  severity public.severity_level,
  status public.incident_status,
  title text,
  description text,
  lng double precision,
  lat double precision,
  elevation_m numeric,
  upvotes integer,
  downvotes integer,
  score integer,
  media_count integer,
  user_vote smallint,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
)
language sql
stable
as $$
  select
    i.id,
    i.user_id,
    i.type,
    i.severity,
    i.status,
    i.title,
    i.description,
    st_x(i.location::geometry) as lng,
    st_y(i.location::geometry) as lat,
    i.elevation_m,
    i.upvotes,
    i.downvotes,
    i.score,
    i.media_count,
    v.vote as user_vote,
    i.created_at,
    i.updated_at,
    i.expires_at
  from public.incidents i
  left join public.incident_votes v
    on v.incident_id = i.id
   and v.user_id = auth.uid()
  where i.id = p_id
    and i.status <> 'dismissed';
$$;

grant execute on function public.get_incident_by_id(uuid) to anon, authenticated;
