const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const vm = require('node:vm');
const source = f => fs.readFileSync(require('node:path').join(__dirname, '..', f), 'utf8');
const modulePromise = import('../assets/js/core/opportunity-mutations.mjs');
const args = (version = 1, id = 'lead') => ({ p_opportunity_id: id, p_expected_version: version, p_target_stage_id: 'next' });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('normal move returns new version; repeated simultaneous writes across entry points are blocked', async () => {
  const { createOpportunityMutations } = await modulePromise;
  const gate = deferred(); let writes = 0;
  const coordinator = createOpportunityMutations({ write: async () => { writes++; return gate.promise; }, read: async () => ({ version: 2 }) });
  const first = coordinator.run('transition_opportunity', args());
  const repeated = await Promise.allSettled(Array.from({ length: 25 }, () => coordinator.run('update_opportunity_details_v4', args())));
  assert.ok(repeated.every(r => r.reason.code === 'OPERATION_IN_PROGRESS'));
  gate.resolve({ id: 'lead', version: 2, stage_id: 'next' });
  assert.equal((await first).version, 2);
  await assert.rejects(coordinator.run('transition_opportunity', args()), { code: 'PT409' });
  assert.equal(writes, 1);
});

test('two independent clients: losing version is refreshed once and never replayed', async () => {
  const { createOpportunityMutations } = await modulePromise;
  let row = { version: 1, stage_id: 'old' }, writes = 0, reads = 0;
  const events = [];
  const server = { write: async (_, a) => { writes++; if (row.version !== a.p_expected_version) throw { code: 'PT409', message: 'opportunity changed by another user' }; row = { version: row.version + 1, stage_id: a.p_target_stage_id }; return row; }, read: async () => { reads++; return row; }, onReconciled: e => events.push(e) };
  const sessionA = createOpportunityMutations(server), sessionB = createOpportunityMutations(server);
  const results = await Promise.allSettled([sessionA.run('transition_opportunity', args()), sessionB.run('transition_opportunity', args())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'PT409');
  assert.equal(writes, 2); assert.equal(reads, 1); assert.equal(events[0].row.version, 2);
  await assert.rejects(sessionB.run('transition_opportunity', args()), { code: 'PT409' });
  assert.equal(writes, 2);
  assert.equal((await sessionB.run('transition_opportunity', args(2))).version, 3);
});

test('legacy business 40001 is normalized; real serialization stays 40001', async () => {
  const { createOpportunityMutations, isBusinessConflict } = await modulePromise;
  for (const message of ['opportunity changed by another user', 'financial entry changed by another user']) {
    assert.equal(isBusinessConflict({ code: '40001', message }), true);
  }
  assert.equal(isBusinessConflict({ code: '40001', message: 'could not serialize access due to concurrent update' }), false);
  for (const [message, code] of [['opportunity changed by another user', 'PT409'], ['could not serialize access due to concurrent update', '40001']]) {
    let writes = 0;
    const c = createOpportunityMutations({ write: async () => { writes++; throw { code: '40001', message }; }, read: async () => ({ version: 2 }) });
    await assert.rejects(c.run('transition_opportunity', args()), { code });
    assert.equal(writes, 1);
  }
});

test('failed refresh blocks stale writes without inventing a newer version', async () => {
  const { createOpportunityMutations } = await modulePromise;
  let writes = 0, online = false;
  const c = createOpportunityMutations({ write: async () => { writes++; if (writes === 1) throw { code: 'PT409' }; return { version: 3 }; },
    read: async () => { if (!online) throw Error('offline'); return { version: 2 }; } });
  await assert.rejects(c.run('transition_opportunity', args(99)), { code: 'PT409' });
  await assert.rejects(c.run('transition_opportunity', args(99)), { code: 'PT409' });
  assert.equal(writes, 1);
  online = true;
  assert.equal((await c.run('transition_opportunity', args(2))).version, 3);
});

test('network timeout aborts once; another explicit attempt reads rather than replaying an uncertain write', async () => {
  const { createOpportunityMutations } = await modulePromise;
  let writes = 0, aborted = 0, reads = 0;
  const c = createOpportunityMutations({ timeoutMs: 15, write: async (_, __, signal) => { writes++; signal.addEventListener('abort', () => aborted++); return new Promise(() => {}); }, read: async () => { reads++; return { version: 1 }; } });
  await assert.rejects(c.run('transition_opportunity', args()), { code: 'MUTATION_TIMEOUT' });
  await assert.rejects(c.run('transition_opportunity', args()), { code: 'REVIEW_REQUIRED' });
  assert.equal(writes, 1); assert.equal(aborted, 1); assert.equal(reads, 2);
});

test('missing versions are rejected before network and different leads can progress independently', async () => {
  const { createOpportunityMutations } = await modulePromise;
  let writes = 0;
  const c = createOpportunityMutations({ write: async () => { writes++; return { version: 2 }; }, read: async () => null });
  for (const v of [null, undefined, 0, -1, 1.5, '1']) {
    const a = args(); a.p_expected_version = v;
    await assert.rejects(c.run('transition_opportunity', a), { code: 'INVALID_VERSION' });
  }
  assert.equal(writes, 0);
  await Promise.all([c.run('transition_opportunity', args(1, 'a')), c.run('transition_opportunity', args(1, 'b'))]);
  assert.equal(writes, 2);
});

test('installed Supabase SDK never retries a POST on HTTP 500 or network failure', async () => {
  for (const network of [false, true]) {
    let requests = 0;
    const client = createClient('https://example.supabase.co', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (_, init) => {
      assert.equal(init.method, 'POST'); requests++;
      if (network) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ code: '40001', message: 'opportunity changed by another user' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    } } });
    const { error } = await client.rpc('transition_opportunity', args());
    assert.ok(error); assert.equal(requests, 1);
  }
});

