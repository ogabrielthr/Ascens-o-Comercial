begin;

create or replace function public.save_team(
  p_organization_id uuid,
  p_team_id uuid,
  p_name text,
  p_color text,
  p_manager_id uuid
)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare team_row public.teams%rowtype;
begin
  if auth.uid() is null or not app_private.has_role(p_organization_id, array['admin'::public.access_role]) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 100 then
    raise exception 'valid team name required' using errcode = '23514';
  end if;
  if p_manager_id is not null and not app_private.user_in_org(p_organization_id, p_manager_id) then
    raise exception 'manager does not belong to organization' using errcode = '23514';
  end if;
  if p_team_id is null then
    insert into public.teams (organization_id, name, color, manager_id)
    values (p_organization_id, trim(p_name), nullif(trim(p_color), ''), p_manager_id)
    returning * into team_row;
  else
    update public.teams set name = trim(p_name), color = nullif(trim(p_color), ''),
      manager_id = p_manager_id, active = true, deleted_at = null, updated_at = now()
    where id = p_team_id and organization_id = p_organization_id and deleted_at is null
    returning * into team_row;
    if not found then raise exception 'team not found' using errcode = 'P0002'; end if;
  end if;
  update public.team_members set is_manager = false where team_id = team_row.id and is_manager;
  if p_manager_id is not null then
    insert into public.team_members (team_id, user_id, is_manager)
    values (team_row.id, p_manager_id, true)
    on conflict (team_id, user_id) do update set is_manager = true;
  end if;
  return team_row;
end;
$$;

revoke execute on function public.save_team(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.save_team(uuid, uuid, text, text, uuid) to authenticated, service_role;

commit;
