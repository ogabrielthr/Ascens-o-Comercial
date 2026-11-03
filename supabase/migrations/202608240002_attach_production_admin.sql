begin;

do $$
declare
  admin_user auth.users%rowtype;
begin
  select *
  into admin_user
  from auth.users
  where lower(email) = 'admin@ascensao.example.test'
  limit 1;

  if admin_user.id is null then
    raise notice 'Administrador de producao nao encontrado; vinculo ignorado neste ambiente.';
    return;
  end if;

  insert into public.profiles (id, full_name, email, active)
  values (
    admin_user.id,
    coalesce(
      nullif(trim(admin_user.raw_user_meta_data ->> 'full_name'), ''),
      'Administrador Ascensão Comercial'
    ),
    admin_user.email,
    true
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      active = true,
      updated_at = now();

  insert into public.user_preferences (user_id)
  values (admin_user.id)
  on conflict (user_id) do nothing;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (
    '00000000-0000-4000-8000-000000000001',
    admin_user.id,
    'admin'::public.access_role,
    true
  )
  on conflict (organization_id, user_id) do update
  set role = 'admin'::public.access_role,
      active = true,
      updated_at = now();
end;
$$;

commit;
