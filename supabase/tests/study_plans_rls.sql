\set ON_ERROR_STOP on

begin;

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'study-manager@local.test', '{"provider":"email","providers":["email"]}', '{"full_name":"Study Manager"}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'study-seller@local.test', '{"provider":"email","providers":["email"]}', '{"full_name":"Study Seller"}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'study-outsider@local.test', '{"provider":"email","providers":["email"]}', '{"full_name":"Study Outsider"}', now(), now(), now());

insert into public.organization_members (organization_id, user_id, role, active) values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'manager', true),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'commercial', true),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'commercial', true);

insert into public.teams (id, organization_id, name, manager_id, active)
values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
        'Study Test Team', '10000000-0000-4000-8000-000000000001', true);
insert into public.team_members (team_id, user_id, is_manager) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', false);

insert into public.learning_tracks (id, organization_id, title, published, position) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Study Track One', true, 1),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Study Track Two', true, 2);
insert into public.lessons (id, organization_id, track_id, title, content_type, position, published) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 'Study Lesson One', 'text', 1, true),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000002', 'Study Lesson Two', 'text', 1, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select public.save_study_plan(
  '00000000-0000-4000-8000-000000000001', null,
  '10000000-0000-4000-8000-000000000002', 'Plano de teste RLS',
  'Sequência validada automaticamente', current_date, current_date + 30,
  'active',
  array['30000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000002'::uuid],
  array[current_date + 10, current_date + 20]
);

do $$
begin
  if (select count(*) from public.study_plans where user_id = '10000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'manager could not read the managed study plan';
  end if;
  if (select count(*) from public.study_plan_tracks) <> 2 then
    raise exception 'study plan track order was not persisted';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.study_plans) <> 0 then
    raise exception 'unrelated seller could read another seller study plan';
  end if;
  begin
    perform public.save_study_plan(
      '00000000-0000-4000-8000-000000000001', null,
      '10000000-0000-4000-8000-000000000002', 'Unauthorized plan', null,
      current_date, current_date + 30, 'active',
      array['30000000-0000-4000-8000-000000000001'::uuid], array[current_date + 10]
    );
    raise exception 'unauthorized seller managed another seller plan';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.study_plans) <> 1 then
    raise exception 'seller could not read their own study plan';
  end if;
end;
$$;

select public.mark_lesson_started('40000000-0000-4000-8000-000000000001');
select public.set_lesson_completion('40000000-0000-4000-8000-000000000001', true);
select public.set_lesson_completion('40000000-0000-4000-8000-000000000002', true);

do $$
begin
  if (select count(*) from public.lesson_progress where user_id = auth.uid() and status = 'completed') <> 2 then
    raise exception 'lesson progress was not persisted';
  end if;
  if (select count(*) from public.study_plans where user_id = auth.uid() and status = 'completed') <> 1 then
    raise exception 'study plan did not complete automatically';
  end if;
end;
$$;

rollback;

\echo 'study_plans_rls: ok'
