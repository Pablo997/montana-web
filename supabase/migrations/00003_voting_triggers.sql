-- ============================================================================
-- Voting triggers and automatic status transitions
-- ----------------------------------------------------------------------------
-- Thresholds are kept as settings so they can be tuned without a migration.
-- ============================================================================

-- Default thresholds (override with: select set_config('montana.validation_threshold','7',false);)
do $$
begin
  perform set_config('montana.validation_threshold', '5', false);
  perform set_config('montana.dismissal_threshold', '5', false);
end
$$;

create or replace function public.montana_threshold(key text, fallback integer)
returns integer
language plpgsql
stable
as $$
declare
  raw text;
begin
  raw := current_setting('montana.' || key, true);
  if raw is null or raw = '' then
    return fallback;
  end if;
  return raw::integer;
end;
$$;

-- ----------------------------------------------------------------------------
-- Recompute counters for a single incident and transition status if needed.
-- ----------------------------------------------------------------------------
create or replace function public.recompute_incident_score(p_incident_id uuid)
returns void
language plpgsql
as $$
declare
  v_up integer;
  v_down integer;
  v_status incident_status;
  v_new_status incident_status;
  v_val_threshold integer := public.montana_threshold('validation_threshold', 5);
  v_dis_threshold integer := public.montana_threshold('dismissal_threshold', 5);
begin
  select
    coalesce(sum(case when vote = 1 then 1 else 0 end), 0),
    coalesce(sum(case when vote = -1 then 1 else 0 end), 0)
    into v_up, v_down
  from public.incident_votes
  where incident_id = p_incident_id;

  select status into v_status from public.incidents where id = p_incident_id;
  v_new_status := v_status;

  if v_status = 'pending' and v_up >= v_val_threshold then
    v_new_status := 'validated';
  end if;

  if v_status in ('pending', 'validated') and v_down >= v_dis_threshold then
    v_new_status := 'dismissed';
  end if;

  update public.incidents
     set upvotes = v_up,
         downvotes = v_down,
         score = v_up - v_down,
         status = v_new_status
   where id = p_incident_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Trigger: whenever a vote row changes, recompute the incident aggregates.
-- ----------------------------------------------------------------------------
create or replace function public.on_incident_vote_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_incident_score(old.incident_id);
    return old;
  end if;

  perform public.recompute_incident_score(new.incident_id);
  return new;
end;
$$;

create trigger incident_votes_after_write
after insert or update or delete on public.incident_votes
for each row execute function public.on_incident_vote_change();

-- ----------------------------------------------------------------------------
-- RPC helper to create an incident from plain lng/lat pairs.
-- Avoids having to serialise WKT from the client.
-- ----------------------------------------------------------------------------
create or replace function public.create_incident(
  p_type incident_type,
  p_severity severity_level,
  p_title text,
  p_description text,
  p_lng double precision,
  p_lat double precision,
  p_elevation_m numeric default null
)
returns public.incidents
language plpgsql
security invoker
as $$
declare
  v_row public.incidents;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  insert into public.incidents (
    user_id, type, severity, title, description, location, elevation_m
  )
  values (
    auth.uid(),
    p_type,
    p_severity,
    p_title,
    p_description,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_elevation_m
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- Geospatial helper: nearby incidents for a given viewport / radius
-- ----------------------------------------------------------------------------
create or replace function public.nearby_incidents(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer default 25000,
  p_types incident_type[] default null,
  p_min_severity severity_level default null
)
returns setof public.incidents
language sql
stable
as $$
  select *
  from public.incidents i
  where i.status in ('pending', 'validated')
    and st_dwithin(
      i.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
    and (p_types is null or i.type = any(p_types))
    and (
      p_min_severity is null
      or (p_min_severity = 'mild')
      or (p_min_severity = 'moderate' and i.severity in ('moderate', 'severe'))
      or (p_min_severity = 'severe' and i.severity = 'severe')
    )
  order by i.created_at desc
  limit 500;
$$;
