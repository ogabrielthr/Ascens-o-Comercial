begin;

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
begin
  display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if display_name is null then
    display_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;
  if display_name is null then display_name := 'Usuário'; end if;

  insert into public.profiles (id, full_name, email, active)
  values (new.id, display_name, new.email, true)
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function app_private.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function app_private.handle_auth_user_updated();

create or replace function public.my_access_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'extension', p.extension,
      'avatar_path', p.avatar_path,
      'active', p.active
    ),
    'organizations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'role', m.role,
          'teams', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'is_manager', tm.is_manager
              )
              order by t.name
            )
            from public.team_members tm
            join public.teams t on t.id = tm.team_id
            where tm.user_id = p.id
              and t.organization_id = o.id
              and t.active
              and t.deleted_at is null
          ), '[]'::jsonb)
        )
        order by o.name
      )
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p.id
        and m.active
        and o.active
        and o.deleted_at is null
    ), '[]'::jsonb),
    'preferences', coalesce(
      (select to_jsonb(up) - 'user_id' from public.user_preferences up where up.user_id = p.id),
      '{}'::jsonb
    )
  )
  from public.profiles p
  where p.id = auth.uid() and p.active;
$$;

create or replace function public.has_access_role(
  target_org uuid,
  allowed public.access_role[]
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.has_role(target_org, allowed);
$$;

grant execute on function public.my_access_context() to authenticated;
grant execute on function public.has_access_role(uuid, public.access_role[]) to authenticated;

revoke execute on function app_private.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function app_private.handle_auth_user_updated() from public, anon, authenticated;

commit;