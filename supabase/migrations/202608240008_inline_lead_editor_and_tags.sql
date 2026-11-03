begin;

alter table public.tags
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.update_opportunity_details_v2(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_product_id uuid,
  p_bank_id uuid,
  p_source_id uuid,
  p_full_name text,
  p_cpf text,
  p_phone text,
  p_email text,
  p_city text,
  p_state text,
  p_amount numeric,
  p_total_value numeric,
  p_final_value numeric,
  p_requested_reversal numeric,
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

  if not found then
    raise exception 'opportunity not found' using errcode = 'P0002';
  end if;
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
  if opportunity_row.status = 'cancelled' then
    raise exception 'cancelled opportunities cannot be edited' using errcode = '23514';
  end if;
  if clean_name is null or char_length(clean_name) > 160 then
    raise exception 'valid contact name required' using errcode = '23514';
  end if;
  if clean_cpf is not null and char_length(clean_cpf) <> 11 then
    raise exception 'cpf must have 11 digits' using errcode = '23514';
  end if;
  if clean_phone is not null and char_length(clean_phone) not in (10, 11) then
    raise exception 'phone must have 10 or 11 digits' using errcode = '23514';
  end if;
  if clean_email is not null and clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid email required' using errcode = '23514';
  end if;
  if clean_state is not null and clean_state !~ '^[A-Z]{2}$' then
    raise exception 'state must have two letters' using errcode = '23514';
  end if;
  if p_amount is null or p_amount < 0
     or coalesce(p_total_value, 0) < 0
     or coalesce(p_final_value, 0) < 0
     or coalesce(p_requested_reversal, 0) < 0 then
    raise exception 'financial values must be non-negative' using errcode = '23514';
  end if;
  if not app_private.manages_user(opportunity_row.organization_id, p_owner_id) then
    raise exception 'owner is outside access scope' using errcode = '42501';
  end if;
  if p_bank_id is not null
     and not app_private.entity_in_org('public.banks', p_bank_id, opportunity_row.organization_id) then
    raise exception 'bank does not belong to organization' using errcode = '23514';
  end if;
  if p_source_id is not null
     and not app_private.entity_in_org('public.lead_sources', p_source_id, opportunity_row.organization_id) then
    raise exception 'source does not belong to organization' using errcode = '23514';
  end if;

  select p.name into product_name
  from public.products p
  where p.id = p_product_id
    and p.organization_id = opportunity_row.organization_id
    and p.active
    and p.deleted_at is null;
  if product_name is null then
    raise exception 'active product required' using errcode = '23514';
  end if;

  update public.contacts
  set full_name = clean_name,
      cpf = clean_cpf,
      phone = clean_phone,
      email = clean_email,
      city = nullif(trim(p_city), ''),
      state = clean_state,
      owner_id = p_owner_id,
      updated_at = now()
  where id = opportunity_row.contact_id
  returning * into contact_row;

  if not found then
    raise exception 'opportunity contact not found' using errcode = 'P0002';
  end if;

  update public.opportunities
  set owner_id = p_owner_id,
      product_id = p_product_id,
      bank_id = p_bank_id,
      source_id = p_source_id,
      title = product_name || ' - ' || split_part(clean_name, ' ', 1),
      amount = p_amount,
      total_value = p_total_value,
      final_value = p_final_value,
      requested_reversal = p_requested_reversal,
      expected_close_date = p_expected_close_date,
      notes = nullif(trim(p_notes), ''),
      version = version + 1,
      updated_at = now()
  where id = opportunity_row.id
  returning * into opportunity_row;

  return jsonb_build_object(
    'opportunity', to_jsonb(opportunity_row),
    'contact', to_jsonb(contact_row)
  );
end;
$$;

create or replace function public.save_tag(
  p_organization_id uuid,
  p_tag_id uuid,
  p_name text,
  p_color text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := nullif(trim(p_name), '');
  clean_color text := upper(coalesce(nullif(trim(p_color), ''), '#FF9800'));
  tag_row public.tags%rowtype;
begin
  if auth.uid() is null
     or not app_private.has_role(p_organization_id, array[
       'admin'::public.access_role, 'manager'::public.access_role,
       'commercial'::public.access_role, 'bdr'::public.access_role
     ]) then
    raise exception 'not allowed to manage tags' using errcode = '42501';
  end if;
  if clean_name is null or char_length(clean_name) > 40 then
    raise exception 'tag name must have between 1 and 40 characters' using errcode = '23514';
  end if;
  if clean_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'tag color must use #RRGGBB' using errcode = '23514';
  end if;

  if p_tag_id is null then
    insert into public.tags (organization_id, name, color, updated_at)
    values (p_organization_id, clean_name, clean_color, now())
    on conflict (organization_id, lower(name))
    do update set color = excluded.color, updated_at = now()
    returning * into tag_row;
  else
    update public.tags
    set name = clean_name, color = clean_color, updated_at = now()
    where id = p_tag_id and organization_id = p_organization_id
    returning * into tag_row;
    if not found then
      raise exception 'tag not found' using errcode = 'P0002';
    end if;
  end if;

  return to_jsonb(tag_row);
end;
$$;

create or replace function public.set_opportunity_tags(
  p_opportunity_id uuid,
  p_tag_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  result jsonb;
begin
  select * into opportunity_row
  from public.opportunities o
  where o.id = p_opportunity_id and o.deleted_at is null
  for update;

  if not found then
    raise exception 'opportunity not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null
     or not app_private.manages_user(opportunity_row.organization_id, opportunity_row.owner_id)
     or not app_private.has_role(opportunity_row.organization_id, array[
       'admin'::public.access_role, 'manager'::public.access_role,
       'commercial'::public.access_role, 'bdr'::public.access_role
     ]) then
    raise exception 'not allowed to update opportunity tags' using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_tag_ids, array[]::uuid[])) requested(id)
    left join public.tags t on t.id = requested.id
    where t.id is null or t.organization_id <> opportunity_row.organization_id
  ) then
    raise exception 'tag does not belong to opportunity organization' using errcode = '23514';
  end if;

  delete from public.opportunity_tags where opportunity_id = opportunity_row.id;
  insert into public.opportunity_tags (opportunity_id, tag_id)
  select opportunity_row.id, requested.id
  from (
    select distinct id
    from unnest(coalesce(p_tag_ids, array[]::uuid[])) requested(id)
  ) requested;

  select coalesce(jsonb_agg(to_jsonb(t) order by lower(t.name)), '[]'::jsonb)
  into result
  from public.tags t
  join public.opportunity_tags ot on ot.tag_id = t.id
  where ot.opportunity_id = opportunity_row.id;

  return result;
end;
$$;

revoke execute on function public.update_opportunity_details_v2(
  uuid, integer, uuid, uuid, uuid, uuid, text, text, text, text, text,
  text, numeric, numeric, numeric, numeric, date, text
) from public, anon;
grant execute on function public.update_opportunity_details_v2(
  uuid, integer, uuid, uuid, uuid, uuid, text, text, text, text, text,
  text, numeric, numeric, numeric, numeric, date, text
) to authenticated, service_role;

revoke execute on function public.save_tag(uuid, uuid, text, text) from public, anon;
grant execute on function public.save_tag(uuid, uuid, text, text) to authenticated, service_role;

revoke execute on function public.set_opportunity_tags(uuid, uuid[]) from public, anon;
grant execute on function public.set_opportunity_tags(uuid, uuid[]) to authenticated, service_role;

commit;
