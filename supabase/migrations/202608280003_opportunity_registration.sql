begin;

alter table public.opportunities
  add column registration_number text
  check (registration_number is null or char_length(registration_number) between 1 and 60);

create index opportunities_org_registration_idx
  on public.opportunities(organization_id, registration_number)
  where deleted_at is null and registration_number is not null;

create or replace function public.set_opportunity_registration(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_registration_number text default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  clean_registration text := nullif(trim(p_registration_number), '');
begin
  select * into opportunity_row
  from public.opportunities opportunity
  where opportunity.id = p_opportunity_id and opportunity.deleted_at is null
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
  if clean_registration is not null and char_length(clean_registration) > 60 then
    raise exception 'registration number must have at most 60 characters' using errcode = '23514';
  end if;

  if opportunity_row.registration_number is not distinct from clean_registration then
    return opportunity_row;
  end if;

  update public.opportunities
  set registration_number = clean_registration, version = version + 1, updated_at = now()
  where id = opportunity_row.id
  returning * into opportunity_row;
  return opportunity_row;
end;
$$;

revoke execute on function public.set_opportunity_registration(uuid, integer, text) from public, anon;
grant execute on function public.set_opportunity_registration(uuid, integer, text) to authenticated, service_role;

create or replace function public.create_opportunity_v3(
  p_organization_id uuid,
  p_owner_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_product_id uuid,
  p_convention_id uuid,
  p_registration_number text,
  p_bank_id uuid,
  p_source_id uuid,
  p_full_name text,
  p_phone text default null,
  p_cpf text default null,
  p_amount numeric default 0,
  p_total_value numeric default null,
  p_final_value numeric default null,
  p_requested_reversal numeric default null,
  p_expected_close_date date default null,
  p_notes text default null,
  p_company_id uuid default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare opportunity_row public.opportunities%rowtype;
begin
  opportunity_row := public.create_opportunity_v2(
    p_organization_id, p_owner_id, p_pipeline_id, p_stage_id, p_product_id,
    p_convention_id, p_bank_id, p_source_id, p_full_name, p_phone, p_cpf,
    p_amount, p_total_value, p_final_value, p_requested_reversal,
    p_expected_close_date, p_notes, p_company_id
  );
  opportunity_row := public.set_opportunity_registration(
    opportunity_row.id, opportunity_row.version, p_registration_number
  );
  return opportunity_row;
end;
$$;

revoke execute on function public.create_opportunity_v3(
  uuid, uuid, uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric, date, text, uuid
) from public, anon;
grant execute on function public.create_opportunity_v3(
  uuid, uuid, uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric, date, text, uuid
) to authenticated, service_role;

create or replace function public.update_opportunity_details_v4(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_product_id uuid,
  p_convention_id uuid,
  p_registration_number text,
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
  update_result jsonb;
  opportunity_row public.opportunities%rowtype;
begin
  update_result := public.update_opportunity_details_v3(
    p_opportunity_id, p_expected_version, p_owner_id, p_product_id,
    p_convention_id, p_bank_id, p_source_id, p_full_name, p_cpf, p_phone,
    p_email, p_city, p_state, p_amount, p_total_value, p_final_value,
    p_requested_reversal, p_expected_close_date, p_notes
  );
  opportunity_row := public.set_opportunity_registration(
    p_opportunity_id,
    (update_result -> 'opportunity' ->> 'version')::integer,
    p_registration_number
  );
  return jsonb_set(update_result, '{opportunity}', to_jsonb(opportunity_row), false);
end;
$$;

revoke execute on function public.update_opportunity_details_v4(
  uuid, integer, uuid, uuid, uuid, text, uuid, uuid, text, text, text,
  text, text, text, numeric, numeric, numeric, numeric, date, text
) from public, anon;
grant execute on function public.update_opportunity_details_v4(
  uuid, integer, uuid, uuid, uuid, text, uuid, uuid, text, text, text,
  text, text, text, numeric, numeric, numeric, numeric, date, text
) to authenticated, service_role;

create or replace function app_private.record_opportunity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_set jsonb;
  history_type text;
begin
  if tg_op = 'INSERT' then
    insert into public.opportunity_change_history (
      organization_id, opportunity_id, changed_by, event_type, changes, changed_at
    ) values (
      new.organization_id, new.id, coalesce(auth.uid(), new.created_by), 'created',
      jsonb_build_object(
        'stage_id', jsonb_build_object('old', null, 'new', to_jsonb(new.stage_id)),
        'owner_id', jsonb_build_object('old', null, 'new', to_jsonb(new.owner_id)),
        'product_id', jsonb_build_object('old', null, 'new', to_jsonb(new.product_id)),
        'convention_id', jsonb_build_object('old', null, 'new', to_jsonb(new.convention_id)),
        'registration_number', jsonb_build_object('old', null, 'new', to_jsonb(new.registration_number)),
        'amount', jsonb_build_object('old', null, 'new', to_jsonb(new.amount))
      ),
      new.created_at
    );
    return new;
  end if;

  change_set := app_private.row_changes(
    to_jsonb(old), to_jsonb(new),
    array[
      'title', 'owner_id', 'product_id', 'convention_id', 'registration_number',
      'bank_id', 'source_id', 'stage_id', 'status', 'loss_reason_id', 'amount',
      'total_value', 'final_value', 'requested_reversal', 'expected_close_date', 'notes'
    ]
  );
  if change_set = '{}'::jsonb then return new; end if;

  history_type := case
    when old.stage_id is distinct from new.stage_id then 'stage_changed'
    when old.status is distinct from new.status and new.status = 'cancelled' then 'cancelled'
    else 'updated'
  end;

  insert into public.opportunity_change_history (
    organization_id, opportunity_id, changed_by, event_type, changes, changed_at
  ) values (
    new.organization_id, new.id, auth.uid(), history_type, change_set, now()
  );
  return new;
end;
$$;

revoke all on function app_private.record_opportunity_change() from public, anon, authenticated;

commit;
