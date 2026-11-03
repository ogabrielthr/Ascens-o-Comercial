const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('documents enforce lead scope and inactive profiles remain visible for reactivation', async () => {
  const db = new PGlite();
  const org='00000000-0000-0000-0000-000000000001';
  const other='00000000-0000-0000-0000-000000000002';
  const admin='00000000-0000-0000-0000-000000000011';
  const inactive='00000000-0000-0000-0000-000000000012';
  const stranger='00000000-0000-0000-0000-000000000013';
  const lead='00000000-0000-0000-0000-000000000021';
  const foreignLead='00000000-0000-0000-0000-000000000022';
  try {
    await db.exec(`create role authenticated; create schema auth; create schema app_private; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.uid')::uuid $$;
      create type public.access_role as enum ('admin','manager','commercial','bdr','operations','user');
      create table organizations(id uuid primary key);
      create table profiles(id uuid primary key);
      create table organization_members(organization_id uuid,user_id uuid,active boolean);
      create table opportunities(id uuid primary key,organization_id uuid,owner_id uuid);
      create function app_private.has_role(org uuid,roles access_role[]) returns boolean language sql stable as $$
        select exists(select 1 from organization_members where organization_id=org and user_id=auth.uid() and active) $$;
      create function app_private.can_access_crm_owner(org uuid,owner uuid) returns boolean language sql stable as $$
        select app_private.has_role(org,array['admin'::access_role]) $$;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text);
      alter table storage.objects enable row level security;
      alter table profiles enable row level security;
      grant usage on schema public,auth,app_private,storage to authenticated;
      grant select on profiles,organization_members,opportunities to authenticated;
      grant select,insert,delete on storage.objects to authenticated;
      insert into organizations values ('${org}'),('${other}');
      insert into profiles values ('${admin}'),('${inactive}'),('${stranger}');
      insert into organization_members values ('${org}','${admin}',true),('${org}','${inactive}',false),('${other}','${stranger}',true);
      insert into opportunities values ('${lead}','${org}','${inactive}'),('${foreignLead}','${other}','${stranger}');`);
    await db.exec(fs.readFileSync('supabase/migrations/202610200001_show_inactive_profiles.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/202610230001_lead_documents.sql','utf8'));
    await db.exec(`set test.uid='${admin}'; set role authenticated;`);
    assert.deepEqual((await db.query('select id from profiles order by id')).rows.map(r=>r.id),[admin,inactive]);
    const insert = (organization,opportunity) => db.query(`insert into lead_documents(organization_id,opportunity_id,uploaded_by,original_name,storage_path,mime_type,size_bytes)
      values ($1,$2,$3,'video.mp4',$4,'video/mp4',1024) returning id`,[organization,opportunity,admin,organization+'/documents/'+opportunity+'/'+admin+'/test.mp4']);
    await insert(org,lead);
    await assert.rejects(insert(other,foreignLead),/row-level security/);
    await assert.rejects(insert(other,lead),/row-level security/);
    assert.equal((await db.query('select * from lead_documents')).rows.length,1);
    await db.exec(`set test.uid='${stranger}';`);
    assert.equal((await db.query('select * from lead_documents')).rows.length,0);
    await db.exec(`set test.uid='${inactive}';`);
    assert.deepEqual((await db.query('select id from profiles')).rows.map(r=>r.id),[inactive]);
    assert.equal((await db.query('select * from lead_documents')).rows.length,0);
    await db.exec('reset role');
    assert.equal((await db.query(`select owner_id from opportunities where id='${lead}'`)).rows[0].owner_id,inactive);
  } finally { await db.close(); }
});
