-- ============================================================================
-- Automatic incident moderation: final, self-sustaining policy.
--
-- Goal: no one manually curates incidents. The community's votes plus
-- time decay should converge on a trustworthy map with zero admin cost.
--
-- Three independent signals combine to dismiss or validate an incident:
--
--   1. Wilson score lower bound (95% confidence) of the down/up ratio.
--      This is the statistically correct answer to "given N votes, what
--      is the real ratio in the worst case?". Small samples are naturally
--      de-weighted (2/2 downvotes does NOT dismiss; 10/11 does).
--
--   2. Absolute floor + ratio guard. Backup rule for when Wilson has not
--      fired yet but the signal is unambiguous:
--        downvotes >= 5  AND  downvotes > upvotes * 2
--      This also protects against long-tail neglect: a single-downvote
--      incident will not disappear just because it was never validated.
--
--   3. Time expiration (expires_at). Every incident is born with a TTL
--      based on its type and severity. Once expired it drops out of the
--      viewport RPCs and the map.
--
-- Severity asymmetry: dismissing a genuine `severe` incident (e.g.
-- avalanche, accident with injuries) is far more costly than keeping a
-- dubious one a bit longer, so the absolute floor and the minimum
-- sample size are doubled for `severe` rows. TTL, conversely, is
-- shortened for severe items so stale warnings age out fast.
--
-- All thresholds live as `montana.*` settings with safe fallbacks, so a
-- future tuning pass is a one-line SQL change, not a migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: float-valued setting lookup (mirror of montana_threshold, but
-- returning numeric so ratios and Wilson thresholds stay precise).
-- ----------------------------------------------------------------------------
create or replace function public.montana_threshold_num(key text, fallback numeric)
returns numeric
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
  return raw::numeric;
end;
$$;

-- ----------------------------------------------------------------------------
-- Wilson score lower bound of the binomial proportion at 95% confidence.
-- Returns 0 when there are no observations, so callers don't need a
-- special case for brand-new incidents.
-- ----------------------------------------------------------------------------
create or replace function public.wilson_lower_bound(p_pos integer, p_total integer)
returns numeric
language plpgsql
immutable
as $$
declare
  n       numeric := p_total;
  p_hat   numeric;
  z       constant numeric := 1.96;  -- 95% confidence
  z2      constant numeric := 1.96 * 1.96;
  denom   numeric;
  center  numeric;
  spread  numeric;
begin
  if n <= 0 then
    return 0;
  end if;

  p_hat  := p_pos::numeric / n;
  denom  := 1 + z2 / n;
  center := p_hat + z2 / (2 * n);
  spread := z * sqrt((p_hat * (1 - p_hat) + z2 / (4 * n)) / n);

  return (center - spread) / denom;
end;
$$;

-- ----------------------------------------------------------------------------
-- Default TTL per (type, severity).
--
-- Returns NULL for truly static features (water sources, shelters,
-- points of interest). These don't age out by time — a viewpoint doesn't
-- stop being a viewpoint unless the mountain collapses. If the feature
-- actually disappears (a spring runs dry, a refuge is torn down) the
-- community-moderation rules (Wilson + absolute floor) will still
-- dismiss the incident based on downvotes.
--
-- Transient hazards and logistics get finite TTLs scaled by severity.
-- ----------------------------------------------------------------------------
create or replace function public.default_incident_ttl(
  p_type public.incident_type,
  p_severity public.severity_level
)
returns interval
language plpgsql
immutable
as $$
declare
  base interval;
  mult numeric;
begin
  base := case p_type
    when 'accident'          then interval '12 hours'
    when 'weather_hazard'    then interval '24 hours'
    when 'wildlife'          then interval '3 days'
    when 'other'             then interval '14 days'
    when 'trail_blocked'     then interval '30 days'
    when 'detour'            then interval '30 days'
    -- Static features: never auto-expire; rely on votes for removal.
    when 'water_source'      then null
    when 'shelter'           then null
    when 'point_of_interest' then null
    else                          interval '14 days'
  end;

  if base is null then
    return null;
  end if;

  -- Severity modulates TTL in both directions:
  --   severe expires fastest (urgent & likely to be re-reported)
  --   mild lingers a bit longer (low signal, no hurry)
  mult := case p_severity
    when 'severe'   then 0.5
    when 'moderate' then 1.0
    when 'mild'     then 1.5
  end;

  return base * mult;
end;
$$;

-- ----------------------------------------------------------------------------
-- Populate expires_at on insert if the client did not supply one. This
-- means every existing insert path (RPC `create_incident`, direct inserts
-- during seeding, etc.) gets the TTL for free.
-- ----------------------------------------------------------------------------
create or replace function public.set_incident_expires_at()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is null then
    new.expires_at := coalesce(new.created_at, now())
                      + public.default_incident_ttl(new.type, new.severity);
  end if;
  return new;
end;
$$;

