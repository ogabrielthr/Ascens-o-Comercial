const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { citext } = require('@electric-sql/pglite/contrib/citext');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(dir).sort();
const sql = prefix => fs.readFileSync(path.join(dir, files.find(f => f.startsWith(prefix))), 'utf8');
const migration = sql('202609070001');
function functionSql(prefix, name) {
  const text = sql(prefix), start = text.indexOf('create or replace function ' + name + '(');
  assert.ok(start >= 0, name);
  return text.slice(start, text.indexOf('$$;', start) + 3);
}

test('PT409 migration on PostgreSQL: real workflow, stale/null versions, rollback, ACL and idempotency', { timeout: 120000 }, async () => {
  // Local WASM PostgreSQL only; no URL, credentials or production rows.
  const db = new PGlite({ extensions: { citext, pg_trgm } });
  try {
    await db.exec(`create schema extensions; create schema auth;
      create role anon; create role authenticated; create role service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.user_id',true),'')::uuid $$;`);
    for (const prefix of ['202608230001', '202608230002', '202608230003', '202608230004', '202608230005']) {
      // gen_random_uuid is built into PG; pgcrypto itself is not used here.
      await db.exec(sql(prefix).replace('create extension if not exists pgcrypto with schema extensions;', ''));
    }
    for (const [prefix, name] of [['202608230009', 'set_actor_columns'], ['202608230009', 'audit_row_change'], ['202608230008', 'entity_in_org']]) {
      await db.exec(functionSql(prefix, 'app_private.' + name));
    }
    await db.exec(sql('202608230012'));
    for (const [prefix, name] of [
      ['202608230013', 'realize_financial_entry'], ['202608230017', 'cancel_opportunity'],
      ['202608230018', 'update_opportunity_details'], ['202608240006', 'set_opportunity_financial_values'],
      ['202608240008', 'update_opportunity_details_v2'], ['202608280002', 'set_opportunity_convention'],
      ['202608280003', 'set_opportunity_registration'],
    ]) await db.exec(functionSql(prefix, 'public.' + name));
    await db.exec(`alter table public.opportunities add column total_value numeric(14,2),
      add column final_value numeric(14,2), add column requested_reversal numeric(14,2),
      add column convention_id uuid, add column registration_number text;
      create table public.conventions(id uuid primary key,organization_id uuid,active boolean,deleted_at timestamptz);`);
    await db.exec(functionSql('202608280002', 'public.update_opportunity_details_v3'));
    await db.exec(functionSql('202608280003', 'public.update_opportunity_details_v4'));
    await db.exec(`revoke all on function public.transition_opportunity(uuid,uuid,integer,uuid) from public;
      grant execute on function public.transition_opportunity(uuid,uuid,integer,uuid) to authenticated;
      create function app_private.real_serialization() returns void language plpgsql as $$ begin
        raise exception 'actual serialization failure' using errcode = '40001'; end; $$;`);
    const metadata = () => db.query(`select oid, proowner, proacl::text, prosecdef, proconfig
      from pg_proc where oid='public.transition_opportunity(uuid,uuid,integer,uuid)'::regprocedure`);
    const before = (await metadata()).rows;
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await metadata()).rows, before);
    const functions = await db.query(`select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosrc like '%changed by another user%' and p.prosrc like '%PT409%'`);
    assert.equal(functions.rows[0].count, 8);
    await assert.rejects(db.query('select app_private.real_serialization()'), { code: '40001' });

    const ids = Array.from({ length: 8 }, (_, i) => '00000000-0000-0000-0000-' + String(i + 1).padStart(12, '0'));
    const [org, a, b, pipeline, stage1, stage2, product, lead] = ids;
    await db.exec(`insert into auth.users values ('${a}'),('${b}');
      insert into public.profiles(id,full_name) values ('${a}','Sessão A'),('${b}','Sessão B');
      insert into public.organizations(id,name) values ('${org}','Teste isolado');
      insert into public.organization_members(organization_id,user_id,role) values ('${org}','${a}','admin'),('${org}','${b}','admin');
      insert into public.pipelines(id,organization_id,name) values ('${pipeline}','${org}','Teste');
      insert into public.pipeline_stages(id,organization_id,pipeline_id,name,position) values
        ('${stage1}','${org}','${pipeline}','Entrada',0),('${stage2}','${org}','${pipeline}','Contato',1);
      insert into public.products(id,organization_id,name) values ('${product}','${org}','Produto');
      insert into public.contacts(id,organization_id,full_name,owner_id) values ('${lead}','${org}','Contato de teste','${a}');
      insert into public.opportunities(id,organization_id,contact_id,pipeline_id,stage_id,owner_id,product_id,title,amount)
        values ('${lead}','${org}','${lead}','${pipeline}','${stage1}','${a}','${product}','Lead de teste',1234.56);`);
    await db.query("select set_config('test.user_id',$1,false)", [a]);
    const move = version => db.query('select * from public.transition_opportunity($1,$2,$3,null)', [lead, stage2, version]);
    const result = (await move(1)).rows[0];
    assert.equal(result.version, 2); assert.equal(result.stage_id, stage2);
    await db.query("select set_config('test.user_id',$1,false)", [b]);
    await assert.rejects(move(1), { code: 'PT409' });
    await assert.rejects(move(null), { code: 'PT409' });
    assert.equal((await db.query('select version from public.opportunities')).rows[0].version, 2);
    assert.equal((await db.query('select count(*)::int as count from public.opportunity_stage_history')).rows[0].count, 1);
    assert.equal((await db.query('select count(*)::int as count from public.financial_entries')).rows[0].count, 0);

    const v4Metadata = () => db.query("select oid,proowner,proacl::text,prosecdef,proconfig from pg_proc where proname='update_opportunity_details_v4'");
    const beforeV4 = (await v4Metadata()).rows;
    await db.exec(sql('202609090001')); await db.exec(sql('202609090001'));
    assert.deepEqual((await v4Metadata()).rows, beforeV4);
    const values = [lead, 2, a, product, null, null, null, null, 'Contato de teste', null, null, null, null, null, 1234.56, null, null, null, null, null];
    const edit = values => db.query('select public.update_opportunity_details_v4(' + values.map((_, i) => '$' + (i + 1)).join(',') + ') as bundle', values);
    assert.equal((await edit(values)).rows[0].bundle.opportunity.version, 2, 'unchanged payload does not write');
    values[8] = 'Nome editado';
    assert.equal((await edit(values)).rows[0].bundle.opportunity.version, 3, 'real edit increases version');
    assert.equal((await edit(values)).rows[0].bundle.opportunity.version, 3, 'identical stale retry is a no-op');
    for (const [index, changed] of [[5, 'MATRICULA-NOVA'], [11, 'outro@example.test'], [18, '2026-10-01'], [19, 'outra anotação']]) {
      const conflict = [...values]; conflict[index] = changed;
      await assert.rejects(edit(conflict), { code: 'PT409' });
    }
    const missingVersion = [...values]; missingVersion[1] = null;
    await assert.rejects(edit(missingVersion), { code: 'PT409' });
    assert.equal((await db.query('select version from public.opportunities')).rows[0].version, 3);
    assert.equal((await db.query('select email from public.contacts')).rows[0].email, null);
    await db.query("select set_config('test.user_id','',false)");
    await assert.rejects(edit(values), { code: '42501' }, 'idempotent response still requires authorization');
    await db.query("select set_config('test.user_id',$1,false)", [b]);
    await db.query('update public.organization_members set role=$1 where user_id=$2', ['commercial', b]);
    await assert.rejects(edit(values), { code: '42501' }, 'another seller cannot retrieve even an identical payload');
    await db.query('update public.organization_members set role=$1 where user_id=$2', ['admin', b]);

    // Nullable products from imported leads remain editable; invalid IDs fail.
    await db.exec('alter table public.opportunities alter column product_id drop not null');
    await db.exec(sql('202609100001')); await db.exec(sql('202609100001'));
    const optionalProduct = [...values]; optionalProduct[1] = 3; optionalProduct[3] = null;
    assert.equal((await edit(optionalProduct)).rows[0].bundle.opportunity.version, 4);
    assert.equal((await edit(optionalProduct)).rows[0].bundle.opportunity.product_id, null);
    const invalidProduct = [...optionalProduct]; invalidProduct[1] = 4; invalidProduct[3] = org;
    await assert.rejects(edit(invalidProduct), { code: '23514' });

    // Fail closed if the installed schema has drifted: the entire migration rolls back.
    await db.exec("create or replace function public.set_opportunity_registration(p_opportunity_id uuid,p_expected_version integer,p_registration_number text default null) returns public.opportunities language plpgsql as $$ begin raise exception 'unexpected implementation'; end; $$;");
    await assert.rejects(db.exec(migration), /Conflito de negocio esperado nao encontrado/);
    await db.exec('rollback');
    assert.deepEqual((await metadata()).rows, before);
  } finally { await db.close(); }
});
