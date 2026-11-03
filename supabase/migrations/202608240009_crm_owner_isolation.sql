begin;

create or replace function app_private.can_access_crm_owner(
  target_org uuid,
  target_owner uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      auth.uid() = target_owner
      or app_private.has_role(target_org, array['admin'::public.access_role])
    );
$$;

comment on function app_private.can_access_crm_owner(uuid, uuid) is
  'CRM scope: administrators access the organization portfolio; every other role accesses only records it owns.';

revoke all on function app_private.can_access_crm_owner(uuid, uuid) from public, anon;
grant execute on function app_private.can_access_crm_owner(uuid, uuid) to authenticated, service_role;

drop policy if exists contacts_read_scope on public.contacts;
drop policy if exists contacts_write_scope on public.contacts;
create policy contacts_read_scope on public.contacts
for select to authenticated
using (app_private.can_access_crm_owner(organization_id, owner_id));
create policy contacts_write_scope on public.contacts
for all to authenticated
using (
  app_private.can_access_crm_owner(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role, 'manager'::public.access_role,
    'commercial'::public.access_role, 'bdr'::public.access_role,
    'operations'::public.access_role, 'user'::public.access_role
  ])
)
with check (
  app_private.can_access_crm_owner(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role, 'manager'::public.access_role,
    'commercial'::public.access_role, 'bdr'::public.access_role,
    'operations'::public.access_role, 'user'::public.access_role
  ])
);

drop policy if exists opportunities_read_scope on public.opportunities;
drop policy if exists opportunities_insert_scope on public.opportunities;
create policy opportunities_read_scope on public.opportunities
for select to authenticated
using (app_private.can_access_crm_owner(organization_id, owner_id));
create policy opportunities_insert_scope on public.opportunities
for insert to authenticated
with check (
  app_private.can_access_crm_owner(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role, 'manager'::public.access_role,
    'commercial'::public.access_role, 'bdr'::public.access_role,
    'operations'::public.access_role, 'user'::public.access_role
  ])
);

drop policy if exists activities_read_scope on public.activities;
drop policy if exists activities_insert_scope on public.activities;
drop policy if exists activities_update_scope on public.activities;
create policy activities_read_scope on public.activities
for select to authenticated
using (
  exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = activities.opportunity_id
      and opportunity.organization_id = activities.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);
create policy activities_insert_scope on public.activities
for insert to authenticated
with check (
  app_private.can_access_crm_owner(organization_id, owner_id)
  and app_private.has_role(organization_id, array[
    'admin'::public.access_role, 'manager'::public.access_role,
    'commercial'::public.access_role, 'bdr'::public.access_role,
    'operations'::public.access_role, 'user'::public.access_role
  ])
  and exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = activities.opportunity_id
      and opportunity.organization_id = activities.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);
create policy activities_update_scope on public.activities
for update to authenticated
using (
  app_private.can_access_crm_owner(organization_id, owner_id)
  and exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = activities.opportunity_id
      and opportunity.organization_id = activities.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
)
with check (
  app_private.can_access_crm_owner(organization_id, owner_id)
  and exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = activities.opportunity_id
      and opportunity.organization_id = activities.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

drop policy if exists opportunity_tags_read_scope on public.opportunity_tags;
drop policy if exists opportunity_tags_write_scope on public.opportunity_tags;
create policy opportunity_tags_read_scope on public.opportunity_tags
for select to authenticated
using (
  exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_tags.opportunity_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);
create policy opportunity_tags_write_scope on public.opportunity_tags
for all to authenticated
using (
  exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_tags.opportunity_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
)
with check (
  exists (
    select 1
    from public.opportunities opportunity
    join public.tags tag on tag.id = opportunity_tags.tag_id
    where opportunity.id = opportunity_tags.opportunity_id
      and opportunity.organization_id = tag.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

drop policy if exists opportunity_messages_read_scope on public.opportunity_messages;
drop policy if exists opportunity_messages_insert_scope on public.opportunity_messages;
drop policy if exists opportunity_messages_author_update on public.opportunity_messages;
create policy opportunity_messages_read_scope on public.opportunity_messages
for select to authenticated
using (
  exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_messages.opportunity_id
      and opportunity.organization_id = opportunity_messages.organization_id
      and opportunity.deleted_at is null
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);
create policy opportunity_messages_insert_scope on public.opportunity_messages
for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_messages.opportunity_id
      and opportunity.organization_id = opportunity_messages.organization_id
      and opportunity.deleted_at is null
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);
create policy opportunity_messages_author_update on public.opportunity_messages
for update to authenticated
using (
  author_id = auth.uid()
  and deleted_at is null
  and exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_messages.opportunity_id
      and opportunity.organization_id = opportunity_messages.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
)
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = opportunity_messages.opportunity_id
      and opportunity.organization_id = opportunity_messages.organization_id
      and app_private.can_access_crm_owner(opportunity.organization_id, opportunity.owner_id)
  )
);

