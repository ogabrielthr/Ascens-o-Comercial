begin;

create or replace function app_private.require_activity_access(activity_row public.activities)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not app_private.manages_user(activity_row.organization_id, activity_row.owner_id) then
    raise exception 'not allowed to manage activity' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.complete_activity(
  p_activity_id uuid,
  p_result text,
  p_notes text default null,
  p_duration_seconds integer default null
)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare activity_row public.activities%rowtype;
begin
  select * into activity_row from public.activities a
  where a.id = p_activity_id and a.deleted_at is null for update;
  if not found then raise exception 'activity not found' using errcode = 'P0002'; end if;
  perform app_private.require_activity_access(activity_row);
  if activity_row.status <> 'pending' then
    raise exception 'only pending activities can be completed' using errcode = '23514';
  end if;
  if nullif(trim(p_result), '') is null then
    raise exception 'result is required' using errcode = '23514';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'duration must be non-negative' using errcode = '23514';
  end if;
  update public.activities
  set status = 'completed', result = trim(p_result),
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      duration_seconds = coalesce(p_duration_seconds, duration_seconds),
      completed_at = now(), updated_at = now()
  where id = activity_row.id returning * into activity_row;
  return activity_row;
end;
$$;

create or replace function public.reschedule_activity(
  p_activity_id uuid,
  p_scheduled_at timestamptz
)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare activity_row public.activities%rowtype;
begin
  if p_scheduled_at is null then raise exception 'schedule is required' using errcode = '23514'; end if;
  select * into activity_row from public.activities a
  where a.id = p_activity_id and a.deleted_at is null for update;
  if not found then raise exception 'activity not found' using errcode = 'P0002'; end if;
  perform app_private.require_activity_access(activity_row);
  if activity_row.status <> 'pending' then
    raise exception 'only pending activities can be rescheduled' using errcode = '23514';
  end if;
  update public.activities
  set scheduled_at = p_scheduled_at, updated_at = now()
  where id = activity_row.id returning * into activity_row;
  return activity_row;
end;
$$;

create or replace function public.cancel_activity(p_activity_id uuid)
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare activity_row public.activities%rowtype;
begin
  select * into activity_row from public.activities a
  where a.id = p_activity_id and a.deleted_at is null for update;
  if not found then raise exception 'activity not found' using errcode = 'P0002'; end if;
  perform app_private.require_activity_access(activity_row);
  if activity_row.status <> 'pending' then
    raise exception 'only pending activities can be cancelled' using errcode = '23514';
  end if;
  update public.activities
  set status = 'cancelled', updated_at = now()
  where id = activity_row.id returning * into activity_row;
  return activity_row;
end;
$$;

create or replace function public.cancel_opportunity(
  p_opportunity_id uuid,
  p_expected_version integer
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare opportunity_row public.opportunities%rowtype;
begin
  select * into opportunity_row from public.opportunities o
  where o.id = p_opportunity_id and o.deleted_at is null for update;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  if auth.uid() is null
     or not app_private.manages_user(opportunity_row.organization_id, opportunity_row.owner_id)
     or not app_private.has_role(opportunity_row.organization_id, array[
       'admin'::public.access_role, 'manager'::public.access_role,
       'commercial'::public.access_role, 'bdr'::public.access_role
     ]) then
    raise exception 'not allowed to cancel opportunity' using errcode = '42501';
  end if;
  if opportunity_row.version <> p_expected_version then
    raise exception 'opportunity changed by another user' using errcode = '40001';
  end if;
  if opportunity_row.status <> 'open' then
    raise exception 'only open opportunities can be cancelled' using errcode = '23514';
  end if;
  update public.opportunities
  set status = 'cancelled', closed_at = now(), loss_reason_id = null,
      version = version + 1, updated_at = now()
  where id = opportunity_row.id returning * into opportunity_row;
  return opportunity_row;
end;
$$;

revoke execute on function app_private.require_activity_access(public.activities) from public, anon, authenticated;
revoke execute on function public.complete_activity(uuid, text, text, integer) from public, anon;
revoke execute on function public.reschedule_activity(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_activity(uuid) from public, anon;
revoke execute on function public.cancel_opportunity(uuid, integer) from public, anon;
grant execute on function public.complete_activity(uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.reschedule_activity(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.cancel_activity(uuid) to authenticated, service_role;
grant execute on function public.cancel_opportunity(uuid, integer) to authenticated, service_role;

commit;