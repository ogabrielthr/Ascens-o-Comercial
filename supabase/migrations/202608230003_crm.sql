begin;

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index pipelines_default_unique
  on public.pipelines(organization_id) where is_default and deleted_at is null;
create unique index pipelines_org_name_unique
  on public.pipelines(organization_id, lower(name)) where deleted_at is null;

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position smallint not null check (position >= 0),
  stage_type public.pipeline_stage_type not null default 'open',
  probability numeric(5,2) not null default 0 check (probability between 0 and 100),
  sla_days integer not null default 0 check (sla_days >= 0),
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index pipeline_stages_position_unique
  on public.pipeline_stages(pipeline_id, position) where deleted_at is null;
create index pipeline_stages_org_pipeline_idx
  on public.pipeline_stages(organization_id, pipeline_id, position);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  default_commission_rate numeric(7,4) not null default 0
    check (default_commission_rate between 0 and 100),
  min_amount numeric(14,2) check (min_amount is null or min_amount >= 0),
  max_amount numeric(14,2) check (max_amount is null or max_amount >= min_amount),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index products_org_name_unique
  on public.products(organization_id, lower(name)) where deleted_at is null;

create table public.banks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index banks_org_name_unique
  on public.banks(organization_id, lower(name)) where deleted_at is null;

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index lead_sources_org_name_unique
  on public.lead_sources(organization_id, lower(name)) where deleted_at is null;

create table public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index loss_reasons_org_name_unique
  on public.loss_reasons(organization_id, lower(name)) where deleted_at is null;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  legal_name text,
  cnpj text,
  company_type text,
  contact_name text,
  phone text,
  city text,
  state char(2),
  owner_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint companies_cnpj_digits check (cnpj is null or cnpj = public.normalize_digits(cnpj)),
  constraint companies_cnpj_length check (cnpj is null or char_length(cnpj) = 14)
);
create unique index companies_org_cnpj_unique
  on public.companies(organization_id, cnpj)
  where cnpj is not null and deleted_at is null;
create index companies_org_owner_idx on public.companies(organization_id, owner_id);
create index companies_name_trgm_idx on public.companies using gin (name extensions.gin_trgm_ops);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  cpf text,
  email extensions.citext,
  phone text,
  city text,
  state char(2),
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown', 'granted', 'revoked')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contacts_cpf_digits check (cpf is null or cpf = public.normalize_digits(cpf)),
  constraint contacts_cpf_length check (cpf is null or char_length(cpf) = 11)
);
create unique index contacts_org_cpf_unique
  on public.contacts(organization_id, cpf)
  where cpf is not null and deleted_at is null;
create index contacts_org_owner_idx on public.contacts(organization_id, owner_id);
create index contacts_org_phone_idx on public.contacts(organization_id, phone);
create index contacts_name_trgm_idx on public.contacts using gin (full_name extensions.gin_trgm_ops);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  bank_id uuid references public.banks(id) on delete set null,
  source_id uuid references public.lead_sources(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  expected_commission numeric(14,2) not null default 0 check (expected_commission >= 0),
  status public.opportunity_status not null default 'open',
  loss_reason_id uuid references public.loss_reasons(id) on delete set null,
  expected_close_date date,
  stage_entered_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint opportunities_close_state check (
    (status = 'open' and closed_at is null and loss_reason_id is null)
    or (status = 'won' and closed_at is not null and loss_reason_id is null)
    or (status = 'lost' and closed_at is not null and loss_reason_id is not null)
    or (status = 'cancelled' and closed_at is not null)
  )
);
create index opportunities_org_owner_status_idx
  on public.opportunities(organization_id, owner_id, status) where deleted_at is null;
create index opportunities_org_stage_entered_idx
  on public.opportunities(organization_id, stage_id, stage_entered_at) where deleted_at is null;
create index opportunities_open_expected_close_idx
  on public.opportunities(organization_id, expected_close_date)
  where status = 'open' and deleted_at is null;
create index opportunities_contact_idx on public.opportunities(contact_id, created_at desc);

create table public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  duration_seconds bigint check (duration_seconds is null or duration_seconds >= 0)
);
create index opportunity_stage_history_timeline_idx
  on public.opportunity_stage_history(opportunity_id, changed_at desc);
create index opportunity_stage_history_org_stage_idx
  on public.opportunity_stage_history(organization_id, to_stage_id, changed_at);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);
create unique index tags_org_name_unique on public.tags(organization_id, lower(name));

create table public.opportunity_tags (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (opportunity_id, tag_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  activity_type public.activity_type not null,
  status public.activity_status not null default 'completed',
  result text,
  notes text,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint activities_dates check (
    status <> 'completed' or completed_at is not null
  )
);
create index activities_org_owner_schedule_idx
  on public.activities(organization_id, owner_id, scheduled_at) where deleted_at is null;
create index activities_opportunity_timeline_idx
  on public.activities(opportunity_id, coalesce(completed_at, scheduled_at, created_at) desc)
  where deleted_at is null;

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  year smallint not null check (year between 2020 and 2200),
  month smallint not null check (month between 1 and 12),
  calls integer not null default 0 check (calls >= 0),
  appointments integer not null default 0 check (appointments >= 0),
  meetings integer not null default 0 check (meetings >= 0),
  proposals integer not null default 0 check (proposals >= 0),
  sales_count integer not null default 0 check (sales_count >= 0),
  sales_amount numeric(14,2) not null default 0 check (sales_amount >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, year, month)
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'pipelines','pipeline_stages','products','banks','lead_sources',
    'loss_reasons','companies','contacts','opportunities','activities','goals'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end $$;

commit;