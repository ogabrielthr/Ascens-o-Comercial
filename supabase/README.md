# Banco Supabase — Ascensão Comercial

A estrutura de banco foi copiada como código. Este diretório não contém vínculo com projeto remoto nem credenciais da empresa de origem. Configure um projeto exclusivo antes de ativar o modo com banco compartilhado.

## Ambiente local opcional

Com Docker e Supabase CLI disponíveis, execute `npx supabase start`. A configuração desta cópia usa API na porta 54421, banco na porta 54422, banco auxiliar na porta 54420 e Studio na porta 54423. O endereço da aplicação é http://localhost:5174.

As migrações são aplicadas em ordem. `supabase/seed/demo.sql` contém apenas catálogos de demonstração. `npx supabase db reset` recria o banco local e apaga seus dados locais; use somente quando quiser reinicializar esse ambiente.

Para criar o administrador local, defina `ASCENSAO_LOCAL_ADMIN_PASSWORD` no processo e execute `node scripts/create-local-admin.mjs` a partir da raiz da aplicação. O e-mail local é admin@ascensao.local.

## Banco remoto exclusivo

1. Crie um novo projeto Supabase para a Ascensão Comercial.
2. Confira o destino ao executar `npx supabase link --project-ref SEU_PROJECT_REF`.
3. Revise e aplique as migrações com `npx supabase db push`.
4. Publique as funções invite-user e manage-user no novo projeto, mantendo a verificação JWT habilitada.
5. Configure APP_URL nas funções e o endereço de acesso nas configurações de autenticação.
6. Cadastre o primeiro usuário no Supabase Auth e vincule seu UUID à organização como administrador. As migrações históricas de bootstrap contêm um e-mail fictício (admin@ascensao.example.test); elas não criam uma conta de autenticação real.
7. Configure .env.local da aplicação com a URL e a chave pública do novo projeto.

Exemplo para vincular o primeiro administrador, executado somente no projeto novo depois de criar a conta no Auth:

```sql
begin;
insert into public.profiles (id, full_name, email, active)
select id, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), 'Administrador'), email, true
from auth.users
where id = 'UUID_DO_ADMINISTRADOR'::uuid
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, active = true;

insert into public.user_preferences (user_id)
select id from auth.users where id = 'UUID_DO_ADMINISTRADOR'::uuid
on conflict (user_id) do nothing;

insert into public.organization_members (organization_id, user_id, role, active)
values ('00000000-0000-4000-8000-000000000001', 'UUID_DO_ADMINISTRADOR'::uuid, 'admin', true)
on conflict (organization_id, user_id) do update set role = 'admin', active = true;
commit;
```

Substitua o UUID do exemplo antes de executar. O frontend usa apenas VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY; chaves privadas ficam exclusivamente no servidor. As regras de acesso e os nomes dos buckets foram mantidos consistentes com os arquivos desta cópia.
