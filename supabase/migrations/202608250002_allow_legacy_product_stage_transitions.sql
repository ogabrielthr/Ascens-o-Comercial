begin;

create or replace function app_private.prepare_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  stage_row public.pipeline_stages%rowtype;
begin
  select * into stage_row
  from public.pipeline_stages s
  where s.id = new.stage_id
    and s.organization_id = new.organization_id
    and s.pipeline_id = new.pipeline_id
    and s.active
    and s.deleted_at is null;
  if not found then
    raise exception 'stage does not belong to the selected pipeline' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and (new.status <> 'open' or stage_row.stage_type <> 'open') then
    raise exception 'new opportunities must start in an open stage' using errcode = '23514';
  end if;

  if new.product_id is null then
    new.expected_commission := 0;
  elsif tg_op = 'UPDATE'
    and new.product_id is not distinct from old.product_id
    and new.amount is not distinct from old.amount then
    -- Leads antigos podem continuar no funil mesmo quando o produto legado
    -- saiu do catalogo. O produto ativo volta a ser exigido se produto ou
    -- valor forem alterados.
    new.expected_commission := old.expected_commission;
  else
    select * into product_row
    from public.products p
    where p.id = new.product_id
      and p.organization_id = new.organization_id
      and p.active
      and p.deleted_at is null;
    if not found then
      raise exception 'active product required' using errcode = '23514';
    end if;
    if (product_row.min_amount is not null and new.amount < product_row.min_amount)
       or (product_row.max_amount is not null and new.amount > product_row.max_amount) then
      raise exception 'amount is outside product limits' using errcode = '23514';
    end if;
    new.expected_commission := round(new.amount * product_row.default_commission_rate / 100, 2);
  end if;

  return new;
end;
$$;

revoke execute on function app_private.prepare_opportunity() from public, anon, authenticated;

commit;
