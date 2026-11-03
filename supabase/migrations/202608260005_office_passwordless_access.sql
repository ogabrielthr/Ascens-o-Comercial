begin;

create table public.office_access_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  attempts_remaining smallint not null default 5 check (attempts_remaining between 0 and 5),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  grant_hash text unique,
  grant_expires_at timestamptz,
  grant_used_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_ip text,
  used_ip text,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index office_access_codes_user_active_idx
  on public.office_access_codes(user_id, created_at desc)
  where used_at is null and revoked_at is null;

create table public.office_access_sessions (
  session_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_code_id uuid not null references public.office_access_codes(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index office_access_sessions_user_active_idx
  on public.office_access_sessions(user_id, expires_at desc)
  where revoked_at is null;

alter table public.office_access_codes enable row level security;
alter table public.office_access_sessions enable row level security;
revoke all on public.office_access_codes from anon, authenticated;
revoke all on public.office_access_sessions from anon, authenticated;

create or replace function public.consume_office_access_code(
  p_user_id uuid,
  p_code_hash text,
  p_grant_hash text,
  p_ip_address text default null
)
returns table(code_id uuid, organization_id uuid, user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_code public.office_access_codes%rowtype;
begin
  select code.* into access_code
  from public.office_access_codes code
  join public.organization_members member
    on member.organization_id = code.organization_id
   and member.user_id = code.user_id
   and member.active
   and member.role <> 'admin'::public.access_role
  where code.user_id = p_user_id
    and code.used_at is null
    and code.revoked_at is null
    and code.expires_at > now()
    and code.attempts_remaining > 0
  order by code.created_at desc
  limit 1
  for update of code;

  if not found then return; end if;

  if access_code.code_hash <> p_code_hash
     or (access_code.created_ip is not null
         and access_code.created_ip <> nullif(left(coalesce(p_ip_address, ''), 160), '')) then
    update public.office_access_codes
    set attempts_remaining = greatest(0, attempts_remaining - 1),
        revoked_at = case when attempts_remaining <= 1 then now() else revoked_at end
    where id = access_code.id;
    return;
  end if;

  update public.office_access_codes
  set used_at = now(),
      used_ip = nullif(left(coalesce(p_ip_address, ''), 160), ''),
      grant_hash = p_grant_hash,
      grant_expires_at = now() + interval '2 minutes'
  where id = access_code.id;

  return query
  select access_code.id, access_code.organization_id, access_code.user_id, profile.email::text
  from public.profiles profile
  where profile.id = access_code.user_id and profile.active;
end;
$$;

create or replace function public.activate_office_access_session(
  p_user_id uuid,
  p_session_id uuid,
  p_grant_hash text,
  p_ip_address text default null
)
returns table(organization_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_code public.office_access_codes%rowtype;
  session_expiry timestamptz;
begin
  select code.* into access_code
  from public.office_access_codes code
  join public.organization_members member
    on member.organization_id = code.organization_id
   and member.user_id = code.user_id
   and member.active
   and member.role <> 'admin'::public.access_role
  where code.user_id = p_user_id
    and code.grant_hash = p_grant_hash
    and code.grant_used_at is null
    and code.grant_expires_at > now()
  limit 1
  for update of code;

  if not found then return; end if;

  session_expiry := least(
    now() + interval '12 hours',
    ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day')
      at time zone 'America/Sao_Paulo')
  );

  update public.office_access_codes set grant_used_at = now() where id = access_code.id;
  insert into public.office_access_sessions (
    session_id, organization_id, user_id, access_code_id, expires_at, ip_address
  ) values (
    p_session_id, access_code.organization_id, p_user_id, access_code.id,
    session_expiry, nullif(left(coalesce(p_ip_address, ''), 160), '')
  )
  on conflict (session_id) do update
  set expires_at = excluded.expires_at,
      revoked_at = null,
      ip_address = excluded.ip_address,
      last_seen_at = now();

  return query select access_code.organization_id, session_expiry;
end;
$$;

revoke execute on function public.consume_office_access_code(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.activate_office_access_session(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_office_access_code(uuid, text, text, text) to service_role;
grant execute on function public.activate_office_access_session(uuid, uuid, text, text) to service_role;

create or replace function app_private.has_valid_office_session(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.office_access_sessions office_session
    where office_session.organization_id = target_org
      and office_session.user_id = auth.uid()
      and office_session.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and office_session.revoked_at is null
      and office_session.expires_at > now()
  );
$$;

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
      and (
        member.role = 'admin'::public.access_role
        or app_private.has_valid_office_session(target_org)
      )
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
      and (
        member.role = 'admin'::public.access_role
        or app_private.has_valid_office_session(target_org)
      )
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
        and (
          member.role = 'admin'::public.access_role
          or app_private.has_valid_office_session(organization.id)
        )
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

create or replace function app_private.revoke_office_access_on_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active then
    update public.office_access_codes
    set revoked_at = coalesce(revoked_at, now())
    where organization_id = new.organization_id
      and user_id = new.user_id
      and used_at is null;
    update public.office_access_sessions
    set revoked_at = coalesce(revoked_at, now())
    where organization_id = new.organization_id
      and user_id = new.user_id
      and revoked_at is null;
  end if;
  return new;
end;
$$;

create trigger organization_members_revoke_office_access
after update of active on public.organization_members
for each row execute function app_private.revoke_office_access_on_membership_change();

revoke execute on function app_private.has_valid_office_session(uuid)
  from public, anon;
grant execute on function app_private.has_valid_office_session(uuid) to authenticated, service_role;
revoke execute on function app_private.revoke_office_access_on_membership_change()
  from public, anon, authenticated;

comment on table public.office_access_codes is
  'Codigos individuais, temporarios e de uso unico liberados pela administracao.';
comment on table public.office_access_sessions is
  'Sessoes sem senha autorizadas para o expediente e vinculadas ao session_id do Supabase Auth.';

commit;
