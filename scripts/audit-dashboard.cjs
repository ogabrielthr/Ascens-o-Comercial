// Run explicitly against the linked project. Only aggregated validation results
// are printed; the minimal numeric source snapshot stays in process memory.
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'),
  'db','query','--linked','--file',path.join(__dirname,'audit-dashboard.sql')], {cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:30*1024*1024});
if (result.status !== 0) throw new Error('A consulta de auditoria falhou: '+result.stderr);
const output = result.stdout;
const response = JSON.parse(output.slice(output.indexOf('{'),output.lastIndexOf('}')+1));
const snapshot = response.rows?.[0]?.audit_snapshot;
if (!snapshot) throw new Error('Snapshot de auditoria ausente.');
const NativeDate = Date;
class AuditDate extends NativeDate { constructor(...args){super(...(args.length?args:[snapshot.reference_time]));} static now(){return +new NativeDate(snapshot.reference_time);} }
const types={call:'ligacao',meeting:'reuniao',proposal:'proposta'};
const data={
  usuarios:snapshot.members.map(m=>({id:m.user_id,nome:m.user_id,equipeId:m.team_id,ativo:m.active,role:m.role})),
  oportunidades:snapshot.leads.map(l=>({id:l.id,ownerId:l.owner_id,produtoId:l.product_id,origemId:l.source_id,bancoId:l.bank_id,
    status:{open:'aberto',won:'ganho',lost:'perdido'}[l.status],motivoPerdaId:l.loss_reason_id,criadoEm:l.created_at,fechadoEm:l.closed_at,estornoSolicitado:Number(l.requested_reversal)||0,comissao:Number(l.expected_commission)||0})),
  atividades:snapshot.activities.map(a=>({id:a.id,ownerId:a.owner_id,oportunidadeId:a.opportunity_id,tipo:types[a.activity_type]||a.activity_type,
    status:a.status,resultado:a.status==='pending'?'pendente':a.result,data:a.happened_at,duracaoSeg:a.duration_seconds})),
  metas:snapshot.goals.map(g=>({...g,usuarioId:g.user_id,ano:g.year,mes:g.month}))
};
const store={get:key=>data[key]||[],indexBy:key=>Object.fromEntries((data[key]||[]).map(r=>[r.id,r])),byId:(key,id)=>(data[key]||[]).find(r=>r.id===id)};
const window={AGIR:{store}};
const context=vm.createContext({window,Date:AuditDate,Intl,console});
for(const file of ['format.js','analytics.js']) vm.runInContext(fs.readFileSync(path.join(root,'assets/js/core',file),'utf8'),context);
const an=window.AGIR.an;
let assertions=0;
const mismatches=[],totals=[];
for(const check of snapshot.checks){
  const filter={periodo:check.period};
  if(check.kind!=='all') filter[{owner:'ownerId',team:'equipeId',product:'produtoId',source:'origemId'}[check.kind]]=check.scope_id;
  const k=an.kpis(filter).atual;
  for(const [key,value] of Object.entries(check.expected)){
    assertions++;
    const actual=key==='contatosHeatmap'?an.heatAtividade(filter).data.flat().reduce((sum,v)=>sum+v,0):k[key];
    if(Math.abs(actual-Number(value))>0.005) mismatches.push({filter,key,actual,expected:Number(value)});
  }
  const series=an.serie(filter,['vendasValor','vendasQtd','comissao','ligacoes','propostas','agendamentos','reunioes','leads']);
  for(const key of Object.keys(series.s)){
    assertions++;
    const total=series.s[key].reduce((sum,v)=>sum+v,0);
    if(Math.abs(total-k[key==='leads'?'leadsNovos':key])>0.005) mismatches.push({filter,key,series:total,kpi:k[key]});
  }
  const pace=an.paceMes(filter); assertions++;
  if(Math.abs(pace.vendasValor.realizado-k.vendasValor)>0.005) mismatches.push({filter,pace:pace.vendasValor.realizado,kpi:k.vendasValor});
  const ranking=an.ranking(filter); assertions++;
  if(Math.abs(ranking.reduce((sum,r)=>sum+r.c.vendasValor,0)-k.vendasValor)>0.005) mismatches.push({filter,ranking:'sum mismatch'});
  for(const [dimension,measure,key] of [['produtoId','valor','vendasValor'],['origemId','qtd','leadsNovos'],['motivoPerdaId','qtd','perdidasQtd']]){
    assertions++;
    const total=an.porDimensao(filter,dimension,measure).reduce((sum,r)=>sum+r.value,0);
    if(Math.abs(total-k[key])>0.005)mismatches.push({filter,dimension,total,kpi:k[key]});
  }
  if(check.kind==='all') totals.push({periodo:check.period,vendas:k.vendasQtd,estornoSolicitado:k.vendasValor,perdas:k.perdidasQtd,ligacoes:k.ligacoes});
}
console.log(JSON.stringify({referenceTime:snapshot.reference_time,scenarios:snapshot.checks.length,assertions,totals,mismatches},null,2));
if(mismatches.length) process.exitCode=1;
