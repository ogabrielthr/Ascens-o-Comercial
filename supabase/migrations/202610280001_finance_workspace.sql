begin;

-- A workspace is committed as one transaction: no title/payment/transfer can be half-saved.
create table public.finance_workspaces (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  snapshot jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict
);
create table public.finance_workspace_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  revision bigint not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  action text not null default 'workspace.save',
  previous_hash text,
  snapshot_hash text not null,
  details jsonb not null,
  unique (organization_id, revision)
);
create table public.finance_workspace_requests (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  payload_hash text not null,
  expected_revision bigint not null,
  resulting_revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, request_id)
);

create or replace function app_private.can_access_finance_workspace(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    join public.profiles p on p.id = m.user_id
    where m.organization_id = target_org and m.user_id = auth.uid()
      and m.active and m.role::text in ('admin','finance')
      and o.active and o.deleted_at is null and p.active
  );
$$;

alter table public.finance_workspaces enable row level security;
alter table public.finance_workspace_audit enable row level security;
alter table public.finance_workspace_requests enable row level security;
create policy finance_workspaces_read on public.finance_workspaces for select to authenticated
using (app_private.can_access_finance_workspace(organization_id));
create policy finance_workspace_audit_read on public.finance_workspace_audit for select to authenticated
using (app_private.can_access_finance_workspace(organization_id));
revoke all on public.finance_workspaces, public.finance_workspace_audit, public.finance_workspace_requests from public, anon, authenticated;
grant select on public.finance_workspaces, public.finance_workspace_audit to authenticated;

create or replace function app_private.finance_audit_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'financial audit is immutable' using errcode = '42501';
end;
$$;
create trigger finance_audit_immutable before update or delete on public.finance_workspace_audit
for each row execute function app_private.finance_audit_immutable();

