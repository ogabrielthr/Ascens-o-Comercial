begin;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action public.audit_action not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_logs_org_time_idx
  on public.audit_logs(organization_id, occurred_at desc);
create index audit_logs_entity_idx
  on public.audit_logs(entity_type, entity_id, occurred_at desc);

create or replace function app_private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  org_id uuid;
  row_id uuid;
  action_name public.audit_action;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  org_id := coalesce((new_row ->> 'organization_id')::uuid, (old_row ->> 'organization_id')::uuid);
  row_id := coalesce((new_row ->> 'id')::uuid, (old_row ->> 'id')::uuid);
  action_name := lower(tg_op)::public.audit_action;

  insert into public.audit_logs
    (organization_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values
    (org_id, auth.uid(), action_name, tg_table_name, row_id, old_row, new_row);

  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organization_members','teams','team_members','pipelines','pipeline_stages',
    'products','banks','lead_sources','loss_reasons','companies','contacts',
    'opportunities','activities','goals','mood_factors','daily_mood_checkins',
    'learning_tracks','lessons','lesson_progress','gamification_rules',
    'files','financial_entries','budgets','automation_rules','email_templates'
  ] loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function app_private.audit_row_change()',
      table_name, table_name
    );
  end loop;
end $$;

-- RLS is mandatory on every table exposed through the public schema.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','profiles','organization_members','teams','team_members',
    'user_preferences','pipelines','pipeline_stages','products','banks',
    'lead_sources','loss_reasons','companies','contacts','opportunities',
    'opportunity_stage_history','tags','opportunity_tags','activities','goals',
    'mood_scale_options','mood_factors','daily_mood_checkins',
    'mood_checkin_factors','mood_checkin_skips','learning_tracks','lessons',
    'lesson_progress','gamification_rules','point_events','file_categories',
    'files','file_downloads','chart_of_accounts','cost_centers',
    'financial_entries','budgets','automation_rules','automation_runs',
    'email_templates','message_deliveries','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end $$;

-- Identity and organization.
create policy organizations_select_member on public.organizations
for select to authenticated
using (app_private.is_org_member(id));

create policy organizations_update_admin on public.organizations
for update to authenticated
using (app_private.has_role(id, array['admin'::public.access_role]))
with check (app_private.has_role(id, array['admin'::public.access_role]));

create policy profiles_select_shared_org on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
     and theirs.user_id = profiles.id
     and theirs.active
    where mine.user_id = auth.uid() and mine.active
  )
);

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
for update to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.user_id = profiles.id
      and app_private.has_role(m.organization_id, array['admin'::public.access_role])
  )
)
with check (
  exists (
    select 1 from public.organization_members m
    where m.user_id = profiles.id
      and app_private.has_role(m.organization_id, array['admin'::public.access_role])
  )
);

create policy memberships_select_scope on public.organization_members
for select to authenticated
using (
  user_id = auth.uid()
  or app_private.has_role(organization_id, array['admin'::public.access_role, 'manager'::public.access_role])
);

create policy memberships_admin_all on public.organization_members
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role]));

create policy teams_select_member on public.teams
for select to authenticated using (app_private.is_org_member(organization_id));
create policy teams_admin_manage on public.teams
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role]));

create policy team_members_select_scope on public.team_members
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.teams t
    where t.id = team_members.team_id
      and app_private.has_role(t.organization_id, array['admin'::public.access_role, 'manager'::public.access_role])
  )
);
create policy team_members_admin_manage on public.team_members
for all to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = team_members.team_id
      and app_private.has_role(t.organization_id, array['admin'::public.access_role])
  )
)
with check (
  exists (
    select 1 from public.teams t
    where t.id = team_members.team_id
      and app_private.has_role(t.organization_id, array['admin'::public.access_role])
  )
);

