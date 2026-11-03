begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'mention', 'lead_updated', 'lead_message', 'activity_updated', 'payment_receipt'
  )),
  title text not null check (char_length(trim(title)) between 1 and 180),
  body text not null default '' check (char_length(body) <= 1200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_timeline_idx
  on public.notifications(recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;
create unique index notifications_recipient_dedupe_idx
  on public.notifications(recipient_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_read_own
on public.notifications
for select to authenticated
using (
  recipient_id = auth.uid()
  and exists (
    select 1
    from public.organization_members member
    where member.organization_id = notifications.organization_id
      and member.user_id = auth.uid()
      and member.active = true
  )
);

create policy notifications_mark_own
on public.notifications
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

create or replace function app_private.create_notification(
  p_organization_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_opportunity_id uuid,
  p_notification_type text,
  p_title text,
  p_body text default '',
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then return; end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_recipient_id
      and member.active = true
  ) then return; end if;

  insert into public.notifications (
    organization_id, recipient_id, actor_id, opportunity_id,
    notification_type, title, body, metadata, dedupe_key
  ) values (
    p_organization_id, p_recipient_id, p_actor_id, p_opportunity_id,
    p_notification_type, left(trim(p_title), 180), left(coalesce(p_body, ''), 1200),
    coalesce(p_metadata, '{}'::jsonb), p_dedupe_key
  )
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

revoke all on function app_private.create_notification(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text
) from public, anon, authenticated;

create or replace function app_private.notify_opportunity_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  event_label text;
begin
  select * into opportunity_row
  from public.opportunities
  where id = new.opportunity_id and deleted_at is null;
  if not found then return new; end if;

  event_label := case new.event_type
    when 'created' then 'Novo lead atribuído a você'
    when 'stage_changed' then 'Etapa do lead alterada'
    when 'tag_added' then 'Etiqueta adicionada ao lead'
    when 'tag_removed' then 'Etiqueta removida do lead'
    when 'cancelled' then 'Lead removido do pipeline'
    else 'Informações do lead alteradas'
  end;

  perform app_private.create_notification(
    new.organization_id,
    opportunity_row.owner_id,
    new.changed_by,
    new.opportunity_id,
    'lead_updated',
    event_label,
    opportunity_row.title,
    jsonb_build_object('event_type', new.event_type, 'changes', new.changes),
    'history:' || new.id::text
  );
  return new;
end;
$$;

create trigger opportunity_history_notify_owner
after insert on public.opportunity_change_history
for each row execute function app_private.notify_opportunity_history();

create or replace function app_private.notify_opportunity_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  actor_name text;
  mentioned_id uuid;
begin
  if new.deleted_at is not null then return new; end if;

  select * into opportunity_row
  from public.opportunities
  where id = new.opportunity_id and deleted_at is null;
  if not found then return new; end if;

  select profile.full_name into actor_name
  from public.profiles profile where profile.id = new.author_id;

  if new.message_type = 'chat' then
    foreach mentioned_id in array coalesce(new.mentioned_user_ids, '{}'::uuid[])
    loop
      perform app_private.create_notification(
        new.organization_id,
        mentioned_id,
        new.author_id,
        new.opportunity_id,
        'mention',
        coalesce(actor_name, 'Alguém') || ' mencionou você',
        new.body,
        jsonb_build_object('message_id', new.id),
        'message:' || new.id::text || ':mention:' || mentioned_id::text
      );
    end loop;
  end if;

  if not (opportunity_row.owner_id = any(coalesce(new.mentioned_user_ids, '{}'::uuid[]))) then
    perform app_private.create_notification(
      new.organization_id,
      opportunity_row.owner_id,
      new.author_id,
      new.opportunity_id,
      'lead_message',
      case when new.message_type = 'chat' then 'Nova mensagem no seu lead' else 'Nova anotação no seu lead' end,
      new.body,
      jsonb_build_object('message_id', new.id, 'message_type', new.message_type),
      'message:' || new.id::text || ':owner'
    );
  end if;
  return new;
end;
$$;

create trigger opportunity_messages_notify_people
after insert on public.opportunity_messages
for each row execute function app_private.notify_opportunity_message();

create or replace function app_private.notify_opportunity_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_row public.activities%rowtype;
  opportunity_row public.opportunities%rowtype;
  actor uuid := auth.uid();
  action_label text;
begin
  activity_row := case when tg_op = 'DELETE' then old else new end;
  if activity_row.opportunity_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select * into opportunity_row
  from public.opportunities
  where id = activity_row.opportunity_id and deleted_at is null;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  action_label := case
    when tg_op = 'INSERT' then 'Nova atividade no seu lead'
    when tg_op = 'DELETE' then 'Atividade removida do seu lead'
    when old.status is distinct from new.status and new.status = 'completed' then 'Atividade concluída no seu lead'
    when old.scheduled_at is distinct from new.scheduled_at then 'Atividade reagendada no seu lead'
    else 'Atividade alterada no seu lead'
  end;

  perform app_private.create_notification(
    activity_row.organization_id,
    opportunity_row.owner_id,
    actor,
    activity_row.opportunity_id,
    'activity_updated',
    action_label,
    opportunity_row.title,
    jsonb_build_object('activity_id', activity_row.id, 'operation', lower(tg_op)),
    'activity:' || activity_row.id::text || ':' || lower(tg_op) || ':' ||
      coalesce(activity_row.updated_at::text, activity_row.created_at::text)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger activities_notify_opportunity_owner
after insert or update or delete on public.activities
for each row execute function app_private.notify_opportunity_activity();

create or replace function app_private.notify_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt_row public.payment_receipts%rowtype;
  opportunity_row public.opportunities%rowtype;
begin
  receipt_row := case when tg_op = 'DELETE' then old else new end;
  select * into opportunity_row
  from public.opportunities
  where id = receipt_row.opportunity_id and deleted_at is null;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform app_private.create_notification(
    receipt_row.organization_id,
    opportunity_row.owner_id,
    auth.uid(),
    receipt_row.opportunity_id,
    'payment_receipt',
    case when tg_op = 'DELETE' then 'Comprovante removido do seu lead' else 'Comprovante anexado ao seu lead' end,
    receipt_row.original_name,
    jsonb_build_object('receipt_id', receipt_row.id, 'operation', lower(tg_op)),
    'receipt:' || receipt_row.id::text || ':' || lower(tg_op)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger payment_receipts_notify_opportunity_owner
after insert or delete on public.payment_receipts
for each row execute function app_private.notify_payment_receipt();

revoke all on function app_private.notify_opportunity_history() from public, anon, authenticated;
revoke all on function app_private.notify_opportunity_message() from public, anon, authenticated;
revoke all on function app_private.notify_opportunity_activity() from public, anon, authenticated;
revoke all on function app_private.notify_payment_receipt() from public, anon, authenticated;

-- O bloco é idempotente e só publica tabelas que ainda não participam do
-- Realtime. A interface também atualiza ao recuperar o foco, cobrindo quedas
-- temporárias de conexão sem recorrer a polling constante.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'notifications', 'opportunity_change_history', 'activities',
      'opportunity_messages', 'payment_receipts'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

comment on table public.notifications is
  'Caixa de notificações persistentes por usuário, alimentada por eventos do CRM.';

commit;
