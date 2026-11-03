begin;

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  entry_type public.financial_entry_type not null,
  group_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  beneficiary_user_id uuid references public.profiles(id) on delete set null,
  entry_type public.financial_entry_type not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  entry_date date not null,
  competence date not null,
  status public.financial_entry_status not null default 'draft',
  external_reference text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  reversed_entry_id uuid references public.financial_entries(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint financial_competence_month_start
    check (competence = date_trunc('month', competence)::date),
  constraint financial_approval_state check (
    (status <> 'realized') or (approved_by is not null and approved_at is not null)
  )
);
create index financial_entries_org_competence_idx
  on public.financial_entries(organization_id, competence, status) where deleted_at is null;
create index financial_entries_org_account_idx
  on public.financial_entries(organization_id, account_id, competence) where deleted_at is null;
create index financial_entries_opportunity_idx
  on public.financial_entries(opportunity_id) where opportunity_id is not null;
create unique index financial_entries_external_reference_unique
  on public.financial_entries(organization_id, external_reference)
  where external_reference is not null and deleted_at is null;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete cascade,
  cost_center_id uuid references public.cost_centers(id) on delete cascade,
  competence date not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_competence_month_start
    check (competence = date_trunc('month', competence)::date)
);
create unique index budgets_scope_unique
  on public.budgets(organization_id, account_id, coalesce(cost_center_id, '00000000-0000-0000-0000-000000000000'::uuid), competence);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index automation_rules_active_idx
  on public.automation_rules(organization_id, trigger_type) where active and deleted_at is null;

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  status public.automation_run_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  attempts smallint not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);
create index automation_runs_queue_idx
  on public.automation_runs(status, created_at) where status in ('queued', 'failed');

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  trigger_stage_id uuid references public.pipeline_stages(id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.email_templates(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  provider text not null,
  provider_message_id text,
  status public.message_delivery_status not null default 'queued',
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index message_deliveries_org_created_idx
  on public.message_deliveries(organization_id, created_at desc);
create unique index message_deliveries_provider_id_unique
  on public.message_deliveries(provider, provider_message_id)
  where provider_message_id is not null;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'chart_of_accounts','cost_centers','financial_entries','budgets',
    'automation_rules','email_templates'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end $$;

commit;