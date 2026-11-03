begin;

-- Administradores podem concluir uma venda sem comprovante após a confirmação
-- explícita da interface. Todos os demais perfis continuam protegidos pelo
-- bloqueio no banco, inclusive em clientes antigos ou chamadas diretas.
create or replace function app_private.require_payment_receipt_before_win()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'won'::public.opportunity_status
     and (tg_op = 'INSERT' or old.status is distinct from 'won'::public.opportunity_status)
     and not app_private.has_role(
       new.organization_id,
       array['admin'::public.access_role]
     )
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

comment on function app_private.require_payment_receipt_before_win() is
  'Exige comprovante para concluir vendas, exceto quando o ator autenticado e administrador da organizacao.';

commit;
