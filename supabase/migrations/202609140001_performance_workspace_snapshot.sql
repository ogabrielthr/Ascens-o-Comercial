begin;

-- A regra anterior consultava organization_members duas vezes por linha
-- (is_org_member + has_role). A decisao continua dependente do responsavel,
-- mas passa a exigir uma unica consulta de associacao por avaliacao.
create or replace function app_private.can_access_crm_owner(
  target_org uuid,
  target_owner uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_org
      and member.user_id = (select auth.uid())
      and member.active
      and (
        member.role = 'admin'::public.access_role
        or target_owner = (select auth.uid())
      )
  );
$$;

-- Compatibilidade para a RPC de alteração em massa publicada em 202609010001.
-- Ela foi criada com text[] enquanto a API canônica recebe access_role[]. A
-- conversão explícita elimina o erro 42883 sem ampliar os papéis permitidos.
create or replace function app_private.has_role(target_org uuid, allowed text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_role(
    target_org,
    array(
      select role_name::public.access_role
      from pg_catalog.unnest(allowed) as requested(role_name)
    )
  );
$$;

revoke all on function app_private.has_role(uuid, text[]) from public, anon;
grant execute on function app_private.has_role(uuid, text[]) to authenticated, service_role;

-- Estes indices seguem exatamente o filtro e a ordenacao usados no bootstrap
-- e na reconciliacao. Sao parciais para nao aumentar o custo de registros que
-- nunca aparecem no workspace ativo.
create index if not exists contacts_org_live_id_idx
  on public.contacts(organization_id, id)
  where deleted_at is null;

create index if not exists opportunities_org_live_id_idx
  on public.opportunities(organization_id, id)
  where deleted_at is null and status <> 'cancelled';

create index if not exists opportunities_org_won_closed_idx
  on public.opportunities(organization_id, closed_at, owner_id)
  include (requested_reversal, total_value, product_id, source_id)
  where deleted_at is null and status = 'won' and closed_at is not null;

create index if not exists activities_org_live_id_idx
  on public.activities(organization_id, id)
  where deleted_at is null and status <> 'cancelled';

-- A estatistica remota mostrou a leitura legada de historico por organization_id
-- e id como a consulta de negocio mais cara desde o ultimo reset. Este indice
-- tambem protege clientes antigos que ainda estejam abertos durante o rollout.
create index if not exists opportunity_change_history_org_id_idx
  on public.opportunity_change_history(organization_id, id);

create index if not exists opportunity_stage_history_org_id_idx
  on public.opportunity_stage_history(organization_id, id);

create index if not exists opportunity_messages_org_live_id_idx
  on public.opportunity_messages(organization_id, id)
  where deleted_at is null;

create index if not exists payment_receipts_org_id_idx
  on public.payment_receipts(organization_id, id);

-- Um snapshot executa a verificacao de associacao uma vez, preserva o mesmo
-- escopo de administrador/vendedor e devolve apenas linhas alteradas quando o
-- cliente envia seu manifesto. IDs completos continuam detectando exclusoes e
-- transferencias sem baixar novamente cada registro.
create or replace function public.crm_workspace_snapshot(
  p_organization_id uuid,
  p_known jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role public.access_role;
  can_read_all boolean;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select member.role
  into caller_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = caller_id
    and member.active;

  if caller_role is null then
    raise exception 'organization access denied' using errcode = '42501';
  end if;
  can_read_all := caller_role = 'admin'::public.access_role;

  return jsonb_build_object(
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(contact_row) order by contact_row.id)
      from public.contacts contact_row
      where contact_row.organization_id = p_organization_id
        and contact_row.deleted_at is null
        and (can_read_all or contact_row.owner_id = caller_id)
        and (
          p_known is null
          or nullif(p_known -> 'contacts' ->> contact_row.id::text, '')::timestamptz
             is distinct from contact_row.updated_at
        )
    ), '[]'::jsonb),
    'contact_ids', coalesce((
      select jsonb_agg(contact_row.id order by contact_row.id)
      from public.contacts contact_row
      where contact_row.organization_id = p_organization_id
        and contact_row.deleted_at is null
        and (can_read_all or contact_row.owner_id = caller_id)
    ), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(to_jsonb(opportunity_row) order by opportunity_row.id)
      from public.opportunities opportunity_row
      where opportunity_row.organization_id = p_organization_id
        and opportunity_row.deleted_at is null
        and opportunity_row.status <> 'cancelled'
        and (can_read_all or opportunity_row.owner_id = caller_id)
        and (
          p_known is null
          or nullif(p_known -> 'opportunities' ->> opportunity_row.id::text, '')::timestamptz
             is distinct from opportunity_row.updated_at
        )
    ), '[]'::jsonb),
    'opportunity_ids', coalesce((
      select jsonb_agg(opportunity_row.id order by opportunity_row.id)
      from public.opportunities opportunity_row
      where opportunity_row.organization_id = p_organization_id
        and opportunity_row.deleted_at is null
        and opportunity_row.status <> 'cancelled'
        and (can_read_all or opportunity_row.owner_id = caller_id)
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(activity_row) order by activity_row.id)
      from public.activities activity_row
      where activity_row.organization_id = p_organization_id
        and activity_row.deleted_at is null
        and activity_row.status <> 'cancelled'
        and (can_read_all or activity_row.owner_id = caller_id)
        and (
          p_known is null
          or nullif(p_known -> 'activities' ->> activity_row.id::text, '')::timestamptz
             is distinct from activity_row.updated_at
        )
    ), '[]'::jsonb),
    'activity_ids', coalesce((
      select jsonb_agg(activity_row.id order by activity_row.id)
      from public.activities activity_row
      where activity_row.organization_id = p_organization_id
        and activity_row.deleted_at is null
        and activity_row.status <> 'cancelled'
        and (can_read_all or activity_row.owner_id = caller_id)
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(to_jsonb(tag_row) order by tag_row.id)
      from public.tags tag_row
      where tag_row.organization_id = p_organization_id
    ), '[]'::jsonb),
    'opportunity_tags', coalesce((
      select jsonb_agg(to_jsonb(tag_link) order by tag_link.opportunity_id, tag_link.tag_id)
      from public.opportunity_tags tag_link
      join public.opportunities opportunity_row on opportunity_row.id = tag_link.opportunity_id
      where opportunity_row.organization_id = p_organization_id
        and opportunity_row.deleted_at is null
        and opportunity_row.status <> 'cancelled'
        and (can_read_all or opportunity_row.owner_id = caller_id)
    ), '[]'::jsonb),
    'opportunity_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', message_row.id,
        'opportunity_id', message_row.opportunity_id,
        'created_at', message_row.created_at
      ) order by message_row.id)
      from public.opportunity_messages message_row
      join public.opportunities opportunity_row on opportunity_row.id = message_row.opportunity_id
      where opportunity_row.organization_id = p_organization_id
        and opportunity_row.deleted_at is null
        and opportunity_row.status <> 'cancelled'
        and message_row.deleted_at is null
        and (can_read_all or opportunity_row.owner_id = caller_id)
    ), '[]'::jsonb),
    'payment_receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', receipt_row.id,
        'opportunity_id', receipt_row.opportunity_id
      ) order by receipt_row.id)
      from public.payment_receipts receipt_row
      join public.opportunities opportunity_row on opportunity_row.id = receipt_row.opportunity_id
      where opportunity_row.organization_id = p_organization_id
        and opportunity_row.deleted_at is null
        and opportunity_row.status <> 'cancelled'
        and (can_read_all or opportunity_row.owner_id = caller_id)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.crm_workspace_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.crm_workspace_snapshot(uuid, jsonb) to authenticated, service_role;

