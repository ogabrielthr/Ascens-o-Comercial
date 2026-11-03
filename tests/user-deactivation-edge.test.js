const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const source=transformSync(fs.readFileSync('supabase/functions/manage-user/index.ts','utf8').replace(/^import .*;\r?\n/gm,''),{loader:'ts',format:'cjs'}).code;
function harness(rpcError=null) {
  const writes=[];let serve;
  class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
  const table={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{user_id:'source',role:'commercial',active:true}}),update(value){writes.push(['update',value]);return this;}};
  const context={Error,Deno:{serve:fn=>{serve=fn;}},console:{error(){}},Response,assertAllowedOrigin(){},corsHeaders:()=>({}),HttpError,
    json:(req,body,status=200)=>({body,status}),uuid:value=>value,requiredString:value=>value,role:value=>value,password:value=>value,
    requireOrganizationAdmin:async()=>({user:{id:'admin'},serviceClient:{from:()=>table},userClient:{rpc:async(name,args)=>{writes.push([name,args]);return {data:{ok:true,leads:5},error:rpcError};}}})};
  vm.runInNewContext(source,context);
  return {writes,call:payload=>serve({method:'POST',json:async()=>({organizationId:'org',userId:'source',action:'set_active',active:false,...payload})})};
}
test('manage-user requires an explicit portfolio decision and delegates deactivation to the atomic caller-authorized RPC',async()=>{
  const app=harness();
  assert.equal((await app.call({})).status,400);assert.equal(app.writes.length,0);
  const response=await app.call({transferData:true,destinationUserId:'destination'});
  assert.equal(response.status,200);assert.equal(response.body.leads,5);
  assert.equal(app.writes.length,1);assert.equal(app.writes[0][0],'deactivate_user_with_transfer');
  assert.equal(app.writes[0][1].p_destination_user_id,'destination');
});
test('manage-user surfaces invalid destination errors without falling back to nontransactional deactivation',async()=>{
  const app=harness({code:'22023',message:'Destino inativo'});
  const response=await app.call({transferData:true,destinationUserId:'inactive'});
  assert.equal(response.status,400);assert.equal(response.body.error,'Destino inativo');assert.equal(app.writes.length,1);
});