drop trigger if exists incidents_set_expires_at on public.incidents;
create trigger incidents_set_expires_at
  before insert on public.incidents
  for each row execute function public.set_incident_expires_at();

-- Backfill: any historical row without TTL gets one from today so the
-- map doesn't keep stale points around forever.
update public.incidents
   set expires_at = created_at + public.default_incident_ttl(type, severity)
 where expires_at is null;

-- ----------------------------------------------------------------------------
-- Replace the existing scorer. Wilson + absolute floor + severity
-- multiplier. The trigger wiring from `00003` still calls this function
-- by name, so no trigger change is needed.
-- ----------------------------------------------------------------------------
create or replace function public.recompute_incident_score(p_incident_id uuid)
returns void
language plpgsql
as $$
declare
  v_up            integer;
  v_down          integer;
  v_total         integer;
  v_severity      public.severity_level;
  v_status        public.incident_status;
  v_new_status    public.incident_status;

  -- Tunable thresholds (with safe defaults baked in as fallbacks).
  v_min_votes     integer := public.montana_threshold('min_votes_for_stats', 3);
  v_wilson_dis    numeric := public.montana_threshold_num('wilson_dismiss_threshold', 0.65);
  v_wilson_val    numeric := public.montana_threshold_num('wilson_validate_threshold', 0.65);
  v_abs_down      integer := public.montana_threshold('absolute_dismiss_downvotes', 5);
  v_abs_ratio     numeric := public.montana_threshold_num('absolute_dismiss_ratio', 2.0);

  -- Severity multiplier for the dismissal side. Keeps severe incidents
  -- harder to bury while leaving validation untouched.
  v_sev_mult      integer;
begin
  select
    coalesce(sum(case when vote =  1 then 1 else 0 end), 0),
    coalesce(sum(case when vote = -1 then 1 else 0 end), 0)
    into v_up, v_down
  from public.incident_votes
  where incident_id = p_incident_id;

  v_total := v_up + v_down;

  select status, severity
    into v_status, v_severity
    from public.incidents
   where id = p_incident_id;

  v_sev_mult := case when v_severity = 'severe' then 2 else 1 end;
  v_new_status := v_status;

  -- Validation: Wilson on upvotes. Severity does NOT make validation
  -- harder; we want genuine severe incidents confirmed fast.
  if v_status = 'pending'
     and v_total >= v_min_votes
     and public.wilson_lower_bound(v_up, v_total) >= v_wilson_val
  then
    v_new_status := 'validated';
  end if;

  -- Dismissal: only out of active states. Two independent triggers:
  --   A) Wilson lower bound on downvotes clears the threshold.
  --   B) Absolute floor + ratio pattern (down >= 5 AND down > up * 2).
  -- Both scale with severity so severe incidents need stronger evidence.
  if v_status in ('pending', 'validated')
     and (
       (
         v_total >= v_min_votes * v_sev_mult
         and public.wilson_lower_bound(v_down, v_total) >= v_wilson_dis
       )
       or (
         v_down >= v_abs_down * v_sev_mult
         and v_down::numeric > v_up::numeric * v_abs_ratio
       )
     )
  then
    v_new_status := 'dismissed';
  end if;

  update public.incidents
     set upvotes   = v_up,
         downvotes = v_down,
         score     = v_up - v_down,
         status    = v_new_status
   where id = p_incident_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rebuild the read RPCs so they honour expires_at. Signature is
-- unchanged, only the WHERE clause gains the freshness filter.
-- ----------------------------------------------------------------------------
drop function if exists public.nearby_incidents(
  double precision, double precision, integer,
  public.incident_type[], public.severity_level
);

create or replace function public.nearby_incidents(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer default 25000,
  p_types public.incident_type[] default null,
  p_min_severity public.severity_level default null
)
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
  where i.status in ('pending', 'validated')
    and (i.expires_at is null or i.expires_at > now())
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

drop function if exists public.incidents_in_bbox(
  double precision, double precision, double precision, double precision,
  public.incident_type[], public.severity_level, integer
);

create or replace function public.incidents_in_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_types public.incident_type[] default null,
  p_min_severity public.severity_level default null,
  p_limit integer default 500
)
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
  where i.status in ('pending', 'validated')
    and (i.expires_at is null or i.expires_at > now())
    and st_intersects(
      i.location,
      st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    )
    and (p_types is null or i.type = any(p_types))
    and (
      p_min_severity is null
      or (p_min_severity = 'mild')
      or (p_min_severity = 'moderate' and i.severity in ('moderate', 'severe'))
      or (p_min_severity = 'severe' and i.severity = 'severe')
    )
  order by i.created_at desc
  limit p_limit;
$$;

grant execute on function public.nearby_incidents(
  double precision, double precision, integer,
  public.incident_type[], public.severity_level
) to anon, authenticated;

grant execute on function public.incidents_in_bbox(
  double precision, double precision, double precision, double precision,
  public.incident_type[], public.severity_level, integer
) to anon, authenticated;
