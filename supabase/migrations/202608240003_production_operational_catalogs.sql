begin;

insert into public.pipelines (id, organization_id, name, is_default, active)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Comercial', true, true)
on conflict (id) do update set name = excluded.name, is_default = true, active = true, deleted_at = null, updated_at = now();

insert into public.pipeline_stages
  (id, organization_id, pipeline_id, name, position, stage_type, probability, sla_days, color, active)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Lead novo', 0, 'open', 10, 1, '#F59E0B', true),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Contato realizado', 1, 'open', 25, 2, '#38BDF8', true),
  ('11000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Qualificacao', 2, 'open', 45, 3, '#818CF8', true),
  ('11000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Proposta enviada', 3, 'open', 70, 3, '#C084FC', true),
  ('11000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Fechado ganho', 4, 'won', 100, 0, '#22C55E', true),
  ('11000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Fechado perdido', 5, 'lost', 0, 0, '#EF4444', true)
on conflict (id) do update set name = excluded.name, position = excluded.position, stage_type = excluded.stage_type,
  probability = excluded.probability, sla_days = excluded.sla_days, color = excluded.color,
  active = true, deleted_at = null, updated_at = now();

insert into public.products
  (id, organization_id, name, code, default_commission_rate, min_amount, max_amount, active)
values
  ('12000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Consignado INSS', 'INSS', 4.2, 0, 1000000, true),
  ('12000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Consignado Servidor', 'SERVIDOR', 5.0, 0, 1000000, true),
  ('12000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Antecipacao FGTS', 'FGTS', 3.1, 0, 1000000, true),
  ('12000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Credito CLT', 'CLT', 2.7, 0, 1000000, true)
on conflict (id) do update set name = excluded.name, code = excluded.code,
  default_commission_rate = excluded.default_commission_rate, min_amount = excluded.min_amount,
  max_amount = excluded.max_amount, active = true, deleted_at = null, updated_at = now();

insert into public.banks (id, organization_id, name, code, active)
values
  ('13000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Banco a definir', 'A_DEFINIR', true),
  ('13000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Banco PAN', 'PAN', true),
  ('13000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Banco BMG', 'BMG', true)
on conflict (id) do update set name = excluded.name, code = excluded.code, active = true, deleted_at = null, updated_at = now();

insert into public.lead_sources (id, organization_id, name, code, active)
values
  ('14000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Indicacao', 'INDICACAO', true),
  ('14000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'WhatsApp', 'WHATSAPP', true),
  ('14000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Site', 'SITE', true),
  ('14000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Midia paga', 'MIDIA_PAGA', true)
on conflict (id) do update set name = excluded.name, code = excluded.code, active = true, deleted_at = null, updated_at = now();

insert into public.loss_reasons (id, organization_id, name, code, active)
values
  ('15000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Sem margem', 'SEM_MARGEM', true),
  ('15000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Taxa nao aceita', 'TAXA', true),
  ('15000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Sem retorno', 'SEM_RETORNO', true),
  ('15000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Fechou com concorrente', 'CONCORRENTE', true)
on conflict (id) do update set name = excluded.name, code = excluded.code, active = true, deleted_at = null, updated_at = now();

insert into public.mood_scale_options (organization_id, score, label, color, active)
values
  ('00000000-0000-4000-8000-000000000001', 1, 'Muito mal', '#EF4444', true),
  ('00000000-0000-4000-8000-000000000001', 2, 'Mal', '#F97316', true),
  ('00000000-0000-4000-8000-000000000001', 3, 'Neutro', '#EAB308', true),
  ('00000000-0000-4000-8000-000000000001', 4, 'Bem', '#84CC16', true),
  ('00000000-0000-4000-8000-000000000001', 5, 'Muito bem', '#22C55E', true)
on conflict (organization_id, score) do update set label = excluded.label, color = excluded.color, active = true, updated_at = now();

insert into public.mood_factors (organization_id, name, sentiment, active)
values
  ('00000000-0000-4000-8000-000000000001', 'Resultados', 'positive', true),
  ('00000000-0000-4000-8000-000000000001', 'Equipe', 'positive', true),
  ('00000000-0000-4000-8000-000000000001', 'Clientes', 'neutral', true),
  ('00000000-0000-4000-8000-000000000001', 'Volume de trabalho', 'negative', true),
  ('00000000-0000-4000-8000-000000000001', 'Questao pessoal', 'neutral', true)
on conflict (organization_id, lower(name)) do nothing;

commit;
