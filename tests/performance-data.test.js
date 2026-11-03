const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function storeHarness() {
  const window = { AGIR: {}, AGIR_BACKEND: { mode: 'supabase' } };
  vm.runInNewContext(read('assets/js/core/store.js'), { window, console, setTimeout, clearTimeout });
  window.AGIR.store.load();
  return window.AGIR.store;
}

test('nested batches notify each affected subscriber once, never unrelated collections', () => {
  const s = storeHarness();
  let crm = 0, history = 0, all = 0;
  s.subscribe(['oportunidades', 'atividades'], () => crm++);
  s.subscribe(['historicoAlteracoes'], () => history++);
  s.subscribe(() => all++);
  s.batch(() => { s.insert('historicoAlteracoes', { id: 'a' }); s.batch(() => s.insert('historicoAlteracoes', { id: 'b' })); });
  assert.deepEqual([crm, history, all], [0, 1, 1]);
  s.batch(() => {});
  assert.equal(all, 1);
  s.batch(() => { s.insert('oportunidades', { id: 'c' }); s.insert('atividades', { id: 'd' }); });
  assert.deepEqual([crm, history, all], [1, 1, 2]);
  s.notify('*');
  assert.deepEqual([crm, history, all], [2, 2, 3]);
});

test('ID and join indexes survive insert/update/remove/restore and invalidate on replacement/session', () => {
  const s = storeHarness();
  s.set('oportunidades', [{ id: 'a', ownerId: 'one' }]);
  const first = s.indexBy('oportunidades');
  assert.equal(s.indexBy('oportunidades'), first);
  assert.equal(s.byId('oportunidades', 'a'), first.a);
  const revision = s.revision('oportunidades');
  s.update('oportunidades', 'a', { ownerId: 'one' });
  assert.equal(s.revision('oportunidades'), revision);
  s.insert('oportunidades', { id: 'b', ownerId: 'two' });
  assert.equal(s.indexBy('oportunidades').b, s.byId('oportunidades', 'b'));
  s.update('oportunidades', 'b', { ownerId: 'three' });
  assert.equal(s.indexBy('oportunidades', 'ownerId').three.id, 'b');
  assert.equal(s.indexBy('oportunidades', 'ownerId').two, undefined);
  const removed = s.remove('oportunidades', 'b');
  assert.equal(s.byId('oportunidades', 'b'), null);
  s.restore('oportunidades', removed, 0);
  assert.equal(s.byId('oportunidades', 'b').ownerId, 'three');
  s.set('oportunidades', [{ id: 'a', ownerId: 'replacement' }]);
  assert.equal(s.byId('oportunidades', 'a').ownerId, 'replacement');
  s.load();
  assert.equal(s.byId('oportunidades', 'a'), null);
});

