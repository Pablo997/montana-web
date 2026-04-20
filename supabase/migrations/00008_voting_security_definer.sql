-- ============================================================================
-- Fix: let the voting trigger update incidents it does not own.
--
-- `recompute_incident_score` runs from a trigger fired by `incident_votes`
-- changes. It updates counters on `public.incidents`. Under RLS, the only
-- update policy on incidents is `incidents_update_own_pending`, which means
-- the trigger silently fails whenever a user votes on someone else's
-- incident — exactly the normal case.
--
-- Promote both functions to `security definer` and lock their search_path
-- so they can update any incident as intended without widening the surface
-- to arbitrary callers. The functions themselves are tightly scoped:
--   - `recompute_incident_score` only touches vote aggregates.
--   - `on_incident_vote_change` only forwards the incident id to the above.
-- ============================================================================

alter function public.recompute_incident_score(uuid)
  security definer
  set search_path = public;

alter function public.on_incident_vote_change()
  security definer
  set search_path = public;
