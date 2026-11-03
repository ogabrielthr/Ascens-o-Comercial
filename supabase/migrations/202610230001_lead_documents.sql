begin;

create table public.lead_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  original_name text not null check (char_length(original_name) between 1 and 180),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);

create index lead_documents_opportunity_created_idx
  on public.lead_documents(opportunity_id, created_at desc);
create index lead_documents_org_uploader_idx
  on public.lead_documents(organization_id, uploaded_by, created_at desc);

alter table public.lead_documents enable row level security;
alter table public.lead_documents force row level security;

create policy lead_documents_read_lead_scope on public.lead_documents
for select to authenticated
using (
  exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = lead_documents.opportunity_id
      and opportunity.organization_id = lead_documents.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create policy lead_documents_insert_lead_scope on public.lead_documents
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (string_to_array(storage_path, '/'))[1] = organization_id::text
  and (string_to_array(storage_path, '/'))[2] = 'documents'
  and (string_to_array(storage_path, '/'))[3] = opportunity_id::text
  and (string_to_array(storage_path, '/'))[4] = auth.uid()::text
  and exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = lead_documents.opportunity_id
      and opportunity.organization_id = lead_documents.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role, 'manager'::public.access_role,
    'commercial'::public.access_role, 'bdr'::public.access_role,
    'operations'::public.access_role, 'user'::public.access_role
  ])
);


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ascensao-documents', 'ascensao-documents', false, 52428800,
  null
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy lead_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ascensao-documents'
  and (storage.foldername(name))[2] = 'documents'
  and (storage.foldername(name))[4]::uuid = auth.uid()
  and exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = (storage.foldername(name))[3]::uuid
      and opportunity.organization_id = (storage.foldername(name))[1]::uuid
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create policy lead_documents_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ascensao-documents'
  and exists (
    select 1 from public.lead_documents receipt
    join public.opportunities opportunity on opportunity.id = receipt.opportunity_id
    where receipt.storage_path = storage.objects.name
      and opportunity.organization_id = receipt.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create policy lead_documents_storage_cleanup on storage.objects
for delete to authenticated using (
  bucket_id = 'ascensao-documents'
  and (storage.foldername(name))[4] = auth.uid()::text
  and not exists (select 1 from public.lead_documents d where d.storage_path = storage.objects.name)
);

comment on table public.lead_documents is
  'Documentos privados do lead; nao substituem comprovantes de pagamento.';

grant select, insert on public.lead_documents to authenticated;

commit;
