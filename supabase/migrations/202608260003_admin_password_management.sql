begin;

-- =============================================================================
-- Redefinicao de senha pelo administrador
--
-- A troca em si acontece no Auth, dentro da Edge Function manage-user, unica
-- camada com credencial administrativa. Aqui so preparamos a trilha de
-- auditoria: sem um valor proprio no enum, a operacao seria registrada como
-- "update" generico e ficaria indistinguivel de uma edicao de cadastro.
--
-- ALTER TYPE ... ADD VALUE e permitido dentro de transacao no PostgreSQL 12+
-- desde que o novo valor nao seja usado nesta mesma transacao — que e o caso.
-- =============================================================================

alter type public.audit_action add value if not exists 'password_reset';

commit;
