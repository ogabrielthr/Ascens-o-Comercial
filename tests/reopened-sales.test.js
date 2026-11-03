process.env.TZ='America/Sao_Paulo';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');const {citext}=require('@electric-sql/pglite/contrib/citext');const {pg_trgm}=require('@electric-sql/pglite/contrib/pg_trgm');
const dir='supabase/migrations/',files=fs.readdirSync(dir);
const sql=prefix=>fs.readFileSync(dir+files.find(f=>f.startsWith(prefix)),'utf8');
function fn(prefix,name){const text=sql(prefix),start=text.indexOf('create or replace function '+name+'(');assert.ok(start>=0,name);return text.slice(start,text.indexOf('$$;',start)+3);}
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('won → reopen → won restores one sale, ranking, goals, financials and correct lead points over repeated cycles', {timeout:120000},async()=>{
 const db=new PGlite({extensions:{citext,pg_trgm}});const org=id(1),admin=id(2),seller=id(3),pipeline=id(4),open=id(5),won=id(6),contact=id(7),lead=id(8),product=id(9),other=id(10);
 try{
  await db.exec(`create schema extensions;create schema auth;create role anon;create role authenticated;create role service_role;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`);
  for(const prefix of ['202608230001','202608230002','202608230003','202608230004','202608230005'])await db.exec(sql(prefix).replace('create extension if not exists pgcrypto with schema extensions;',''));
  await db.exec(`create table public.audit_logs(id bigint generated always as identity,organization_id uuid,actor_id uuid,action public.audit_action,entity_type text,entity_id uuid,old_data jsonb,new_data jsonb);`);
  for(const name of ['set_actor_columns','audit_row_change'])await db.exec(fn('202608230009','app_private.'+name));
  await db.exec(sql('202608230008'));await db.exec(sql('202608230012'));
  await db.exec(`alter table opportunities add column requested_reversal numeric(14,2),add column total_value numeric(14,2);
    create table opportunity_change_history(id uuid primary key,organization_id uuid);
    create table opportunity_messages(id uuid primary key,organization_id uuid,opportunity_id uuid,deleted_at timestamptz,created_at timestamptz);
    create table payment_receipts(id uuid primary key,organization_id uuid,opportunity_id uuid,created_at timestamptz);
    create table financial_history_test(old_status text,new_status text);
  `);
  await db.exec(sql('202609140001'));
  await db.exec(sql('202608260007'));await db.exec(sql('202608270002'));
  const original=(await db.query("select pg_get_functiondef('transition_opportunity(uuid,uuid,integer,uuid)'::regprocedure) as definition")).rows[0].definition;
  await db.exec(original.replace("opportunity_row.version <> p_expected_version","opportunity_row.version is distinct from p_expected_version").replace("errcode = '40001'","errcode = 'PT409'"));
  const metadata=()=>db.query("select oid,proowner,proacl::text,prosecdef,proconfig from pg_proc where oid='transition_opportunity(uuid,uuid,integer,uuid)'::regprocedure");
  const before=(await metadata()).rows;
  await db.exec(sql('202610260001'));const definition=(await db.query("select pg_get_functiondef('transition_opportunity(uuid,uuid,integer,uuid)'::regprocedure) as definition")).rows;
  await db.exec(sql('202610260001'));assert.deepEqual((await metadata()).rows,before);assert.deepEqual((await db.query("select pg_get_functiondef('transition_opportunity(uuid,uuid,integer,uuid)'::regprocedure) as definition")).rows,definition);
  await db.exec(`insert into auth.users values('${admin}'),('${seller}');insert into profiles(id,full_name)values('${admin}','Admin'),('${seller}','Seller');insert into organizations(id,name)values('${org}','Test');insert into organization_members(organization_id,user_id,role)values('${org}','${admin}','admin'),('${org}','${seller}','commercial');
    insert into pipelines(id,organization_id,name)values('${pipeline}','${org}','Pipeline');
    insert into pipeline_stages(id,organization_id,pipeline_id,name,position,stage_type)values('${open}','${org}','${pipeline}','Open',0,'open'),('${won}','${org}','${pipeline}','Won',1,'won');
    insert into contacts(id,organization_id,full_name,owner_id)values('${contact}','${org}','Contact','${seller}');
    insert into products(id,organization_id,name)values('${product}','${org}','Product');
    insert into opportunities(id,organization_id,contact_id,pipeline_id,stage_id,owner_id,product_id,title,amount,expected_commission,requested_reversal,total_value)values('${lead}','${org}','${contact}','${pipeline}','${open}','${seller}','${product}','Lead',1000,100,250.25,1000),('${other}','${org}','${contact}','${pipeline}','${open}','${seller}','${product}','Other',2000,100,30,2000);
    insert into chart_of_accounts(organization_id,code,name,entry_type,group_name)values('${org}','REC_COMISSAO','Revenue','revenue','Revenue'),('${org}','DESP_COMERCIAL','Expense','expense','Expense');
    insert into cost_centers(organization_id,code,name)values('${org}','COMERCIAL','Commercial');
    insert into commission_rules(organization_id,product_id,rate)values('${org}','${product}',10);
    insert into gamification_rules(organization_id,event_type,points,effective_from)values('${org}','opportunity_won',10,'2000-01-01');
    insert into payment_receipts(id,organization_id,opportunity_id)values('${id(11)}','${org}','${lead}'),('${id(12)}','${org}','${other}');
    set test.uid='${admin}';`);
  const transition=async(target,stage,version)=> (await db.query('select result.* from transition_opportunity($1,$2,$3,null) result',[target,stage,version])).rows[0];
  let row=await transition(lead,won,1);assert.equal(row.status,'won');
  // A different lead earned a different point value: reopening the first one
  // must reverse its own ten points, not the latest thirty-point sale.
  await db.exec(`update gamification_rules set points=30 where organization_id='${org}';`);
  await transition(other,won,1);
  let openRow=await transition(lead,open,row.version);
  assert.equal((await db.query("select points from point_events where event_type='opportunity_reopened' order by occurred_at desc limit 1")).rows[0].points,-10);
  assert.equal(openRow.closed_at,null);
  assert.ok((await db.query('select status from financial_entries where opportunity_id=$1',[lead])).rows.every(r=>r.status==='cancelled'));
  const checkCounts=async(expected)=>{
    const rank=(await db.query('select sales_ranking_snapshot($1,$2,$3) as data',[org,'2000-01-01','2100-01-01'])).rows[0].data;
    assert.equal(rank.entries.reduce((sum,e)=>sum+e.sales_count,0),expected);
    const leads=(await db.query('select * from opportunities')).rows;
    const data={usuarios:[{id:seller,role:'commercial',ativo:true}],oportunidades:leads.map(r=>({id:r.id,ownerId:r.owner_id,status:r.status==='won'?'ganho':'aberto',criadoEm:r.created_at,fechadoEm:r.closed_at,estornoSolicitado:Number(r.requested_reversal),comissao:Number(r.expected_commission)})),rankingVendas:rank.entries.map(r=>({ownerId:r.owner_id,status:'ganho',fechadoEm:r.closed_at,estornoSolicitado:Number(r.requested_reversal),quantidadeVendas:r.sales_count})),metas:[]};
    const store={get:k=>data[k]||[],byId:()=>({}),indexBy:k=>Object.fromEntries((data[k]||[]).map(r=>[r.id,r]))};const window={AGIR:{store},AGIR_BACKEND:{mode:'supabase'}};
    for(const file of ['format.js','analytics.js'])vm.runInNewContext(fs.readFileSync('assets/js/core/'+file,'utf8'),{window,Date,Intl});
    const an=window.AGIR.an,k=an.kpis({periodo:'mes'}).atual,pace=an.paceMes({periodo:'mes'}),ranking=an.rankingVendasEstornadas({periodo:'mes'});
    assert.equal(k.vendasQtd,expected);assert.equal(pace.vendasQtd.realizado,expected);assert.equal(ranking.reduce((sum,r)=>sum+r.vendasQtd,0),expected);
    assert.equal(k.vendasValor,expected===1?30:280.25);assert.equal(pace.vendasValor.realizado,k.vendasValor);assert.equal(ranking.totalEstornado,k.vendasValor);
    data.usuarios[0].ativo=false;
    assert.equal(an.rankingVendasEstornadas({periodo:'mes'}).reduce((sum,r)=>sum+r.vendasQtd,0),expected);
  };
  await checkCounts(1);
  for(let cycle=0;cycle<3;cycle++){
    await db.exec(`set test.uid='${seller}';`);
    row=await transition(lead,won,openRow.version);await checkCounts(2);
    assert.equal(row.requested_reversal,'250.25');assert.ok(row.closed_at);assert.equal(row.owner_id,seller);
    const financial=(await db.query('select status,amount from financial_entries where opportunity_id=$1',[lead])).rows;
    assert.equal(financial.length,2);assert.ok(financial.every(r=>r.status==='scheduled'));assert.deepEqual(financial.map(r=>Number(r.amount)).sort((a,b)=>a-b),[10,100]);
    assert.equal((await db.query('select status from commission_payables where opportunity_id=$1',[lead])).rows[0].status,'draft');
    await assert.rejects(transition(lead,won,row.version-1),e=>e.code==='PT409');
    await assert.rejects(transition(lead,won,row.version),/reopened first/);
    if(cycle<2){await db.exec(`set test.uid='${admin}';`);openRow=await transition(lead,open,row.version);await checkCounts(1);}
  }
  // Realized financials still block reopening; no payment protection is relaxed.
  await db.exec(`set test.uid='${admin}';update financial_entries set status='realized',approved_by='${admin}',approved_at=now() where opportunity_id='${lead}' and entry_type='revenue';`);
  await assert.rejects(transition(lead,open,row.version),/must be reversed/);await checkCounts(2);
 }finally{await db.close();}
});
