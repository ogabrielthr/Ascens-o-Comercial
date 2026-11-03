const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('inactive user portfolio includes old open, won and lost leads with explicit all-history filters', () => {
  const now = new Date().toISOString();
  const rows = [
    {id:'open', ownerId:'inactive',status:'aberto',criadoEm:'2020-01-01'},
    {id:'won', ownerId:'inactive',status:'ganho',criadoEm:'2020-01-01',fechadoEm:'2020-02-01'},
    {id:'lost', ownerId:'inactive',status:'perdido',criadoEm:'2020-01-01',fechadoEm:'2020-02-01'},
    {id:'recent', ownerId:'inactive',status:'ganho',criadoEm:now,fechadoEm:now},
    {id:'other', ownerId:'active',status:'aberto',criadoEm:now},
  ];
  const data={usuarios:[{id:'inactive',ativo:false},{id:'active',ativo:true}],oportunidades:rows};
  const h=()=>({});
  const AGIR={dom:{h,icon:h},pages:{},util:{},ui:{segmented:h,empty:h},store:{get:key=>data[key]||[],byId:()=>null}};
  const context={window:{AGIR},Date,Intl,console};
  for (const file of ['core/format.js','core/analytics.js','core/widgets.js']) vm.runInNewContext(fs.readFileSync('assets/js/'+file,'utf8'),context);
  let visible,filterContext;
  Object.assign(AGIR.w,{pageHead:h,filterBar:ctx=>{filterContext=ctx;return {};},kpi:h,section:h,dataTable:options=>{visible=options.rows;return {};}});
  vm.runInNewContext(fs.readFileSync('assets/js/pages/crm/leads.js','utf8'),context);
  const query={owner:'inactive',v:'todas',periodo:'todos'};
  const render=patch=>{AGIR.pages.crmLeads({appendChild(){}},{query:{...query,...patch}});return Array.from(visible,r=>r.id);};
  assert.deepEqual(render({}),['open','won','lost','recent']);
  assert.equal(filterContext.allTimePeriod,true);
  assert.equal(AGIR.w.rotuloPeriodo('todos'),'Todo o histórico');
  assert.deepEqual(render({v:'ganhas'}),['won','recent']);
  assert.deepEqual(render({v:'perdidas'}),['lost']);
  assert.deepEqual(render({v:'abertas'}),['open']);
  assert.deepEqual(render({periodo:'mes'}),['open','recent']);
});
