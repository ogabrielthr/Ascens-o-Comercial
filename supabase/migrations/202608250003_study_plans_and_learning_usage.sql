begin;

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Plano de Estudos'
    check (char_length(trim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  starts_on date not null default current_date,
  due_on date,
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint study_plans_due_after_start check (due_on is null or due_on >= starts_on),
  constraint study_plans_completed_at check (status <> 'completed' or completed_at is not null)
);
create index study_plans_user_status_idx
  on public.study_plans(organization_id, user_id, status, due_on)
  where deleted_at is null;
create unique index study_plans_one_active_per_user
  on public.study_plans(organization_id, user_id)
  where status = 'active' and deleted_at is null;

create table public.study_plan_tracks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  track_id uuid not null references public.learning_tracks(id) on delete restrict,
  position smallint not null check (position > 0),
  due_on date,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, track_id),
  unique (plan_id, position)
);
create index study_plan_tracks_plan_position_idx
  on public.study_plan_tracks(plan_id, position);
create index study_plan_tracks_track_idx
  on public.study_plan_tracks(organization_id, track_id);

create or replace function app_private.enforce_study_plan_track_integrity()
returns trigger
language plpgsql set search_path = '' as $$
declare plan_start date; plan_due date;
begin
  select p.starts_on, p.due_on into plan_start, plan_due
  from public.study_plans p
  where p.id = new.plan_id and p.organization_id = new.organization_id and p.deleted_at is null;
  if not found then
    raise exception 'study plan organization mismatch' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.learning_tracks t
    where t.id = new.track_id and t.organization_id = new.organization_id and t.deleted_at is null
  ) then
    raise exception 'learning track organization mismatch' using errcode = '23514';
  end if;
  if new.due_on is not null
     and (new.due_on < plan_start or (plan_due is not null and new.due_on > plan_due)) then
    raise exception 'track deadline must be inside the study plan period' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger study_plan_tracks_enforce_integrity
before insert or update on public.study_plan_tracks
for each row execute function app_private.enforce_study_plan_track_integrity();

alter table public.study_plans enable row level security;
alter table public.study_plans force row level security;
alter table public.study_plan_tracks enable row level security;
alter table public.study_plan_tracks force row level security;

create policy study_plans_read_scope on public.study_plans
for select to authenticated
using (
  user_id = auth.uid()
  or app_private.manages_user(organization_id, user_id)
);

create policy study_plan_tracks_read_scope on public.study_plan_tracks
for select to authenticated
using (
  exists (
    select 1 from public.study_plans p
    where p.id = study_plan_tracks.plan_id
      and p.organization_id = study_plan_tracks.organization_id
      and p.deleted_at is null
      and (p.user_id = auth.uid() or app_private.manages_user(p.organization_id, p.user_id))
  )
);

