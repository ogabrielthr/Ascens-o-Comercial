begin;

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  original_name text not null check (char_length(original_name) between 1 and 180),
  storage_path text not null,
  mime_type text not null check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);

create index payment_receipts_opportunity_created_idx
  on public.payment_receipts(opportunity_id, created_at desc);
create index payment_receipts_org_uploader_idx
  on public.payment_receipts(organization_id, uploaded_by, created_at desc);

alter table public.payment_receipts enable row level security;
alter table public.payment_receipts force row level security;

create policy payment_receipts_read_lead_scope on public.payment_receipts
for select to authenticated
using (
  exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = payment_receipts.opportunity_id
      and opportunity.organization_id = payment_receipts.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create policy payment_receipts_insert_lead_scope on public.payment_receipts
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = payment_receipts.opportunity_id
      and opportunity.organization_id = payment_receipts.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role, 'manager'::public.access_role,
    'commercial'::public.access_role, 'bdr'::public.access_role,
    'operations'::public.access_role, 'user'::public.access_role
  ])
);

create policy payment_receipts_delete_own_or_admin on public.payment_receipts
for delete to authenticated
using (
  uploaded_by = auth.uid()
  or app_private.has_role(organization_id, array['admin'::public.access_role])
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ascensao-receipts', 'ascensao-receipts', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy payment_receipts_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ascensao-receipts'
  and (storage.foldername(name))[2] = 'payment-receipts'
  and (storage.foldername(name))[4]::uuid = auth.uid()
  and exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = (storage.foldername(name))[3]::uuid
      and opportunity.organization_id = (storage.foldername(name))[1]::uuid
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create policy payment_receipts_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ascensao-receipts'
  and exists (
    select 1 from public.payment_receipts receipt
    join public.opportunities opportunity on opportunity.id = receipt.opportunity_id
    where receipt.storage_path = storage.objects.name
      and opportunity.organization_id = receipt.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create policy payment_receipts_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'ascensao-receipts'
  and (
    (storage.foldername(name))[4]::uuid = auth.uid()
    or app_private.has_role(
      (storage.foldername(name))[1]::uuid,
      array['admin'::public.access_role]
    )
  )
);

comment on table public.payment_receipts is
  'Metadados de comprovantes de pagamento privados; o binario permanece no Supabase Storage.';

commit;
