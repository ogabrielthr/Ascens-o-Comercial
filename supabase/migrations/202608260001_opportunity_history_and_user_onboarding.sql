begin;

create table public.opportunity_change_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'created', 'updated', 'stage_changed', 'cancelled', 'tag_added', 'tag_removed'
  )),
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  changed_at timestamptz not null default now()
);

create index opportunity_change_history_timeline_idx
  on public.opportunity_change_history(opportunity_id, changed_at desc);
create index opportunity_change_history_org_time_idx
  on public.opportunity_change_history(organization_id, changed_at desc);

alter table public.opportunity_change_history enable row level security;

create policy opportunity_change_history_read_scope
on public.opportunity_change_history
for select to authenticated
using (
  exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_change_history.opportunity_id
      and opportunity.organization_id = opportunity_change_history.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

revoke all on public.opportunity_change_history from public, anon;
revoke insert, update, delete on public.opportunity_change_history from authenticated;
grant select on public.opportunity_change_history to authenticated, service_role;

create or replace function app_private.row_changes(
  old_row jsonb,
  new_row jsonb,
  tracked_fields text[]
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      field_name,
      jsonb_build_object('old', old_row -> field_name, 'new', new_row -> field_name)
    ),
    '{}'::jsonb
  )
  from unnest(tracked_fields) as fields(field_name)
  where old_row -> field_name is distinct from new_row -> field_name;
$$;

revoke all on function app_private.row_changes(jsonb, jsonb, text[]) from public, anon, authenticated;

create or replace function app_private.record_opportunity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_set jsonb;
  history_type text;
begin
  if tg_op = 'INSERT' then
    insert into public.opportunity_change_history (
      organization_id, opportunity_id, changed_by, event_type, changes, changed_at
    ) values (
      new.organization_id,
      new.id,
      coalesce(auth.uid(), new.created_by),
      'created',
      jsonb_build_object(
        'stage_id', jsonb_build_object('old', null, 'new', to_jsonb(new.stage_id)),
        'owner_id', jsonb_build_object('old', null, 'new', to_jsonb(new.owner_id)),
        'product_id', jsonb_build_object('old', null, 'new', to_jsonb(new.product_id)),
        'amount', jsonb_build_object('old', null, 'new', to_jsonb(new.amount))
      ),
      new.created_at
    );
    return new;
  end if;

  change_set := app_private.row_changes(
    to_jsonb(old),
    to_jsonb(new),
    array[
      'title', 'owner_id', 'product_id', 'bank_id', 'source_id',
      'stage_id', 'status', 'loss_reason_id', 'amount', 'total_value',
      'final_value', 'requested_reversal', 'expected_close_date', 'notes'
    ]
  );

  if change_set = '{}'::jsonb then return new; end if;

  history_type := case
    when old.stage_id is distinct from new.stage_id then 'stage_changed'
    when old.status is distinct from new.status and new.status = 'cancelled' then 'cancelled'
    else 'updated'
  end;

  insert into public.opportunity_change_history (
    organization_id, opportunity_id, changed_by, event_type, changes, changed_at
  ) values (
    new.organization_id, new.id, auth.uid(), history_type, change_set, now()
  );
  return new;
end;
$$;

revoke all on function app_private.record_opportunity_change() from public, anon, authenticated;

drop trigger if exists opportunities_change_history on public.opportunities;
create trigger opportunities_change_history
after insert or update on public.opportunities
for each row execute function app_private.record_opportunity_change();

create or replace function app_private.record_opportunity_contact_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_set jsonb;
  opportunity_row record;
begin
  change_set := app_private.row_changes(
    to_jsonb(old),
    to_jsonb(new),
    array['full_name', 'cpf', 'phone', 'email', 'city', 'state']
  );
  if change_set = '{}'::jsonb then return new; end if;

  for opportunity_row in
    select id, organization_id
    from public.opportunities
    where contact_id = new.id and deleted_at is null
  loop
    insert into public.opportunity_change_history (
      organization_id, opportunity_id, changed_by, event_type, changes, changed_at
    ) values (
      opportunity_row.organization_id, opportunity_row.id, auth.uid(), 'updated', change_set, now()
    );
  end loop;
  return new;
end;
$$;

revoke all on function app_private.record_opportunity_contact_change() from public, anon, authenticated;

drop trigger if exists contacts_opportunity_change_history on public.contacts;
create trigger contacts_opportunity_change_history
after update on public.contacts
for each row execute function app_private.record_opportunity_contact_change();

