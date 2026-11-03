begin;
-- P1 only: a completely identical v4 payload is a no-op, including contact data.
-- Requires 202609070001 first. No table changes or weakened RLS/authorization.
-- Apply only after a verified manual backup and staging tests.
do $migration$
declare
  target regprocedure := 'public.update_opportunity_details_v4(uuid,integer,uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,date,text)'::regprocedure;
  definition text;
  anchor text := E'begin\n  update_result := public.update_opportunity_details_v3(';
  guard text := $guard$begin
  -- agir_v4_identical_payload_v1
  declare
    current_contact public.contacts%rowtype;
  begin
    select * into opportunity_row from public.opportunities
    where id = p_opportunity_id and deleted_at is null for update;
    if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
    if auth.uid() is null
       or not app_private.manages_user(opportunity_row.organization_id, opportunity_row.owner_id)
       or not app_private.has_role(opportunity_row.organization_id, array[
         'admin'::public.access_role, 'manager'::public.access_role,
         'commercial'::public.access_role, 'bdr'::public.access_role
       ]) then
      raise exception 'not allowed to update opportunity' using errcode = '42501';
    end if;
    if p_expected_version is null or p_expected_version < 1 then
      raise exception 'opportunity changed by another user' using errcode = 'PT409';
    end if;
    select * into current_contact from public.contacts
    where id = opportunity_row.contact_id for update;
    if found and opportunity_row.status <> 'cancelled'
      and row(opportunity_row.owner_id, opportunity_row.product_id,
        opportunity_row.convention_id, opportunity_row.registration_number,
        opportunity_row.bank_id, opportunity_row.source_id, opportunity_row.amount,
        opportunity_row.total_value, opportunity_row.final_value, opportunity_row.requested_reversal,
        opportunity_row.expected_close_date, opportunity_row.notes,
        current_contact.full_name, current_contact.cpf, current_contact.phone,
        current_contact.email::text, current_contact.city, current_contact.state::text, current_contact.owner_id)
      is not distinct from row(p_owner_id, p_product_id,
        p_convention_id, nullif(trim(p_registration_number), ''),
        p_bank_id, p_source_id, p_amount,
        p_total_value, p_final_value, p_requested_reversal,
        p_expected_close_date, nullif(trim(p_notes), ''),
        nullif(trim(p_full_name), ''), nullif(public.normalize_digits(p_cpf), ''),
        nullif(public.normalize_digits(p_phone), ''), nullif(lower(trim(p_email)), ''),
        nullif(trim(p_city), ''), nullif(upper(trim(p_state)), ''), p_owner_id)
    then
      return jsonb_build_object('opportunity', to_jsonb(opportunity_row), 'contact', to_jsonb(current_contact));
    end if;
  end;
  update_result := public.update_opportunity_details_v3($guard$;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='update_opportunity_details_v2'
      and position('using errcode = ''PT409''' in p.prosrc) > 0) then
    raise exception 'Aplicar e validar 202609070001 antes desta migration';
  end if;
  definition := replace(pg_get_functiondef(target), E'\r\n', E'\n');
  if position('agir_v4_identical_payload_v1' in definition) > 0 then return; end if;
  if position(anchor in definition) = 0 then
    raise exception 'Implementacao v4 divergente; revisar antes de adicionar idempotencia';
  end if;
  execute replace(definition, anchor, guard);
end;
$migration$;
commit;