create or replace function app_private.require_study_plan_manager(
  p_organization_id uuid, p_user_id uuid
)
returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or not app_private.has_role(
       p_organization_id,
       array['admin'::public.access_role, 'manager'::public.access_role]
     )
     or not app_private.manages_user(p_organization_id, p_user_id) then
    raise exception 'study plan management access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id and m.active
  ) then
    raise exception 'target user is not an active organization member' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.save_study_plan(
  p_organization_id uuid,
  p_plan_id uuid,
  p_user_id uuid,
  p_title text,
  p_description text,
  p_starts_on date,
  p_due_on date,
  p_status text,
  p_track_ids uuid[],
  p_track_due_dates date[]
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  plan_row public.study_plans%rowtype;
  previous_plan public.study_plans%rowtype;
  track_count integer;
  tracks_json jsonb;
begin
  if p_plan_id is not null then
    select * into previous_plan
    from public.study_plans
    where id = p_plan_id and organization_id = p_organization_id and deleted_at is null;
    if not found then raise exception 'study plan not found' using errcode = 'P0002'; end if;
    perform app_private.require_study_plan_manager(p_organization_id, previous_plan.user_id);
  end if;
  perform app_private.require_study_plan_manager(p_organization_id, p_user_id);
  if nullif(trim(p_title), '') is null or char_length(trim(p_title)) > 160 then
    raise exception 'valid study plan title required' using errcode = '23514';
  end if;
  if p_status not in ('draft', 'active', 'paused', 'completed', 'cancelled') then
    raise exception 'invalid study plan status' using errcode = '23514';
  end if;
  if p_due_on is not null and p_due_on < coalesce(p_starts_on, current_date) then
    raise exception 'study plan due date must not precede start date' using errcode = '23514';
  end if;
  if coalesce(cardinality(p_track_ids), 0) < 1 then
    raise exception 'at least one learning track is required' using errcode = '23514';
  end if;
  if p_track_due_dates is not null
     and cardinality(p_track_due_dates) <> cardinality(p_track_ids) then
    raise exception 'track deadlines must match track list' using errcode = '23514';
  end if;
  if (select count(distinct x) from unnest(p_track_ids) x) <> cardinality(p_track_ids) then
    raise exception 'learning tracks cannot be repeated' using errcode = '23514';
  end if;

  select count(*) into track_count
  from public.learning_tracks t
  where t.organization_id = p_organization_id
    and t.id = any(p_track_ids)
    and t.published and t.deleted_at is null;
  if track_count <> cardinality(p_track_ids) then
    raise exception 'one or more learning tracks are unavailable' using errcode = '23514';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_track_due_dates, array_fill(null::date, array[cardinality(p_track_ids)]))) d
    where d is not null
      and (d < coalesce(p_starts_on, current_date) or (p_due_on is not null and d > p_due_on))
  ) then
    raise exception 'track deadline must be inside the study plan period' using errcode = '23514';
  end if;

  if p_status = 'active' then
    update public.study_plans
    set status = 'paused', updated_at = now()
    where organization_id = p_organization_id and user_id = p_user_id
      and status = 'active' and deleted_at is null
      and (p_plan_id is null or id <> p_plan_id);
  end if;

  if p_plan_id is null then
    insert into public.study_plans (
      organization_id, user_id, title, description, starts_on, due_on,
      status, created_by, completed_at
    ) values (
      p_organization_id, p_user_id, trim(p_title), nullif(trim(p_description), ''),
      coalesce(p_starts_on, current_date), p_due_on, p_status, auth.uid(),
      case when p_status = 'completed' then now() else null end
    ) returning * into plan_row;
  else
    update public.study_plans set
      user_id = p_user_id,
      title = trim(p_title),
      description = nullif(trim(p_description), ''),
      starts_on = coalesce(p_starts_on, starts_on),
      due_on = p_due_on,
      status = p_status,
      completed_at = case
        when p_status = 'completed' then coalesce(completed_at, now()) else null end,
      updated_at = now()
    where id = p_plan_id and organization_id = p_organization_id and deleted_at is null
    returning * into plan_row;
    if not found then raise exception 'study plan not found' using errcode = 'P0002'; end if;
  end if;

  delete from public.study_plan_tracks where plan_id = plan_row.id;
  insert into public.study_plan_tracks (
    organization_id, plan_id, track_id, position, due_on
  )
  select
    p_organization_id,
    plan_row.id,
    ids.track_id,
    ids.ordinality::smallint,
    case when p_track_due_dates is null then null else p_track_due_dates[ids.ordinality] end
  from unnest(p_track_ids) with ordinality ids(track_id, ordinality);

  select coalesce(jsonb_agg(to_jsonb(spt) order by spt.position), '[]'::jsonb)
  into tracks_json from public.study_plan_tracks spt where spt.plan_id = plan_row.id;

  return jsonb_build_object('plan', to_jsonb(plan_row), 'tracks', tracks_json);
end;
$$;

create or replace function public.archive_study_plan(p_plan_id uuid)
returns public.study_plans
language plpgsql security definer set search_path = '' as $$
declare plan_row public.study_plans%rowtype;
begin
  select * into plan_row from public.study_plans where id = p_plan_id and deleted_at is null for update;
  if not found then raise exception 'study plan not found' using errcode = 'P0002'; end if;
  perform app_private.require_study_plan_manager(plan_row.organization_id, plan_row.user_id);
  update public.study_plans
  set status = 'cancelled', deleted_at = now(), updated_at = now()
  where id = p_plan_id returning * into plan_row;
  return plan_row;
end;
$$;

create or replace function public.mark_lesson_started(p_lesson_id uuid)
returns public.lesson_progress
language plpgsql security definer set search_path = '' as $$
declare lesson_row public.lessons%rowtype; progress_row public.lesson_progress%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select l.* into lesson_row from public.lessons l
  join public.learning_tracks t on t.id = l.track_id
  where l.id = p_lesson_id and l.deleted_at is null and l.published
    and t.deleted_at is null and t.published
    and app_private.is_org_member(l.organization_id);
  if not found then raise exception 'lesson not available' using errcode = 'P0002'; end if;

  insert into public.lesson_progress (
    organization_id, lesson_id, user_id, status, progress_percent, started_at
  ) values (
    lesson_row.organization_id, lesson_row.id, auth.uid(),
    'in_progress'::public.learning_progress_status, 0, now()
  )
  on conflict (organization_id, lesson_id, user_id) do update set
    started_at = coalesce(public.lesson_progress.started_at, excluded.started_at),
    status = case when public.lesson_progress.status = 'completed'
      then public.lesson_progress.status else 'in_progress'::public.learning_progress_status end,
    updated_at = now()
  returning * into progress_row;
  return progress_row;
