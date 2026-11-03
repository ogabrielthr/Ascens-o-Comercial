begin;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  legal_name text,
  cnpj text,
  phone text,
  site text,
  city text,
  state char(2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organizations_cnpj_digits check (cnpj is null or cnpj = public.normalize_digits(cnpj)),
  constraint organizations_cnpj_length check (cnpj is null or char_length(cnpj) = 14)
);
create unique index organizations_cnpj_unique
  on public.organizations (cnpj) where cnpj is not null and deleted_at is null;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 160),
  email extensions.citext,
  phone text,
  extension text,
  avatar_path text,
  active boolean not null default true,
  admission_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_unique on public.profiles(email) where email is not null;

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.access_role not null default 'user',
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx
  on public.organization_members(user_id, active);
create index organization_members_org_role_idx
  on public.organization_members(organization_id, role) where active;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  color text,
  manager_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index teams_org_name_unique
  on public.teams(organization_id, lower(name)) where deleted_at is null;
create index teams_manager_idx on public.teams(organization_id, manager_id) where active;

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_manager boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id, team_id);

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  density text not null default 'normal' check (density in ('normal', 'compact')),
  sidebar_collapsed boolean not null default false,
  hide_currency boolean not null default false,
  default_module text check (default_module in ('crm', 'performance', 'finance')),
  mood_checkin_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.active
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
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.active
      and m.role = any(allowed)
  );
$$;

create or replace function app_private.manages_user(target_org uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() = target_user
    or app_private.has_role(target_org, array['admin'::public.access_role])
    or (
      app_private.has_role(target_org, array['manager'::public.access_role])
      and exists (
        select 1
        from public.teams t
        join public.team_members manager_membership
          on manager_membership.team_id = t.id
         and manager_membership.user_id = auth.uid()
         and manager_membership.is_manager
        join public.team_members target_membership
          on target_membership.team_id = t.id
         and target_membership.user_id = target_user
        where t.organization_id = target_org
          and t.active
      )
    );
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();
create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

commit;