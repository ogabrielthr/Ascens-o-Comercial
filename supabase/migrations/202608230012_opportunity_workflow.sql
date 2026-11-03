begin;

create type public.commission_payable_status as enum
  ('draft', 'approved', 'paid', 'cancelled');

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  role public.access_role,
  rate numeric(7,4) not null check (rate between 0 and 100),
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_until date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint commission_rule_dates check (
    effective_until is null or effective_until >= effective_from
  )
);
create index commission_rules_lookup_idx
  on public.commission_rules(organization_id, product_id, role, effective_from desc)
  where active and deleted_at is null;

create table public.commission_payables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  rule_id uuid references public.commission_rules(id) on delete set null,
  calculation_base numeric(14,2) not null check (calculation_base >= 0),
  rate numeric(7,4) not null check (rate between 0 and 100),
  amount numeric(14,2) not null check (amount >= 0),
  status public.commission_payable_status not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, opportunity_id, user_id)
);
create index commission_payables_user_status_idx
  on public.commission_payables(organization_id, user_id, status);

create trigger commission_rules_set_updated_at
before update on public.commission_rules
for each row execute function public.set_updated_at();
create trigger commission_payables_set_updated_at
before update on public.commission_payables
for each row execute function public.set_updated_at();
create trigger commission_rules_set_actor
before insert on public.commission_rules
for each row execute function app_private.set_actor_columns();
create trigger commission_rules_audit
after insert or update or delete on public.commission_rules
for each row execute function app_private.audit_row_change();
create trigger commission_payables_audit
after insert or update or delete on public.commission_payables
for each row execute function app_private.audit_row_change();

alter table public.commission_rules enable row level security;
alter table public.commission_rules force row level security;
alter table public.commission_payables enable row level security;
alter table public.commission_payables force row level security;

create policy commission_rules_read on public.commission_rules
for select to authenticated using (app_private.is_org_member(organization_id));
create policy commission_rules_manage on public.commission_rules
for insert to authenticated
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]));
create policy commission_rules_update on public.commission_rules
for update to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]));

create policy commission_payables_read on public.commission_payables
for select to authenticated
using (
  user_id = auth.uid()
  or app_private.manages_user(organization_id, user_id)
  or app_private.has_role(organization_id, array['finance'::public.access_role,'auditor'::public.access_role])
);
-- No direct client writes to commission_payables.

create or replace function app_private.award_points(
  target_org uuid,
  target_user uuid,
  target_event text,
  target_source_type text,
  target_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  points_value integer;
begin
  select r.points into points_value
  from public.gamification_rules r
  where r.organization_id = target_org
    and r.event_type = target_event
    and r.active
    and r.effective_from <= now()
    and (r.effective_until is null or r.effective_until > now())
  order by r.effective_from desc
  limit 1;

  if points_value is null then return; end if;

  insert into public.point_events
    (organization_id, user_id, event_type, source_type, source_id, points)
  values
    (target_org, target_user, target_event, target_source_type, target_source_id, points_value)
  on conflict (organization_id, user_id, event_type, source_type, source_id) do nothing;
end;
$$;

create or replace function app_private.points_from_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare event_name text;
begin
  if new.status <> 'completed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return new; end if;

  event_name := case new.activity_type
    when 'call' then 'call_completed'
    when 'proposal' then 'proposal_sent'
    else null
  end;
  if event_name is not null then
    perform app_private.award_points(
      new.organization_id, new.owner_id, event_name, 'activity', new.id
    );
  end if;
  return new;
end;
$$;

create trigger activities_award_points
after insert or update of status on public.activities
for each row execute function app_private.points_from_activity();

create or replace function app_private.points_from_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status <> 'completed') then
    perform app_private.award_points(
      new.organization_id, new.user_id, 'lesson_completed', 'lesson_progress', new.id
    );
  end if;
  return new;
end;
$$;

create trigger lesson_progress_award_points
after insert or update of status on public.lesson_progress
for each row execute function app_private.points_from_lesson();

