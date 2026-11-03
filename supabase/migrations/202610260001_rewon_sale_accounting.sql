begin;

-- Preserve the installed permissions, version guard, receipt requirements and
-- function identity. Only cancelled automatic postings may be reactivated.
do $migration$
declare
  definition text := pg_get_functiondef('public.transition_opportunity(uuid,uuid,integer,uuid)'::regprocedure);
  revised text;
  financial_conflict text := E'on conflict (organization_id, external_reference)\n        where external_reference is not null and deleted_at is null\n      do nothing;';
  expense_conflict text := E'on conflict (organization_id, external_reference)\n          where external_reference is not null and deleted_at is null\n        do nothing;';
  financial_update text := $update$on conflict (organization_id, external_reference)
        where external_reference is not null and deleted_at is null
      do update set status = 'scheduled', account_id = excluded.account_id,
        cost_center_id = excluded.cost_center_id, beneficiary_user_id = excluded.beneficiary_user_id,
        amount = excluded.amount, description = excluded.description,
        entry_date = excluded.entry_date, competence = excluded.competence,
        approved_by = null, approved_at = null, updated_at = now()
      where financial_entries.status = 'cancelled';$update$;
  payable_conflict text := 'on conflict (organization_id, opportunity_id, user_id) do nothing;';
  payable_update text := $update$on conflict (organization_id, opportunity_id, user_id)
      do update set status = 'draft', rule_id = excluded.rule_id,
        calculation_base = excluded.calculation_base, rate = excluded.rate, amount = excluded.amount,
        approved_by = null, approved_at = null, paid_at = null, updated_at = now()
      where commission_payables.status = 'cancelled';$update$;
begin
  definition := replace(definition, E'\r\n', E'\n');
  revised := replace(replace(replace(definition,
    financial_conflict, financial_update), expense_conflict, financial_update), payable_conflict, payable_update);
  if strpos(revised, financial_update) = 0 or strpos(revised, payable_update) = 0 then
    raise exception 'Unexpected transition_opportunity definition; review before changing accounting';
  end if;
  -- Reopening must reverse the points of this lead, not the seller's most
  -- recent sale on a different lead with a potentially different point rule.
  if strpos(revised, 'where history.id = pe.source_id and history.opportunity_id = opportunity_row.id') = 0 then
    revised := replace(revised,
    'and pe.source_type = ''opportunity_transition''',
    'and pe.source_type = ''opportunity_transition''
      and exists (select 1 from public.opportunity_stage_history history
        where history.id = pe.source_id and history.opportunity_id = opportunity_row.id)');
  end if;
  if revised <> definition then execute revised; end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
