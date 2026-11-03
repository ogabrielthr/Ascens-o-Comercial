begin;

create or replace function public.update_opportunity_details(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_product_id uuid,
  p_bank_id uuid,
  p_source_id uuid,
  p_company_id uuid,
  p_full_name text,
  p_cpf text,
  p_phone text,
  p_email text,
  p_city text,
  p_state text,
  p_amount numeric,
  p_expected_close_date date,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  contact_row public.contacts%rowtype;
  clean_name text := nullif(trim(p_full_name), '');
  clean_cpf text := nullif(public.normalize_digits(p_cpf), '');
  clean_phone text := nullif(public.normalize_digits(p_phone), '');
  clean_email text := nullif(lower(trim(p_email)), '');
  clean_state text := nullif(upper(trim(p_state)), '');
  product_name text;
begin
  select * into opportunity_row
  from public.opportunities o
  where o.id = p_opportunity_id and o.deleted_at is null
  for update;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  if auth.uid() is null
     or not app_private.manages_user(opportunity_row.organization_id, opportunity_row.owner_id)
     or not app_private.has_role(opportunity_row.organization_id, array[
       'admin'::public.access_role, 'manager'::public.access_role,
       'commercial'::public.access_role, 'bdr'::public.access_role
     ]) then
    raise exception 'not allowed to update opportunity' using errcode = '42501';
  end if;
  if opportunity_row.version <> p_expected_version then
    raise exception 'opportunity changed by another user' using errcode = '40001';
  end if;
  if opportunity_row.status <> 'open' then
    raise exception 'only open opportunities can be edited' using errcode = '23514';
  end if;
  if clean_name is null or char_length(clean_name) > 160 then
    raise exception 'valid contact name required' using errcode = '23514';
  end if;
  if clean_cpf is not null and char_length(clean_cpf) <> 11 then
    raise exception 'cpf must have 11 digits' using errcode = '23514';
  end if;
  if clean_email is not null and clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid email required' using errcode = '23514';
  end if;
  if clean_state is not null and clean_state !~ '^[A-Z]{2}$' then
    raise exception 'state must have two letters' using errcode = '23514';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be non-negative' using errcode = '23514';
  end if;
  if not app_private.manages_user(opportunity_row.organization_id, p_owner_id) then
    raise exception 'owner is outside access scope' using errcode = '42501';
  end if;
  if p_company_id is not null and not app_private.entity_in_org('public.companies', p_company_id, opportunity_row.organization_id) then
    raise exception 'company does not belong to organization' using errcode = '23514';
  end if;
  if p_bank_id is not null and not app_private.entity_in_org('public.banks', p_bank_id, opportunity_row.organization_id) then
    raise exception 'bank does not belong to organization' using errcode = '23514';
  end if;
  if p_source_id is not null and not app_private.entity_in_org('public.lead_sources', p_source_id, opportunity_row.organization_id) then
    raise exception 'source does not belong to organization' using errcode = '23514';
  end if;
  select p.name into product_name from public.products p
  where p.id = p_product_id and p.organization_id = opportunity_row.organization_id
    and p.active and p.deleted_at is null;
  if product_name is null then raise exception 'active product required' using errcode = '23514'; end if;

  update public.contacts
  set full_name = clean_name, cpf = clean_cpf, phone = clean_phone,
      email = clean_email, city = nullif(trim(p_city), ''), state = clean_state,
      company_id = p_company_id, owner_id = p_owner_id, updated_at = now()
  where id = opportunity_row.contact_id
  returning * into contact_row;

  update public.opportunities
  set owner_id = p_owner_id, product_id = p_product_id, bank_id = p_bank_id,
      source_id = p_source_id, company_id = p_company_id,
      title = product_name || ' - ' || split_part(clean_name, ' ', 1),
      amount = p_amount, expected_close_date = p_expected_close_date,
      notes = nullif(trim(p_notes), ''), version = version + 1, updated_at = now()
  where id = opportunity_row.id
  returning * into opportunity_row;

  return jsonb_build_object('opportunity', to_jsonb(opportunity_row), 'contact', to_jsonb(contact_row));
end;
$$;

revoke execute on function public.update_opportunity_details(
  uuid, integer, uuid, uuid, uuid, uuid, uuid, text, text, text,
  text, text, text, numeric, date, text
) from public, anon;
grant execute on function public.update_opportunity_details(
  uuid, integer, uuid, uuid, uuid, uuid, uuid, text, text, text,
  text, text, text, numeric, date, text
) to authenticated, service_role;

commit;
