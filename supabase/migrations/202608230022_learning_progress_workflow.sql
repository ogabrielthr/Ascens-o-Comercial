begin;

create or replace function public.set_lesson_completion(p_lesson_id uuid, p_completed boolean)
returns public.lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
  progress_row public.lesson_progress%rowtype;
  total_lessons integer;
  completed_lessons integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select l.* into lesson_row from public.lessons l
  join public.learning_tracks t on t.id = l.track_id
  where l.id = p_lesson_id and l.deleted_at is null and t.deleted_at is null
    and app_private.is_org_member(l.organization_id)
    and (not p_completed or (l.published and t.published));
  if not found then raise exception 'lesson not available' using errcode = 'P0002'; end if;

  insert into public.lesson_progress
    (organization_id, lesson_id, user_id, status, progress_percent, started_at, completed_at)
  values (
    lesson_row.organization_id, lesson_row.id, auth.uid(),
    case when p_completed then 'completed'::public.learning_progress_status else 'not_started'::public.learning_progress_status end,
    case when p_completed then 100 else 0 end,
    case when p_completed then now() else null end,
    case when p_completed then now() else null end
  )
  on conflict (organization_id, lesson_id, user_id) do update set
    status = excluded.status, progress_percent = excluded.progress_percent,
    started_at = coalesce(public.lesson_progress.started_at, excluded.started_at),
    completed_at = excluded.completed_at, updated_at = now()
  returning * into progress_row;

  if not p_completed then
    delete from public.point_events where organization_id = lesson_row.organization_id
      and user_id = auth.uid() and event_type = 'lesson_completed'
      and source_type = 'lesson_progress' and source_id = progress_row.id;
    delete from public.point_events where organization_id = lesson_row.organization_id
      and user_id = auth.uid() and event_type = 'track_completed'
      and source_type = 'learning_track' and source_id = lesson_row.track_id;
  else
    select count(*) into total_lessons from public.lessons
      where track_id = lesson_row.track_id and published and deleted_at is null;
    select count(*) into completed_lessons from public.lessons l
      join public.lesson_progress p on p.lesson_id = l.id
        and p.organization_id = l.organization_id and p.user_id = auth.uid()
      where l.track_id = lesson_row.track_id and l.published and l.deleted_at is null
        and p.status = 'completed';
    if total_lessons > 0 and completed_lessons = total_lessons then
      perform app_private.award_points(
        lesson_row.organization_id, auth.uid(), 'track_completed',
        'learning_track', lesson_row.track_id
      );
    end if;
  end if;
  return progress_row;
end;
$$;

revoke execute on function public.set_lesson_completion(uuid, boolean) from public, anon;
grant execute on function public.set_lesson_completion(uuid, boolean) to authenticated, service_role;

commit;
