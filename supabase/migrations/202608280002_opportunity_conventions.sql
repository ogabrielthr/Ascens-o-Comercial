begin;

create table public.conventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index conventions_org_name_unique
  on public.conventions(organization_id, lower(name))
  where deleted_at is null;

alter table public.conventions enable row level security;
alter table public.conventions force row level security;

create policy conventions_member_read
on public.conventions for select to authenticated
using (app_private.is_org_member(organization_id));

create policy conventions_admin_manage
on public.conventions for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role]));

revoke all on public.conventions from public, anon;
grant select, insert, update, delete on public.conventions to authenticated;
grant all on public.conventions to service_role;

alter table public.opportunities
  add column convention_id uuid references public.conventions(id) on delete set null;

create index opportunities_org_convention_idx
  on public.opportunities(organization_id, convention_id)
  where deleted_at is null and convention_id is not null;

create or replace function app_private.validate_opportunity_convention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.convention_id is not null
     and not app_private.entity_in_org('public.conventions', new.convention_id, new.organization_id) then
    raise exception 'convention does not belong to organization' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_opportunity_convention() from public, anon, authenticated;

create trigger opportunities_validate_convention
before insert or update of convention_id, organization_id on public.opportunities
for each row execute function app_private.validate_opportunity_convention();

create or replace function public.set_opportunity_convention(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_convention_id uuid default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare opportunity_row public.opportunities%rowtype;
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
  if p_convention_id is not null and not exists (
    select 1 from public.conventions convention
    where convention.id = p_convention_id
      and convention.organization_id = opportunity_row.organization_id
      and convention.active and convention.deleted_at is null
  ) then
    raise exception 'active convention required' using errcode = '23514';
  end if;

  if opportunity_row.convention_id is not distinct from p_convention_id then
    return opportunity_row;
  end if;

  update public.opportunities
  set convention_id = p_convention_id, version = version + 1, updated_at = now()
  where id = opportunity_row.id
  returning * into opportunity_row;
  return opportunity_row;
end;
$$;

revoke execute on function public.set_opportunity_convention(uuid, integer, uuid) from public, anon;
grant execute on function public.set_opportunity_convention(uuid, integer, uuid) to authenticated, service_role;

create or replace function public.create_opportunity_v2(
  p_organization_id uuid,
  p_owner_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_product_id uuid,
  p_convention_id uuid,
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
  opportunity_row := public.create_opportunity(
    p_organization_id, p_owner_id, p_pipeline_id, p_stage_id, p_product_id,
    p_bank_id, p_source_id, p_full_name, p_phone, p_cpf, p_amount,
    p_expected_close_date, p_notes, p_company_id
  );
  opportunity_row := public.set_opportunity_financial_values(
    opportunity_row.id, opportunity_row.version,
    p_total_value, p_final_value, p_requested_reversal
  );
  opportunity_row := public.set_opportunity_convention(
    opportunity_row.id, opportunity_row.version, p_convention_id
  );
  return opportunity_row;
end;
$$;

revoke execute on function public.create_opportunity_v2(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric, date, text, uuid
) from public, anon;
grant execute on function public.create_opportunity_v2(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text,
  numeric, numeric, numeric, numeric, date, text, uuid
) to authenticated, service_role;

create or replace function public.update_opportunity_details_v3(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_product_id uuid,
  p_convention_id uuid,
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
  update_result := public.update_opportunity_details_v2(
    p_opportunity_id, p_expected_version, p_owner_id, p_product_id,
    p_bank_id, p_source_id, p_full_name, p_cpf, p_phone, p_email,
    p_city, p_state, p_amount, p_total_value, p_final_value,
    p_requested_reversal, p_expected_close_date, p_notes
  );
  opportunity_row := public.set_opportunity_convention(
    p_opportunity_id,
    (update_result -> 'opportunity' ->> 'version')::integer,
    p_convention_id
  );
  return jsonb_set(update_result, '{opportunity}', to_jsonb(opportunity_row), false);
end;
$$;

revoke execute on function public.update_opportunity_details_v3(
  uuid, integer, uuid, uuid, uuid, uuid, uuid, text, text, text, text,
  text, text, numeric, numeric, numeric, numeric, date, text
) from public, anon;
grant execute on function public.update_opportunity_details_v3(
  uuid, integer, uuid, uuid, uuid, uuid, uuid, text, text, text, text,
  text, text, numeric, numeric, numeric, numeric, date, text
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
        'amount', jsonb_build_object('old', null, 'new', to_jsonb(new.amount))
      ),
      new.created_at
    );
    return new;
  end if;

  change_set := app_private.row_changes(
    to_jsonb(old), to_jsonb(new),
    array[
      'title', 'owner_id', 'product_id', 'convention_id', 'bank_id', 'source_id',
      'stage_id', 'status', 'loss_reason_id', 'amount', 'total_value',
      'final_value', 'requested_reversal', 'expected_close_date', 'notes'
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
