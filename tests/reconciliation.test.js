const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const modulePromise = import('../assets/js/core/reconcile-read.mjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('unchanged 10000-row manifest requires no full payload reads and preserves microseconds', async () => {
  const { readCollectionDelta } = await modulePromise;
  const known = Array.from({ length: 10000 }, (_, i) => ({ id: String(i), updated_at: '2026-09-12T00:00:00.123456Z' }));
  let calls = 0;
  const result = await readCollectionDelta({ known, read: async (columns, ids) => {
    calls++; assert.equal(columns, 'id,updated_at'); assert.equal(ids, null); return known;
  } });
  assert.equal(calls, 1); assert.equal(result.ids.length, 10000); assert.equal(result.rows.length, 0);
});

test('only changed/new records are fetched, with bounded batches and deletion race handled', async () => {
  const { readCollectionDelta } = await modulePromise;
  const calls = [];
  const manifest = [{ id: 'same', updated_at: '1' }, { id: 'changed', updated_at: '2' }, { id: 'new', updated_at: '1' }, { id: 'revoked', updated_at: '1' }];
  const result = await readCollectionDelta({ batchSize: 2, known: [{ id: 'same', updated_at: '1' }, { id: 'changed', updated_at: '1' }, { id: 'deleted', updated_at: '1' }],
    read: async (_, ids) => { calls.push(ids); return ids ? manifest.filter(row => ids.includes(row.id) && row.id !== 'revoked') : manifest; } });
  assert.deepEqual(calls, [null, ['changed', 'new'], ['revoked']]);
  assert.deepEqual(result.ids, ['same', 'changed', 'new']);
  assert.deepEqual(result.rows.map(r => r.id), ['changed', 'new']);
});

test('read failure/abort does not retry, incomplete responses never yield a partial result', async () => {
  const { readCollectionDelta } = await modulePromise;
  let calls = 0;
  await assert.rejects(readCollectionDelta({ read: async (_, ids) => { calls++; if (ids) throw Error('offline'); return [{ id: 'a', updated_at: '1' }]; } }), /offline/);
  assert.equal(calls, 2);
  const controller = new AbortController();
  await assert.rejects(readCollectionDelta({ signal: controller.signal, read: async () => { controller.abort(); return []; } }), { name: 'AbortError' });
  await assert.rejects(readCollectionDelta({ batchSize: 0, read: async () => [] }), /inválido/);
  await assert.rejects(readCollectionDelta({ read: async () => [{ id: 'a' }, { id: 'a' }] }), /inválido/);
  await assert.rejects(readCollectionDelta({ read: async (_, ids) => [{ id: ids ? 'wrong' : 'a' }] }), /inválida/);
});

function harness() {
  const window = { AGIR: {}, AGIR_BACKEND: { mode: 'supabase' } };
  vm.runInNewContext(read('assets/js/core/store.js'), { window, console, setTimeout, clearTimeout });
  const store = window.AGIR.store; store.load();
  store.set('session', { organizationId: 'org', role: 'admin', userId: 'admin' });
  const context = { AGIR: { store }, global: { dispatchEvent() {} }, CustomEvent: class {}, scheduleCrmRefresh() {}, needsReconciliation: false, setSyncState() {}, dispatchCrmRefreshed() {} };
  const app = read('assets/js/app.js');
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('  function upsertRealtime('), app.indexOf('  function applyCrmRealtimeSnapshot(')), context);
  return { store, context };
}
function envelope() {
  return { incremental: { contacts: { ids: ['c'], rows: [{ id: 'c', full_name: 'Contato', updated_at: '2' }] },
    opportunities: { ids: ['o'], rows: [{ id: 'o', contact_id: 'c', title: 'Lead', stage_id: 'next', version: 2, updated_at: '2', status: 'open' }] },
    activities: { ids: ['a'], rows: [{ id: 'a', opportunity_id: 'o', status: 'pending', updated_at: '2' }] } },
    tags: [], opportunityTags: [], opportunityMessages: [], paymentReceipts: [] };
}

test('real reconciliation applies mapper fields, removes revoked scopes and keeps current versions', () => {
  const { store, context } = harness();
  store.set('oportunidades', [{ id: 'removed' }, { id: 'o', version: 1 }]);
  store.set('historicoAlteracoes', [{ id: 'h', oportunidadeId: 'removed' }]);
  store.set('comprovantesPagamento', [{ id: 'p', oportunidadeId: 'removed' }]);
  context.applyCrmReconciliation(envelope(), true);
  assert.equal(store.get('oportunidades').length, 1);
  assert.equal(store.byId('oportunidades', 'o').etapaId, 'next');
  assert.equal(store.byId('oportunidades', 'o').cliente, 'Contato');
  assert.equal(store.byId('atividades', 'a').atualizadoEm, '2');
  assert.equal(store.get('historicoAlteracoes').length, 0);
  assert.equal(store.get('comprovantesPagamento').length, 0);
  assert.equal(context.reconciliationVersions().contacts[0].updated_at, '2');
  context.applyCrmRealtimeDelta({ table: 'opportunities', payload: { eventType: 'UPDATE', new: { id: 'o', contact_id: 'c', version: 3, stage_id: 'newer' } } }, true);
  context.applyCrmReconciliation(envelope(), true);
  assert.equal(store.byId('oportunidades', 'o').version, 3);
  assert.equal(store.byId('oportunidades', 'o').etapaId, 'newer');
});

test('invalid envelope is rejected before any store changes; unchanged records survive', () => {
  const { store, context } = harness();
  context.applyCrmReconciliation(envelope(), true);
  const revision = store.revision('oportunidades');
  const bad = envelope(); delete bad.paymentReceipts;
  assert.throws(() => context.applyCrmReconciliation(bad), /ausente/);
  assert.equal(store.revision('oportunidades'), revision);
  const unchanged = envelope(); Object.values(unchanged.incremental).forEach(part => { part.rows = []; });
  context.applyCrmReconciliation(unchanged, true);
  assert.equal(store.revision('oportunidades'), revision);
  assert.equal(store.byId('atividades', 'a').oportunidadeId, 'o');
});
