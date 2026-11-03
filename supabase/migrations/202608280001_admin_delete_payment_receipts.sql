begin;

-- Comprovantes sustentam a confirmação de uma venda. A remoção é uma ação
-- administrativa e auditada, independentemente de quem enviou o arquivo.
drop policy if exists payment_receipts_delete_own_or_admin on public.payment_receipts;
create policy payment_receipts_delete_admin_only on public.payment_receipts
for delete to authenticated
using (
  app_private.has_role(organization_id, array['admin'::public.access_role])
);

drop policy if exists payment_receipts_storage_delete on storage.objects;
create policy payment_receipts_storage_delete_admin_only on storage.objects
for delete to authenticated
using (
  bucket_id = 'ascensao-receipts'
  and app_private.has_role(
    (storage.foldername(name))[1]::uuid,
    array['admin'::public.access_role]
  )
);

create or replace function public.delete_payment_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt_row public.payment_receipts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into receipt_row
  from public.payment_receipts receipt
  where receipt.id = p_receipt_id
  for update;

  if not found then
    raise exception 'payment receipt not found' using errcode = 'P0002';
  end if;

  if not app_private.has_role(
    receipt_row.organization_id,
    array['admin'::public.access_role]
  ) then
    raise exception 'only administrators can delete payment receipts' using errcode = '42501';
  end if;

  delete from public.payment_receipts where id = receipt_row.id;

  insert into public.audit_logs
    (organization_id, actor_id, action, entity_type, entity_id, old_data)
  values
    (receipt_row.organization_id, auth.uid(), 'delete',
     'payment_receipts', receipt_row.id, to_jsonb(receipt_row));

  return jsonb_build_object(
    'id', receipt_row.id,
    'organization_id', receipt_row.organization_id,
    'opportunity_id', receipt_row.opportunity_id,
    'storage_path', receipt_row.storage_path,
    'original_name', receipt_row.original_name
  );
end;
$$;

revoke execute on function public.delete_payment_receipt(uuid) from public, anon;
grant execute on function public.delete_payment_receipt(uuid) to authenticated, service_role;

comment on function public.delete_payment_receipt(uuid) is
  'Exclui metadados de um comprovante somente para administradores e registra a ação na auditoria.';

commit;
