begin;

-- O acesso operacional agora usa exclusivamente a sessao persistente do
-- Supabase Auth. Remove o mecanismo temporario anterior para que ele nao
-- continue gerando tabelas, funcoes e uma Edge Function sem uso.
drop trigger if exists organization_members_revoke_office_access
  on public.organization_members;

drop function if exists app_private.revoke_office_access_on_membership_change();
drop function if exists app_private.has_valid_office_session(uuid);
drop function if exists public.activate_office_access_session(uuid, uuid, text, text);
drop function if exists public.consume_office_access_code(uuid, text, text, text);

drop table if exists public.office_access_sessions;
drop table if exists public.office_access_codes;

commit;
