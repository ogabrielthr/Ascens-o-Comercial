begin;

create or replace function app_private.require_finance_access(target_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not app_private.has_role(
       target_org,
       array['admin'::public.access_role,'finance'::public.access_role
     ]) then
    raise exception 'finance access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.realize_financial_entry(
  p_entry_id uuid,
  p_expected_updated_at timestamptz default null
)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare entry_row public.financial_entries%rowtype;
begin
  select * into entry_row
  from public.financial_entries f
  where f.id = p_entry_id and f.deleted_at is null
  for update;
  if not found then raise exception 'financial entry not found' using errcode = 'P0002'; end if;

  perform app_private.require_finance_access(entry_row.organization_id);

  if p_expected_updated_at is not null and entry_row.updated_at <> p_expected_updated_at then
    raise exception 'financial entry changed by another user' using errcode = '40001';
  end if;
  if entry_row.status not in ('draft','scheduled','pending_approval') then
    raise exception 'financial entry cannot be realized from current status' using errcode = '23514';
  end if;

  update public.financial_entries
  set status = 'realized', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = entry_row.id
  returning * into entry_row;

  if entry_row.external_reference like '%:seller_commission' then
    update public.commission_payables
    set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    where opportunity_id = entry_row.opportunity_id and status = 'draft';
  end if;

  insert into public.audit_logs
    (organization_id, actor_id, action, entity_type, entity_id, new_data)
  values
    (entry_row.organization_id, auth.uid(), 'approve',
     'financial_entries', entry_row.id, jsonb_build_object('status', 'realized'));

  return entry_row;
end;
$$;

create or replace function public.cancel_financial_entry(
  p_entry_id uuid,
  p_reason text
)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare entry_row public.financial_entries%rowtype;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'cancellation reason required' using errcode = '23514';
  end if;

  select * into entry_row
  from public.financial_entries f
  where f.id = p_entry_id and f.deleted_at is null
  for update;
  if not found then raise exception 'financial entry not found' using errcode = 'P0002'; end if;

  perform app_private.require_finance_access(entry_row.organization_id);
  if entry_row.status not in ('draft','scheduled','pending_approval') then
    raise exception 'only unrealized entries can be cancelled' using errcode = '23514';
  end if;

  update public.financial_entries
  set status = 'cancelled',
      description = description || ' [Cancelado: ' || left(trim(p_reason), 500) || ']',
      updated_at = now()
  where id = entry_row.id
  returning * into entry_row;

  update public.commission_payables
  set status = 'cancelled', updated_at = now()
  where opportunity_id = entry_row.opportunity_id
    and entry_row.external_reference like '%:seller_commission'
    and status in ('draft','approved');

  insert into public.audit_logs
    (organization_id, actor_id, action, entity_type, entity_id, new_data)
  values
    (entry_row.organization_id, auth.uid(), 'cancel',
     'financial_entries', entry_row.id, jsonb_build_object('reason', left(trim(p_reason), 500)));

  return entry_row;
end;
$$;

create or replace function public.reverse_financial_entry(
  p_entry_id uuid,
  p_reason text
)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.financial_entries%rowtype;
  reversal public.financial_entries%rowtype;
  reversal_reference text;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'reversal reason required' using errcode = '23514';
  end if;

  select * into original
  from public.financial_entries f
  where f.id = p_entry_id and f.deleted_at is null
  for update;
  if not found then raise exception 'financial entry not found' using errcode = 'P0002'; end if;

  perform app_private.require_finance_access(original.organization_id);
  if original.status <> 'realized' then
    raise exception 'only realized entries can be reversed' using errcode = '23514';
  end if;

  if original.external_reference like '%:seller_commission'
     and exists (
       select 1 from public.commission_payables cp
       where cp.opportunity_id = original.opportunity_id and cp.status = 'paid'
     ) then
    raise exception 'paid commission requires a separate clawback process' using errcode = '23514';
  end if;

  reversal_reference := coalesce(original.external_reference, 'entry:' || original.id) || ':reversal';

  insert into public.financial_entries
    (organization_id, account_id, cost_center_id, opportunity_id,
     beneficiary_user_id, entry_type, description, amount, entry_date,
     competence, status, external_reference, approved_by, approved_at,
     reversed_entry_id, created_by)
  values
    (original.organization_id, original.account_id, original.cost_center_id,
     original.opportunity_id, original.beneficiary_user_id,
     case original.entry_type when 'revenue' then 'expense'::public.financial_entry_type
                              else 'revenue'::public.financial_entry_type end,
     'Estorno: ' || original.description || ' [' || left(trim(p_reason), 500) || ']',
     original.amount, current_date, date_trunc('month', current_date)::date,
     'realized', reversal_reference, auth.uid(), now(), original.id, auth.uid())
  returning * into reversal;

  update public.financial_entries
  set status = 'reversed', updated_at = now()
  where id = original.id;

  update public.commission_payables
  set status = 'cancelled', updated_at = now()
  where opportunity_id = original.opportunity_id
    and original.external_reference like '%:seller_commission'
    and status in ('draft','approved');

  insert into public.audit_logs
    (organization_id, actor_id, action, entity_type, entity_id, new_data)
  values
    (original.organization_id, auth.uid(), 'cancel',
     'financial_entries', original.id,
     jsonb_build_object('reason', left(trim(p_reason), 500), 'reversal_id', reversal.id));

  return reversal;
end;
$$;

create or replace function public.mark_commission_paid(
  p_payable_id uuid
)
returns public.commission_payables
language plpgsql
security definer
set search_path = ''
as $$
declare payable public.commission_payables%rowtype;
begin
  select * into payable
  from public.commission_payables cp
  where cp.id = p_payable_id
  for update;
  if not found then raise exception 'commission payable not found' using errcode = 'P0002'; end if;

  perform app_private.require_finance_access(payable.organization_id);
  if payable.status <> 'approved' then
    raise exception 'commission must be approved before payment' using errcode = '23514';
  end if;

  update public.commission_payables
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = payable.id
  returning * into payable;

  return payable;
end;
$$;

revoke execute on function app_private.require_finance_access(uuid) from public, anon, authenticated;
revoke execute on function public.realize_financial_entry(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_financial_entry(uuid, text) from public, anon;
revoke execute on function public.reverse_financial_entry(uuid, text) from public, anon;
revoke execute on function public.mark_commission_paid(uuid) from public, anon;
grant execute on function public.realize_financial_entry(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_financial_entry(uuid, text) to authenticated;
grant execute on function public.reverse_financial_entry(uuid, text) to authenticated;
grant execute on function public.mark_commission_paid(uuid) to authenticated;

commit;