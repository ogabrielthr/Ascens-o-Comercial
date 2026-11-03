begin;

insert into public.chart_of_accounts (organization_id, code, name, entry_type, group_name)
select id, 'REC_COMISSAO', 'Receita de comissao', 'revenue', 'Receitas comerciais' from public.organizations
on conflict (organization_id, code) do update set active = true, deleted_at = null, updated_at = now();

insert into public.chart_of_accounts (organization_id, code, name, entry_type, group_name)
select id, 'DESP_COMERCIAL', 'Despesa comercial', 'expense', 'Despesas comerciais' from public.organizations
on conflict (organization_id, code) do update set active = true, deleted_at = null, updated_at = now();

insert into public.cost_centers (organization_id, code, name)
select id, 'COMERCIAL', 'Comercial' from public.organizations
on conflict (organization_id, code) do update set active = true, deleted_at = null, updated_at = now();

insert into public.loss_reasons (organization_id, name, code)
select organization.id, reason.name, reason.code
from public.organizations organization
cross join (values
  ('Sem margem disponivel', 'no_margin'), ('Cliente desistiu', 'customer_withdrew'),
  ('Sem retorno do cliente', 'no_response'), ('Documentacao pendente', 'missing_documents'),
  ('Condicao nao aprovada', 'not_approved'), ('Fechou com concorrente', 'competitor'),
  ('Outro motivo', 'other')
) as reason(name, code)
where not exists (
  select 1 from public.loss_reasons existing where existing.organization_id = organization.id
  and lower(existing.name) = lower(reason.name) and existing.deleted_at is null
);

commit;
