begin;

alter table public.goals
  add column requested_reversal_amount numeric(14,2) not null default 0
  check (requested_reversal_amount >= 0);

-- Preserva as metas monetarias existentes, que anteriormente eram gravadas
-- no campo generico sales_amount.
alter table public.goals disable trigger goals_validate_org;

update public.goals
set requested_reversal_amount = sales_amount
where requested_reversal_amount = 0
  and sales_amount > 0;

alter table public.goals enable trigger goals_validate_org;

comment on column public.goals.requested_reversal_amount is
  'Meta monetaria mensal baseada na soma de Estorno Solicitado dos leads ganhos.';

commit;
