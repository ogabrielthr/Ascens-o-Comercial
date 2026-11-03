begin;

drop policy if exists storage_files_read on storage.objects;
create policy storage_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ascensao-files'
  and exists (
    select 1 from public.files f
    where f.storage_path = storage.objects.name
      and f.organization_id = (storage.foldername(storage.objects.name))[1]::uuid
      and f.deleted_at is null
      and (
        f.access_level = 'organization'
        or f.uploaded_by = auth.uid()
        or (f.access_level = 'management' and app_private.has_role(f.organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
        or (f.access_level = 'finance' and app_private.has_role(f.organization_id, array['admin'::public.access_role,'finance'::public.access_role]))
        or (f.access_level = 'private' and f.uploaded_by = auth.uid())
      )
  )
);

commit;
