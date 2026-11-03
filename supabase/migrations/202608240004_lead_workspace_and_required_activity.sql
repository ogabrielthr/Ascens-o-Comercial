begin;

alter table public.activities
  add constraint activities_opportunity_required
  check (opportunity_id is not null) not valid;

comment on constraint activities_opportunity_required on public.activities is
  'Impede novas atividades sem lead e preserva temporariamente registros legados para saneamento.';

create table public.opportunity_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  message_type text not null default 'note' check (message_type in ('note', 'chat')),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index opportunity_messages_timeline_idx
  on public.opportunity_messages(opportunity_id, created_at desc)
  where deleted_at is null;

create trigger opportunity_messages_set_updated_at
before update on public.opportunity_messages
for each row execute function public.set_updated_at();

create trigger opportunity_messages_audit
after insert or update or delete on public.opportunity_messages
for each row execute function app_private.audit_row_change();

alter table public.opportunity_messages enable row level security;
alter table public.opportunity_messages force row level security;

create policy opportunity_messages_read_scope on public.opportunity_messages
for select to authenticated
using (
  exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = opportunity_messages.opportunity_id
      and opportunity.organization_id = opportunity_messages.organization_id
      and opportunity.deleted_at is null
      and (
        app_private.manages_user(opportunity.organization_id, opportunity.owner_id)
        or app_private.has_role(opportunity.organization_id, array['operations'::public.access_role])
      )
  )
);

create policy opportunity_messages_insert_scope on public.opportunity_messages
for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.opportunities opportunity
    where opportunity.id = opportunity_messages.opportunity_id
      and opportunity.organization_id = opportunity_messages.organization_id
      and opportunity.deleted_at is null
      and (
        app_private.manages_user(opportunity.organization_id, opportunity.owner_id)
        or app_private.has_role(opportunity.organization_id, array['operations'::public.access_role])
      )
  )
);

create policy opportunity_messages_author_update on public.opportunity_messages
for update to authenticated
using (author_id = auth.uid() and deleted_at is null)
with check (author_id = auth.uid());

commit;
