begin;

insert into public.loss_reasons (organization_id, name, code, active)
select organization.id, reason.name, reason.code, true
from public.organizations organization
cross join (values
  ('Cliente sem margem', 'customer_no_margin'),
  ('Banco não trabalhado', 'unsupported_bank'),
  ('Sem interesse na taxa atual', 'current_rate_not_accepted'),
  ('Sem interesse', 'not_interested'),
  ('Sem contato', 'no_contact'),
  ('Falecido', 'deceased')
) as reason(name, code)
where not exists (
  select 1 from public.loss_reasons existing
  where existing.organization_id = organization.id
    and lower(existing.name) = lower(reason.name)
    and existing.deleted_at is null
);

update public.loss_reasons set active = true, deleted_at = null, updated_at = now()
where lower(name) in ('cliente sem margem', 'banco não trabalhado',
  'sem interesse na taxa atual', 'sem interesse', 'sem contato', 'falecido');

commit;
