begin;

create or replace view public.v_open_pipeline
with (security_invoker = true)
as
select
  o.id,
  o.organization_id,
  o.owner_id,
  o.pipeline_id,
  o.stage_id,
  s.name as stage_name,
  s.position as stage_position,
  s.probability,
  o.contact_id,
  c.full_name as contact_name,
  c.phone,
  o.product_id,
  p.name as product_name,
  o.bank_id,
  b.name as bank_name,
  o.source_id,
  src.name as source_name,
  o.amount,
  o.expected_commission,
  o.expected_close_date,
  o.stage_entered_at,
  o.updated_at,
  extract(day from now() - o.stage_entered_at)::integer as days_in_stage,
  (extract(day from now() - o.stage_entered_at) > s.sla_days) as sla_breached
from public.opportunities o
join public.pipeline_stages s on s.id = o.stage_id
join public.contacts c on c.id = o.contact_id
left join public.products p on p.id = o.product_id
left join public.banks b on b.id = o.bank_id
left join public.lead_sources src on src.id = o.source_id
where o.status = 'open'
  and o.deleted_at is null;

create or replace view public.v_monthly_sales
with (security_invoker = true)
as
select
  organization_id,
  owner_id,
  date_trunc('month', closed_at)::date as competence,
  count(*)::integer as sales_count,
  sum(amount)::numeric(14,2) as sales_amount,
  sum(expected_commission)::numeric(14,2) as expected_commission
from public.opportunities
where status = 'won'
  and closed_at is not null
  and deleted_at is null
group by organization_id, owner_id, date_trunc('month', closed_at)::date;

create or replace view public.v_financial_monthly
with (security_invoker = true)
as
select
  organization_id,
  competence,
  sum(amount) filter (where entry_type = 'revenue' and status = 'realized')::numeric(14,2) as revenue,
  sum(amount) filter (where entry_type = 'expense' and status = 'realized')::numeric(14,2) as expense,
  (
    coalesce(sum(amount) filter (where entry_type = 'revenue' and status = 'realized'), 0)
    - coalesce(sum(amount) filter (where entry_type = 'expense' and status = 'realized'), 0)
  )::numeric(14,2) as result
from public.financial_entries
where deleted_at is null
group by organization_id, competence;

create or replace function public.my_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  role public.access_role
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, o.name, m.role
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
    and m.active
    and o.active
    and o.deleted_at is null;
$$;

grant select on public.v_open_pipeline to authenticated;
grant select on public.v_monthly_sales to authenticated;
grant select on public.v_financial_monthly to authenticated;
grant execute on function public.my_organizations() to authenticated;

commit;