create or replace function app_private.finance_assert(condition boolean, message text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if condition is distinct from true then
    raise exception '%', message using errcode = '22023';
  end if;
end;
$$;
create or replace function app_private.finance_valid_date(value text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and to_char(value::date, 'YYYY-MM-DD') = value;
exception when others then return false;
end;
$$;
create or replace function app_private.finance_validate_money_tree(value jsonb, depth integer default 0)
returns void language plpgsql immutable set search_path = '' as $$
declare child record; number_value numeric;
begin
  perform app_private.finance_assert(depth <= 20, 'financial data nesting limit exceeded');
  if jsonb_typeof(value) = 'object' then
    for child in select * from jsonb_each(value) loop
      if child.key like '%Centavos' then
        perform app_private.finance_assert(jsonb_typeof(child.value) = 'number', 'centavos must be integer numbers');
        number_value := (child.value #>> '{}')::numeric;
        perform app_private.finance_assert(trunc(number_value) = number_value and abs(number_value) <= 9007199254740991,
          'centavos must be safe integers');
        if child.key not in ('amountCentavos','saldoInicialCentavos') then
          perform app_private.finance_assert(number_value >= 0, 'centavos cannot be negative');
        end if;
      end if;
      perform app_private.finance_validate_money_tree(child.value, depth + 1);
    end loop;
  elsif jsonb_typeof(value) = 'array' then
    for child in select x as value from jsonb_array_elements(value) x loop
      perform app_private.finance_validate_money_tree(child.value, depth + 1);
    end loop;
  end if;
end;
$$;

create or replace function app_private.finance_validate_state(state jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  collection_name text; item jsonb; payment jsonb; category jsonb; linked jsonb; title jsonb;
  statement jsonb; payment_sum numeric; cash numeric; seen text[] := array[]::text[];
begin
  perform app_private.finance_assert(jsonb_typeof(state) = 'object', 'financial snapshot must be an object');
  perform app_private.finance_assert(octet_length((state - 'auditoria')::text) <= 5242880, 'financial snapshot exceeds 5 MiB');
  perform app_private.finance_assert(state ->> 'schemaVersion' = '2', 'financial schemaVersion must be 2');
  perform app_private.finance_assert((state ->> 'revision') ~ '^[0-9]+$' and (state ->> 'revision')::numeric <= 9007199254740991,
    'financial revision must be a safe integer');
  foreach collection_name in array array['planoContas','centrosCusto','lancamentos','orcamento','contasBancarias','contatos',
    'transferencias','extrato','conciliacoes','fechamentos','auditoria'] loop
    perform app_private.finance_assert(jsonb_typeof(state -> collection_name) = 'array', 'financial collection required: ' || collection_name);
    perform app_private.finance_assert(jsonb_array_length(state -> collection_name) <= 50000, 'financial collection exceeds 50000 rows');
    if collection_name <> 'auditoria' then
      perform app_private.finance_assert(not exists (
        select 1 from jsonb_array_elements(state -> collection_name) row_value
        where jsonb_typeof(row_value) <> 'object' or jsonb_typeof(row_value -> 'id') <> 'string'
          or length(coalesce(row_value ->> 'id','')) not between 1 and 120
      ), 'every financial row requires a string id');
      perform app_private.finance_assert(not exists (
        select 1 from jsonb_array_elements(state -> collection_name) row_value group by row_value ->> 'id' having count(*) > 1
      ), 'duplicate financial id in ' || collection_name);
    end if;
  end loop;
  perform app_private.finance_assert(jsonb_typeof(state -> 'politicas') = 'object', 'financial policies required');
  perform app_private.finance_assert(jsonb_typeof(state -> 'politicas' -> 'exigirAprovacao') = 'boolean', 'invalid approval policy');
  perform app_private.finance_assert(jsonb_typeof(state -> 'politicas' -> 'limiteAprovacaoCentavos') = 'number', 'approval limit required');
  -- Audit rows are not accepted as evidence. They are replaced with the server ledger on commit.
  perform app_private.finance_validate_money_tree(state - 'auditoria');
  for item in select * from jsonb_array_elements(state -> 'planoContas') loop
    perform app_private.finance_assert(length(trim(item ->> 'nome')) between 1 and 500 and item ->> 'tipo' in ('receita','despesa'), 'invalid financial category');
  end loop;
  for item in select * from jsonb_array_elements(state -> 'centrosCusto') loop
    perform app_private.finance_assert(length(trim(item ->> 'nome')) between 1 and 500, 'invalid cost center');
  end loop;
  for item in select * from jsonb_array_elements(state -> 'contasBancarias') loop
    perform app_private.finance_assert(length(trim(item ->> 'nome')) between 1 and 500, 'invalid bank account');
    perform app_private.finance_assert(jsonb_typeof(item -> 'saldoInicialCentavos') = 'number'
      and app_private.finance_valid_date(item ->> 'dataSaldoInicial'), 'bank opening balance and date required');
  end loop;
  for item in select * from jsonb_array_elements(state -> 'lancamentos') loop
    perform app_private.finance_assert(length(trim(item ->> 'descricao')) between 1 and 1000 and item ->> 'tipo' in ('receita','despesa'), 'invalid financial title');
    perform app_private.finance_assert((item ->> 'valorCentavos')::numeric > 0, 'title amount must be positive');
    perform app_private.finance_assert((item ->> 'competencia') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and app_private.finance_valid_date(item ->> 'vencimento'), 'valid title competence and due date required');
    select x into category from jsonb_array_elements(state -> 'planoContas') x where x ->> 'id' = item ->> 'contaId';
    perform app_private.finance_assert(category is not null and category ->> 'tipo' = item ->> 'tipo', 'title category missing or has another type');
    perform app_private.finance_assert(nullif(item ->> 'centroId','') is null or exists
      (select 1 from jsonb_array_elements(state -> 'centrosCusto') x where x ->> 'id' = item ->> 'centroId'), 'title cost center missing');
    perform app_private.finance_assert(nullif(item ->> 'contatoId','') is null or exists
      (select 1 from jsonb_array_elements(state -> 'contatos') x where x ->> 'id' = item ->> 'contatoId'), 'title contact missing');
    perform app_private.finance_assert(exists
      (select 1 from jsonb_array_elements(state -> 'contasBancarias') x where x ->> 'id' = item ->> 'contaBancariaId'), 'title bank account missing');
    perform app_private.finance_assert(item ->> 'aprovacao' in ('dispensada','pendente','aprovada','rejeitada')
      and jsonb_typeof(item -> 'cancelado') = 'boolean' and jsonb_typeof(item -> 'pagamentos') = 'array', 'invalid title workflow');
    payment_sum := 0;
    for payment in select * from jsonb_array_elements(item -> 'pagamentos') loop
      perform app_private.finance_assert(jsonb_typeof(payment) = 'object' and length(payment ->> 'id') between 1 and 120,
        'payment id required');
      perform app_private.finance_assert(not ((payment ->> 'id') = any(seen)), 'duplicate payment id');
      seen := array_append(seen, payment ->> 'id');
      perform app_private.finance_assert(app_private.finance_valid_date(payment ->> 'data'), 'valid payment date required');
      perform app_private.finance_assert((payment ->> 'valorCentavos')::numeric > 0
        and jsonb_typeof(payment -> 'jurosCentavos') = 'number' and jsonb_typeof(payment -> 'multaCentavos') = 'number'
        and jsonb_typeof(payment -> 'descontoCentavos') = 'number' and jsonb_typeof(payment -> 'estornado') = 'boolean', 'invalid payment amounts');
      perform app_private.finance_assert(exists (select 1 from jsonb_array_elements(state -> 'contasBancarias') x
        where x ->> 'id' = payment ->> 'contaBancariaId' and payment ->> 'data' >= x ->> 'dataSaldoInicial'), 'payment bank account missing or payment precedes opening balance');
      cash := (payment ->> 'valorCentavos')::numeric + (payment ->> 'jurosCentavos')::numeric
        + (payment ->> 'multaCentavos')::numeric - (payment ->> 'descontoCentavos')::numeric;
      perform app_private.finance_assert(cash >= 0 and cash <= 9007199254740991, 'invalid payment cash amount');
      if not (payment ->> 'estornado')::boolean then
        payment_sum := payment_sum + (payment ->> 'valorCentavos')::numeric;
      end if;
    end loop;
    perform app_private.finance_assert(payment_sum <= (item ->> 'valorCentavos')::numeric, 'payments exceed title principal');
    perform app_private.finance_assert(payment_sum = 0 or (not (item ->> 'cancelado')::boolean
      and item ->> 'aprovacao' in ('aprovada','dispensada')), 'cancelled or unapproved title cannot have active payments');
  end loop;
  for item in select * from jsonb_array_elements(state -> 'orcamento') loop
    perform app_private.finance_assert(jsonb_typeof(item -> 'valorCentavos') = 'number'
      and (item ->> 'competencia') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$', 'invalid budget');
    perform app_private.finance_assert(exists (select 1 from jsonb_array_elements(state -> 'planoContas') x
      where x ->> 'id' = item ->> 'contaId'), 'budget category missing');
    perform app_private.finance_assert(nullif(item ->> 'centroId','') is null or exists
      (select 1 from jsonb_array_elements(state -> 'centrosCusto') x where x ->> 'id' = item ->> 'centroId'), 'budget cost center missing');
  end loop;
  perform app_private.finance_assert(not exists (select 1 from jsonb_array_elements(state -> 'orcamento') x
    group by x ->> 'contaId', coalesce(x ->> 'centroId',''), x ->> 'competencia' having count(*) > 1), 'duplicate budget scope');
  for item in select * from jsonb_array_elements(state -> 'transferencias') loop
    perform app_private.finance_assert((item ->> 'valorCentavos')::numeric > 0 and app_private.finance_valid_date(item ->> 'data')
      and jsonb_typeof(item -> 'cancelado') = 'boolean' and item ->> 'origemId' <> item ->> 'destinoId', 'invalid transfer');
    perform app_private.finance_assert(exists (select 1 from jsonb_array_elements(state -> 'contasBancarias') x where x ->> 'id' = item ->> 'origemId' and item ->> 'data' >= x ->> 'dataSaldoInicial')
      and exists (select 1 from jsonb_array_elements(state -> 'contasBancarias') x where x ->> 'id' = item ->> 'destinoId' and item ->> 'data' >= x ->> 'dataSaldoInicial'), 'transfer bank account missing or transfer precedes opening balance');
  end loop;
  for item in select * from jsonb_array_elements(state -> 'extrato') loop
    perform app_private.finance_assert(jsonb_typeof(item -> 'amountCentavos') = 'number' and (item ->> 'amountCentavos')::numeric <> 0
      and app_private.finance_valid_date(item ->> 'date') and length(item ->> 'fingerprint') between 1 and 500, 'invalid statement row');
    perform app_private.finance_assert(exists (select 1 from jsonb_array_elements(state -> 'contasBancarias') x where x ->> 'id' = item ->> 'accountId'), 'statement bank account missing');
  end loop;
  perform app_private.finance_assert(not exists (select 1 from jsonb_array_elements(state -> 'extrato') x
    group by x ->> 'accountId', x ->> 'fingerprint' having count(*) > 1), 'duplicate statement fingerprint');
  perform app_private.finance_assert(not exists (select 1 from jsonb_array_elements(state -> 'extrato') x
    where nullif(x ->> 'externalId','') is not null group by x ->> 'accountId', x ->> 'externalId' having count(*) > 1), 'duplicate statement external id');
  for item in select * from jsonb_array_elements(state -> 'conciliacoes') loop
    perform app_private.finance_assert(jsonb_typeof(item -> 'cancelado') = 'boolean', 'conciliation status required');
    select x into statement from jsonb_array_elements(state -> 'extrato') x where x ->> 'id' = item ->> 'statementId';
    select x into title from jsonb_array_elements(state -> 'lancamentos') x where x ->> 'id' = item ->> 'entryId';
    select x into linked from jsonb_array_elements(coalesce(title -> 'pagamentos','[]')) x where x ->> 'id' = item ->> 'paymentId';
    perform app_private.finance_assert(statement is not null and title is not null and linked is not null, 'conciliation reference missing');
    if not (item ->> 'cancelado')::boolean then
      cash := ((linked ->> 'valorCentavos')::numeric + (linked ->> 'jurosCentavos')::numeric
        + (linked ->> 'multaCentavos')::numeric - (linked ->> 'descontoCentavos')::numeric)
        * case when title ->> 'tipo' = 'receita' then 1 else -1 end;
      perform app_private.finance_assert(not (linked ->> 'estornado')::boolean and statement ->> 'accountId' = linked ->> 'contaBancariaId'
        and (statement ->> 'amountCentavos')::numeric = cash, 'conciliation amount, sign or bank account mismatch');
    end if;
  end loop;
  perform app_private.finance_assert(not exists (select 1 from jsonb_array_elements(state -> 'conciliacoes') x
    where not (x ->> 'cancelado')::boolean group by x ->> 'statementId' having count(*) > 1), 'statement already reconciled');
  perform app_private.finance_assert(not exists (select 1 from jsonb_array_elements(state -> 'conciliacoes') x
    where not (x ->> 'cancelado')::boolean group by x ->> 'paymentId' having count(*) > 1), 'payment already reconciled');
  for item in select * from jsonb_array_elements(state -> 'fechamentos') loop
    perform app_private.finance_assert((item ->> 'month') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and jsonb_typeof(item -> 'fechado') = 'boolean', 'invalid month closing');
  end loop;
  perform app_private.finance_assert(not exists (select 1 from jsonb_array_elements(state -> 'fechamentos') x
    group by x ->> 'month' having count(*) > 1), 'duplicate month closing');
  perform app_private.finance_assert((select coalesce(sum(abs((x ->> 'saldoInicialCentavos')::numeric)),0) from jsonb_array_elements(state -> 'contasBancarias') x)
    + (select coalesce(sum((x ->> 'valorCentavos')::numeric),0) from jsonb_array_elements(state -> 'lancamentos') x)
    + (select coalesce(sum((p ->> 'valorCentavos')::numeric + (p ->> 'jurosCentavos')::numeric + (p ->> 'multaCentavos')::numeric),0)
      from jsonb_array_elements(state -> 'lancamentos') x, jsonb_array_elements(x -> 'pagamentos') p)
    + (select coalesce(sum((x ->> 'valorCentavos')::numeric),0) from jsonb_array_elements(state -> 'transferencias') x)
    + (select coalesce(sum((x ->> 'valorCentavos')::numeric),0) from jsonb_array_elements(state -> 'orcamento') x)
    + (select coalesce(sum(abs((x ->> 'amountCentavos')::numeric)),0) from jsonb_array_elements(state -> 'extrato') x)
    <= 9007199254740991, 'financial aggregates exceed the safe integer range');
end;
$$;

create or replace function app_private.finance_validate_closed_months(previous jsonb, proposed jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare closing jsonb; next_closing jsonb; month_value text; name text; before_rows jsonb; after_rows jsonb;
begin
  for closing in select * from jsonb_array_elements(coalesce(previous -> 'fechamentos','[]'))
    where value ->> 'fechado' = 'true' loop
    month_value := closing ->> 'month';
    select x into next_closing from jsonb_array_elements(proposed -> 'fechamentos') x where x ->> 'month' = month_value;
    perform app_private.finance_assert(next_closing is not null, 'month closing history cannot be removed');
    if next_closing ->> 'fechado' = 'false' then
      perform app_private.finance_assert(length(trim(next_closing ->> 'motivo')) between 3 and 1000, 'reopening a month requires a reason');
      continue;
    end if;
    foreach name in array array['lancamentos','orcamento','transferencias'] loop
      select coalesce(jsonb_agg(x order by x ->> 'id'),'[]') into before_rows from jsonb_array_elements(previous -> name) x
      where case when name = 'transferencias' then left(x ->> 'data',7) else x ->> 'competencia' end = month_value;
      select coalesce(jsonb_agg(x order by x ->> 'id'),'[]') into after_rows from jsonb_array_elements(proposed -> name) x
      where case when name = 'transferencias' then left(x ->> 'data',7) else x ->> 'competencia' end = month_value;
      perform app_private.finance_assert(before_rows = after_rows, 'closed month cannot be changed: ' || month_value);
    end loop;
    select coalesce(jsonb_agg(payment order by payment ->> 'id'),'[]') into before_rows
      from jsonb_array_elements(previous -> 'lancamentos') title, jsonb_array_elements(title -> 'pagamentos') payment
      where left(payment ->> 'data',7) = month_value;
    select coalesce(jsonb_agg(payment order by payment ->> 'id'),'[]') into after_rows
      from jsonb_array_elements(proposed -> 'lancamentos') title, jsonb_array_elements(title -> 'pagamentos') payment
      where left(payment ->> 'data',7) = month_value;
    perform app_private.finance_assert(before_rows = after_rows, 'payments in a closed month cannot be changed');
    select coalesce(jsonb_agg(jsonb_build_object('id',x -> 'id','saldo',x -> 'saldoInicialCentavos','data',x -> 'dataSaldoInicial') order by x ->> 'id'),'[]')
      into before_rows from jsonb_array_elements(previous -> 'contasBancarias') x where left(x ->> 'dataSaldoInicial',7) <= month_value;
    select coalesce(jsonb_agg(jsonb_build_object('id',x -> 'id','saldo',x -> 'saldoInicialCentavos','data',x -> 'dataSaldoInicial') order by x ->> 'id'),'[]')
      into after_rows from jsonb_array_elements(proposed -> 'contasBancarias') x where left(x ->> 'dataSaldoInicial',7) <= month_value;
    perform app_private.finance_assert(before_rows = after_rows, 'opening balances affect a closed month');
    select coalesce(jsonb_agg(jsonb_build_object('id',x -> 'id','tipo',x -> 'tipo','grupo',x -> 'grupo') order by x ->> 'id'),'[]')
      into before_rows from jsonb_array_elements(previous -> 'planoContas') x where exists
      (select 1 from jsonb_array_elements(previous -> 'lancamentos') t where t ->> 'competencia' = month_value and t ->> 'contaId' = x ->> 'id');
    select coalesce(jsonb_agg(jsonb_build_object('id',x -> 'id','tipo',x -> 'tipo','grupo',x -> 'grupo') order by x ->> 'id'),'[]')
      into after_rows from jsonb_array_elements(proposed -> 'planoContas') x where exists
      (select 1 from jsonb_array_elements(previous -> 'lancamentos') t where t ->> 'competencia' = month_value and t ->> 'contaId' = x ->> 'id');
    perform app_private.finance_assert(before_rows = after_rows, 'category reclassification affects a closed month');
  end loop;
end;
$$;

-- Existing cash evidence remains in the ledger. Reversal changes only its reversal flag.
create or replace function app_private.finance_validate_history(previous jsonb, proposed jsonb, target_org uuid)
returns void language plpgsql stable set search_path = '' as $$
declare title jsonb; next_title jsonb; payment jsonb; next_payment jsonb; row_value jsonb; next_row jsonb;
  attachment jsonb; collection_name text; field_name text;
begin
  for title in select * from jsonb_array_elements(coalesce(previous -> 'lancamentos','[]')) loop
    select x into next_title from jsonb_array_elements(proposed -> 'lancamentos') x where x ->> 'id' = title ->> 'id';
    perform app_private.finance_assert(next_title is not null, 'title history cannot be removed; cancel the title instead');
    for payment in select * from jsonb_array_elements(title -> 'pagamentos') loop
      select x into next_payment from jsonb_array_elements(next_title -> 'pagamentos') x where x ->> 'id' = payment ->> 'id';
      perform app_private.finance_assert(next_payment is not null, 'payment history cannot be removed; reverse the payment instead');
      foreach field_name in array array['id','data','valorCentavos','jurosCentavos','multaCentavos','descontoCentavos','contaBancariaId'] loop
        perform app_private.finance_assert(payment -> field_name = next_payment -> field_name, 'recorded payment cannot be rewritten; reverse it instead');
      end loop;
      perform app_private.finance_assert(not (payment ->> 'estornado')::boolean or (next_payment ->> 'estornado')::boolean,
        'payment reversal cannot be undone');
    end loop;
  end loop;
  foreach collection_name in array array['transferencias','extrato','conciliacoes'] loop
    for row_value in select * from jsonb_array_elements(coalesce(previous -> collection_name,'[]')) loop
      select x into next_row from jsonb_array_elements(proposed -> collection_name) x where x ->> 'id' = row_value ->> 'id';
      perform app_private.finance_assert(next_row is not null, 'financial evidence cannot be removed: ' || collection_name);
      if collection_name = 'extrato' then
        perform app_private.finance_assert(row_value = next_row, 'imported bank evidence is immutable');
      else
        if collection_name = 'transferencias' then
          foreach field_name in array array['origemId','destinoId','data','valorCentavos'] loop
            perform app_private.finance_assert(row_value -> field_name = next_row -> field_name, 'recorded transfer cannot be rewritten');
          end loop;
        else
          foreach field_name in array array['statementId','entryId','paymentId'] loop
            perform app_private.finance_assert(row_value -> field_name = next_row -> field_name, 'conciliation history cannot be rewritten');
          end loop;
        end if;
        perform app_private.finance_assert(not (row_value ->> 'cancelado')::boolean or (next_row ->> 'cancelado')::boolean,
          'cancellation cannot be undone');
      end if;
    end loop;
  end loop;
  for title in select * from jsonb_array_elements(proposed -> 'lancamentos') loop
    if previous is not null then
      for payment in select * from jsonb_array_elements(title -> 'pagamentos') loop
        if not exists (select 1 from jsonb_array_elements(previous -> 'lancamentos') t,
          jsonb_array_elements(t -> 'pagamentos') p where p ->> 'id' = payment ->> 'id') then
          perform app_private.finance_assert((payment ->> 'data')::date <= (now() at time zone 'America/Sao_Paulo')::date,
            'future payments must remain scheduled');
          perform app_private.finance_assert(exists(select 1 from jsonb_array_elements(proposed -> 'contasBancarias') a
            where a ->> 'id' = payment ->> 'contaBancariaId' and a ->> 'ativo' = 'true'), 'new payments require an active bank account');
        end if;
      end loop;
    end if;
    perform app_private.finance_assert(title -> 'anexos' is null or jsonb_typeof(title -> 'anexos') = 'array', 'attachments must be an array');
    perform app_private.finance_assert(jsonb_array_length(coalesce(title -> 'anexos','[]')) <= 50, 'a title accepts at most 50 attachments');
    for attachment in select * from jsonb_array_elements(coalesce(title -> 'anexos','[]')) loop
      perform app_private.finance_assert(length(attachment ->> 'id') between 1 and 120 and length(attachment ->> 'name') between 1 and 255,
        'attachment id and name required');
      perform app_private.finance_assert(jsonb_typeof(attachment -> 'size') = 'number'
        and (attachment ->> 'size')::numeric = trunc((attachment ->> 'size')::numeric)
        and (attachment ->> 'size')::numeric between 1 and 10485760, 'attachment limit is 10 MiB');
      perform app_private.finance_assert(attachment ->> 'type' in ('application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'unsupported attachment type');
      perform app_private.finance_assert(split_part(attachment ->> 'path','/',1) = target_org::text
        and split_part(attachment ->> 'path','/',2) = title ->> 'id'
        and split_part(attachment ->> 'path','/',3) <> '' and split_part(attachment ->> 'path','/',4) = ''
        and (attachment ->> 'path') not like '%..%', 'attachment must belong to this organization and title');
    end loop;
    perform app_private.finance_assert(not exists(select 1 from jsonb_array_elements(coalesce(title -> 'anexos','[]')) a
      group by a ->> 'id' having count(*) > 1), 'duplicate attachment id');
  end loop;
  if previous is not null then
    for row_value in select * from jsonb_array_elements(proposed -> 'transferencias') loop
      if not exists(select 1 from jsonb_array_elements(previous -> 'transferencias') t where t ->> 'id' = row_value ->> 'id') then
        perform app_private.finance_assert((row_value ->> 'data')::date <= (now() at time zone 'America/Sao_Paulo')::date,
          'future bank transfers cannot be recorded as realized');
        perform app_private.finance_assert(exists(select 1 from jsonb_array_elements(proposed -> 'contasBancarias') a
          where a ->> 'id' = row_value ->> 'origemId' and a ->> 'ativo' = 'true') and exists
          (select 1 from jsonb_array_elements(proposed -> 'contasBancarias') a where a ->> 'id' = row_value ->> 'destinoId' and a ->> 'ativo' = 'true'),
          'new bank transfers require active bank accounts');
      end if;
    end loop;
  end if;
end;
$$;

create or replace function app_private.finance_changes(previous jsonb, proposed jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare collection_name text; result jsonb := '[]'; delta jsonb;
begin
  foreach collection_name in array array['planoContas','centrosCusto','lancamentos','orcamento','contasBancarias','contatos',
    'transferencias','extrato','conciliacoes','fechamentos'] loop
    select coalesce(jsonb_agg(jsonb_build_object('collection',collection_name,'id',coalesce(a.value ->> 'id',b.value ->> 'id'),
      'before',a.value,'after',b.value) order by coalesce(a.value ->> 'id',b.value ->> 'id')),'[]') into delta
      from jsonb_array_elements(coalesce(previous -> collection_name,'[]')) a(value)
      full join jsonb_array_elements(proposed -> collection_name) b(value) on a.value ->> 'id' = b.value ->> 'id'
      where a.value is distinct from b.value;
    result := result || delta;
  end loop;
  if previous -> 'politicas' is distinct from proposed -> 'politicas' then
    result := result || jsonb_build_array(jsonb_build_object('collection','politicas','before',previous -> 'politicas','after',proposed -> 'politicas'));
  end if;
  return result;
end;
$$;

create or replace function app_private.finance_snapshot_with_audit(target_org uuid, snapshot_value jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when snapshot_value is null then null else snapshot_value || jsonb_build_object('auditoria',coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actorId',a.actor_id,'at',a.occurred_at,
      'revision',a.revision,'entityId',a.organization_id,'details',a.details) order by a.revision)
    from (select * from public.finance_workspace_audit where organization_id = target_org order by revision desc limit 500) a
  ),'[]'::jsonb)) end;
$$;

create or replace function public.finance_workspace_load(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not app_private.can_access_finance_workspace(p_organization_id) then
    raise exception 'finance access required' using errcode = '42501';
  end if;
  select snapshot into result from public.finance_workspaces where organization_id = p_organization_id;
  return app_private.finance_snapshot_with_audit(p_organization_id,result);
end;
$$;

create or replace function public.finance_workspace_save(p_organization_id uuid, p_state jsonb, p_expected_revision bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare workspace public.finance_workspaces%rowtype; prior_request public.finance_workspace_requests%rowtype;
  payload_hash text; result jsonb; caller uuid := auth.uid(); details_value jsonb;
begin
  if not app_private.can_access_finance_workspace(p_organization_id) then
    raise exception 'finance access required' using errcode = '42501';
  end if;
  perform app_private.finance_assert(p_request_id is not null and p_expected_revision is not null and p_expected_revision between 0 and 9007199254740990,
    'request id and expected revision required');
  perform app_private.finance_validate_state(p_state);
  perform app_private.finance_assert((p_state ->> 'revision')::numeric = p_expected_revision + 1, 'proposed revision must follow expected revision');
  payload_hash := md5((p_state - 'auditoria')::text);
  insert into public.finance_workspaces(organization_id,updated_by) values (p_organization_id,caller) on conflict do nothing;
  select * into workspace from public.finance_workspaces where organization_id = p_organization_id for update;
  select * into prior_request from public.finance_workspace_requests where organization_id = p_organization_id and request_id = p_request_id;
  if found then
    perform app_private.finance_assert(prior_request.actor_id = caller and prior_request.payload_hash = payload_hash
      and prior_request.expected_revision = p_expected_revision, 'idempotency key was used with another payload or actor');
    return app_private.finance_snapshot_with_audit(p_organization_id,workspace.snapshot);
  end if;
  if workspace.revision <> p_expected_revision then
    raise exception 'financial workspace changed by another user' using errcode = 'PT409';
  end if;
  perform app_private.finance_validate_closed_months(workspace.snapshot,p_state);
  perform app_private.finance_validate_history(workspace.snapshot,p_state,p_organization_id);
  result := (p_state - 'auditoria') || jsonb_build_object('revision',workspace.revision + 1,'updatedAt',now(),
    'createdAt',coalesce(workspace.snapshot -> 'createdAt',to_jsonb(now())));
  details_value := jsonb_build_object('titles',jsonb_array_length(p_state -> 'lancamentos'),
    'bankAccounts',jsonb_array_length(p_state -> 'contasBancarias'),'transfers',jsonb_array_length(p_state -> 'transferencias'),
    'statements',jsonb_array_length(p_state -> 'extrato'),'reconciliations',jsonb_array_length(p_state -> 'conciliacoes'),
    'changes',app_private.finance_changes(workspace.snapshot,p_state));
  insert into public.finance_workspace_audit(organization_id,revision,actor_id,previous_hash,snapshot_hash,details)
    values (p_organization_id,workspace.revision + 1,caller,case when workspace.snapshot is null then null else md5(workspace.snapshot::text) end,
      md5(result::text),details_value);
  update public.finance_workspaces set revision = workspace.revision + 1, snapshot = result, updated_at = now(),updated_by = caller
    where organization_id = p_organization_id;
  insert into public.finance_workspace_requests(organization_id,request_id,actor_id,payload_hash,expected_revision,resulting_revision)
    values (p_organization_id,p_request_id,caller,payload_hash,p_expected_revision,workspace.revision + 1);
  return app_private.finance_snapshot_with_audit(p_organization_id,result);
end;
$$;

revoke all on function app_private.can_access_finance_workspace(uuid) from public, anon;
grant execute on function app_private.can_access_finance_workspace(uuid) to authenticated;
revoke all on function app_private.finance_audit_immutable(), app_private.finance_assert(boolean,text),
  app_private.finance_valid_date(text), app_private.finance_validate_money_tree(jsonb,integer),
  app_private.finance_validate_state(jsonb), app_private.finance_validate_closed_months(jsonb,jsonb),
  app_private.finance_validate_history(jsonb,jsonb,uuid), app_private.finance_changes(jsonb,jsonb),
  app_private.finance_snapshot_with_audit(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.finance_workspace_load(uuid), public.finance_workspace_save(uuid,jsonb,bigint,uuid) from public,anon;
grant execute on function public.finance_workspace_load(uuid), public.finance_workspace_save(uuid,jsonb,bigint,uuid) to authenticated;

-- Supabase Storage exists in deployed Supabase projects, but not in the local WASM test fixture.
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values ('ascensao-finance-documents','ascensao-finance-documents',false,10485760,
        array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv',
          'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
      on conflict (id) do update set public = false,file_size_limit = excluded.file_size_limit,allowed_mime_types = excluded.allowed_mime_types;
    execute $policy$create policy ascensao_finance_documents_read on storage.objects for select to authenticated using (
      bucket_id = 'ascensao-finance-documents' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      and app_private.can_access_finance_workspace(((storage.foldername(name))[1])::uuid))$policy$;
    execute $policy$create policy ascensao_finance_documents_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'ascensao-finance-documents' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      and length((storage.foldername(name))[2]) between 1 and 120
      and app_private.can_access_finance_workspace(((storage.foldername(name))[1])::uuid))$policy$;
    execute $policy$create policy ascensao_finance_documents_delete on storage.objects for delete to authenticated using (
      bucket_id = 'ascensao-finance-documents' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      and app_private.can_access_finance_workspace(((storage.foldername(name))[1])::uuid))$policy$;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
