begin;

alter table public.user_preferences
  add column if not exists dashboard_widgets jsonb not null default
    '["metas","kpis","producao","funil","equipe","canais","atividades","saude"]'::jsonb;

alter table public.user_preferences
  drop constraint if exists user_preferences_dashboard_widgets_array;
alter table public.user_preferences
  add constraint user_preferences_dashboard_widgets_array
  check (jsonb_typeof(dashboard_widgets) = 'array');

drop policy if exists stage_history_read_scope on public.opportunity_stage_history;
create policy stage_history_read_scope on public.opportunity_stage_history
for select to authenticated
using (
  exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_stage_history.opportunity_id
      and opportunity.organization_id = opportunity_stage_history.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create or replace function app_private.record_initial_opportunity_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.opportunity_stage_history (
    organization_id, opportunity_id, from_stage_id, to_stage_id,
    changed_by, changed_at, duration_seconds
  ) values (
    new.organization_id, new.id, null, new.stage_id,
    auth.uid(), new.created_at, 0
  );
  return new;
end;
$$;

revoke all on function app_private.record_initial_opportunity_stage() from public, anon, authenticated;

drop trigger if exists opportunities_record_initial_stage on public.opportunities;
create trigger opportunities_record_initial_stage
after insert on public.opportunities
for each row execute function app_private.record_initial_opportunity_stage();

commit;