const main = read('assets/js/main.js');
const queryCode = main.slice(main.indexOf('let readSessionController'), main.indexOf('const deferredCommercialKeys'));
function queryHarness(extra = {}) {
  const context = vm.createContext({ window: {}, AbortController, DOMException, setTimeout, clearTimeout, ...extra });
  vm.runInContext(queryCode, context);
  return context;
}
test('cancellation aborts a page and prevents later batches from starting under a new session', async () => {
  const c = queryHarness();
  let signal, release, calls = 0;
  const query = { order() { return this; }, limit() { return this; }, abortSignal(s) {
    signal = s; return new Promise(resolve => { release = resolve; });
  } };
  const pending = c.runQueryBatches([() => c.readAllRows(() => query), () => { calls++; }], 1);
  c.cancelSessionReads();
  assert.equal(signal.aborted, true);
  release({ data: [] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 0);
  const result = await c.readAllRows(() => ({ ...query, abortSignal() { return Promise.resolve({ data: [] }); } }));
  assert.equal(result.data.length, 0);
});

test('lead workspace queries are scoped to organization and lead; no global history download', async () => {
  const seen = [];
  const c = queryHarness({ client: { from(table) {
    const entry = { table, filters: {} }; seen.push(entry);
    return { select() { return this; }, eq(k, v) { entry.filters[k] = v; return this; },
      is(k, v) { entry.filters[k] = v; return this; }, order() { return this; }, limit() { return this; },
      abortSignal() { return Promise.resolve({ data: [] }); } };
  } } });
  vm.runInContext(main.slice(main.indexOf('async function loadLeadWorkspace'), main.indexOf('async function restoreSession')), c);
  assert.deepEqual(plain(await c.loadLeadWorkspace({ organizationId: 'org', opportunityId: 'lead' })), { changes: [], messages: [], receipts: [] });
  assert.equal(seen.length, 3);
  for (const query of seen) assert.equal(query.filters.opportunity_id, 'lead');
  for (const query of seen) assert.equal(query.filters.organization_id, 'org');
  assert.equal(seen.find(q => q.table === 'opportunity_messages').filters.deleted_at, null);
});

const widgetSource = read('assets/js/core/widgets.js');
const loadCode = widgetSource.slice(widgetSource.indexOf('    async function loadWorkspace()'), widgetSource.indexOf('    function notifyLeadChange('));
function leadHarness(loader) {
  const s = storeHarness();
  s.set('oportunidades', [{ id: 'lead', ownerId: 'seller' }]);
  s.set('historicoAlteracoes', [{ id: 'old', oportunidadeId: 'lead' }, { id: 'other', oportunidadeId: 'other-lead' }]);
  const c = vm.createContext({ workspaceRemote: true, workspaceClosed: false, workspaceRequest: null, workspaceState: 'loading',
    workspaceRevision: 0, workspaceController: new AbortController(), oppId: 'lead', canViewAllLeads: false,
    currentUser: { id: 'seller' }, S: () => s, renderCurrentHistory: null, renderCurrentReceipts: null,
    mapChangeHistoryRow: row => ({ id: row.id, oportunidadeId: row.opportunity_id }), readWorkspaceStore() {},
    AGIR: {}, global: { AGIR_BACKEND: { loadLeadWorkspace: loader } } });
  vm.runInContext(loadCode, c);
  return { c, s };
}
const leadData = id => ({ changes: [{ id, opportunity_id: 'lead' }], messages: [], receipts: [] });
test('lead reads deduplicate, replace only this lead and never trigger a write', async () => {
  let complete, calls = 0;
  const { c, s } = leadHarness(() => { calls++; return new Promise(resolve => { complete = resolve; }); });
  const first = c.loadWorkspace(), second = c.loadWorkspace();
  assert.equal(calls, 1);
  complete(leadData('fresh'));
  await Promise.all([first, second]);
  assert.equal(c.workspaceState, 'ready');
  assert.deepEqual(plain(s.get('historicoAlteracoes')).map(r => r.id), ['other', 'fresh']);
});
test('Realtime during a lead read gets at most one follow-up, never an unbounded retry', async () => {
  const releases = [];
  const { c, s } = leadHarness(() => new Promise(resolve => releases.push(resolve)));
  const pending = c.loadWorkspace();
  c.workspaceRevision++; releases[0](leadData('stale'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases.length, 2);
  c.workspaceRevision++; releases[1](leadData('still-stale'));
  await pending;
  assert.equal(c.workspaceState, 'error');
  assert.equal(releases.length, 2);
  assert.deepEqual(plain(s.get('historicoAlteracoes')).map(r => r.id), ['old', 'other']);
});
test('closing a lead or losing ownership discards a late response', async () => {
  for (const revoke of [false, true]) {
    let complete;
    const { c, s } = leadHarness(() => new Promise(resolve => { complete = resolve; }));
    const pending = c.loadWorkspace();
    if (revoke) s.update('oportunidades', 'lead', { ownerId: 'another-seller' });
    else { c.workspaceClosed = true; c.workspaceController.abort(); }
    complete(leadData('late'));
    await pending;
    assert.equal(s.byId('historicoAlteracoes', 'late'), null);
  }
});
test('network errors preserve prior lead details and require explicit retry', async () => {
  let calls = 0;
  const { c, s } = leadHarness(async () => { calls++; if (calls === 1) throw new Error('offline'); return leadData('retry'); });
  await c.loadWorkspace();
  assert.equal(c.workspaceState, 'error');
  assert.equal(calls, 1);
  assert.ok(s.byId('historicoAlteracoes', 'old'));
  await c.loadWorkspace();
  assert.equal(c.workspaceState, 'ready');
  assert.equal(calls, 2);
});

test('pipeline window bounds DOM size and keeps every record reachable with correct final page', () => {
  const source = read('assets/js/pages/crm/pipeline.js');
  const c = vm.createContext({ columnPages: new Map(), columnPageSize: 30 });
  vm.runInContext(source.slice(source.indexOf('    function columnWindow('), source.indexOf('    function updateColumnPager(')), c);
  const rows = Array.from({ length: 10001 }, (_, id) => ({ id }));
  const visited = [];
  for (let page = 0; page < Math.ceil(rows.length / 30); page++) {
    c.columnPages.set('stage', page);
    const slice = c.columnWindow('stage', rows);
    assert.ok(slice.length <= 30);
    visited.push(...slice.map(r => r.id));
  }
  assert.deepEqual(visited, rows.map(r => r.id));
  assert.equal(rows.length, 10001);
  assert.equal(c.columnWindow('stage', rows.slice(0, 10)).length, 10);
  assert.equal(c.columnPages.get('stage'), 0);
});

test('pipeline pager targets its status label, not a temporary button ripple span', () => {
  const pipeline = read('assets/js/pages/crm/pipeline.js');
  const status = {}, ripple = {}, buttons = [{}, {}];
  const pager = { querySelector: selector => selector === '[role="status"]' ? status : ripple,
    querySelectorAll: () => buttons };
  const c = vm.createContext({ columnPages: new Map([['stage', 1]]), columnPageSize: 30 });
  vm.runInContext(pipeline.slice(pipeline.indexOf('    function updateColumnPager('), pipeline.indexOf('    function soma(')), c);
  const column = { querySelector: () => pager };
  c.updateColumnPager(column, 'stage', 34);
  assert.equal(status.textContent, '31–34 de 34');
  c.columnPages.set('stage', 0);
  c.updateColumnPager(column, 'stage', 34);
  assert.equal(status.textContent, '1–30 de 34');
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
  assert.equal(ripple.textContent, undefined);
});

test('dashboard fetches stage history only for views that use conversion', () => {
  const app = read('assets/js/app.js');
  let dashboardWidgets = ['kpis'];
  const c = vm.createContext({ AGIR: { store: { get: () => ({ dashboardWidgets }) } } });
  vm.runInContext(app.slice(app.indexOf('  function pageDataModules('), app.indexOf('  function applyCommercialModule(')), c);
  assert.deepEqual(plain(c.pageDataModules('crmDashboard', { query: { view: 'metas' } })), []);
  assert.deepEqual(plain(c.pageDataModules('crmDashboard', { query: {} })), []);
  assert.deepEqual(plain(c.pageDataModules('crmDashboard', { query: { view: 'funil' } })), ['analytics']);
  dashboardWidgets = ['funil'];
  assert.deepEqual(plain(c.pageDataModules('crmDashboard', { query: {} })), ['analytics']);
});

test('ranking replaces initial loading with empty state, then skips identical refreshes', () => {
  const ranking = read('assets/js/pages/performance/ranking.js');
  let mounts = 0, patches = 0, emptyStates = 0;
  const c = vm.createContext({ f: {}, linhas: [], periodo: null, totalEstornado: 0, vendas: 0,
    vendedoresAtivos: 0, lider: null, boardSignature: undefined, board: null, node: {},
    lastUpdatedAt: null, isRemote: true, AGIR: {},
    An: { rankingVendasEstornadas: () => [], range: () => ({ label: 'mês', from: 'start', to: 'end' }) },
    F: { date: value => value }, S: () => ({ get: () => [] }),
    h: (tag, ...children) => ({ tag, children }), icon() {}, cabecalho() {}, resumoGeral() {},
    vazio() { emptyStates++; }, classificacao() {}, podio() {},
    D: { mount() { mounts++; } }, patchElement() { patches++; }
  });
  vm.runInContext(ranking.slice(ranking.indexOf('    function renderBoard()'), ranking.indexOf('    // Keep existing buttons')), c);
  c.renderBoard();
  assert.deepEqual([mounts, patches, emptyStates], [1, 0, 0]);
  c.lastUpdatedAt = new Date();
  c.renderBoard();
  assert.deepEqual([mounts, patches, emptyStates], [1, 1, 1]);
  c.lastUpdatedAt = new Date(Date.now() + 15000);
  c.renderBoard();
  assert.deepEqual([mounts, patches, emptyStates], [1, 1, 1]);
});
