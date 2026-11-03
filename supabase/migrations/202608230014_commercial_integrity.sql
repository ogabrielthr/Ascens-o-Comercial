begin;

create or replace function app_private.validate_commission_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'commission_rules' then
    if not app_private.entity_in_org('public.products', new.product_id, new.organization_id)
       or (new.created_by is not null and not app_private.user_in_org(new.organization_id, new.created_by)) then
      raise exception 'commission rule reference does not belong to organization' using errcode = '23514';
    end if;
  elsif tg_table_name = 'commission_payables' then
    if not app_private.entity_in_org('public.opportunities', new.opportunity_id, new.organization_id)
       or not app_private.user_in_org(new.organization_id, new.user_id)
       or not app_private.entity_in_org('public.commission_rules', new.rule_id, new.organization_id)
       or (new.approved_by is not null and not app_private.user_in_org(new.organization_id, new.approved_by)) then
      raise exception 'commission payable reference does not belong to organization' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger commission_rules_validate_org
before insert or update on public.commission_rules
for each row execute function app_private.validate_commission_references();

create trigger commission_payables_validate_org
before insert or update on public.commission_payables
for each row execute function app_private.validate_commission_references();

create or replace function app_private.prepare_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  stage_row public.pipeline_stages%rowtype;
begin
  select * into stage_row
  from public.pipeline_stages s
  where s.id = new.stage_id
    and s.organization_id = new.organization_id
    and s.pipeline_id = new.pipeline_id
    and s.active
    and s.deleted_at is null;
  if not found then
    raise exception 'stage does not belong to the selected pipeline' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and (new.status <> 'open' or stage_row.stage_type <> 'open') then
    raise exception 'new opportunities must start in an open stage' using errcode = '23514';
  end if;

  if new.product_id is null then
    new.expected_commission := 0;
  else
    select * into product_row
    from public.products p
    where p.id = new.product_id
      and p.organization_id = new.organization_id
      and p.active
      and p.deleted_at is null;
    if not found then
      raise exception 'active product required' using errcode = '23514';
    end if;
    if (product_row.min_amount is not null and new.amount < product_row.min_amount)
       or (product_row.max_amount is not null and new.amount > product_row.max_amount) then
      raise exception 'amount is outside product limits' using errcode = '23514';
    end if;
    new.expected_commission := round(new.amount * product_row.default_commission_rate / 100, 2);
  end if;

  return new;
end;
$$;

create trigger opportunities_prepare_values
before insert or update of amount, product_id, stage_id, pipeline_id
on public.opportunities
for each row execute function app_private.prepare_opportunity();

revoke execute on function app_private.validate_commission_references() from public, anon, authenticated;
revoke execute on function app_private.prepare_opportunity() from public, anon, authenticated;

commit;