create or replace function public.transition_opportunity(
  p_opportunity_id uuid,
  p_target_stage_id uuid,
  p_expected_version integer,
  p_loss_reason_id uuid default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  current_stage public.pipeline_stages%rowtype;
  target_stage public.pipeline_stages%rowtype;
  next_status public.opportunity_status;
  actor_role public.access_role;
  actor_allowed boolean;
  account_revenue uuid;
  account_commission uuid;
  center_commercial uuid;
  member_role public.access_role;
  commission_rule public.commission_rules%rowtype;
  payable_amount numeric(14,2);
  won_points integer;
  previous_status public.opportunity_status;
  previous_stage_entered_at timestamptz;
  history_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into opportunity_row
  from public.opportunities o
  where o.id = p_opportunity_id and o.deleted_at is null
  for update;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  previous_status := opportunity_row.status;
  previous_stage_entered_at := opportunity_row.stage_entered_at;

  select m.role into actor_role
  from public.organization_members m
  where m.organization_id = opportunity_row.organization_id
    and m.user_id = auth.uid() and m.active;

  actor_allowed :=
    app_private.manages_user(opportunity_row.organization_id, opportunity_row.owner_id)
    or actor_role = 'operations';
  if not actor_allowed or actor_role not in ('admin','manager','commercial','operations') then
    raise exception 'not allowed to transition opportunity' using errcode = '42501';
  end if;

  if opportunity_row.version <> p_expected_version then
    raise exception 'opportunity changed by another user' using errcode = '40001';
  end if;

  select * into current_stage from public.pipeline_stages where id = opportunity_row.stage_id;
  select * into target_stage
  from public.pipeline_stages s
  where s.id = p_target_stage_id
    and s.organization_id = opportunity_row.organization_id
    and s.pipeline_id = opportunity_row.pipeline_id
    and s.active and s.deleted_at is null;
  if not found then raise exception 'invalid target stage' using errcode = '23514'; end if;

  next_status := case target_stage.stage_type
    when 'won' then 'won'::public.opportunity_status
    when 'lost' then 'lost'::public.opportunity_status
    else 'open'::public.opportunity_status
  end;

  if opportunity_row.status <> 'open' and next_status <> 'open' then
    raise exception 'closed opportunity must be reopened first' using errcode = '23514';
  end if;
  if opportunity_row.status <> 'open' and actor_role not in ('admin','manager') then
    raise exception 'only management can reopen an opportunity' using errcode = '42501';
  end if;

  if next_status = 'lost' then
    if p_loss_reason_id is null
       or not app_private.entity_in_org('public.loss_reasons', p_loss_reason_id, opportunity_row.organization_id) then
      raise exception 'valid loss reason required' using errcode = '23514';
    end if;
  else
    p_loss_reason_id := null;
  end if;

  if opportunity_row.status = 'won' and next_status = 'open' then
    if exists (
      select 1 from public.financial_entries f
      where f.opportunity_id = opportunity_row.id and f.status in ('realized','reversed')
    ) or exists (
      select 1 from public.commission_payables cp
      where cp.opportunity_id = opportunity_row.id and cp.status = 'paid'
    ) then
      raise exception 'realized financial records must be reversed before reopening' using errcode = '23514';
    end if;

    update public.financial_entries
      set status = 'cancelled', updated_at = now()
    where opportunity_id = opportunity_row.id
      and status in ('draft','scheduled','pending_approval');

    update public.commission_payables
      set status = 'cancelled', updated_at = now()
    where opportunity_id = opportunity_row.id
      and status in ('draft','approved');


  end if;

  update public.opportunities
  set stage_id = target_stage.id,
      status = next_status,
      loss_reason_id = p_loss_reason_id,
      stage_entered_at = now(),
      closed_at = case when next_status in ('won','lost') then now() else null end,
      version = version + 1,
      updated_at = now()
  where id = opportunity_row.id
  returning * into opportunity_row;

  insert into public.opportunity_stage_history
    (organization_id, opportunity_id, from_stage_id, to_stage_id,
     changed_by, changed_at, duration_seconds)
  values
    (opportunity_row.organization_id, opportunity_row.id, current_stage.id,
     target_stage.id, auth.uid(), now(),
     greatest(0, extract(epoch from now() - previous_stage_entered_at)::bigint))
  returning id into history_id;

  if previous_status = 'won' and next_status = 'open' then
    select pe.points into won_points
    from public.point_events pe
    where pe.organization_id = opportunity_row.organization_id
      and pe.user_id = opportunity_row.owner_id
      and pe.event_type = 'opportunity_won'
      and pe.source_type = 'opportunity_transition'
    order by pe.occurred_at desc
    limit 1;

    if won_points is not null then
      insert into public.point_events
        (organization_id, user_id, event_type, source_type, source_id, points)
      values
        (opportunity_row.organization_id, opportunity_row.owner_id,
         'opportunity_reopened', 'opportunity_transition', history_id, -won_points);
    end if;
  end if;

  if next_status = 'won' then
    perform app_private.award_points(
      opportunity_row.organization_id, opportunity_row.owner_id,
      'opportunity_won', 'opportunity_transition', history_id
    );

    select id into account_revenue from public.chart_of_accounts
      where organization_id = opportunity_row.organization_id
        and code = 'REC_COMISSAO' and active and deleted_at is null;
    select id into center_commercial from public.cost_centers
      where organization_id = opportunity_row.organization_id
        and code = 'COMERCIAL' and active and deleted_at is null;
    if account_revenue is null or center_commercial is null then
      raise exception 'financial catalog is not configured' using errcode = '23514';
    end if;

    if opportunity_row.expected_commission > 0 then
      insert into public.financial_entries
        (organization_id, account_id, cost_center_id, opportunity_id,
         beneficiary_user_id, entry_type, description, amount, entry_date,
         competence, status, external_reference, created_by)
      values
        (opportunity_row.organization_id, account_revenue, center_commercial,
         opportunity_row.id, opportunity_row.owner_id, 'revenue',
         'Comissao prevista - ' || opportunity_row.title,
         opportunity_row.expected_commission, current_date,
         date_trunc('month', current_date)::date, 'scheduled',
         'opportunity:' || opportunity_row.id || ':commission_revenue', auth.uid())
      on conflict (organization_id, external_reference)
        where external_reference is not null and deleted_at is null
      do nothing;
    end if;

    select m.role into member_role from public.organization_members m
      where m.organization_id = opportunity_row.organization_id
        and m.user_id = opportunity_row.owner_id and m.active;

    select * into commission_rule
    from public.commission_rules r
    where r.organization_id = opportunity_row.organization_id
      and (r.product_id = opportunity_row.product_id or r.product_id is null)
      and (r.role = member_role or r.role is null)
      and r.active and r.deleted_at is null
      and r.effective_from <= current_date
      and (r.effective_until is null or r.effective_until >= current_date)
    order by (r.product_id is not null) desc, (r.role is not null) desc, r.effective_from desc
    limit 1;

    if commission_rule.id is not null then
      payable_amount := round(opportunity_row.expected_commission * commission_rule.rate / 100, 2);
      insert into public.commission_payables
        (organization_id, opportunity_id, user_id, rule_id,
         calculation_base, rate, amount, status)
      values
        (opportunity_row.organization_id, opportunity_row.id, opportunity_row.owner_id,
         commission_rule.id, opportunity_row.expected_commission,
         commission_rule.rate, payable_amount, 'draft')
      on conflict (organization_id, opportunity_id, user_id) do nothing;

      select id into account_commission from public.chart_of_accounts
        where organization_id = opportunity_row.organization_id
          and code = 'DESP_COMERCIAL' and active and deleted_at is null;
      if account_commission is null then
        raise exception 'commission expense account is not configured' using errcode = '23514';
      end if;

      if payable_amount > 0 then
        insert into public.financial_entries
          (organization_id, account_id, cost_center_id, opportunity_id,
           beneficiary_user_id, entry_type, description, amount, entry_date,
           competence, status, external_reference, created_by)
        values
          (opportunity_row.organization_id, account_commission, center_commercial,
           opportunity_row.id, opportunity_row.owner_id, 'expense',
           'Comissao do vendedor - ' || opportunity_row.title,
           payable_amount, current_date, date_trunc('month', current_date)::date,
           'scheduled', 'opportunity:' || opportunity_row.id || ':seller_commission',
           auth.uid())
        on conflict (organization_id, external_reference)
          where external_reference is not null and deleted_at is null
        do nothing;
      end if;
    end if;
  end if;

  return opportunity_row;
end;
$$;

revoke execute on function public.transition_opportunity(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.transition_opportunity(uuid, uuid, integer, uuid) to authenticated;
revoke execute on function app_private.award_points(uuid, uuid, text, text, uuid) from public, anon, authenticated;

commit;