-- O placar recebe buckets diarios agregados em vez de todas as vendas. A lista
-- recente, limitada, conserva IDs opacos para a animacao de nova venda.
create or replace function public.sales_ranking_snapshot(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_team_id uuid default null,
  p_product_id uuid default null,
  p_source_id uuid default null,
  p_recent_after timestamptz default null,
  p_recent_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not exists (
    select 1 from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = caller_id
      and member.active
  ) then
    raise exception 'organization access denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'valid ranking range required' using errcode = '22023';
  end if;
  if p_recent_limit < 1 or p_recent_limit > 100 then
    raise exception 'recent limit must be between 1 and 100' using errcode = '22023';
  end if;

  return (
    with won_sales as materialized (
      select
        opportunity_row.id,
        opportunity_row.owner_id,
        opportunity_row.closed_at,
        coalesce(opportunity_row.requested_reversal, 0)::numeric as requested_reversal,
        coalesce(opportunity_row.total_value, 0)::numeric as production_value,
        opportunity_row.product_id,
        opportunity_row.source_id,
        owner_team.team_id
      from public.opportunities opportunity_row
      left join lateral (
        select membership.team_id
        from public.team_members membership
        join public.teams team on team.id = membership.team_id
        where membership.user_id = opportunity_row.owner_id
          and team.organization_id = opportunity_row.organization_id
          and team.active and team.deleted_at is null
        order by membership.joined_at, membership.team_id
        limit 1
      ) owner_team on true
      where opportunity_row.organization_id = p_organization_id
        and opportunity_row.status = 'won'
        and opportunity_row.closed_at between p_from and p_to
        and opportunity_row.deleted_at is null
        and (p_team_id is null or owner_team.team_id = p_team_id)
        and (p_product_id is null or opportunity_row.product_id = p_product_id)
        and (p_source_id is null or opportunity_row.source_id = p_source_id)
    ), buckets as (
      select
        sale.owner_id,
        date_trunc('day', sale.closed_at at time zone 'America/Sao_Paulo')
          at time zone 'America/Sao_Paulo' as closed_at,
        sum(sale.requested_reversal)::numeric as requested_reversal,
        sum(sale.production_value)::numeric as production_value,
        count(*)::integer as sales_count,
        sale.product_id,
        sale.source_id,
        sale.team_id
      from won_sales sale
      group by sale.owner_id,
        date_trunc('day', sale.closed_at at time zone 'America/Sao_Paulo')
          at time zone 'America/Sao_Paulo',
        sale.product_id, sale.source_id, sale.team_id
    )
    select jsonb_build_object(
      'entries', coalesce((
        select jsonb_agg(to_jsonb(bucket) order by bucket.closed_at, bucket.owner_id)
        from buckets bucket
      ), '[]'::jsonb),
      'recent', coalesce((
        select jsonb_agg(to_jsonb(recent_sale) order by recent_sale.closed_at, recent_sale.sale_id)
        from (
          select
            pg_catalog.md5(p_organization_id::text || ':' || sale.id::text)::uuid as sale_id,
            sale.owner_id, sale.closed_at, sale.requested_reversal,
            sale.production_value, sale.product_id, sale.source_id, sale.team_id
          from won_sales sale
          where p_recent_after is null or sale.closed_at > p_recent_after
          order by sale.closed_at desc, sale.id desc
          limit p_recent_limit
        ) recent_sale
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.sales_ranking_snapshot(
  uuid, timestamptz, timestamptz, uuid, uuid, uuid, timestamptz, integer
) from public, anon;
grant execute on function public.sales_ranking_snapshot(
  uuid, timestamptz, timestamptz, uuid, uuid, uuid, timestamptz, integer
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
