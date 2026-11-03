begin;

create or replace function app_private.user_in_org(target_org uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = target_user
      and m.active
  );
$$;

create or replace function app_private.entity_in_org(
  target_table regclass,
  target_id uuid,
  target_org uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare found boolean;
begin
  if target_id is null then return true; end if;
  execute format(
    'select exists (select 1 from %s where id = $1 and organization_id = $2)',
    target_table
  ) into found using target_id, target_org;
  return found;
end;
$$;

create or replace function app_private.validate_organization_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'pipeline_stages' then
    if not app_private.entity_in_org('public.pipelines', new.pipeline_id, new.organization_id) then
      raise exception 'pipeline does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'companies' then
    if new.owner_id is not null and not app_private.user_in_org(new.organization_id, new.owner_id) then
      raise exception 'company owner does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'contacts' then
    if not app_private.entity_in_org('public.companies', new.company_id, new.organization_id)
       or (new.owner_id is not null and not app_private.user_in_org(new.organization_id, new.owner_id)) then
      raise exception 'contact reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'opportunities' then
    if not app_private.entity_in_org('public.contacts', new.contact_id, new.organization_id)
       or not app_private.entity_in_org('public.companies', new.company_id, new.organization_id)
       or not app_private.entity_in_org('public.pipelines', new.pipeline_id, new.organization_id)
       or not app_private.entity_in_org('public.pipeline_stages', new.stage_id, new.organization_id)
       or not app_private.entity_in_org('public.products', new.product_id, new.organization_id)
       or not app_private.entity_in_org('public.banks', new.bank_id, new.organization_id)
       or not app_private.entity_in_org('public.lead_sources', new.source_id, new.organization_id)
       or not app_private.entity_in_org('public.loss_reasons', new.loss_reason_id, new.organization_id)
       or not app_private.user_in_org(new.organization_id, new.owner_id) then
      raise exception 'opportunity reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'activities' then
    if not app_private.entity_in_org('public.opportunities', new.opportunity_id, new.organization_id)
       or not app_private.user_in_org(new.organization_id, new.owner_id) then
      raise exception 'activity reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'goals' or tg_table_name = 'daily_mood_checkins'
     or tg_table_name = 'mood_checkin_skips' or tg_table_name = 'lesson_progress'
     or tg_table_name = 'point_events' then
    if not app_private.user_in_org(new.organization_id, new.user_id) then
      raise exception 'user does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'lessons' then
    if not app_private.entity_in_org('public.learning_tracks', new.track_id, new.organization_id) then
      raise exception 'track does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'files' then
    if not app_private.entity_in_org('public.file_categories', new.category_id, new.organization_id)
       or not app_private.user_in_org(new.organization_id, new.uploaded_by) then
      raise exception 'file reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'financial_entries' then
    if not app_private.entity_in_org('public.chart_of_accounts', new.account_id, new.organization_id)
       or not app_private.entity_in_org('public.cost_centers', new.cost_center_id, new.organization_id)
       or not app_private.entity_in_org('public.opportunities', new.opportunity_id, new.organization_id)
       or (new.beneficiary_user_id is not null and not app_private.user_in_org(new.organization_id, new.beneficiary_user_id)) then
      raise exception 'financial reference does not belong to organization' using errcode = '23514';
    end if;

  elsif tg_table_name = 'budgets' then
    if not app_private.entity_in_org('public.chart_of_accounts', new.account_id, new.organization_id)
       or not app_private.entity_in_org('public.cost_centers', new.cost_center_id, new.organization_id) then
      raise exception 'budget reference does not belong to organization' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'pipeline_stages','companies','contacts','opportunities','activities','goals',
    'daily_mood_checkins','mood_checkin_skips','lessons','lesson_progress',
    'point_events','files','financial_entries','budgets'
  ] loop
    execute format(
      'create trigger %I_validate_org before insert or update on public.%I for each row execute function app_private.validate_organization_references()',
      table_name, table_name
    );
  end loop;
end $$;

create policy opportunity_tags_read_scope on public.opportunity_tags
for select to authenticated
using (
  exists (select 1 from public.opportunities o where o.id = opportunity_tags.opportunity_id)
);
create policy opportunity_tags_write_scope on public.opportunity_tags
for all to authenticated
using (
  exists (
    select 1 from public.opportunities o
    where o.id = opportunity_tags.opportunity_id
      and app_private.manages_user(o.organization_id, o.owner_id)
  )
)
with check (
  exists (
    select 1 from public.opportunities o
    join public.tags t on t.id = opportunity_tags.tag_id
    where o.id = opportunity_tags.opportunity_id
      and o.organization_id = t.organization_id
      and app_private.manages_user(o.organization_id, o.owner_id)
  )
);

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant execute on function app_private.user_in_org(uuid, uuid) to authenticated;
-- entity_in_org and validation functions stay private.

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

commit;