// Deliberately restricted to the isolated local restore container; no remote URL.
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID, createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const run = promisify(execFile);
const db = 'supabase_db_agir-p1-validation';
const api = 'ascensao-p1-postgrest-check-' + randomUUID().slice(0, 8);
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 });
const networks = JSON.parse(docker(['inspect', db, '--format', '{{json .NetworkSettings.Networks}}']));
assert.equal(Object.keys(networks).length, 0, 'Restore database must have no network endpoints.');
const [org, a, b, pipeline, first, second, product, lead] = Array.from({ length: 8 }, randomUUID);
const secret = randomUUID() + randomUUID();
const password = randomUUID();
function sql(text) {
  return execFileSync('docker', ['exec', '-i', db, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1'],
    { input: text, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
}
function token(sub) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
async function rpc(name, payload, user = a) {
  const { stdout } = await run('docker', ['exec', db, 'curl', '--silent', '--show-error', '--max-time', '12',
    '-w', '\n%{http_code}', '-H', 'Content-Type: application/json', '-H', 'Authorization: Bearer ' + token(user),
    '--data', JSON.stringify(payload), 'http://127.0.0.1:3000/rpc/' + name], { timeout: 15000 });
  const split = stdout.lastIndexOf('\n');
  return { status: Number(stdout.slice(split + 1)), body: JSON.parse(stdout.slice(0, split)) };
}
(async () => {
  // Only synthetic records. Replica mode suppresses auth provisioning during fixture setup.
  sql(`begin; set local session_replication_role=replica;
    alter role authenticator password '${password}';
    insert into auth.users(id) values ('${a}'),('${b}');
    insert into public.profiles(id,full_name) values ('${a}','P1 Test A'),('${b}','P1 Test B');
    insert into public.organizations(id,name) values ('${org}','P1 isolated test');
    insert into public.organization_members(organization_id,user_id,role) values ('${org}','${a}','admin'),('${org}','${b}','admin');
    insert into public.pipelines(id,organization_id,name) values ('${pipeline}','${org}','P1');
    insert into public.pipeline_stages(id,organization_id,pipeline_id,name,position) values
      ('${first}','${org}','${pipeline}','First',0),('${second}','${org}','${pipeline}','Second',1);
    insert into public.products(id,organization_id,name) values ('${product}','${org}','P1 product');
    insert into public.contacts(id,organization_id,full_name,owner_id) values ('${lead}','${org}','P1 contact','${a}');
    insert into public.opportunities(id,organization_id,contact_id,pipeline_id,stage_id,owner_id,product_id,title,amount)
      values ('${lead}','${org}','${lead}','${pipeline}','${first}','${a}','${product}','P1 lead',1234.56); commit;`);
  docker(['run', '-d', '--name', api, '--network', 'container:' + db,
    '-e', 'PGRST_DB_URI=postgresql://authenticator:' + password + '@127.0.0.1:5432/postgres',
    '-e', 'PGRST_JWT_SECRET=' + secret, '-e', 'PGRST_DB_ANON_ROLE=anon', 'postgrest/postgrest:v14.5']);
  try {
    let ready = false;
    for (let i = 0; i < 20; i++) {
      try {
        docker(['exec', db, 'curl', '--silent', '--fail', '--max-time', '1', 'http://127.0.0.1:3000/']);
        ready = true; break;
      } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.ok(ready, 'PostgREST did not become ready.');
    const move = { p_opportunity_id: lead, p_target_stage_id: second, p_expected_version: 1, p_loss_reason_id: null };
    const concurrent = await Promise.all([rpc('transition_opportunity', move, a), rpc('transition_opportunity', move, b)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    assert.equal(concurrent.find(r => r.status === 409).body.code, 'PT409');
    sql(`update public.organization_members set role='commercial' where organization_id='${org}' and user_id='${a}';`);
    const payload = { p_opportunity_id: lead, p_expected_version: 2, p_owner_id: a, p_product_id: product,
      p_convention_id: null, p_registration_number: null, p_bank_id: null, p_source_id: null,
      p_full_name: 'P1 contact', p_cpf: null, p_phone: null, p_email: null, p_city: null, p_state: null,
      p_amount: 1234.56, p_total_value: null, p_final_value: null, p_requested_reversal: null,
      p_expected_close_date: null, p_notes: null };
    let result = await rpc('update_opportunity_details_v4', payload);
    assert.equal(result.status, 200); assert.equal(result.body.opportunity.version, 2);
    payload.p_full_name = 'P1 edited';
    result = await rpc('update_opportunity_details_v4', payload);
    assert.equal(result.status, 200); assert.equal(result.body.opportunity.version, 3);
    result = await rpc('update_opportunity_details_v4', payload);
    assert.equal(result.status, 200); assert.equal(result.body.opportunity.version, 3);
    result = await rpc('update_opportunity_details_v4', { ...payload, p_notes: 'stale change' }, b);
    assert.equal(result.status, 409); assert.equal(result.body.code, 'PT409');
    result = await rpc('update_opportunity_details_v4', { ...payload, p_expected_version: null });
    assert.equal(result.status, 409);
    assert.equal(sql(`select count(*) from public.opportunity_stage_history where opportunity_id='${lead}';`).trim(), '1');
    assert.equal(sql(`select version from public.opportunities where id='${lead}';`).trim(), '3');
    sql(`update public.organization_members set role='commercial' where organization_id='${org}' and user_id='${b}';`);
    result = await rpc('update_opportunity_details_v4', { ...payload, p_expected_version: 3 }, b);
    assert.equal(result.status, 403, 'Another seller cannot edit or retrieve the identical payload.');
    result = await rpc('transition_opportunity', { ...move, p_target_stage_id: first, p_expected_version: 3 }, a);
    assert.equal(result.status, 200, 'Owner seller can move their lead.');
    result = await rpc('update_opportunity_details_v4', { ...payload, p_expected_version: 4, p_product_id: null }, a);
    assert.equal(result.status, 200, 'Seller can edit a lead without product.');
    assert.equal(result.body.opportunity.product_id, null);
    result = await rpc('update_opportunity_details_v4', { ...payload, p_expected_version: 5, p_product_id: org }, a);
    assert.equal(result.status, 400, 'Invalid product is still rejected.');
    console.log('PASS: PostgREST 14.5 concurrent sessions, PT409, seller edit/move, foreign seller denied, idempotency, NULL version and optional product.');
  } finally {
    docker(['stop', api]);
  }
})().catch(error => {
  // Do not print child-process arguments/JWTs or restored rows on failure.
  console.error('P1 HTTP validation failed:', error.code || error.name,
    error instanceof assert.AssertionError ? error.message : 'Inspect isolated environment; output suppressed for privacy.');
  process.exitCode = 1;
});