create policy preferences_self on public.user_preferences
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared catalog tables: members read; admins manage.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'pipelines','pipeline_stages','products','banks','lead_sources',
    'loss_reasons','tags','mood_scale_options','mood_factors',
    'learning_tracks','lessons','gamification_rules','file_categories'
  ] loop
    execute format(
      'create policy %I_member_read on public.%I for select to authenticated using (app_private.is_org_member(organization_id))',
      table_name, table_name
    );
    execute format(
      'create policy %I_admin_manage on public.%I for all to authenticated using (app_private.has_role(organization_id, array[''admin''::public.access_role])) with check (app_private.has_role(organization_id, array[''admin''::public.access_role]))',
      table_name, table_name
    );
  end loop;
end $$;

-- CRM entities: own/team scope, with operations allowed to read organization-wide.
create policy companies_read_scope on public.companies
for select to authenticated
using (
  app_private.manages_user(organization_id, owner_id)
  or app_private.has_role(organization_id, array['operations'::public.access_role])
);
create policy companies_write_scope on public.companies
for all to authenticated
using (
  app_private.manages_user(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role,'manager'::public.access_role,
    'commercial'::public.access_role,'bdr'::public.access_role
  ])
)
with check (
  app_private.manages_user(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role,'manager'::public.access_role,
    'commercial'::public.access_role,'bdr'::public.access_role
  ])
);

create policy contacts_read_scope on public.contacts
for select to authenticated
using (
  app_private.manages_user(organization_id, owner_id)
  or app_private.has_role(organization_id, array['operations'::public.access_role])
);
create policy contacts_write_scope on public.contacts
for all to authenticated
using (
  app_private.manages_user(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role,'manager'::public.access_role,
    'commercial'::public.access_role,'bdr'::public.access_role
  ])
)
with check (
  app_private.manages_user(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role,'manager'::public.access_role,
    'commercial'::public.access_role,'bdr'::public.access_role
  ])
);

create policy opportunities_read_scope on public.opportunities
for select to authenticated
using (
  app_private.manages_user(organization_id, owner_id)
  or app_private.has_role(organization_id, array['operations'::public.access_role,'finance'::public.access_role])
);
create policy opportunities_insert_scope on public.opportunities
for insert to authenticated
with check (
  app_private.manages_user(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role,'manager'::public.access_role,
    'commercial'::public.access_role,'bdr'::public.access_role
  ])
);
-- Sensitive transitions are intentionally absent from direct UPDATE policies.
-- They will be exposed by checked server-side functions in Phase 4.

create policy stage_history_read_scope on public.opportunity_stage_history
for select to authenticated
using (
  exists (
    select 1 from public.opportunities o
    where o.id = opportunity_stage_history.opportunity_id
  )
);

create policy activities_read_scope on public.activities
for select to authenticated
using (
  app_private.manages_user(organization_id, owner_id)
  or app_private.has_role(organization_id, array['operations'::public.access_role])
);
create policy activities_insert_scope on public.activities
for insert to authenticated
with check (
  app_private.manages_user(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role,'manager'::public.access_role,
    'commercial'::public.access_role,'bdr'::public.access_role,'operations'::public.access_role
  ])
);
create policy activities_update_scope on public.activities
for update to authenticated
using (app_private.manages_user(organization_id, owner_id))
with check (app_private.manages_user(organization_id, owner_id));

create policy goals_read_scope on public.goals
for select to authenticated using (app_private.manages_user(organization_id, user_id));
create policy goals_manager_write on public.goals
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
with check (
  app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role])
  and app_private.manages_user(organization_id, user_id)
);

-- Mood: own response; direct manager can read.
create policy mood_checkins_read_scope on public.daily_mood_checkins
for select to authenticated using (app_private.manages_user(organization_id, user_id));
create policy mood_checkins_insert_self on public.daily_mood_checkins
for insert to authenticated
with check (
  user_id = auth.uid()
  and app_private.is_org_member(organization_id)
  and not app_private.has_role(organization_id, array['admin'::public.access_role])
);
create policy mood_checkins_update_self on public.daily_mood_checkins
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy mood_factors_link_read on public.mood_checkin_factors
for select to authenticated
using (
  exists (
    select 1 from public.daily_mood_checkins c
    where c.id = mood_checkin_factors.checkin_id
  )
);
create policy mood_factors_link_self_write on public.mood_checkin_factors
for all to authenticated
using (
  exists (
    select 1 from public.daily_mood_checkins c
    where c.id = mood_checkin_factors.checkin_id and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.daily_mood_checkins c
    where c.id = mood_checkin_factors.checkin_id and c.user_id = auth.uid()
  )
);