test('three failures open the circuit; only successful explicit refresh releases it', async () => {
  const { createOpportunityMutations } = await modulePromise;
  let writes = 0, reads = 0, fail = true, offline = false;
  const c = createOpportunityMutations({ write: async () => { writes++; if (fail) throw { code: '23514', message: 'invalid payload' }; return { opportunity: { version: 2 } }; },
    read: async () => { reads++; if (offline) throw Error('offline'); return { version: 1 }; } });
  for (let i = 0; i < 3; i++) await assert.rejects(c.run('update_opportunity_details_v4', args()), { code: '23514' });
  for (let i = 0; i < 10; i++) await assert.rejects(c.run('update_opportunity_details_v4', args()), { code: 'CIRCUIT_OPEN' });
  assert.equal(writes, 3); assert.equal(reads, 3);
  offline = true; assert.equal(await c.refresh('lead'), false);
  await assert.rejects(c.run('update_opportunity_details_v4', args()), { code: 'CIRCUIT_OPEN' });
  offline = false; fail = false; assert.equal(await c.refresh('lead'), true);
  assert.equal((await c.run('update_opportunity_details_v4', args())).opportunity.version, 2);
  await assert.rejects(c.run('update_opportunity_details_v4', args()), { code: 'PT409' });
  assert.equal(writes, 4, 'nested v4 response version is remembered');
});

test('autosave skips unchanged/reverted payload without validation, RPC or timer', async () => {
  const widgets = source('assets/js/core/widgets.js');
  const start = widgets.indexOf('    async function saveInline('), end = widgets.indexOf('\n    function tagTone(', start);
  const values = { nome: 'Nome', cpf: '', telefone: '', valor: 0 };
  const context = { editorState: { fields: {}, revision: 3, savedRevision: 1, savedPayload: JSON.stringify(values), saveButton: { hidden: false }, status: {} },
    accessRevoked: false, readEditorValues: () => values, clearTimeout: () => {},
    validateEditor: () => { throw Error('should not validate or save unchanged payload'); } };
  vm.createContext(context); vm.runInContext(widgets.slice(start, end), context);
  assert.equal(await context.saveInline(false), true);
  assert.equal(context.editorState.savedRevision, 3);
  assert.equal(context.editorState.saveButton.hidden, true);
});

