begin;
-- UX-04: conflito de versao comercial deve chegar ao PostgREST como HTTP 409.
-- Somente os RAISEs de negocio conhecidos mudam. Erros reais de serializacao
-- continuam 40001. pg_get_functiondef conserva corpo instalado, parametros,
-- SECURITY DEFINER e search_path; CREATE OR REPLACE conserva OID, owner e ACL.
-- Nao aplicar em producao antes de executar testes em homologacao.
-- Tambem fecha o bypass por expected_version NULL nas sete funcoes de lead.
-- A comparacao continua obrigatoria; nenhum retry ou overwrite e introduzido.
do $migration$
declare
  target record;
  definition text;
  revised text;
  expected_message text;
  old_raise text;
  new_raise text;
  old_guard text := 'opportunity_row.version <> p_expected_version';
  new_guard text := 'opportunity_row.version is distinct from p_expected_version';
  found_count integer := 0;
begin
  for target in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and l.lanname = 'plpgsql'
      and p.proname = any(array[
        'transition_opportunity', 'realize_financial_entry', 'cancel_opportunity',
        'update_opportunity_details', 'set_opportunity_financial_values',
        'update_opportunity_details_v2', 'set_opportunity_convention',
        'set_opportunity_registration'
      ])
  loop
    found_count := found_count + 1;
    definition := pg_get_functiondef(target.oid);
    expected_message := case when target.proname = 'realize_financial_entry'
      then 'financial entry changed by another user'
      else 'opportunity changed by another user' end;
    old_raise := format('raise exception %L using errcode = %L;', expected_message, '40001');
    new_raise := format('raise exception %L using errcode = %L;', expected_message, 'PT409');
    if strpos(definition, old_raise) = 0 and strpos(definition, new_raise) = 0 then
      raise exception 'Conflito de negocio esperado nao encontrado em %; revisar divergencia antes de migrar',
        target.oid::regprocedure;
    end if;
    revised := replace(definition, old_raise, new_raise);
    if target.proname <> 'realize_financial_entry' then
      if strpos(revised, old_guard) = 0 and strpos(revised, new_guard) = 0 then
        raise exception 'Controle de versao esperado nao encontrado em %; revisar antes de migrar', target.oid::regprocedure;
      end if;
      revised := replace(revised, old_guard, new_guard);
    end if;
    if revised <> definition then execute revised; end if;
  end loop;
  if found_count <> 8 then
    raise exception 'Esperadas 8 funcoes de conflito, encontradas %; revisar assinaturas antes de migrar', found_count;
  end if;
end;
$migration$;

commit;
