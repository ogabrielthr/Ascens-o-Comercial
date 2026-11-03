const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync('supabase/migrations/202610280001_finance_workspace.sql', 'utf8');
const id = number => '00000000-0000-0000-0000-' + String(number).padStart(12, '0');
const [org, other, admin, finance, manager, stranger, inactive] = [1,2,11,12,13,14,15].map(id);

function snapshot() {
  return { schemaVersion: 2, revision: 1, createdAt: '2026-10-28T12:00:00Z', updatedAt: '2026-10-28T12:00:00Z',
    planoContas: [{ id: 'revenue', nome: 'Serviços', tipo: 'receita' }, { id: 'expense', nome: 'Aluguel', tipo: 'despesa' }],
    centrosCusto: [{ id: 'commercial', nome: 'Comercial' }], contatos: [],
    contasBancarias: [{ id: 'bank_a', nome: 'Principal', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-01-01', ativo: true },
      { id: 'bank_b', nome: 'Reserva', saldoInicialCentavos: 0, dataSaldoInicial: '2026-01-01', ativo: true }],
    lancamentos: [{ id: 'entry_a', tipo: 'receita', contaId: 'revenue', centroId: 'commercial', contatoId: null,
      contaBancariaId: 'bank_a', descricao: 'Serviço contratado', competencia: '2026-10', data: '2026-10-20', vencimento: '2026-10-20',
      valorCentavos: 10000, valor: 100, aprovacao: 'dispensada', cancelado: false,
      pagamentos: [{ id: 'payment_a', data: '2026-10-20', valorCentavos: 10000, jurosCentavos: 50, multaCentavos: 0,
        descontoCentavos: 0, contaBancariaId: 'bank_a', estornado: false }] }],
    orcamento: [{ id: 'budget', contaId: 'revenue', centroId: null, competencia: '2026-10', valorCentavos: 100000 }],
    transferencias: [{ id: 'transfer', origemId: 'bank_a', destinoId: 'bank_b', data: '2026-10-20', valorCentavos: 1000, cancelado: false }],
    extrato: [{ id: 'statement', accountId: 'bank_a', externalId: 'bank-row', date: '2026-10-20', description: 'Serviço', amountCentavos: 10050, fingerprint: 'fingerprint' }],
    conciliacoes: [{ id: 'conciliation', statementId: 'statement', entryId: 'entry_a', paymentId: 'payment_a', data: '2026-10-21', cancelado: false }],
    politicas: { exigirAprovacao: false, limiteAprovacaoCentavos: 0 }, fechamentos: [],
    auditoria: [{ id: 'forged', actorId: stranger, action: 'forged', revision: 1, at: '2000-01-01' }] };
}

async function fixture({ storage = false } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table organizations(id uuid primary key,active boolean default true,deleted_at timestamptz);
    create table profiles(id uuid primary key,active boolean default true);
    create table organization_members(organization_id uuid,user_id uuid,role text,active boolean default true);
    grant usage on schema public,auth to authenticated;
    insert into organizations(id) values ('${org}'),('${other}');
    insert into profiles(id) values ('${admin}'),('${finance}'),('${manager}'),('${stranger}'),('${inactive}');
    insert into organization_members values ('${org}','${admin}','admin',true),('${org}','${finance}','finance',true),
      ('${org}','${manager}','manager',true),('${other}','${stranger}','admin',true),('${org}','${inactive}','finance',false);`);
  if (storage) await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(migration);
  return db;
}
const asUser = (db, user) => db.query("select set_config('test.uid',$1,false)", [user || '']);
const load = async (db, company = org) => (await db.query('select finance_workspace_load($1) as state', [company])).rows[0].state;
const save = async (db, state, expected = state.revision - 1, request = id(100 + state.revision), company = org) =>
  (await db.query('select finance_workspace_save($1,$2::jsonb,$3,$4) as state', [company, JSON.stringify(state), expected, request])).rows[0].state;

test('PostgreSQL finance isolates tenants and roles, commits atomically, detects stale revisions and stamps immutable audit', { timeout: 120000 }, async () => {
  const db = await fixture();
  try {
    await asUser(db, admin); await db.exec('set role authenticated');
    assert.equal(await load(db), null);
    const first = await save(db, snapshot());
    assert.equal(first.revision, 1);
    assert.equal(first.auditoria.length, 1);
    assert.equal(first.auditoria[0].actorId, admin);
    assert.equal(first.auditoria[0].action, 'workspace.save');
    assert.notEqual(first.auditoria[0].at, '2000-01-01');
    assert.deepEqual(await save(db, snapshot()), first, 'retry is idempotent');
    await assert.rejects(save(db, snapshot(), 0, id(200)), { code: 'PT409' });
    const changedRetry = snapshot(); changedRetry.lancamentos[0].descricao = 'Outra descrição';
    await assert.rejects(save(db, changedRetry), { code: '22023' });
    await assert.rejects(db.query("update finance_workspaces set revision=99"), { code: '42501' });
    await assert.rejects(db.query("insert into finance_workspace_audit(organization_id,revision,actor_id,snapshot_hash,details) values ($1,999,$2,'x','{}')", [org, admin]), { code: '42501' });
    await assert.rejects(db.query('select finance_workspace_save($1,$2::jsonb,null,$3)', [org, JSON.stringify(snapshot()), id(999)]), { code: '22023' });
    await assert.rejects(load(db, other), { code: '42501' });
    for (const user of [manager, stranger, inactive, null]) {
      await asUser(db, user);
      await assert.rejects(load(db), { code: '42501' });
      await assert.rejects(save(db, snapshot()), { code: '42501' });
      assert.equal((await db.query('select * from finance_workspaces')).rows.length, 0);
      assert.equal((await db.query('select * from finance_workspace_audit')).rows.length, 0);
    }
    await asUser(db, finance);
    const second = structuredClone(first); second.revision = 2; second.lancamentos[0].descricao = 'Descrição revista';
    const saved = await save(db, second);
    assert.equal(saved.revision, 2); assert.equal(saved.auditoria[1].actorId, finance);
    await db.exec('reset role');
    await assert.rejects(db.query('update finance_workspace_audit set action=\'forged\''), { code: '42501' });
    await assert.rejects(db.query('delete from finance_workspace_audit'), { code: '42501' });
    assert.equal((await db.query('select count(*)::int n from finance_workspace_audit')).rows[0].n, 2);
  } finally { await db.close(); }
});

test('PostgreSQL finance rejects invalid money, references, excess settlement, duplicate reconciliation and closed-month changes with rollback', { timeout: 120000 }, async () => {
  const db = await fixture();
  try {
    await asUser(db, admin); await db.exec('set role authenticated');
    const first = await save(db, snapshot());
    const mutations = [
      s => s.lancamentos[0].valorCentavos = 10000.5,
      s => s.lancamentos[0].valorCentavos = 9007199254740992,
      s => s.lancamentos[0].valorCentavos = 0,
      s => s.lancamentos[0].contaId = 'unknown',
      s => s.lancamentos[0].contaBancariaId = 'foreign',
      s => s.lancamentos[0].vencimento = '2026-02-30',
      s => s.lancamentos[0].pagamentos[0].valorCentavos = 10001,
      s => s.lancamentos[0].pagamentos[0].descontoCentavos = 10051,
      s => s.lancamentos[0].aprovacao = 'pendente',
      s => s.lancamentos[0].cancelado = true,
      s => s.transferencias[0].destinoId = 'bank_a',
      s => s.transferencias[0].origemId = 'foreign',
      s => s.extrato[0].amountCentavos = -10050,
      s => s.extrato.push({ ...s.extrato[0], id: 'duplicate' }),
      s => s.conciliacoes.push({ ...s.conciliacoes[0], id: 'duplicate' }),
      s => s.conciliacoes[0].paymentId = 'unknown',
      s => s.orcamento.push({ ...s.orcamento[0], id: 'duplicate' }),
      s => s.politicas.limiteAprovacaoCentavos = -1,
      s => s.contasBancarias = [],
      s => s.centrosCusto.push({ ...s.centrosCusto[0] })
      ,s => { s.lancamentos[0].pagamentos = []; s.conciliacoes[0].cancelado = true; }
      ,s => { s.lancamentos[0].pagamentos[0].jurosCentavos = 51; s.extrato[0].amountCentavos = 10051; }
      ,s => { s.transferencias = []; }
      ,s => { s.extrato[0].description = 'Evidence rewritten'; }
      ,s => { s.contasBancarias[0].dataSaldoInicial = '2026-10-21'; }
      ,s => { s.lancamentos[0].anexos = [{ id: 'file', name: 'Receipt.pdf', size: 300, type: 'application/pdf', path: `${other}/entry_a/file.pdf` }]; }
      ,s => { s.lancamentos[0].anexos = [{ id: 'file', name: 'Receipt.exe', size: 300, type: 'application/x-msdownload', path: `${org}/entry_a/file.exe` }]; }
      ,s => { s.lancamentos[0].anexos = [{ id: 'file', name: 'Receipt.pdf', size: 10485761, type: 'application/pdf', path: `${org}/entry_a/file.pdf` }]; }
    ];
    let request = 300;
    for (const mutate of mutations) {
      const changed = structuredClone(first); changed.revision = 2; mutate(changed);
      await assert.rejects(save(db, changed, 1, id(request++)), { code: '22023' });
      assert.deepEqual(await load(db), first, 'failed validation does not partially change data or audit');
    }
    const closed = structuredClone(first); closed.revision = 2;
    closed.fechamentos.push({ id: 'closing', month: '2026-10', fechado: true, motivo: 'Fechamento' });
    const savedClosed = await save(db, closed, 1, id(request++));
    const changed = structuredClone(savedClosed); changed.revision = 3; changed.lancamentos[0].descricao = 'Alteração bloqueada';
    await assert.rejects(save(db, changed, 2, id(request++)), { code: '22023' });
    const changedBalance = structuredClone(savedClosed); changedBalance.revision = 3; changedBalance.contasBancarias[0].saldoInicialCentavos++;
    await assert.rejects(save(db, changedBalance, 2, id(request++)), { code: '22023' });
    changed.fechamentos[0].fechado = false; changed.fechamentos[0].motivo = '';
    await assert.rejects(save(db, changed, 2, id(request++)), { code: '22023' });
    changed.fechamentos[0].motivo = 'Correção documentada do fechamento';
    assert.equal((await save(db, changed, 2, id(request++))).revision, 3);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from finance_workspace_audit')).rows[0].n, 3);
    assert.equal((await db.query('select count(*)::int n from finance_workspace_requests')).rows[0].n, 3);
  } finally { await db.close(); }
});

test('private finance attachment bucket enforces organization and role isolation', { timeout: 120000 }, async () => {
  const db = await fixture({ storage: true });
  try {
    const bucket = (await db.query("select * from storage.buckets where id='ascensao-finance-documents'")).rows[0];
    assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 10485760);
    await asUser(db, admin); await db.exec('set role authenticated');
    const insert = name => db.query("insert into storage.objects(bucket_id,name) values ('ascensao-finance-documents',$1)", [name]);
    await insert(`${org}/entry_a/receipt.pdf`);
    await assert.rejects(insert(`${other}/entry_a/receipt.pdf`), { code: '42501' });
    await assert.rejects(insert(`${org}/receipt.pdf`), { code: '42501' });
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
    await asUser(db, manager);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(insert(`${org}/entry_a/receipt.pdf`), { code: '42501' });
    await asUser(db, stranger);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  } finally { await db.close(); }
});

test('remote repository requires backend confirmation and never silently falls back to local data', async () => {
  const { createFinanceRepository } = await import('../assets/js/core/finance-repository.mjs');
  const calls = [];
  let response = { data: null, error: null };
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return response; } };
  const repository = createFinanceRepository({ client, organizationId: org, userId: admin });
  assert.equal(await repository.load(), null);
  response = { data: null, error: { code: 'PGRST202', message: 'not found' } };
  await assert.rejects(repository.load(), { code: 'FINANCE_MIGRATION_REQUIRED' });
  response = { data: null, error: { code: 'PT409', message: 'changed' } };
  await assert.rejects(repository.save(snapshot(), { expectedRevision: 0 }), { code: 'FINANCE_CONFLICT' });
  response = { data: null, error: { code: '42501' } };
  await assert.rejects(repository.load(), { code: 'FINANCE_ACCESS_DENIED' });
  response = { data: snapshot(), error: null };
  assert.equal((await repository.save(snapshot(), { expectedRevision: 0 })).revision, 1);
  assert.equal(calls.at(-1).args.p_organization_id, org);
  assert.ok(calls.at(-1).args.p_request_id);
  assert.ok(!('actor_id' in calls.at(-1).args));
  await assert.rejects(repository.save(snapshot(), {}), { code: 'FINANCE_REVISION_REQUIRED' });
});

test('engine commands persist through repository and PostgreSQL: approval, partial payment, statement, reconciliation, attachments, reversal and closing', { timeout: 120000 }, async () => {
  const db = await fixture();
  try {
    await asUser(db, admin); await db.exec('set role authenticated'); await save(db, snapshot());
    const { createFinanceRepository } = await import('../assets/js/core/finance-repository.mjs');
    const client = { rpc: async (name, args) => {
      try {
        return { data: name === 'finance_workspace_load' ? await load(db, args.p_organization_id)
          : await save(db, args.p_state, args.p_expected_revision, args.p_request_id, args.p_organization_id), error: null };
      } catch (error) { return { data: null, error }; }
    } };
    const storeData = { session: { userId: admin, role: 'admin', organizationId: org } };
    const window = { crypto: require('node:crypto').webcrypto, AGIR_BACKEND: { mode: 'supabase' },
      AGIR_FINANCE_REPOSITORY: createFinanceRepository({ client, organizationId: org, userId: admin }),
      AGIR: { store: { get: key => storeData[key], set: (key, value) => { storeData[key] = value; }, currentUser: () => ({ id: admin, role: 'admin' }) } } };
    vm.runInNewContext(fs.readFileSync('assets/js/core/finance.js', 'utf8'), { window, Intl, Date, console });
    const fin = window.AGIR.fin; await fin.ready(); const date = fin.today();
    const entry = (await fin.command('entry.save', { tipo: 'despesa', contaId: 'expense', centroId: 'commercial', descricao: 'Contrato mensal',
      contaBancariaId: 'bank_a', valorCentavos: 5000, data: date, vencimento: date, competencia: date.slice(0,7) })).data;
    await fin.command('policy.save', { exigirAprovacao: true, limiteAprovacaoCentavos: 1 });
    await assert.rejects(fin.command('entry.settle', { id: entry.id, valorCentavos: 2500, data: date }), { code: 'APPROVAL_REQUIRED' });
    await fin.command('entry.approve', { id: entry.id });
    const payment = (await fin.command('entry.settle', { id: entry.id, valorCentavos: 2500, data: date })).data;
    const statement = (await fin.command('statement.import', { accountId: 'bank_a', format: 'csv', text: `Data;Descricao;Valor;ID\n${date};Contrato mensal;-25,00;engine-row` })).data.rows[0];
    await fin.command('reconciliation.match', { statementId: statement.id, entryId: entry.id, paymentId: payment.id });
    assert.equal(fin.state().conciliacoes.filter(row => !row.cancelado).length, 2);
    await fin.command('attachFile', { entryId: entry.id, attachment: { id: 'attachment', name: 'Comprovante.pdf', size: 500,
      type: 'application/pdf', path: `${org}/${entry.id}/attachment.pdf`, createdAt: new Date().toISOString() } });
    await fin.command('detachFile', { entryId: entry.id, attachmentId: 'attachment' });
    await fin.command('entry.reversePayment', { id: entry.id, paymentId: payment.id, motivo: 'Pagamento duplicado' });
    await fin.command('entry.delete', { id: entry.id });
    const transfer = (await fin.command('transfer.create', { origemId: 'bank_a', destinoId: 'bank_b', valorCentavos: 2000, data: date })).data;
    await fin.command('transfer.cancel', { id: transfer.id, motivo: 'Transferência corrigida' });
    await fin.command('period.close', { month: date.slice(0,7) });
    await fin.command('period.reopen', { month: date.slice(0,7), motivo: 'Revisão da classificação' });
    const saved = await load(db);
    assert.equal(saved.revision, fin.state().revision);
    assert.equal(saved.auditoria.length, saved.revision);
    assert.ok(saved.auditoria.every(event => event.actorId === admin && event.action === 'workspace.save'));
    assert.ok(saved.auditoria.at(-1).details.changes.length > 0);
    assert.equal(saved.lancamentos.find(row => row.id === entry.id).cancelado, true);
    assert.equal(saved.lancamentos.find(row => row.id === entry.id).pagamentos[0].estornado, true);
    assert.equal(saved.conciliacoes.filter(row => !row.cancelado).length, 1);
  } finally { await db.close(); }
});