create or replace function app_private.enforce_crm_owner_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  target_opportunity_id uuid;
begin
  -- Migrations, seeds and trusted service-role jobs do not carry an end-user id.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name in ('contacts', 'opportunities') then
    if tg_op <> 'INSERT'
       and not app_private.can_access_crm_owner(old.organization_id, old.owner_id) then
      raise exception 'CRM record is outside the current user portfolio' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE'
       and not app_private.can_access_crm_owner(new.organization_id, new.owner_id) then
      raise exception 'CRM owner must be the current user unless acting as administrator' using errcode = '42501';
    end if;
  elsif tg_table_name = 'activities' then
    if tg_op <> 'INSERT' then
      select * into opportunity_row from public.opportunities where id = old.opportunity_id;
      if not found or not app_private.can_access_crm_owner(opportunity_row.organization_id, opportunity_row.owner_id) then
        raise exception 'Activity lead is outside the current user portfolio' using errcode = '42501';
      end if;
    end if;
    if tg_op <> 'DELETE' then
      select * into opportunity_row from public.opportunities where id = new.opportunity_id;
      if not found or not app_private.can_access_crm_owner(opportunity_row.organization_id, opportunity_row.owner_id) then
        raise exception 'Activity lead is outside the current user portfolio' using errcode = '42501';
      end if;
      if not app_private.can_access_crm_owner(new.organization_id, new.owner_id) then
        raise exception 'Activity owner must be the current user unless acting as administrator' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name in ('opportunity_messages', 'opportunity_tags') then
    target_opportunity_id := case when tg_op = 'DELETE' then old.opportunity_id else new.opportunity_id end;
    select * into opportunity_row from public.opportunities where id = target_opportunity_id;
    if not found or not app_private.can_access_crm_owner(opportunity_row.organization_id, opportunity_row.owner_id) then
      raise exception 'Lead is outside the current user portfolio' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_crm_owner_scope() from public, anon, authenticated;

drop trigger if exists contacts_enforce_crm_owner_scope on public.contacts;
create trigger contacts_enforce_crm_owner_scope
before insert or update or delete on public.contacts
for each row execute function app_private.enforce_crm_owner_scope();

drop trigger if exists opportunities_enforce_crm_owner_scope on public.opportunities;
create trigger opportunities_enforce_crm_owner_scope
before insert or update or delete on public.opportunities
for each row execute function app_private.enforce_crm_owner_scope();

drop trigger if exists activities_enforce_crm_owner_scope on public.activities;
create trigger activities_enforce_crm_owner_scope
before insert or update or delete on public.activities
for each row execute function app_private.enforce_crm_owner_scope();

drop trigger if exists opportunity_messages_enforce_crm_owner_scope on public.opportunity_messages;
create trigger opportunity_messages_enforce_crm_owner_scope
before insert or update or delete on public.opportunity_messages
for each row execute function app_private.enforce_crm_owner_scope();

drop trigger if exists opportunity_tags_enforce_crm_owner_scope on public.opportunity_tags;
create trigger opportunity_tags_enforce_crm_owner_scope
before insert or update or delete on public.opportunity_tags
for each row execute function app_private.enforce_crm_owner_scope();

commit;
