begin;

-- A venda somente pode ser concluida depois que ao menos um comprovante
-- de pagamento estiver vinculado ao lead. A validacao no banco protege
-- tambem chamadas diretas, clientes desatualizados e funcoes server-side.

create or replace function app_private.require_payment_receipt_before_win()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'won'::public.opportunity_status
     and (tg_op = 'INSERT' or old.status is distinct from 'won'::public.opportunity_status)
     and not exists (
       select 1
       from public.payment_receipts receipt
       where receipt.organization_id = new.organization_id
         and receipt.opportunity_id = new.id
     ) then
    raise exception 'Anexe ao menos um comprovante de pagamento antes de marcar o lead como ganho.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.require_payment_receipt_before_win() from public;

drop trigger if exists opportunities_require_receipt_on_insert on public.opportunities;
create trigger opportunities_require_receipt_on_insert
before insert on public.opportunities
for each row execute function app_private.require_payment_receipt_before_win();

drop trigger if exists opportunities_require_receipt_on_status_update on public.opportunities;
create trigger opportunities_require_receipt_on_status_update
before update of status on public.opportunities
for each row execute function app_private.require_payment_receipt_before_win();

commit;
