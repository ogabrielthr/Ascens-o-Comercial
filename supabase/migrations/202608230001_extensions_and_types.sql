begin;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.access_role as enum
  ('admin', 'manager', 'commercial', 'bdr', 'operations', 'finance', 'user', 'auditor');
create type public.opportunity_status as enum ('open', 'won', 'lost', 'cancelled');
create type public.pipeline_stage_type as enum ('open', 'won', 'lost');
create type public.activity_status as enum ('pending', 'completed', 'cancelled');
create type public.activity_type as enum
  ('call', 'meeting', 'whatsapp', 'email', 'proposal', 'follow_up', 'task');
create type public.financial_entry_type as enum ('revenue', 'expense');
create type public.financial_entry_status as enum
  ('draft', 'scheduled', 'pending_approval', 'realized', 'cancelled', 'reversed');
create type public.learning_progress_status as enum
  ('not_started', 'in_progress', 'completed');
create type public.file_access_level as enum
  ('organization', 'management', 'finance', 'private');
create type public.automation_run_status as enum
  ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.message_delivery_status as enum
  ('queued', 'sent', 'delivered', 'opened', 'replied', 'failed', 'cancelled');
create type public.audit_action as enum
  ('insert', 'update', 'delete', 'login', 'logout', 'export', 'approve', 'cancel', 'transition', 'invite', 'role_change', 'activate', 'deactivate');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_digits(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;

commit;