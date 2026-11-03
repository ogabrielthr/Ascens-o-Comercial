begin;

-- Contas antigas criadas como "usuario" mas vinculadas a uma equipe comercial
-- passam a usar o papel correto de vendedor.
update public.organization_members membership
set role = 'commercial', updated_at = now()
where membership.role = 'user'
  and membership.active
  and exists (
    select 1 from public.team_members team_member
    where team_member.user_id = membership.user_id
  );

-- A classificacao precisa ser igual para todos, sem expor os leads de outros
-- vendedores. Esta funcao entrega somente os numeros anonimizados da venda.
create or replace function public.sales_ranking_entries(p_organization_id uuid)
returns table (
  owner_id uuid,
  closed_at timestamptz,
  requested_reversal numeric,
  production_value numeric,
  product_id uuid,
  source_id uuid,
  team_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    opportunity.owner_id,
    opportunity.closed_at,
    coalesce(opportunity.requested_reversal, 0)::numeric,
    coalesce(opportunity.final_value, opportunity.total_value, opportunity.amount, 0)::numeric,
    opportunity.product_id,
    opportunity.source_id,
    team_member.team_id
  from public.opportunities opportunity
  left join lateral (
    select membership.team_id
    from public.team_members membership
    join public.teams team on team.id = membership.team_id
    where membership.user_id = opportunity.owner_id
      and team.organization_id = opportunity.organization_id
      and team.active
      and team.deleted_at is null
    order by membership.joined_at
    limit 1
  ) team_member on true
  where opportunity.organization_id = p_organization_id
    and opportunity.status = 'won'
    and opportunity.closed_at is not null
    and opportunity.deleted_at is null
    and app_private.is_org_member(p_organization_id);
$$;

revoke all on function public.sales_ranking_entries(uuid) from public, anon;
grant execute on function public.sales_ranking_entries(uuid) to authenticated, service_role;

drop policy if exists mood_factors_link_read on public.mood_checkin_factors;
create policy mood_factors_link_read_scope on public.mood_checkin_factors
for select to authenticated using (
  exists (
    select 1 from public.daily_mood_checkins checkin
    where checkin.id = mood_checkin_factors.checkin_id
      and app_private.manages_user(checkin.organization_id, checkin.user_id)
  )
);

-- Somente administradores e gestores acessam o modulo financeiro. Perfis
-- legados de financeiro/auditoria deixam de obter leitura direta.
do $$
declare table_name text;
begin
  foreach table_name in array array['chart_of_accounts','cost_centers','financial_entries','budgets'] loop
    execute format('drop policy if exists %I_finance_read on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_finance_write on public.%I', table_name, table_name);
    execute format(
      'create policy %I_management_read on public.%I for select to authenticated using (app_private.has_role(organization_id, array[''admin''::public.access_role,''manager''::public.access_role]))',
      table_name, table_name
    );
  end loop;
end $$;

drop policy if exists financial_entries_insert_draft on public.financial_entries;
create policy financial_entries_insert_management on public.financial_entries
for insert to authenticated
with check (
  app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role])
  and status in ('draft', 'scheduled', 'pending_approval')
  and approved_by is null and approved_at is null
);
drop policy if exists financial_entries_update_unapproved on public.financial_entries;
create policy financial_entries_update_management on public.financial_entries
for update to authenticated
using (
  app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role])
  and status in ('draft', 'scheduled', 'pending_approval')
)
with check (
  app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role])
  and status in ('draft', 'scheduled', 'pending_approval')
  and approved_by is null and approved_at is null
);

drop policy if exists chart_of_accounts_admin_finance_write on public.chart_of_accounts;
create policy chart_of_accounts_management_write on public.chart_of_accounts for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]));
drop policy if exists cost_centers_admin_finance_write on public.cost_centers;
create policy cost_centers_management_write on public.cost_centers for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]));
drop policy if exists budgets_admin_finance_write on public.budgets;
create policy budgets_management_write on public.budgets for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]));

create or replace function app_private.require_finance_access(target_org uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_role(
    target_org, array['admin'::public.access_role,'manager'::public.access_role]
  ) then
    raise exception 'management finance access required' using errcode = '42501';
  end if;
end;
$$;

-- Avatares sao imagens publicas, mas cada usuario so pode gravar/remover os
-- arquivos dentro da propria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ascensao-avatars', 'ascensao-avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'ascensao-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
using (bucket_id = 'ascensao-avatars' and owner_id = auth.uid()::text)
with check (bucket_id = 'ascensao-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'ascensao-avatars' and owner_id = auth.uid()::text);

commit;
