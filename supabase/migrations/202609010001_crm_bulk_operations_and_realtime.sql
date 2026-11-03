begin;

create index if not exists opportunities_org_updated_idx
  on public.opportunities(organization_id, updated_at desc)
  where deleted_at is null;

create index if not exists notifications_org_recipient_timeline_idx
  on public.notifications(organization_id, recipient_id, created_at desc);

create or replace function public.bulk_update_opportunities(
  p_organization_id uuid,
  p_opportunity_ids uuid[],
  p_owner_id uuid default null,
  p_pipeline_id uuid default null
)
returns setof public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_stage_id uuid;
  expected_count integer;
  found_count integer;
begin
  if auth.uid() is null or not app_private.has_role(p_organization_id, array['admin']::text[]) then
    raise exception 'Somente administradores podem alterar leads em massa.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_opportunity_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos um lead.' using errcode = '22023';
  end if;
  if p_owner_id is null and p_pipeline_id is null then
    raise exception 'Informe o novo responsavel ou funil.' using errcode = '22023';
  end if;

  select count(distinct opportunity_id) into expected_count
  from unnest(p_opportunity_ids) opportunity_id;

  select count(*) into found_count
  from public.opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.id = any(p_opportunity_ids)
    and opportunity.deleted_at is null;

  if found_count <> expected_count then
    raise exception 'Um ou mais leads nao pertencem a organizacao ou foram removidos.' using errcode = 'P0002';
  end if;

  if p_owner_id is not null and not exists (
    select 1 from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_owner_id
      and member.active = true
  ) then
    raise exception 'O vendedor selecionado nao esta ativo nesta organizacao.' using errcode = '22023';
  end if;

  if p_pipeline_id is not null then
    select stage.id into target_stage_id
    from public.pipeline_stages stage
    join public.pipelines pipeline on pipeline.id = stage.pipeline_id
    where pipeline.id = p_pipeline_id
      and pipeline.organization_id = p_organization_id
      and pipeline.active = true
      and pipeline.deleted_at is null
      and stage.organization_id = p_organization_id
      and stage.stage_type = 'open'
      and stage.active = true
      and stage.deleted_at is null
    order by stage.position
    limit 1;

    if target_stage_id is null then
      raise exception 'O funil selecionado nao possui uma etapa aberta ativa.' using errcode = '22023';
    end if;
  end if;

  update public.opportunities opportunity
  set owner_id = coalesce(p_owner_id, opportunity.owner_id),
      pipeline_id = coalesce(p_pipeline_id, opportunity.pipeline_id),
      stage_id = coalesce(target_stage_id, opportunity.stage_id),
      status = case when p_pipeline_id is not null then 'open' else opportunity.status end,
      loss_reason_id = case when p_pipeline_id is not null then null else opportunity.loss_reason_id end,
      closed_at = case when p_pipeline_id is not null then null else opportunity.closed_at end,
      stage_entered_at = case when p_pipeline_id is not null then now() else opportunity.stage_entered_at end,
      version = opportunity.version + 1,
      updated_at = now()
  where opportunity.organization_id = p_organization_id
    and opportunity.id = any(p_opportunity_ids)
    and opportunity.deleted_at is null;

  if p_owner_id is not null then
    update public.contacts contact
    set owner_id = p_owner_id,
        updated_at = now()
    where contact.organization_id = p_organization_id
      and contact.id in (
        select opportunity.contact_id
        from public.opportunities opportunity
        where opportunity.organization_id = p_organization_id
          and opportunity.id = any(p_opportunity_ids)
          and opportunity.deleted_at is null
      )
      and contact.deleted_at is null;

    update public.activities activity
    set owner_id = p_owner_id,
        updated_at = now()
    where activity.organization_id = p_organization_id
      and activity.opportunity_id = any(p_opportunity_ids)
      and activity.status = 'pending'
      and activity.deleted_at is null;
  end if;

  return query
  select opportunity.*
  from public.opportunities opportunity
  where opportunity.organization_id = p_organization_id
    and opportunity.id = any(p_opportunity_ids)
    and opportunity.deleted_at is null
  order by opportunity.updated_at desc;
end;
$$;

revoke all on function public.bulk_update_opportunities(uuid, uuid[], uuid, uuid)
  from public, anon;
grant execute on function public.bulk_update_opportunities(uuid, uuid[], uuid, uuid)
  to authenticated, service_role;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'opportunities', 'contacts', 'opportunity_stage_history',
      'tags', 'opportunity_tags'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

comment on function public.bulk_update_opportunities(uuid, uuid[], uuid, uuid) is
  'Transfere responsavel e/ou funil de varios leads em uma unica operacao administrativa.';

commit;
