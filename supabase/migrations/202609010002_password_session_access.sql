begin;

create or replace function app_private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members member
    where member.organization_id = target_org
      and member.user_id = auth.uid()
      and member.active
  );
$$;

create or replace function app_private.has_role(target_org uuid, allowed public.access_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members member
    where member.organization_id = target_org
      and member.user_id = auth.uid()
      and member.active
      and member.role = any(allowed)
  );
$$;

create or replace function app_private.can_access_crm_owner(target_org uuid, target_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and app_private.is_org_member(target_org)
    and (
      auth.uid() = target_owner
      or app_private.has_role(target_org, array['admin'::public.access_role])
    );
$$;

create or replace function public.my_access_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', profile.id,
      'full_name', profile.full_name,
      'email', profile.email,
      'phone', profile.phone,
      'extension', profile.extension,
      'avatar_path', profile.avatar_path,
      'active', profile.active
    ),
    'organizations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', organization.id,
          'name', organization.name,
          'role', member.role,
          'teams', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', team.id,
                'name', team.name,
                'is_manager', team_member.is_manager
              ) order by team.name
            )
            from public.team_members team_member
            join public.teams team on team.id = team_member.team_id
            where team_member.user_id = profile.id
              and team.organization_id = organization.id
              and team.active
              and team.deleted_at is null
          ), '[]'::jsonb)
        ) order by organization.name
      )
      from public.organization_members member
      join public.organizations organization on organization.id = member.organization_id
      where member.user_id = profile.id
        and member.active
        and organization.active
        and organization.deleted_at is null
    ), '[]'::jsonb),
    'preferences', coalesce(
      (select to_jsonb(preferences) - 'user_id'
       from public.user_preferences preferences where preferences.user_id = profile.id),
      '{}'::jsonb
    )
  )
  from public.profiles profile
  where profile.id = auth.uid() and profile.active;
$$;

comment on function app_private.is_org_member(uuid) is
  'Valida uma associacao ativa. A autenticacao e a renovacao da sessao ficam a cargo do Supabase Auth.';

commit;
