begin;

create or replace function public.create_opportunity(
  p_organization_id uuid,
  p_owner_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_product_id uuid,
  p_bank_id uuid,
  p_source_id uuid,
  p_full_name text,
  p_phone text default null,
  p_cpf text default null,
  p_amount numeric default 0,
  p_expected_close_date date default null,
  p_notes text default null,
  p_company_id uuid default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  contact_row public.contacts%rowtype;
  opportunity_row public.opportunities%rowtype;
  clean_name text := nullif(trim(p_full_name), '');
  clean_phone text := nullif(public.normalize_digits(p_phone), '');
  clean_cpf text := nullif(public.normalize_digits(p_cpf), '');
  product_name text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if clean_name is null or char_length(clean_name) > 160 then
    raise exception 'valid contact name required' using errcode = '23514';
  end if;
  if clean_cpf is not null and char_length(clean_cpf) <> 11 then
    raise exception 'cpf must have 11 digits' using errcode = '23514';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be non-negative' using errcode = '23514';
  end if;
  if not app_private.manages_user(p_organization_id, p_owner_id)
     or not app_private.has_role(p_organization_id, array[
       'admin'::public.access_role, 'manager'::public.access_role,
       'commercial'::public.access_role, 'bdr'::public.access_role
     ]) then
    raise exception 'not allowed to create opportunity for this owner' using errcode = '42501';
  end if;

  if clean_cpf is not null then
    select * into contact_row
    from public.contacts c
    where c.organization_id = p_organization_id
      and c.cpf = clean_cpf
      and c.deleted_at is null
    limit 1
    for update;
  end if;

  if contact_row.id is null then
    insert into public.contacts
      (organization_id, full_name, cpf, phone, company_id, owner_id, created_by)
    values
      (p_organization_id, clean_name, clean_cpf, clean_phone, p_company_id, p_owner_id, auth.uid())
    returning * into contact_row;
  else
    update public.contacts
    set full_name = clean_name,
        phone = coalesce(clean_phone, phone),
        company_id = coalesce(p_company_id, company_id),
        owner_id = p_owner_id,
        updated_at = now()
    where id = contact_row.id
    returning * into contact_row;
  end if;

  select p.name into product_name
  from public.products p
  where p.id = p_product_id
    and p.organization_id = p_organization_id
    and p.active and p.deleted_at is null;
  if product_name is null then
    raise exception 'active product required' using errcode = '23514';
  end if;

  insert into public.opportunities
    (organization_id, contact_id, company_id, pipeline_id, stage_id,
     product_id, bank_id, source_id, owner_id, title, amount,
     expected_close_date, notes, created_by)
  values
    (p_organization_id, contact_row.id, p_company_id, p_pipeline_id, p_stage_id,
     p_product_id, p_bank_id, p_source_id, p_owner_id,
     product_name || ' - ' || split_part(clean_name, ' ', 1), p_amount,
     p_expected_close_date, nullif(trim(p_notes), ''), auth.uid())
  returning * into opportunity_row;

  return opportunity_row;
end;
$$;

revoke execute on function public.create_opportunity(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text,
  numeric, date, text, uuid
) from public, anon;
grant execute on function public.create_opportunity(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text,
  numeric, date, text, uuid
) to authenticated, service_role;

commit;