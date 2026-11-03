const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync('assets/js/main.js','utf8');
test('every committed transition publishes the authoritative row, while failed transitions publish nothing',async()=>{
 const source=main.slice(main.indexOf('async function transitionOpportunity('),main.indexOf('async function bulkUpdateOpportunities('));
 const events=[],row={id:'lead',status:'won',closed_at:'2026-10-26T14:00:00Z',version:7,requested_reversal:100};let fail=false;
 const context={client:{},opportunityMutations:{run:async()=>{if(fail)throw new Error('failed');return row;}},window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}}};
 vm.createContext(context);vm.runInContext(source,context);
 const result=await context.transitionOpportunity({opportunityId:'lead',targetStageId:'won',expectedVersion:6});
 assert.equal(result,row);assert.equal(events.length,1);assert.equal(events[0].type,'ascensao:opportunity-committed');assert.equal(events[0].detail.row,row);
 fail=true;await assert.rejects(context.transitionOpportunity({opportunityId:'lead',targetStageId:'won',expectedVersion:6}),/failed/);assert.equal(events.length,1);
});
test('ranking recognizes a new completion of the same lead once and immediately schedules a refresh on CRM changes',()=>{
 const source=fs.readFileSync('assets/js/pages/performance/ranking.js','utf8');let stored=[],celebrations=0;const user={id:'seller'};
 const context={disposed:false,node:{isConnected:true},rowsSignature:'',sourceRevision:'',lastUpdatedAt:null,failures:0,linhas:[],baselineLoaded:false,observedThrough:0,seenSales:new Set(),periodo:{from:new Date('2026-10-01'),to:new Date('2026-11-01')},f:{},Date,
  S:()=>({set:(key,rows)=>{stored=rows;},revision:()=>0}),updateStatus(){},celebrateSale(){celebrations++;},
  renderBoard(){context.linhas=stored.length?[{usuario:user,estornoTotal:stored.reduce((sum,r)=>sum+r.estornoSolicitado,0)}]:[];}};
 vm.createContext(context);const start=source.indexOf('    function applyRankingResponse('),end=source.indexOf('    function celebrateSale(',start);vm.runInContext(source.slice(start,end),context);
 const entry={sale_id:'stable-id',owner_id:'seller',closed_at:'2026-10-26T10:00:00Z',requested_reversal:50,production_value:100};
 context.applyRankingResponse({entries:[entry],recent:[entry]},Date.parse('2026-10-26T11:00:00Z'));assert.equal(celebrations,0);
 context.applyRankingResponse({entries:[],recent:[]},Date.parse('2026-10-26T12:00:00Z'));assert.equal(stored.length,0);
 const rewon={...entry,closed_at:'2026-10-26T13:00:00Z',requested_reversal:75};
 context.applyRankingResponse({entries:[rewon],recent:[rewon]},Date.parse('2026-10-26T14:00:00Z'));assert.equal(stored.length,1);assert.equal(stored[0].estornoSolicitado,75);assert.equal(celebrations,1);
 context.applyRankingResponse({entries:[rewon],recent:[rewon]},Date.parse('2026-10-26T15:00:00Z'));assert.equal(celebrations,1);
 let delay;context.refreshing=false;context.nextAttemptAt=123;context.scheduleRefresh=value=>{delay=value;};
 const begin=source.indexOf('    function onCrmChange()'),finish=source.indexOf('    function onSync()',begin);vm.runInContext(source.slice(begin,finish),context);context.onCrmChange();assert.equal(delay,0);assert.equal(context.nextAttemptAt,0);
 context.failures=1;context.nextAttemptAt=321;context.onCrmChange();assert.equal(context.nextAttemptAt,321);
});
