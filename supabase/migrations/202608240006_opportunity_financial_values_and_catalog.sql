begin;

alter table public.opportunities
  add column total_value numeric(14,2) check (total_value is null or total_value >= 0),
  add column final_value numeric(14,2) check (final_value is null or final_value >= 0),
  add column requested_reversal numeric(14,2) check (requested_reversal is null or requested_reversal >= 0);

create or replace function public.set_opportunity_financial_values(
  p_opportunity_id uuid,
  p_expected_version integer,
  p_total_value numeric default null,
  p_final_value numeric default null,
  p_requested_reversal numeric default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare opportunity_row public.opportunities%rowtype;
begin
  select * into opportunity_row from public.opportunities o
  where o.id = p_opportunity_id and o.deleted_at is null for update;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  if auth.uid() is null
     or not app_private.manages_user(opportunity_row.organization_id, opportunity_row.owner_id)
     or not app_private.has_role(opportunity_row.organization_id, array[
       'admin'::public.access_role, 'manager'::public.access_role,
       'commercial'::public.access_role, 'bdr'::public.access_role
     ]) then raise exception 'not allowed to update opportunity' using errcode = '42501'; end if;
  if opportunity_row.version <> p_expected_version then
    raise exception 'opportunity changed by another user' using errcode = '40001';
  end if;
  if coalesce(p_total_value, 0) < 0 or coalesce(p_final_value, 0) < 0 or coalesce(p_requested_reversal, 0) < 0 then
    raise exception 'financial values must be non-negative' using errcode = '23514';
  end if;
  update public.opportunities set total_value = p_total_value, final_value = p_final_value,
    requested_reversal = p_requested_reversal, version = version + 1, updated_at = now()
  where id = opportunity_row.id returning * into opportunity_row;
  return opportunity_row;
end;
$$;

revoke execute on function public.set_opportunity_financial_values(uuid, integer, numeric, numeric, numeric) from public, anon;
grant execute on function public.set_opportunity_financial_values(uuid, integer, numeric, numeric, numeric) to authenticated, service_role;

update public.products set active = false, updated_at = now()
where lower(name) not in ('refinanciamento', 'margem consignável');

update public.products set active = true, deleted_at = null, updated_at = now()
where lower(name) in ('refinanciamento', 'margem consignável');

insert into public.products (organization_id, name, code, active)
select organization.id, product.name, product.code, true from public.organizations organization
cross join (values ('Refinanciamento', 'refinancing'), ('Margem Consignável', 'assignable_margin')) product(name, code)
where not exists (select 1 from public.products existing where existing.organization_id = organization.id
  and lower(existing.name) = lower(product.name) and existing.deleted_at is null);

insert into public.lead_sources (organization_id, name, code, active)
select organization.id, source.name, source.code, true from public.organizations organization
cross join (values
  ('Prospecção Ativa', 'active_prospecting'), ('Indicação', 'referral'),
  ('Carteira Própria', 'own_portfolio'), ('WhatsApp', 'whatsapp'),
  ('Campanha Digital', 'digital_campaign'), ('Lead Orgânico', 'organic'),
  ('Parceiro', 'partner'), ('Evento', 'event')
) source(name, code)
where not exists (select 1 from public.lead_sources existing where existing.organization_id = organization.id
  and lower(existing.name) = lower(source.name) and existing.deleted_at is null);

update public.lead_sources set active = true, deleted_at = null, updated_at = now()
where lower(name) in ('prospecção ativa', 'indicação', 'carteira própria', 'whatsapp',
  'campanha digital', 'lead orgânico', 'parceiro', 'evento');

commit;
