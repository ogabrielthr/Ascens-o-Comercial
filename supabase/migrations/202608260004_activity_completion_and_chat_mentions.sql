begin;

-- Menções são dados estruturados: permitem destacar quem foi acionado hoje e
-- criar notificações posteriormente sem depender de interpretar o texto.
alter table public.opportunity_messages
  add column mentioned_user_ids uuid[] not null default '{}'::uuid[];

create index opportunity_messages_mentions_idx
  on public.opportunity_messages using gin (mentioned_user_ids)
  where deleted_at is null and cardinality(mentioned_user_ids) > 0;

create or replace function app_private.validate_opportunity_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  distinct_mentions integer;
  allowed_mentions integer;
begin
  new.mentioned_user_ids := coalesce(new.mentioned_user_ids, '{}'::uuid[]);

  if new.message_type <> 'chat' and cardinality(new.mentioned_user_ids) > 0 then
    raise exception 'mentions are only allowed in chat messages' using errcode = '23514';
  end if;

  select count(distinct mentioned_id)::integer
    into distinct_mentions
  from unnest(new.mentioned_user_ids) as mentioned_id;

  if distinct_mentions <> cardinality(new.mentioned_user_ids) then
    raise exception 'duplicate mentions are not allowed' using errcode = '23514';
  end if;

  select count(*)::integer
    into allowed_mentions
  from public.organization_members member
  where member.organization_id = new.organization_id
    and member.user_id = any(new.mentioned_user_ids)
    and member.active = true
    and member.role in ('admin'::public.access_role, 'manager'::public.access_role);

  if allowed_mentions <> cardinality(new.mentioned_user_ids) then
    raise exception 'only active management users can be mentioned' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger opportunity_messages_validate_mentions
before insert or update of organization_id, message_type, mentioned_user_ids
on public.opportunity_messages
for each row execute function app_private.validate_opportunity_message_mentions();

revoke execute on function app_private.validate_opportunity_message_mentions()
  from public, anon, authenticated;

comment on column public.opportunity_messages.mentioned_user_ids is
  'Usuários ativos com cargo admin ou manager acionados na mensagem de bate-papo.';

commit;
