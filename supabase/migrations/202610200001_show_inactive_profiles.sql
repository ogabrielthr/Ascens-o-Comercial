begin;

-- Usuarios inativos continuam listados em Configuracoes > Usuarios para que
-- possam ser reativados com leads e historico. A desativacao so bloqueia o
-- acesso (organization_members.active); o perfil segue visivel aos membros
-- ativos da mesma organizacao.
drop policy if exists profiles_select_shared_org on public.profiles;
create policy profiles_select_shared_org on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
     and theirs.user_id = profiles.id
    where mine.user_id = auth.uid() and mine.active
  )
);

commit;
