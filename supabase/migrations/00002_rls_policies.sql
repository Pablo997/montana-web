-- ============================================================================
-- Row Level Security policies
-- Default deny: every policy must explicitly grant access.
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.incidents       enable row level security;
alter table public.incident_media  enable row level security;
alter table public.incident_votes  enable row level security;

-- ----------------------------------------------------------------------------
-- Profiles
-- ----------------------------------------------------------------------------
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Incidents
-- Anyone can read non-dismissed incidents; authors can edit their own
-- while still pending.
-- ----------------------------------------------------------------------------
create policy "incidents_select_visible"
  on public.incidents for select
  using (status <> 'dismissed');

create policy "incidents_insert_authenticated"
  on public.incidents for insert
  with check (auth.uid() = user_id);

create policy "incidents_update_own_pending"
  on public.incidents for update
  using (auth.uid() = user_id and status = 'pending');

create policy "incidents_delete_own"
  on public.incidents for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Media
-- ----------------------------------------------------------------------------
create policy "incident_media_select_all"
  on public.incident_media for select
  using (true);

create policy "incident_media_insert_author"
  on public.incident_media for insert
  with check (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id and i.user_id = auth.uid()
    )
  );

create policy "incident_media_delete_author"
  on public.incident_media for delete
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_id and i.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Votes
-- A user may vote on any visible incident but not on their own.
-- ----------------------------------------------------------------------------
create policy "incident_votes_select_all"
  on public.incident_votes for select
  using (true);

create policy "incident_votes_upsert_self"
  on public.incident_votes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and i.user_id <> auth.uid()
        and i.status in ('pending', 'validated')
    )
  );

create policy "incident_votes_update_self"
  on public.incident_votes for update
  using (auth.uid() = user_id);

create policy "incident_votes_delete_self"
  on public.incident_votes for delete
  using (auth.uid() = user_id);