end;
$$;

create or replace function app_private.refresh_study_plan_completion()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.study_plans p set
    status = case
      when exists (
        select 1 from public.study_plan_tracks spt
        join public.lessons l on l.track_id = spt.track_id
        where spt.plan_id = p.id and l.published and l.deleted_at is null
      ) and not exists (
        select 1 from public.study_plan_tracks spt
        join public.lessons l on l.track_id = spt.track_id and l.published and l.deleted_at is null
        left join public.lesson_progress lp
          on lp.lesson_id = l.id and lp.user_id = p.user_id
          and lp.organization_id = p.organization_id and lp.status = 'completed'
        where spt.plan_id = p.id and lp.id is null
      ) then 'completed'
      when p.status = 'completed' and exists (
        select 1 from public.study_plans current_plan
        where current_plan.organization_id = p.organization_id
          and current_plan.user_id = p.user_id
          and current_plan.status = 'active'
          and current_plan.deleted_at is null
          and current_plan.id <> p.id
      ) then 'paused'
      else 'active' end,
    completed_at = case
      when exists (
        select 1 from public.study_plan_tracks spt
        join public.lessons l on l.track_id = spt.track_id
        where spt.plan_id = p.id and l.published and l.deleted_at is null
      ) and not exists (
        select 1 from public.study_plan_tracks spt
        join public.lessons l on l.track_id = spt.track_id and l.published and l.deleted_at is null
        left join public.lesson_progress lp
          on lp.lesson_id = l.id and lp.user_id = p.user_id
          and lp.organization_id = p.organization_id and lp.status = 'completed'
        where spt.plan_id = p.id and lp.id is null
      ) then coalesce(p.completed_at, now()) else null end,
    updated_at = now()
  where p.organization_id = new.organization_id and p.user_id = new.user_id
    and p.deleted_at is null and p.status in ('active', 'completed')
    and exists (
      select 1 from public.study_plan_tracks spt
      join public.lessons l on l.track_id = spt.track_id
      where spt.plan_id = p.id and l.id = new.lesson_id
    );
  return new;
end;
$$;

create trigger lesson_progress_refresh_study_plans
after insert or update of status on public.lesson_progress
for each row execute function app_private.refresh_study_plan_completion();

-- Rascunhos permanecem visíveis apenas para gestão.
drop policy if exists learning_tracks_member_read on public.learning_tracks;
create policy learning_tracks_member_read on public.learning_tracks
for select to authenticated using (
  app_private.is_org_member(organization_id)
  and (
    published
    or app_private.has_role(organization_id, array['admin'::public.access_role, 'manager'::public.access_role])
  )
);
drop policy if exists lessons_member_read on public.lessons;
create policy lessons_member_read on public.lessons
for select to authenticated using (
  app_private.is_org_member(organization_id)
  and (
    (
      published
      and exists (
        select 1 from public.learning_tracks t
        where t.id = lessons.track_id and t.organization_id = lessons.organization_id
          and t.published and t.deleted_at is null
      )
    )
    or app_private.has_role(organization_id, array['admin'::public.access_role, 'manager'::public.access_role])
  )
);

revoke execute on function app_private.require_study_plan_manager(uuid, uuid) from public, anon, authenticated;
revoke execute on function app_private.refresh_study_plan_completion() from public, anon, authenticated;
revoke execute on function app_private.enforce_study_plan_track_integrity() from public, anon, authenticated;
revoke execute on function public.save_study_plan(uuid, uuid, uuid, text, text, date, date, text, uuid[], date[]) from public, anon;
revoke execute on function public.archive_study_plan(uuid) from public, anon;
revoke execute on function public.mark_lesson_started(uuid) from public, anon;
grant execute on function public.save_study_plan(uuid, uuid, uuid, text, text, date, date, text, uuid[], date[]) to authenticated, service_role;
grant execute on function public.archive_study_plan(uuid) to authenticated, service_role;
grant execute on function public.mark_lesson_started(uuid) to authenticated, service_role;

commit;
