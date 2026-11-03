begin;

-- Assignments concurrent with a deactivation must finish before its sweep or
-- wait and reject the now-inactive owner, rather than leave new orphaned work.
create or replace function app_private.lock_crm_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is not null then
    perform 1 from public.organization_members
    where organization_id = new.organization_id and user_id = new.owner_id and active
    for share;
    if not found then
      raise exception 'O responsavel precisa estar ativo nesta organizacao.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.lock_crm_owner_membership() from public, anon, authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['companies', 'contacts', 'opportunities', 'activities'] loop
    execute format('create trigger %I_lock_owner before insert or update of owner_id on public.%I for each row execute function app_private.lock_crm_owner_membership()', table_name, table_name);
  end loop;
end;
$$;

-- One transaction: the chosen portfolio destination and access revocation
-- either both succeed or both roll back. Identity/authorship is never moved.
create or replace function public.deactivate_user_with_transfer(
  p_organization_id uuid,
  p_user_id uuid,
  p_transfer_data boolean,
  p_destination_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_member public.organization_members%rowtype;
  source_contact public.contacts%rowtype;
  destination_contact_id uuid;
  contact_map jsonb := '{}'::jsonb;
  contact_count integer := 0;
  lead_count integer := 0;
  activity_count integer := 0;
  company_count integer := 0;
  merged_count integer := 0;
  result jsonb;
begin
  if auth.uid() is null or not app_private.has_role(
    p_organization_id, array['admin'::public.access_role]
  ) then
    raise exception 'Somente administradores podem desativar e transferir carteiras.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Voce nao pode desativar o proprio acesso.' using errcode = '22023';
  end if;
  if p_transfer_data is null then
    raise exception 'Escolha se a carteira sera transferida ou mantida.' using errcode = '22023';
  end if;
  if not p_transfer_data and p_destination_user_id is not null then
    raise exception 'Destino informado sem selecionar a transferencia.' using errcode = '22023';
  end if;

  -- Lock memberships in a stable order, including the administrator and the
  -- destination, so concurrent deactivations cannot remove the last admin or
  -- transfer a portfolio to a user being deactivated in another transaction.
  perform 1 from public.organization_members
  where organization_id = p_organization_id order by user_id for update;
  if not app_private.has_role(p_organization_id, array['admin'::public.access_role]) then
    raise exception 'Acesso administrativo indisponivel.' using errcode = '42501';
  end if;
  select * into target_member from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id;
  if not found or not target_member.active then
    raise exception 'O usuario nao esta ativo nesta organizacao. Atualize a pagina.' using errcode = '22023';
  end if;
  if target_member.role = 'admin' and not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and role = 'admin' and active and user_id <> p_user_id
  ) then
    raise exception 'A organizacao precisa manter ao menos um administrador ativo.' using errcode = '22023';
  end if;

  if p_transfer_data then
    if p_destination_user_id is null or p_destination_user_id = p_user_id or not exists (
      select 1 from public.organization_members member
      join public.profiles profile on profile.id = member.user_id
      where member.organization_id = p_organization_id
        and member.user_id = p_destination_user_id and member.active and profile.active
    ) then
      raise exception 'Selecione outro usuario ativo da mesma organizacao para receber a carteira.' using errcode = '22023';
    end if;

    perform 1 from public.contacts
    where organization_id = p_organization_id and owner_id in (p_user_id, p_destination_user_id)
    order by id for update;

    -- CPF is unique per portfolio. Reuse an existing destination contact while
    -- retaining the full source contact as an archived row and in the audit.
    for source_contact in
      select * from public.contacts
      where organization_id = p_organization_id and owner_id = p_user_id and deleted_at is null
      order by id
    loop
      destination_contact_id := null;
      if source_contact.cpf is not null then
        select id into destination_contact_id from public.contacts
        where organization_id = p_organization_id and owner_id = p_destination_user_id
          and cpf = source_contact.cpf and deleted_at is null;
      end if;
      if destination_contact_id is not null then
        contact_map := contact_map || jsonb_build_object(source_contact.id::text, destination_contact_id);
        update public.contacts set owner_id = p_destination_user_id, deleted_at = now(), updated_at = now()
        where id = source_contact.id;
        insert into public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_data, new_data)
        values (p_organization_id, auth.uid(), 'update', 'contacts', source_contact.id,
          to_jsonb(source_contact), jsonb_build_object('merged_into', destination_contact_id,
            'destination_user_id', p_destination_user_id, 'reason', 'user_deactivation_transfer'));
        merged_count := merged_count + 1;
      end if;
    end loop;

    update public.opportunities opportunity
    set owner_id = case when owner_id = p_user_id then p_destination_user_id else owner_id end,
        contact_id = coalesce((contact_map ->> contact_id::text)::uuid, contact_id),
        version = version + 1, updated_at = now()
    where organization_id = p_organization_id
      and (owner_id = p_user_id or contact_map ? contact_id::text);
    get diagnostics lead_count = row_count;

    update public.message_deliveries
    set contact_id = (contact_map ->> contact_id::text)::uuid
    where organization_id = p_organization_id and contact_map ? contact_id::text;

    update public.contacts set owner_id = p_destination_user_id, updated_at = now()
    where organization_id = p_organization_id and owner_id = p_user_id;
    get diagnostics contact_count = row_count;

    update public.companies set owner_id = p_destination_user_id, updated_at = now()
    where organization_id = p_organization_id and owner_id = p_user_id;
    get diagnostics company_count = row_count;

    update public.activities set owner_id = p_destination_user_id, updated_at = now()
    where organization_id = p_organization_id and owner_id = p_user_id;
    get diagnostics activity_count = row_count;
    -- Messages, history, documents, receipts and tags keep their lead IDs and
    -- original authors/uploaders; their access follows the new lead owner.
  end if;

  update public.organization_members set active = false, updated_at = now()
  where organization_id = p_organization_id and user_id = p_user_id;

  result := jsonb_build_object('ok', true, 'transfer_data', p_transfer_data,
    'destination_user_id', p_destination_user_id, 'leads', lead_count,
    'contacts', contact_count + merged_count, 'merged_contacts', merged_count,
    'companies', company_count, 'activities', activity_count);
  insert into public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values (p_organization_id, auth.uid(), 'deactivate', 'organization_members', p_user_id,
    to_jsonb(target_member), result);
  return result;
end;
$$;

revoke all on function public.deactivate_user_with_transfer(uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.deactivate_user_with_transfer(uuid, uuid, boolean, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