test('editor snapshot keeps the displayed version when Realtime mutates the shared store', () => {
  const widgets = source('assets/js/core/widgets.js');
  const row = { id: 'lead', version: 1, cliente: 'Original' };
  const context = { S: () => ({ byId: () => row }) };
  vm.createContext(context);
  vm.runInContext(widgets.slice(widgets.indexOf('  function snapshotOpportunity('), widgets.indexOf('  function oppDrawer(')), context);
  const editor = context.snapshotOpportunity('lead');
  Object.assign(row, { version: 2, cliente: 'Outra sessão' });
  assert.equal(editor.version, 1); assert.equal(editor.cliente, 'Original');
  assert.equal(context.snapshotOpportunity('lead').version, 2, 'only explicit refresh adopts the newer version');
});

test('real Realtime opportunity delta updates visual store, rejects older versions and makes no writes', () => {
  const app = source('assets/js/app.js');
  const start = app.indexOf('  function upsertRealtime(');
  const end = app.indexOf('\n  function ', app.indexOf('  function applyCrmRealtimeDelta(') + 15);
  const rows = [{ id: 'lead', version: 1, etapaId: 'old' }]; const notices = [];
  const store = { byId: (table, id) => table === 'oportunidades' ? rows.find(r => r.id === id) : null,
    get: key => ({ 'session.organizationId': 'org', 'session.role': 'admin', 'session.userId': 'admin' })[key] || [],
    update: (_, id, patch) => Object.assign(rows.find(r => r.id === id), patch), insert: (_, row) => rows.push(row), batch: fn => fn() };
  const context = { AGIR: { store }, global: { dispatchEvent: e => notices.push(e) }, CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options.detail; } },
    scheduleCrmRefresh: () => {}, needsReconciliation: false, setSyncState: () => {}, dispatchCrmRefreshed: d => notices.push(d) };
  vm.createContext(context); vm.runInContext(app.slice(start, end), context);
  context.applyCrmRealtimeDelta({ table: 'opportunities', payload: { eventType: 'UPDATE', new: { id: 'lead', organization_id: 'org', version: 2, stage_id: 'next', status: 'open' } } });
  assert.equal(rows[0].version, 2); assert.equal(rows[0].etapaId, 'next');
  context.applyCrmRealtimeDelta({ table: 'opportunities', payload: { eventType: 'UPDATE', new: { id: 'lead', version: 1, stage_id: 'old' } } });
  assert.equal(rows[0].etapaId, 'next');
});

test('orphan activity replayed from an authoritative snapshot never schedules another full refresh', () => {
  const app = source('assets/js/app.js');
  const start = app.indexOf('  function upsertRealtime(');
  const end = app.indexOf('\n  function ', app.indexOf('  function applyCrmRealtimeDelta(') + 15);
  let refreshes = 0;
  const store = { byId: () => null, get: key => ({ 'session.organizationId': 'org', 'session.role': 'commercial', 'session.userId': 'u' })[key] || [],
    update: () => {}, insert: () => {}, remove: () => {}, batch: fn => fn() };
  const context = { AGIR: { store }, global: { dispatchEvent: () => {} }, CustomEvent: class { constructor(name, options) { this.detail = options.detail; } },
    scheduleCrmRefresh: () => { refreshes++; }, needsReconciliation: false };
  vm.createContext(context); vm.runInContext(app.slice(start, end), context);
  const orphan = { table: 'activities', payload: { eventType: 'UPDATE', new: { id: 'a', organization_id: 'org', opportunity_id: 'cancelled-lead', owner_id: 'u', status: 'completed' }, old: {} } };
  context.applyCrmRealtimeDelta(orphan, true);
  assert.equal(refreshes, 0, 'silent snapshot replay must not loop');
  context.applyCrmRealtimeDelta(orphan);
  assert.equal(refreshes, 1, 'a live event for an unknown lead still reconciles once');
});
