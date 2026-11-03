process.env.TZ='America/Sao_Paulo';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(now='2026-10-23T12:00:00-03:00'){
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return +new Date(now);}}
  const op=(id,owner,status,created,closed,value,product='p1',extra={})=>({id,ownerId:owner,status,criadoEm:created,fechadoEm:closed,estornoSolicitado:value,comissao:value/10,produtoId:product,origemId:'s1',pipelineId:'pipe',etapaId:status==='ganho'?'won':'lead',...extra});
  const activity=(id,lead,type,result,date,status='completed')=>({id,oportunidadeId:lead,ownerId:'u1',tipo:type,resultado:result,data:date,status});
  const data={usuarios:[{id:'u1',nome:'One',ativo:true,equipeId:'t1',role:'commercial'},{id:'u2',nome:'Two',ativo:false,equipeId:'t2',role:'commercial'}],
    oportunidades:[op('first','u1','ganho','2026-08-01','2026-09-01',0.1),op('last','u1','ganho','2026-09-01','2026-09-30',0.2),op('inactive','u2','ganho','2026-08-20','2026-09-15',100,'p2'),op('missing','u1','ganho','2026-09-20','2026-09-25',10,null),
      op('october','u1','ganho','2026-09-15','2026-10-23',200),op('future','u1','ganho','2026-09-15','2026-10-10',900,'p3',{etapaId:'won',entrouEtapaEm:'2026-10-10'}),
      op('lost','u1','perdido','2026-08-01','2026-09-12',7,'p2',{motivoPerdaId:'loss'}),op('open','u1','aberto','2026-09-20',null,999),op('august','u1','ganho','2026-08-01','2026-08-31',5),
      op('cancelled','u1','cancelado','2026-09-01','2026-09-30',5000),op('deleted','u1','ganho','2026-09-01','2026-09-30',5000,'p1',{deleted_at:'2026-10-01'})],
    atividades:[activity('call','last','ligacao','agendou','2026-09-01T15:00:00Z'),activity('wa','last','whatsapp','agendou','2026-09-02T15:00:00Z'),activity('meeting','last','reuniao','realizada','2026-09-03T15:00:00Z'),
      activity('proposal1','last','proposta','enviada','2026-09-04T15:00:00Z'),activity('proposal2','last','proposta','enviada','2026-09-05T15:00:00Z'),activity('proposal3','open','proposta','enviada','2026-09-04T15:00:00Z'),
      activity('cancel-call','first','ligacao','agendou','2026-09-01T15:00:00Z','cancelled'),activity('pending-call','first','ligacao','agendou','2026-09-01T15:00:00Z','pending')],
    metas:[{usuarioId:'u1',ano:2026,mes:9,vendasValor:1000},{usuarioId:'u2',ano:2026,mes:9,vendasValor:500},{usuarioId:'u1',ano:2026,mes:10,vendasValor:2000}],
    produtos:[{id:'p1',nome:'Product 1'},{id:'p2',nome:'Product 2'},{id:'p3',nome:'Product 3'}],origens:[{id:'s1',nome:'Source'}],motivosPerda:[{id:'loss',nome:'Loss'}],
    pipelines:[{id:'pipe',padrao:true,etapas:[{id:'lead',nome:'Lead',tipo:'aberto',ordem:0},{id:'proposal',nome:'Proposal',tipo:'aberto',ordem:1},{id:'won',nome:'Won',tipo:'ganho',ordem:2}]}],
    historicoEtapas:[{oportunidadeId:'future',paraEtapaId:'proposal',deEtapaId:'lead',alteradoEm:'2026-09-20'},{oportunidadeId:'future',deEtapaId:'proposal',paraEtapaId:'won',alteradoEm:'2026-10-10'}]};
  const store={get:key=>key==='session.role'?'admin':data[key]||[],currentUser:()=>({id:'admin',role:'admin'}),byId:(key,id)=>(data[key]||[]).find(r=>r.id===id),indexBy:key=>Object.fromEntries((data[key]||[]).map(r=>[r.id,r]))};
  const window={AGIR:{store}};const context=vm.createContext({window,Date:FixedDate,Intl,console});
  for(const file of ['format.js','analytics.js'])vm.runInContext(fs.readFileSync('assets/js/core/'+file,'utf8'),context);
  return {an:window.AGIR.an,fmt:window.AGIR.fmt,data,context,window};
}
const sum=values=>values.reduce((a,b)=>a+b,0);
test('previous month uses its own full goal, realized value, last day and full comparison month',()=>{
  const {an}=harness();const k=an.kpis({periodo:'mesant'}),pace=an.paceMes({periodo:'mesant'});
  assert.equal(k.atual.vendasValor,110.3);assert.equal(k.atual.vendasQtd,4);assert.equal(k.atual.perdidasQtd,1);assert.equal(k.anterior.vendasValor,5);
  assert.equal(k.range.prevTo.getDate(),31);assert.equal(pace.vendasValor.realizado,110.3);assert.equal(pace.vendasValor.meta,1500);
  assert.equal(pace.vendasValor.esperado,1500);assert.equal(pace.vendasValor.projecao,110.3);assert.equal(pace.uteisRestantes,0);assert.equal(pace.emAndamento,false);
  assert.equal(an.paceMes({periodo:'mes'}).vendasValor.meta,2000);assert.equal(an.paceMes({periodo:'mes'}).vendasValor.realizado,1100);
});
test('activity totals, linked conversions and series ignore pending/cancelled rows and repeated proposals',()=>{
  const {an}=harness();const k=an.kpis({periodo:'mesant'}).atual;
  assert.equal(k.ligacoes,1);assert.equal(k.agendamentos,2);assert.equal(k.reunioes,1);assert.equal(k.propostas,3);
  assert.equal(k.propostasLeads,2);assert.equal(k.vendasDePropostas,1);assert.equal(k.convPropVenda,50);assert.equal(k.convLigAgend,100);assert.equal(k.convAgendReuni,100);assert.equal(k.convReuniProp,100);
  const series=an.serie({periodo:'mesant'},['vendasValor','vendasQtd','comissao','ligacoes','propostas','agendamentos','reunioes']);
  for(const [key,values]of Object.entries(series.s))assert.ok(Math.abs(sum(values)-k[key])<0.00001,key);
  assert.equal(sum(an.heatAtividade({periodo:'mesant'}).data.flat()),2);
});
test('owner/team/product/source filters intersect consistently and inactive sellers remain in historical totals',()=>{
  const {an}=harness();const f={periodo:'mesant',ownerId:'u1',equipeId:'t1',produtoId:'p1',origemId:'s1'};
  assert.equal(an.kpis(f).atual.vendasValor,0.3);assert.equal(an.paceMes(f).vendasValor.realizado,0.3);
  assert.equal(an.paceMes(f).metaCompativel,false);assert.equal(an.paceMes(f).vendasValor.meta,0);
  assert.equal(an.kpis({...f,equipeId:'t2'}).atual.vendasQtd,0);
  assert.equal(an.ranking({periodo:'mesant'}).find(r=>r.usuario.id==='u2').c.vendasValor,100);
  assert.equal(sum(an.ranking({periodo:'mesant'}).map(r=>r.c.vendasValor)),110.3);
  assert.equal(an.ranking({periodo:'mesant',ownerId:'u1'}).find(r=>r.usuario.id==='u1').metaValor,1000);
});
test('product amounts reconcile to won sales, missing catalogs remain visible and losses use closing date',()=>{
  const {an}=harness();const products=an.porDimensao({periodo:'mesant'},'produtoId','valor');
  assert.equal(sum(products.map(r=>r.value)),110.3);assert.equal(products.find(r=>r.id==='__sem_cadastro__').value,10);
  const losses=an.porDimensao({periodo:'mesant'},'motivoPerdaId','qtd');assert.equal(sum(losses.map(r=>r.qtd)),1);
  const origin=an.porDimensao({periodo:'mesant'},'origemId','qtd')[0];
  assert.equal(origin.ganhos,2); // September-created leads that had already won by September end.
});
test('historical funnel never includes next-month transitions or next-month wins',()=>{
  const {an}=harness();const steps=an.funil({periodo:'mesant',produtoId:'p3'});
  assert.deepEqual(Array.from(steps,r=>r.value),[1,1,0]);
});
test('leap-year comparison and business-day boundaries do not include the wrong day',()=>{
  const {an,fmt}=harness('2024-02-29T12:00:00-03:00');const range=an.range('ano');
  assert.equal(range.prevTo.getMonth(),1);assert.equal(range.prevTo.getDate(),28);
  assert.equal(fmt.businessDays('2026-09-01T16:00:00-03:00','2026-09-02T01:00:00-03:00'),2);
});
test('activity heatmap includes Sundays and out-of-hours work and ignores invalid timestamps',()=>{
  const {an,data}=harness();
  data.atividades.push({id:'sunday',tipo:'ligacao',status:'completed',resultado:'atendeu',data:'2026-09-06T02:00:00-03:00',ownerId:'u1'});
  data.atividades.push({id:'invalid',tipo:'ligacao',status:'completed',resultado:'atendeu',data:'invalid',ownerId:'u1'});
  const heat=an.heatAtividade({periodo:'mesant'});
  assert.equal(heat.data[6][2],1);assert.equal(sum(heat.data.flat()),3);assert.equal(heat.cols.length,24);
});
test('empty scopes produce finite numbers and no invented conversion bottleneck',()=>{
  const {an}=harness();const f={periodo:'mesant',ownerId:'missing'};
  assert.ok(Object.values(an.kpis(f).atual).every(v=>typeof v!=='number'||Number.isFinite(v)));
  assert.equal(an.insights(f).some(i=>i.title.startsWith('Gargalo')),false);
});
function dashboardIntegration(query={}){
  const run=harness();const {window,context,data}=run;const AGIR=window.AGIR;
  data.settings={dashboardWidgets:['metas','kpis','producao','canais','atividades']};
  const deferred=[],disposers=[],kpis=[],charts=[],listeners=new Map(),timers=new Map();let timerId=0,node;
  function h(tag,...args){
    const props=args[0]&&typeof args[0]==='object'&&!Array.isArray(args[0])&&!args[0].tag?args.shift():{};
    const el={tag,props,children:[],parent:null,text:props.text||'',value:props.value||'',style:{},
      classList:{add(){},toggle(){}},setAttribute(key,value){this.props[key]=value;},
      appendChild(child){this.children.push(child);child.parent=this;return child;},
      get isConnected(){return this===root||!!this.parent?.isConnected;},
      get textContent(){return this.text+this.children.map(c=>c.textContent||'').join('');},set textContent(value){this.text=String(value);this.children=[];}};
    for(const child of args.flat(Infinity)){if(child==null||child===false)continue;el.appendChild(typeof child==='object'?child:h('text',{text:String(child)}));}
    if(tag.startsWith('select'))el.value=(el.children.find(o=>o.props.selected)||el.children[0])?.props.value||'';
    return el;
  }
  const root={children:[],isConnected:true,appendChild(el){this.children.push(el);el.parent=this;}};
  AGIR.dom={h,icon:()=>h('svg'),mount(el,content){el.textContent='';for(const item of Array.isArray(content)?content:[content])if(item)el.appendChild(item);},clear:el=>{el.textContent='';}};
  AGIR.motion={defer:fn=>deferred.push(fn),initReveal(){},reduced:()=>true,progress:()=>h('progress')};
  AGIR.charts={PALETTE:['orange','blue'],sparkline:()=>h('spark'),stackbar:()=>h('stack')};
  for(const name of ['gauge','area','donut','ranking','heatmap','bars'])AGIR.charts[name]=(box,opts)=>charts.push({name,opts});
  AGIR.pages={};AGIR.avatar=()=>h('avatar');AGIR.ui={skeletonCards:()=>h('skeleton'),skeletonChart:()=>h('skeleton'),empty:opts=>h('empty',{text:opts.text||opts.title})};
  AGIR.onPageDispose=fn=>disposers.push(fn);
  window.addEventListener=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};
  window.removeEventListener=(name,fn)=>listeners.get(name)?.delete(fn);
  window.location={hash:'#/crm/dashboard'+(Object.keys(query).length?'?'+new URLSearchParams(query):''),href:'https://test/'};
  window.history={replaceState(a,b,url){window.location.hash=url.slice(url.indexOf('#'));window.location.href=url;}};
  context.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};context.clearTimeout=id=>timers.delete(id);
  for(const file of ['core/widgets.js','core/router.js','pages/crm/metas.js','pages/crm/dashboard.js'])vm.runInContext(fs.readFileSync('assets/js/'+file,'utf8'),context);
  const originalKpi=AGIR.w.kpi;
  AGIR.w.kpi=opts=>{kpis.push(opts);return originalKpi(opts);};
  AGIR.w.dataTable=()=>h('table');AGIR.shell={persistPrefs(){}};
  AGIR.router.on('/crm/dashboard',ctx=>{disposers.splice(0).forEach(fn=>fn());kpis.length=0;charts.length=0;if(node)node.parent=null;node=h('page');root.appendChild(node);AGIR.pages.crmDashboard(node,ctx);});
  const flush=()=>{while(deferred.length)deferred.shift()();};
  AGIR.router.resolve();flush();
  const walk=el=>[el,...(el.children||[]).flatMap(walk)];
  return {...run,kpis,charts,AGIR,flush,get node(){return node;},walk,
    change(label,value){const select=walk(node).find(el=>el.props?.['aria-label']===label);assert.ok(select,label);select.value=value;select.props.onChange.call(select);flush();},
    emit(){for(const fn of listeners.get('ascensao:crm-refreshed')||[])fn();},
    flushTimers(){for(const [id,fn]of timers){timers.delete(id);fn();}flush();},
    listenerCount:()=>listeners.get('ascensao:crm-refreshed')?.size||0};
}
test('real filter controls route new queries and remount KPI, goal and chart values with the same scope',()=>{
  const run=dashboardIntegration();
  const amount=()=>run.kpis.find(k=>k.label==='Estorno solicitado').raw;
  assert.equal(amount(),1100);
  run.change('Período','mesant');assert.equal(amount(),110.3);
  assert.equal(run.AGIR.router.current.query.periodo,'mesant');
  assert.match(run.node.textContent,/set\/26/i);
  const realized=run.charts.find(c=>c.opts.uid==='dash-acum').opts.series[0].values;
  assert.equal(realized.at(-1),110.3);
  run.change('Toda a equipe','u2');assert.equal(amount(),100);
  run.change('Todas as equipes','t1');assert.equal(amount(),0);
  assert.equal(run.listenerCount(),1);
});
test('live data refresh keeps selected period/owner and disposes previous dashboard listeners',()=>{
  const run=dashboardIntegration({periodo:'mesant',owner:'u2'});
  run.data.oportunidades.find(o=>o.id==='inactive').estornoSolicitado=150;
  run.emit();run.emit();run.flushTimers();
  assert.equal(run.kpis.find(k=>k.label==='Estorno solicitado').raw,150);
  assert.equal(run.AGIR.router.current.query.periodo,'mesant');assert.equal(run.AGIR.router.current.query.owner,'u2');assert.equal(run.listenerCount(),1);
});
test('embedded goals inherit the selected historical month and team scope',()=>{
  const run=dashboardIntegration({view:'metas',periodo:'mesant',equipe:'t2'});
  assert.equal(run.kpis.find(k=>k.label==='Realizado').raw,100);
  assert.equal(run.kpis.find(k=>k.label==='Meta de estorno solicitado').raw,500);
  assert.match(run.node.textContent,/setembro de 2026/i);
});
test('yearly ideal curve respects each monthly target and agrees with the goal card',()=>{
  const run=dashboardIntegration({periodo:'ano'});const pace=run.an.paceMes({periodo:'ano'});
  const production=run.charts.find(c=>c.opts.uid==='dash-acum').opts;
  const ideal=production.series.find(s=>s.name==='Ritmo ideal').values;
  assert.ok(Math.abs(ideal.at(-1)-pace.vendasValor.esperado)<0.01);
  assert.equal(production.target.value,3500);
  assert.equal(pace.vendasValor.realizado,run.an.kpis({periodo:'ano'}).atual.vendasValor);
});
test('rolling ranges prorate goals across month boundaries and series reconcile for every preset',()=>{
  const {an}=harness();
  for(const preset of an.PRESETS){
    const f={periodo:preset.value};const k=an.kpis(f).atual,p=an.paceMes(f),series=an.serie(f,['vendasValor','vendasQtd','ligacoes']);
    assert.equal(p.vendasValor.realizado,k.vendasValor,preset.value);
    for(const key of Object.keys(series.s))assert.ok(Math.abs(sum(series.s[key])-k[key])<0.005,preset.value+' '+key);
    if(!['mes','ano'].includes(preset.value))assert.equal(p.uteisRestantes,0);
  }
});