create or replace function app_private.record_opportunity_tag_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  selected_tag_id uuid;
  selected_opportunity_id uuid;
begin
  selected_tag_id := case when tg_op = 'INSERT' then new.tag_id else old.tag_id end;
  selected_opportunity_id := case when tg_op = 'INSERT' then new.opportunity_id else old.opportunity_id end;

  select * into opportunity_row
  from public.opportunities
  where id = selected_opportunity_id;
  if not found then
    if tg_op = 'INSERT' then return new; end if;
    return old;
  end if;

  insert into public.opportunity_change_history (
    organization_id, opportunity_id, changed_by, event_type, changes, changed_at
  ) values (
    opportunity_row.organization_id,
    opportunity_row.id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'tag_added' else 'tag_removed' end,
    jsonb_build_object(
      'tag_id', jsonb_build_object(
        'old', case when tg_op = 'DELETE' then to_jsonb(selected_tag_id) else null end,
        'new', case when tg_op = 'INSERT' then to_jsonb(selected_tag_id) else null end
      )
    ),
    now()
  );
  if tg_op = 'INSERT' then return new; end if;
  return old;
end;
$$;

revoke all on function app_private.record_opportunity_tag_change() from public, anon, authenticated;

drop trigger if exists opportunity_tags_change_history on public.opportunity_tags;
create trigger opportunity_tags_change_history
after insert or delete on public.opportunity_tags
for each row execute function app_private.record_opportunity_tag_change();

create or replace function public.set_opportunity_tags(
  p_opportunity_id uuid,
  p_tag_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  result jsonb;
begin
  select * into opportunity_row
  from public.opportunities o
  where o.id = p_opportunity_id and o.deleted_at is null
  for update;

  if not found then
    raise exception 'opportunity not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null
     or not app_private.manages_user(opportunity_row.organization_id, opportunity_row.owner_id)
     or not app_private.has_role(opportunity_row.organization_id, array[
       'admin'::public.access_role, 'manager'::public.access_role,
       'commercial'::public.access_role, 'bdr'::public.access_role
     ]) then
    raise exception 'not allowed to update opportunity tags' using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_tag_ids, array[]::uuid[])) requested(id)
    left join public.tags t on t.id = requested.id
    where t.id is null or t.organization_id <> opportunity_row.organization_id
  ) then
    raise exception 'tag does not belong to opportunity organization' using errcode = '23514';
  end if;

  delete from public.opportunity_tags current_tag
  where current_tag.opportunity_id = opportunity_row.id
    and not (current_tag.tag_id = any(coalesce(p_tag_ids, array[]::uuid[])));

  insert into public.opportunity_tags (opportunity_id, tag_id)
  select opportunity_row.id, requested.id
  from (
    select distinct id
    from unnest(coalesce(p_tag_ids, array[]::uuid[])) requested(id)
  ) requested
  on conflict (opportunity_id, tag_id) do nothing;

  select coalesce(jsonb_agg(to_jsonb(t) order by lower(t.name)), '[]'::jsonb)
  into result
  from public.tags t
  join public.opportunity_tags ot on ot.tag_id = t.id
  where ot.opportunity_id = opportunity_row.id;

  return result;
end;
$$;

revoke execute on function public.set_opportunity_tags(uuid, uuid[]) from public, anon;
grant execute on function public.set_opportunity_tags(uuid, uuid[]) to authenticated, service_role;

insert into public.opportunity_change_history (
  organization_id, opportunity_id, changed_by, event_type, changes, changed_at
)
select
  history.organization_id,
  history.opportunity_id,
  history.changed_by,
  case when history.from_stage_id is null then 'created' else 'stage_changed' end,
  jsonb_build_object(
    'stage_id', jsonb_build_object(
      'old', to_jsonb(history.from_stage_id),
      'new', to_jsonb(history.to_stage_id)
    )
  ),
  history.changed_at
from public.opportunity_stage_history history;

update public.teams
set active = true, deleted_at = null, updated_at = now()
where lower(name) = lower('Equipe Comercial')
  and deleted_at is null
  and not active;

insert into public.teams (organization_id, name, color, active)
select organization.id, 'Equipe Comercial', '#FF9800', true
from public.organizations organization
where organization.active
  and organization.deleted_at is null
  and not exists (
    select 1 from public.teams team
    where team.organization_id = organization.id
      and team.active and team.deleted_at is null
  )
on conflict do nothing;

commit;
