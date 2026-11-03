begin;

create or replace function app_private.require_learning_admin(p_organization_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_role(p_organization_id, array['admin'::public.access_role]) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.save_learning_track(
  p_organization_id uuid, p_track_id uuid, p_title text, p_published boolean
)
returns public.learning_tracks
language plpgsql security definer set search_path = '' as $$
declare track_row public.learning_tracks%rowtype; next_position smallint;
begin
  perform app_private.require_learning_admin(p_organization_id);
  if nullif(trim(p_title), '') is null or char_length(trim(p_title)) > 160 then
    raise exception 'valid track title required' using errcode = '23514';
  end if;
  if p_track_id is null then
    select coalesce(max(position) + 1, 0)::smallint into next_position
      from public.learning_tracks where organization_id = p_organization_id and deleted_at is null;
    insert into public.learning_tracks
      (organization_id, title, published, position, created_by)
    values (p_organization_id, trim(p_title), coalesce(p_published, false), next_position, auth.uid())
    returning * into track_row;
  else
    update public.learning_tracks set title = trim(p_title), published = coalesce(p_published, published), updated_at = now()
      where id = p_track_id and organization_id = p_organization_id and deleted_at is null
      returning * into track_row;
    if not found then raise exception 'track not found' using errcode = 'P0002'; end if;
  end if;
  return track_row;
end;
$$;

create or replace function public.archive_learning_track(p_track_id uuid)
returns public.learning_tracks
language plpgsql security definer set search_path = '' as $$
declare track_row public.learning_tracks%rowtype;
begin
  select * into track_row from public.learning_tracks where id = p_track_id and deleted_at is null for update;
  if not found then raise exception 'track not found' using errcode = 'P0002'; end if;
  perform app_private.require_learning_admin(track_row.organization_id);
  update public.learning_tracks set published = false, deleted_at = now(), updated_at = now()
    where id = track_row.id returning * into track_row;
  update public.lessons set published = false, deleted_at = now(), updated_at = now()
    where track_id = track_row.id and deleted_at is null;
  return track_row;
end;
$$;

create or replace function public.save_lesson(
  p_track_id uuid, p_lesson_id uuid, p_title text, p_duration_minutes integer,
  p_content_url text, p_description text
)
returns public.lessons
language plpgsql security definer set search_path = '' as $$
declare track_row public.learning_tracks%rowtype; lesson_row public.lessons%rowtype; next_position smallint;
begin
  select * into track_row from public.learning_tracks where id = p_track_id and deleted_at is null for update;
  if not found then raise exception 'track not found' using errcode = 'P0002'; end if;
  perform app_private.require_learning_admin(track_row.organization_id);
  if nullif(trim(p_title), '') is null or char_length(trim(p_title)) > 160 then
    raise exception 'valid lesson title required' using errcode = '23514';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 0 then
    raise exception 'invalid lesson duration' using errcode = '23514';
  end if;
  if p_lesson_id is null then
    select coalesce(max(position) + 1, 0)::smallint into next_position
      from public.lessons where track_id = p_track_id and deleted_at is null;
    insert into public.lessons
      (organization_id, track_id, title, description, content_type, content_url, duration_minutes, position)
    values (track_row.organization_id, track_row.id, trim(p_title), nullif(trim(p_description), ''),
      case when nullif(trim(p_content_url), '') is null then 'text' else 'video' end,
      nullif(trim(p_content_url), ''), p_duration_minutes, next_position)
    returning * into lesson_row;
  else
    update public.lessons set title = trim(p_title), description = nullif(trim(p_description), ''),
      content_type = case when nullif(trim(p_content_url), '') is null then 'text' else 'video' end,
      content_url = nullif(trim(p_content_url), ''), duration_minutes = p_duration_minutes, updated_at = now()
    where id = p_lesson_id and track_id = track_row.id and deleted_at is null
    returning * into lesson_row;
    if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  end if;
  return lesson_row;
end;
$$;

create or replace function public.archive_lesson(p_lesson_id uuid)
returns public.lessons
language plpgsql security definer set search_path = '' as $$
declare lesson_row public.lessons%rowtype;
begin
  select * into lesson_row from public.lessons where id = p_lesson_id and deleted_at is null for update;
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  perform app_private.require_learning_admin(lesson_row.organization_id);
  update public.lessons set published = false, deleted_at = now(), updated_at = now()
    where id = lesson_row.id returning * into lesson_row;
  return lesson_row;
end;
$$;

revoke execute on function app_private.require_learning_admin(uuid) from public, anon, authenticated;
revoke execute on function public.save_learning_track(uuid, uuid, text, boolean) from public, anon;
revoke execute on function public.archive_learning_track(uuid) from public, anon;
revoke execute on function public.save_lesson(uuid, uuid, text, integer, text, text) from public, anon;
revoke execute on function public.archive_lesson(uuid) from public, anon;
grant execute on function public.save_learning_track(uuid, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.archive_learning_track(uuid) to authenticated, service_role;
grant execute on function public.save_lesson(uuid, uuid, text, integer, text, text) to authenticated, service_role;
grant execute on function public.archive_lesson(uuid) to authenticated, service_role;

commit;
