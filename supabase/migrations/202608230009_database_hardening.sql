begin;

create or replace function app_private.set_actor_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'companies','contacts','opportunities','activities','goals',
    'learning_tracks','financial_entries','budgets',
    'automation_rules','email_templates','message_deliveries'
  ] loop
    execute format(
      'create trigger %I_set_actor before insert on public.%I for each row execute function app_private.set_actor_columns()',
      table_name, table_name
    );
  end loop;
end $$;

create or replace function app_private.validate_extended_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkin_org uuid;
  opportunity_org uuid;
begin
  if tg_table_name = 'teams' then
    if new.manager_id is not null and not app_private.user_in_org(new.organization_id, new.manager_id) then
      raise exception 'team manager does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'team_members' then
    select t.organization_id into checkin_org from public.teams t where t.id = new.team_id;
    if checkin_org is null or not app_private.user_in_org(checkin_org, new.user_id) then
      raise exception 'team member does not belong to team organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'opportunities' then
    if not exists (
      select 1 from public.pipeline_stages s
      where s.id = new.stage_id and s.pipeline_id = new.pipeline_id
    ) then
      raise exception 'stage does not belong to opportunity pipeline' using errcode = '23514';
    end if;

  elsif tg_table_name = 'opportunity_stage_history' then
    if not app_private.entity_in_org('public.opportunities', new.opportunity_id, new.organization_id)
       or not app_private.entity_in_org('public.pipeline_stages', new.from_stage_id, new.organization_id)
       or not app_private.entity_in_org('public.pipeline_stages', new.to_stage_id, new.organization_id)
       or (new.changed_by is not null and not app_private.user_in_org(new.organization_id, new.changed_by)) then
      raise exception 'stage history reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'mood_checkin_factors' then
    select c.organization_id into checkin_org
    from public.daily_mood_checkins c where c.id = new.checkin_id;
    if checkin_org is null
       or not app_private.entity_in_org('public.mood_factors', new.factor_id, checkin_org) then
      raise exception 'mood factor does not belong to checkin organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'lesson_progress' then
    if not app_private.entity_in_org('public.lessons', new.lesson_id, new.organization_id) then
      raise exception 'lesson does not belong to progress organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'file_downloads' then
    if not app_private.entity_in_org('public.files', new.file_id, new.organization_id)
       or not app_private.user_in_org(new.organization_id, new.user_id) then
      raise exception 'download reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'automation_runs' then
    if not app_private.entity_in_org('public.automation_rules', new.rule_id, new.organization_id) then
      raise exception 'automation rule does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'email_templates' then
    if not app_private.entity_in_org('public.pipeline_stages', new.trigger_stage_id, new.organization_id) then
      raise exception 'email stage does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'message_deliveries' then
    if not app_private.entity_in_org('public.email_templates', new.template_id, new.organization_id)
       or not app_private.entity_in_org('public.contacts', new.contact_id, new.organization_id)
       or not app_private.entity_in_org('public.opportunities', new.opportunity_id, new.organization_id) then
      raise exception 'message reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'financial_entries' then
    if new.approved_by is not null and not app_private.user_in_org(new.organization_id, new.approved_by) then
      raise exception 'approver does not belong to organization' using errcode = '23514';
    end if;
    if new.reversed_entry_id is not null
       and not app_private.entity_in_org('public.financial_entries', new.reversed_entry_id, new.organization_id) then
      raise exception 'reversed entry does not belong to organization' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'teams','team_members','opportunities','opportunity_stage_history',
    'mood_checkin_factors','lesson_progress','file_downloads',
    'automation_runs','email_templates','message_deliveries','financial_entries'
  ] loop
    execute format(
      'create trigger %I_validate_extended before insert or update on public.%I for each row execute function app_private.validate_extended_references()',
      table_name, table_name
    );
  end loop;
end $$;

-- Audit trigger must return the correct row type on DELETE.
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

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

commit;