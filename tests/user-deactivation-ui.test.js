const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const users=[{id:'source',nome:'Source',ativo:true},{id:'destination',nome:'Destination',ativo:true},{id:'inactive',nome:'Inactive',ativo:false}];
  const calls=[],warnings=[]; let table,menu,lastModal,resolveWrite,rejectWrite,reloads=0;
  function h(tag,...args) {
    const props=args[0] && !args[0].tag && !Array.isArray(args[0]) && typeof args[0]==='object' ? args.shift() : {};
    const el={tag,props,children:args.flat(Infinity).filter(Boolean),listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}};
    if(tag.startsWith('select')) el.value=el.children[0]?.props?.value||'';
    return el;
  }
  const AGIR={pages:{},dom:{h,icon:()=>h('icon')},fmt:{},motion:{},an:{},charts:{},
    util:{deb:fn=>fn},store:{get:key=>key==='usuarios'?users:key==='session.organizationId'?'org':[],update(path,id,patch){Object.assign(users.find(u=>u.id===id),patch);}},
    router:{resolve(){}},w:{section:opts=>opts,dataTable:opts=>{table=opts;return h('table');}},
    ui:{popover(anchor,items){menu=items;},toast:{warn:(...args)=>warnings.push(args),bad:(...args)=>warnings.push(args),ok(){}},modal(opts){
      const api={close(){api.closed=true;}};
      lastModal={opts,api};lastModal.footer=opts.footer(api);return api;
    }}};
  const backend={mode:'supabase',manageUser:payload=>{calls.push(payload);return new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});}};
  const window={AGIR,AGIR_BACKEND:backend,location:{reload(){reloads++;}}};
  vm.runInNewContext(fs.readFileSync('assets/js/pages/performance/equipe.js','utf8'),{window,console});
  AGIR.pages.perfUsuarios({appendChild(){}},{embedded:true,query:{}});
  table.columns.find(c=>c.key==='acoes').render(users[0]).props.onClick({stopPropagation(){}});
  const deactivate=menu.find(i=>i.label==='Desativar');
  const walk=el=>el && el.tag ? [el,...el.children.flatMap(walk)] : [];
  return {users,calls,warnings,get reloads(){return reloads;},async open(){await deactivate.onClick();return lastModal;},walk,resolve(){resolveWrite({ok:true});},reject(){rejectWrite(new Error('Transferencia falhou'));}};
}

test('deactivation asks for a destination before writing and never disables locally on a failed transfer', async()=>{
  const app=harness(),modal=await app.open();
  assert.equal(app.calls.length,0);
  const fields=app.walk(modal.opts.body).filter(e=>e.tag.startsWith('select'));
  const [choice,destination]=fields,submit=modal.footer[1];
  assert.deepEqual(destination.children.map(o=>o.props.value),['','destination']);
  await submit.props.onClick(); assert.equal(app.calls.length,0); assert.equal(app.users[0].ativo,true);
  destination.value='destination';const pending=submit.props.onClick();
  assert.equal(app.calls.length,1);assert.equal(app.calls[0].transferData,true);assert.equal(app.calls[0].destinationUserId,'destination');
  assert.equal(app.users[0].ativo,true);assert.equal(submit.disabled,true);
  modal.api.close();assert.equal(modal.api.closed,undefined);
  app.reject();await pending;assert.equal(app.users[0].ativo,true);assert.equal(app.reloads,0);assert.equal(submit.disabled,false);
  const success=submit.props.onClick();app.resolve();await success;
  assert.equal(app.users[0].ativo,false);assert.equal(app.reloads,1);assert.equal(modal.api.closed,true);
});

test('administrator can explicitly retain the inactive portfolio without transferring or reloading',async()=>{
  const app=harness(),modal=await app.open();
  const [choice]=app.walk(modal.opts.body).filter(e=>e.tag.startsWith('select'));
  choice.value='keep';choice.listeners.change();
  assert.equal(modal.footer[1].textContent,'Desativar mantendo os dados');
  const pending=modal.footer[1].props.onClick();
  assert.equal(app.calls[0].transferData,false);assert.equal(app.calls[0].destinationUserId,null);
  app.resolve();await pending;assert.equal(app.users[0].ativo,false);assert.equal(app.reloads,0);
});
