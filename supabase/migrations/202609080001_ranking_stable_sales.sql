begin;

-- Identificador opaco e estavel: permite paginacao e celebracao sem expor
-- o identificador do lead, contato, CPF ou comprovantes de outra carteira.
-- A RPC antiga e preservada para clientes ja publicados.
create or replace function public.sales_ranking_entries_v2(p_organization_id uuid)
returns table (
  sale_id uuid, owner_id uuid, closed_at timestamptz,
  requested_reversal numeric, production_value numeric,
  product_id uuid, source_id uuid, team_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select
    pg_catalog.md5(opportunity.organization_id::text || ':' || opportunity.id::text)::uuid,
    opportunity.owner_id, opportunity.closed_at,
    coalesce(opportunity.requested_reversal, 0)::numeric,
    coalesce(opportunity.total_value, 0)::numeric,
    opportunity.product_id, opportunity.source_id, team_member.team_id
  from public.opportunities opportunity
  left join lateral (
    select membership.team_id
    from public.team_members membership
    join public.teams team on team.id = membership.team_id
    where membership.user_id = opportunity.owner_id
      and team.organization_id = opportunity.organization_id
      and team.active and team.deleted_at is null
    order by membership.joined_at, membership.team_id
    limit 1
  ) team_member on true
  where opportunity.organization_id = p_organization_id
    and opportunity.status = 'won'
    and opportunity.closed_at is not null
    and opportunity.deleted_at is null
    and app_private.is_org_member(p_organization_id);
$$;

revoke all on function public.sales_ranking_entries_v2(uuid) from public, anon;
grant execute on function public.sales_ranking_entries_v2(uuid) to authenticated, service_role;

commit;