create policy mood_skips_self on public.mood_checkin_skips
for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and app_private.is_org_member(organization_id));

-- Learning and points.
create policy lesson_progress_read_scope on public.lesson_progress
for select to authenticated using (app_private.manages_user(organization_id, user_id));
create policy lesson_progress_self_write on public.lesson_progress
for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and app_private.is_org_member(organization_id));
create policy point_events_read_scope on public.point_events
for select to authenticated using (app_private.manages_user(organization_id, user_id));
-- point_events has no client-side write policy; only trusted functions create points.

-- Files and downloads.
create policy files_read_scope on public.files
for select to authenticated
using (
  app_private.is_org_member(organization_id)
  and (
    access_level = 'organization'
    or uploaded_by = auth.uid()
    or (access_level = 'management' and app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
    or (access_level = 'finance' and app_private.has_role(organization_id, array['admin'::public.access_role,'finance'::public.access_role]))
  )
);
create policy files_admin_write on public.files
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]));

create policy downloads_insert_self on public.file_downloads
for insert to authenticated with check (user_id = auth.uid() and app_private.is_org_member(organization_id));
create policy downloads_read_management on public.file_downloads
for select to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]));

-- Finance.
do $$
declare table_name text;
begin
  foreach table_name in array array['chart_of_accounts','cost_centers','financial_entries','budgets'] loop
    execute format(
      'create policy %I_finance_read on public.%I for select to authenticated using (app_private.has_role(organization_id, array[''admin''::public.access_role,''finance''::public.access_role,''manager''::public.access_role,''auditor''::public.access_role]))',
      table_name, table_name
    );
    execute format(
      'create policy %I_finance_write on public.%I for all to authenticated using (app_private.has_role(organization_id, array[''admin''::public.access_role,''finance''::public.access_role])) with check (app_private.has_role(organization_id, array[''admin''::public.access_role,''finance''::public.access_role]))',
      table_name, table_name
    );
  end loop;
end $$;

-- Automations and communication.
do $$
declare table_name text;
begin
  foreach table_name in array array['automation_rules','automation_runs','email_templates','message_deliveries'] loop
    execute format(
      'create policy %I_management_read on public.%I for select to authenticated using (app_private.has_role(organization_id, array[''admin''::public.access_role,''manager''::public.access_role]))',
      table_name, table_name
    );
  end loop;
end $$;
create policy automation_rules_admin_write on public.automation_rules
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role]));
create policy email_templates_management_write on public.email_templates
for all to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]))
with check (app_private.has_role(organization_id, array['admin'::public.access_role,'manager'::public.access_role]));

create policy audit_logs_admin_read on public.audit_logs
for select to authenticated
using (app_private.has_role(organization_id, array['admin'::public.access_role,'auditor'::public.access_role]));

-- Storage bucket is private. Object names must start with organization UUID.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ascensao-files', 'ascensao-files', false, 26214400)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

create policy storage_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ascensao-files'
  and app_private.is_org_member((storage.foldername(name))[1]::uuid)
);
create policy storage_files_management_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ascensao-files'
  and app_private.has_role(
    (storage.foldername(name))[1]::uuid,
    array['admin'::public.access_role,'manager'::public.access_role]
  )
);
create policy storage_files_management_update on storage.objects
for update to authenticated
using (
  bucket_id = 'ascensao-files'
  and app_private.has_role(
    (storage.foldername(name))[1]::uuid,
    array['admin'::public.access_role,'manager'::public.access_role]
  )
);
create policy storage_files_management_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'ascensao-files'
  and app_private.has_role(
    (storage.foldername(name))[1]::uuid,
    array['admin'::public.access_role,'manager'::public.access_role]
  )
);

grant usage on schema app_private to authenticated;
grant execute on function app_private.is_org_member(uuid) to authenticated;
grant execute on function app_private.has_role(uuid, public.access_role[]) to authenticated;
grant execute on function app_private.manages_user(uuid, uuid) to authenticated;

commit;