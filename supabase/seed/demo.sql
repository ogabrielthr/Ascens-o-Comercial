-- Catálogos locais de demonstração.
-- Este arquivo é executado apenas por "supabase db reset".
begin;

insert into public.organizations
  (id, name, legal_name, cnpj, phone, site, city, state)
values
  ('00000000-0000-4000-8000-000000000001', 'Ascensão Comercial',
   null, null, null,
   null, null, null)
on conflict (id) do nothing;

insert into public.pipelines
  (id, organization_id, name, is_default)
values
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001', 'Comercial', true)
on conflict (id) do nothing;

insert into public.pipeline_stages
  (id, organization_id, pipeline_id, name, position, stage_type, probability, sla_days, color)
values
  ('11000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Lead novo',1,'open',10,1,'#ff9500'),
  ('11000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Contato efetivo',2,'open',20,2,'#f7b731'),
  ('11000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Reunião marcada',3,'open',35,3,'#45aaf2'),
  ('11000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Reunião realizada',4,'open',50,3,'#2d98da'),
  ('11000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Proposta enviada',5,'open',65,4,'#8854d0'),
  ('11000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Negociação',6,'open',80,5,'#a55eea'),
  ('11000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fechado ganho',7,'won',100,0,'#20bf6b'),
  ('11000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fechado perdido',8,'lost',0,0,'#eb3b5a')
on conflict (id) do nothing;

insert into public.products
  (id, organization_id, name, code, default_commission_rate, min_amount, max_amount)
values
  ('12000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Consignado INSS','INSS',4.20,1000,100000),
  ('12000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Servidor público','SERVIDOR',3.80,1000,200000),
  ('12000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Militar','MILITAR',3.60,1000,200000),
  ('12000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Antecipação FGTS','FGTS',2.40,100,50000),
  ('12000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Cartão consignado','CARTAO',4.80,500,50000),
  ('12000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','Portabilidade','PORT',3.20,1000,150000)
on conflict (id) do nothing;

insert into public.banks (id, organization_id, name, code) values
  ('13000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','C6 Bank','C6'),
  ('13000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Banco PAN','PAN'),
  ('13000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','BMG','BMG'),
  ('13000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Daycoval','DAYCOVAL'),
  ('13000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Facta','FACTA')
on conflict (id) do nothing;

insert into public.lead_sources (id, organization_id, name, code) values
  ('14000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Indicação','INDICACAO'),
  ('14000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Base própria','BASE'),
  ('14000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Meta Ads','META'),
  ('14000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Google Ads','GOOGLE'),
  ('14000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Prospecção ativa','ATIVO')
on conflict do nothing;

insert into public.loss_reasons (id, organization_id, name, code) values
  ('15000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Sem margem','SEM_MARGEM'),
  ('15000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Taxa não competitiva','TAXA'),
  ('15000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Não respondeu','SEM_RETORNO'),
  ('15000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Fechou com concorrente','CONCORRENTE'),
  ('15000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Documentação incompleta','DOCUMENTACAO')
on conflict (id) do nothing;

insert into public.mood_scale_options (organization_id, score, label, color) values
  ('00000000-0000-4000-8000-000000000001',1,'Muito ruim','#ef4444'),
  ('00000000-0000-4000-8000-000000000001',2,'Ruim','#f97316'),
  ('00000000-0000-4000-8000-000000000001',3,'Neutro','#eab308'),
  ('00000000-0000-4000-8000-000000000001',4,'Bem','#22c55e'),
  ('00000000-0000-4000-8000-000000000001',5,'Muito bem','#14b8a6')
on conflict (organization_id, score) do nothing;

insert into public.mood_factors (organization_id, name, sentiment) values
  ('00000000-0000-4000-8000-000000000001','Base / mailing fraco','negative'),
  ('00000000-0000-4000-8000-000000000001','Cansaço','negative'),
  ('00000000-0000-4000-8000-000000000001','Problema pessoal','negative'),
  ('00000000-0000-4000-8000-000000000001','Cliente difícil','negative'),
  ('00000000-0000-4000-8000-000000000001','Meta avançando','positive'),
  ('00000000-0000-4000-8000-000000000001','Venda fechada','positive'),
  ('00000000-0000-4000-8000-000000000001','Time ajudando','positive')
on conflict do nothing;

insert into public.chart_of_accounts (id, organization_id, code, name, entry_type, group_name) values
  ('16000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','REC_COMISSAO','Comissões recebidas','revenue','Receita operacional'),
  ('16000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','DESP_COMERCIAL','Comissionamento do time','expense','Custo variável'),
  ('16000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','DESP_MARKETING','Marketing e tráfego','expense','Custo variável'),
  ('16000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','DESP_FOLHA','Folha e encargos','expense','Custo fixo'),
  ('16000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','DESP_SOFTWARE','Software e sistemas','expense','Custo fixo')
on conflict (organization_id, code) do nothing;

insert into public.cost_centers (id, organization_id, code, name) values
  ('17000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','COMERCIAL','Comercial'),
  ('17000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','MARKETING','Marketing'),
  ('17000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','ADMIN','Administrativo')
on conflict (organization_id, code) do nothing;

insert into public.gamification_rules (organization_id, event_type, points) values
  ('00000000-0000-4000-8000-000000000001','lesson_completed',10),
  ('00000000-0000-4000-8000-000000000001','track_completed',50),
  ('00000000-0000-4000-8000-000000000001','call_completed',1),
  ('00000000-0000-4000-8000-000000000001','appointment_created',15),
  ('00000000-0000-4000-8000-000000000001','proposal_sent',25),
  ('00000000-0000-4000-8000-000000000001','opportunity_won',100)
on conflict (organization_id, event_type, effective_from) do nothing;

commit;
