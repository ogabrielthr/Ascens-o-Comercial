begin;

insert into public.organizations (id, name, active)
values ('00000000-0000-4000-8000-000000000001', 'Ascensão Comercial', true)
on conflict (id) do update
set name = excluded.name,
    active = true,
    deleted_at = null,
    updated_at = now();

insert into public.profiles (id, full_name, email, active)
select
  user_record.id,
  coalesce(
    nullif(trim(user_record.raw_user_meta_data ->> 'full_name'), ''),
    'Administrador Ascensão Comercial'
  ),
  user_record.email,
  true
from auth.users as user_record
where lower(user_record.email) = 'admin@ascensao.example.test'
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    active = true,
    updated_at = now();

insert into public.user_preferences (user_id)
select id
from auth.users
where lower(email) = 'admin@ascensao.example.test'
on conflict (user_id) do nothing;

insert into public.organization_members (organization_id, user_id, role, active)
select
  '00000000-0000-4000-8000-000000000001',
  id,
  'admin'::public.access_role,
  true
from auth.users
where lower(email) = 'admin@ascensao.example.test'
on conflict (organization_id, user_id) do update
set role = 'admin'::public.access_role,
    active = true,
    updated_at = now();

commit;