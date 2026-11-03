begin;

create or replace function app_private.require_pipeline_admin(p_organization_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_role(p_organization_id, array['admin'::public.access_role]) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.save_pipeline_stage(
  p_pipeline_id uuid, p_stage_id uuid, p_name text,
  p_sla_days integer, p_probability numeric, p_color text
)
returns public.pipeline_stages
language plpgsql security definer set search_path = '' as $$
declare pipeline_row public.pipelines%rowtype; stage_row public.pipeline_stages%rowtype; next_position smallint;
begin
  select * into pipeline_row from public.pipelines p
  where p.id = p_pipeline_id and p.active and p.deleted_at is null for update;
  if not found then raise exception 'pipeline not found' using errcode = 'P0002'; end if;
  perform app_private.require_pipeline_admin(pipeline_row.organization_id);
  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 120 then
    raise exception 'valid stage name required' using errcode = '23514';
  end if;
  if p_sla_days is null or p_sla_days < 0 or p_probability is null or p_probability < 0 or p_probability > 100 then
    raise exception 'invalid stage metrics' using errcode = '23514';
  end if;
  if p_stage_id is not null then
    update public.pipeline_stages set name = trim(p_name), sla_days = p_sla_days,
      probability = p_probability, color = nullif(trim(p_color), ''), updated_at = now()
    where id = p_stage_id and pipeline_id = pipeline_row.id and deleted_at is null
    returning * into stage_row;
    if not found then raise exception 'stage not found' using errcode = 'P0002'; end if;
  else
    select coalesce(min(position) filter (where stage_type <> 'open'), max(position) + 1, 0)::smallint
      into next_position from public.pipeline_stages
      where pipeline_id = pipeline_row.id and deleted_at is null;
    update public.pipeline_stages set position = position + 1000
      where pipeline_id = pipeline_row.id and deleted_at is null and position >= next_position;
    update public.pipeline_stages set position = position - 999
      where pipeline_id = pipeline_row.id and deleted_at is null and position >= next_position + 1000;
    insert into public.pipeline_stages
      (organization_id, pipeline_id, name, position, stage_type, probability, sla_days, color)
    values (pipeline_row.organization_id, pipeline_row.id, trim(p_name), next_position, 'open',
      p_probability, p_sla_days, nullif(trim(p_color), '')) returning * into stage_row;
  end if;
  return stage_row;
end;
$$;

create or replace function public.reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[])
returns setof public.pipeline_stages
language plpgsql security definer set search_path = '' as $$
declare pipeline_row public.pipelines%rowtype; expected_count integer; supplied_count integer;
begin
  select * into pipeline_row from public.pipelines p
  where p.id = p_pipeline_id and p.deleted_at is null for update;
  if not found then raise exception 'pipeline not found' using errcode = 'P0002'; end if;
  perform app_private.require_pipeline_admin(pipeline_row.organization_id);
  select count(*) into expected_count from public.pipeline_stages
    where pipeline_id = p_pipeline_id and deleted_at is null;
  select count(distinct supplied.stage_id) into supplied_count
    from unnest(p_stage_ids) as supplied(stage_id);
  if supplied_count <> expected_count or exists (
    select 1 from unnest(p_stage_ids) as supplied(stage_id) left join public.pipeline_stages s
      on s.id = supplied.stage_id and s.pipeline_id = p_pipeline_id and s.deleted_at is null where s.id is null
  ) then raise exception 'stage list must contain every active stage exactly once' using errcode = '23514'; end if;
  if exists (
    select 1 from unnest(p_stage_ids) with ordinality x(id, pos)
    join public.pipeline_stages s on s.id = x.id
    where s.stage_type = 'open' and exists (
      select 1 from unnest(p_stage_ids) with ordinality y(id, pos)
      join public.pipeline_stages terminal on terminal.id = y.id
      where terminal.stage_type <> 'open' and y.pos < x.pos
    )
  ) then raise exception 'open stages must precede terminal stages' using errcode = '23514'; end if;
  update public.pipeline_stages set position = position + 1000
    where pipeline_id = p_pipeline_id and deleted_at is null;
  update public.pipeline_stages s set position = x.pos - 1, updated_at = now()
    from unnest(p_stage_ids) with ordinality x(id, pos) where s.id = x.id;
  return query select * from public.pipeline_stages
    where pipeline_id = p_pipeline_id and deleted_at is null order by position;
end;
$$;

create or replace function public.archive_pipeline_stage(p_stage_id uuid)
returns public.pipeline_stages
language plpgsql security definer set search_path = '' as $$
declare stage_row public.pipeline_stages%rowtype; usage_count integer; open_count integer;
begin
  select * into stage_row from public.pipeline_stages s
  where s.id = p_stage_id and s.deleted_at is null for update;
  if not found then raise exception 'stage not found' using errcode = 'P0002'; end if;
  perform app_private.require_pipeline_admin(stage_row.organization_id);
  if stage_row.stage_type <> 'open' then raise exception 'terminal stages cannot be archived' using errcode = '23514'; end if;
  select count(*) into usage_count from public.opportunities where stage_id = stage_row.id and deleted_at is null;
  if usage_count > 0 then raise exception 'stage is used by opportunities' using errcode = '23514'; end if;
  select count(*) into open_count from public.pipeline_stages
    where pipeline_id = stage_row.pipeline_id and stage_type = 'open' and deleted_at is null;
  if open_count <= 1 then raise exception 'pipeline must keep one open stage' using errcode = '23514'; end if;
  update public.pipeline_stages set active = false, deleted_at = now(), updated_at = now()
    where id = stage_row.id returning * into stage_row;
  return stage_row;
end;
$$;

revoke execute on function app_private.require_pipeline_admin(uuid) from public, anon, authenticated;
revoke execute on function public.save_pipeline_stage(uuid, uuid, text, integer, numeric, text) from public, anon;
revoke execute on function public.reorder_pipeline_stages(uuid, uuid[]) from public, anon;
revoke execute on function public.archive_pipeline_stage(uuid) from public, anon;
grant execute on function public.save_pipeline_stage(uuid, uuid, text, integer, numeric, text) to authenticated, service_role;
grant execute on function public.reorder_pipeline_stages(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.archive_pipeline_stage(uuid) to authenticated, service_role;

commit;
