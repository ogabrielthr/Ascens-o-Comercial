begin;
-- Em producao a funcao perdeu o EXECUTE de authenticated (ACL encontrada:
-- postgres e service_role apenas), bloqueando toda edicao de lead com
-- "permission denied for function update_opportunity_details_v4".
-- Restaura exatamente os privilegios definidos em 202608280003.
revoke execute on function public.update_opportunity_details_v4(
  uuid, integer, uuid, uuid, uuid, text, uuid, uuid, text, text, text,
  text, text, text, numeric, numeric, numeric, numeric, date, text
) from public, anon;
grant execute on function public.update_opportunity_details_v4(
  uuid, integer, uuid, uuid, uuid, text, uuid, uuid, text, text, text,
  text, text, text, numeric, numeric, numeric, numeric, date, text
) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
