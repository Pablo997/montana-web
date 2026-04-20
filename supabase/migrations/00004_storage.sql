-- ============================================================================
-- Storage buckets and policies for incident media
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('incident-media', 'incident-media', true)
on conflict (id) do nothing;

-- Public read
create policy "incident_media_public_read"
  on storage.objects for select
  using (bucket_id = 'incident-media');

-- Authenticated users can upload into their own folder:
-- convention: <user_id>/<incident_id>/<filename>
create policy "incident_media_authenticated_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'incident-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "incident_media_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'incident-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
