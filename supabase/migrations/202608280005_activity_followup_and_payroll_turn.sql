begin;

alter type public.activity_type
  add value if not exists 'payroll_turn';

commit;
