const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { citext } = require('@electric-sql/pglite/contrib/citext');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const dir = 'supabase/migrations/';
const files = fs.readdirSync(dir);
const sql = prefix => fs.readFileSync(dir + files.find(f => f.startsWith(prefix)), 'utf8');
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');

test('deactivation transfers the full portfolio atomically, merges CPF collisions, preserves authors and validates admin/destination', {timeout:120000}, async () => {
  const db = new PGlite({extensions:{citext,pg_trgm}});
  const org=id(1), otherOrg=id(2), admin=id(11), source=id(12), dest=id(13), inactive=id(14), outsider=id(15);
  try {
    await db.exec(`create schema extensions; create schema auth; create role anon; create role authenticated; create role service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`);
    for (const prefix of ['202608230001','202608230002','202608230003','202608230004','202608230005']) {
      await db.exec(sql(prefix).replace('create extension if not exists pgcrypto with schema extensions;',''));
    }
    await db.exec(`create table public.audit_logs(id bigint generated always as identity,organization_id uuid,actor_id uuid,action public.audit_action,entity_type text,entity_id uuid,old_data jsonb,new_data jsonb);
      create function app_private.can_access_crm_owner(org uuid,owner uuid) returns boolean language sql stable as $$ select auth.uid()=owner or app_private.has_role(org,array['admin'::access_role]) $$;`);
    await db.exec(sql('202608230008'));
    await db.exec(sql('202608310002').split('create or replace function public.create_opportunity')[0] + '\ncommit;');
    const history = sql('202608260001');
    await db.exec(history.slice(0,history.indexOf('create or replace function public.set_opportunity_tags'))+'\ncommit;');
    await db.exec(sql('202610230002'));
    await db.exec(`insert into organizations(id,name) values ('${org}','Test organization'),('${otherOrg}','Other organization');
      insert into auth.users values ('${admin}'),('${source}'),('${dest}'),('${inactive}'),('${outsider}');
      insert into profiles(id,full_name) values ('${admin}','Admin'),('${source}','Source'),('${dest}','Destination'),('${inactive}','Inactive'),('${outsider}','Outsider');
      insert into organization_members(organization_id,user_id,role,active) values
        ('${org}','${admin}','admin',true),('${org}','${source}','commercial',true),('${org}','${dest}','commercial',true),('${org}','${inactive}','commercial',false),('${otherOrg}','${outsider}','admin',true);
      insert into pipelines(id,organization_id,name) values ('${id(20)}','${org}','Pipeline');
      insert into pipeline_stages(id,organization_id,pipeline_id,name,position) values ('${id(21)}','${org}','${id(20)}','Open',0);
      insert into loss_reasons(id,organization_id,name) values ('${id(22)}','${org}','Lost');
      insert into companies(id,organization_id,name,owner_id,created_by) values ('${id(30)}','${org}','Company','${source}','${source}');
      insert into contacts(id,organization_id,full_name,cpf,owner_id,created_by) values
        ('${id(31)}','${org}','Unique source','11111111111','${source}','${source}'),
        ('${id(32)}','${org}','Duplicate source','22222222222','${source}','${source}'),
        ('${id(33)}','${org}','Existing destination','22222222222','${dest}','${dest}');
      insert into opportunities(id,organization_id,contact_id,pipeline_id,stage_id,owner_id,title,status,closed_at,loss_reason_id,created_by) values
        ('${id(40)}','${org}','${id(31)}','${id(20)}','${id(21)}','${source}','Open lead','open',null,null,'${source}'),
        ('${id(41)}','${org}','${id(32)}','${id(20)}','${id(21)}','${source}','Won lead','won',now(),null,'${source}'),
        ('${id(42)}','${org}','${id(32)}','${id(20)}','${id(21)}','${source}','Lost lead','lost',now(),'${id(22)}','${source}'),
        ('${id(43)}','${org}','${id(31)}','${id(20)}','${id(21)}','${source}','Cancelled lead','cancelled',now(),null,'${source}');
      insert into activities(id,organization_id,opportunity_id,owner_id,activity_type,status,completed_at,created_by) values
        ('${id(50)}','${org}','${id(40)}','${source}','task','pending',null,'${source}'),
        ('${id(51)}','${org}','${id(41)}','${source}','call','completed',now(),'${source}');
      insert into message_deliveries(id,organization_id,contact_id,opportunity_id,provider) values ('${id(60)}','${org}','${id(32)}','${id(41)}','test');
      create table test_attachments(opportunity_id uuid,uploaded_by uuid,storage_path text);
      insert into test_attachments values ('${id(41)}','${source}','unchanged-private-path');
      set test.uid='${admin}';`);
    const call = (target,transfer,to=null,organization=org) => db.query('select deactivate_user_with_transfer($1,$2,$3,$4) as result',[organization,target,transfer,to]);
    // Invalid decisions must neither move work nor disable the account.
    await assert.rejects(call(source,null),/Escolha/);
    await assert.rejects(call(source,true),/Selecione/);
    await assert.rejects(call(source,true,source),/Selecione/);
    await assert.rejects(call(source,true,inactive),/Selecione/);
    await assert.rejects(call(source,true,outsider),/Selecione/);
    await assert.rejects(call(source,false,dest),/Destino/);
    await assert.rejects(call(admin,false),/proprio/);
    await db.exec(`set test.uid='${dest}'`);
    await assert.rejects(call(source,true,dest),/Somente administradores/);
    await db.exec(`set test.uid='${admin}'`);
    // A failure after leads/contacts were moved must roll back the entire RPC.
    await db.exec(`create function public.fail_activity_transfer() returns trigger language plpgsql as $$ begin raise exception 'test transfer failure'; end $$;
      create trigger fail_transfer before update on activities for each row execute function fail_activity_transfer();`);
    await assert.rejects(call(source,true,dest),/test transfer failure/);
    assert.equal((await db.query('select count(*)::int as count from opportunities where owner_id=$1',[source])).rows[0].count,4);
    assert.equal((await db.query('select active from organization_members where organization_id=$1 and user_id=$2',[org,source])).rows[0].active,true);
    assert.equal((await db.query('select deleted_at from contacts where id=$1',[id(32)])).rows[0].deleted_at,null);
    await db.exec('drop trigger fail_transfer on activities');
    await db.exec('set role authenticated');
    const result=(await call(source,true,dest)).rows[0].result;
    await db.exec('reset role');
    assert.equal(result.leads,4); assert.equal(result.contacts,2); assert.equal(result.activities,2); assert.equal(result.companies,1); assert.equal(result.merged_contacts,1);
    assert.equal((await db.query('select active from organization_members where organization_id=$1 and user_id=$2',[org,source])).rows[0].active,false);
    const leads=(await db.query('select owner_id,created_by,version,status,contact_id from opportunities order by id')).rows;
    assert.ok(leads.every(r=>r.owner_id===dest && r.created_by===source && r.version===2));
    assert.equal(leads[1].contact_id,id(33)); assert.equal(leads[2].contact_id,id(33)); assert.equal(leads[3].status,'cancelled');
    assert.ok((await db.query('select owner_id,created_by from activities')).rows.every(r=>r.owner_id===dest && r.created_by===source));
    assert.equal((await db.query('select contact_id from message_deliveries')).rows[0].contact_id,id(33));
    assert.deepEqual((await db.query('select * from test_attachments')).rows,[{opportunity_id:id(41),uploaded_by:source,storage_path:'unchanged-private-path'}]);
    assert.ok((await db.query('select deleted_at from contacts where id=$1',[id(32)])).rows[0].deleted_at);
    assert.equal((await db.query("select count(*)::int as count from opportunity_change_history where changed_by=$1 and changes ? 'owner_id'",[admin])).rows[0].count,4);
    assert.equal((await db.query("select count(*)::int as count from audit_logs where action='deactivate'")).rows[0].count,1);
    await assert.rejects(call(source,true,dest),/nao esta ativo/);
    // No retrospective migration: another active user remains active until an
    // administrator explicitly chooses keep, and no ownership changes then.
    const before = (await db.query('select id,owner_id from opportunities order by id')).rows;
    await call(dest,false);
    assert.deepEqual((await db.query('select id,owner_id from opportunities order by id')).rows,before);
    assert.equal((await db.query('select active from organization_members where user_id=$1',[dest])).rows[0].active,false);
    await assert.rejects(db.query(`insert into contacts(organization_id,full_name,owner_id) values ('${org}','Cannot assign','${source}')`),/responsavel precisa estar ativo/);
    await db.exec('set role anon');
    await assert.rejects(call(source,true,dest),/permission denied/);
  } finally { await db.close(); }
});
