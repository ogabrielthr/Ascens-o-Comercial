begin;

alter table public.organizations
  add column founded_on date,
  add column segment text;

alter table public.organizations
  add constraint organizations_state_format check (state is null or state ~ '^[A-Z]{2}$'),
  add constraint organizations_segment_length check (segment is null or char_length(segment) <= 120);

commit;
