-- Read-only incident snapshot. No SQL text, JWTs or customer data in results.
select now() as observed_at,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  (select pg_size_pretty(sum(size)) from pg_ls_waldir()) as wal_size,
  (select pg_size_pretty(sum(size)) from pg_ls_logdir()) as postgres_log_size,
  (select json_agg(t) from (
    select pid, application_name, state, wait_event_type, wait_event,
      backend_start, query_start, md5(query) as query_fingerprint
    from pg_stat_activity where pid <> pg_backend_pid()
      and query not like '%pg_stat_activity%'
      and (query like '%transition_opportunity%' or query like '%update_opportunity_details%')
  ) t) as active_calls,
  (select json_agg(t) from (
    select name, setting, unit from pg_settings
    where name in ('min_wal_size','max_wal_size','wal_segment_size','wal_keep_size','log_rotation_age','log_rotation_size')
  ) t) as retention_settings,
  (select json_agg(t) from (
    select p.proname, p.oid::regprocedure::text as signature,
      position('40001' in p.prosrc) > 0 as has_40001,
      position('PT409' in p.prosrc) > 0 as has_pt409,
      position('agir_v4_identical_payload_v1' in p.prosrc) > 0 as idempotent_v4
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'transition_opportunity','update_opportunity_details_v4',
      'update_opportunity_details_v3','update_opportunity_details_v2',
      'update_opportunity_details','set_opportunity_convention',
      'set_opportunity_registration','cancel_opportunity',
      'set_opportunity_financial_values','realize_financial_entry')
  ) t) as functions;
