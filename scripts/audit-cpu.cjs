// Read-only synthetic diagnostics: no browser, network, real customer data or DB writes.
// Timings are Node/V8 helper costs, NOT browser CPU percentages or render timings.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const window = { AGIR: { dom: {}, pages: {} }, AGIR_BACKEND: { mode: 'supabase' } };
const context = vm.createContext({ window, console, setTimeout, clearTimeout, AbortController });
for (const name of ['format', 'store', 'analytics', 'widgets']) {
  vm.runInContext(read(`assets/js/core/${name}.js`), context);
}
const { store, an, w } = window.AGIR;
store.load();
store.set('usuarios', [{ id: 'synthetic-admin', role: 'admin' }]);
store.set('session', { userId: 'synthetic-admin', role: 'admin' });
store.set('pipelines', [{ id: 'synthetic-pipeline', padrao: true, etapas:
  Array.from({ length: 8 }, (_, i) => ({ id: 'stage-' + i, tipo: 'aberto', sla: 3, prob: 50 })) }]);
const date = new Date().toISOString();
function measure(fn) {
  for (let i = 0; i < 3; i++) fn();
  const samples = [];
  for (let i = 0; i < 15; i++) {
    const start = performance.now(); fn(); samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: +samples[7].toFixed(2), p95Ms: +samples[14].toFixed(2) };
}
const sizes = [1000, 10000, 50000];
const helpers = sizes.map(size => {
  store.set('oportunidades', Array.from({ length: size }, (_, i) => ({
    id: 'lead-' + i, ownerId: 'synthetic-admin', etapaId: 'stage-' + (i % 8),
    pipelineId: 'synthetic-pipeline', status: 'aberto', cliente: 'Cliente ficticio ' + i,
    criadoEm: date, entrouEtapaEm: date, estornoSolicitado: 1,
  })));
  const histories = Array.from({ length: size }, (_, i) => ({
    id: 'event-' + i, alteradoEm: new Date(Date.now() - ((i * 7919) % size) * 1000).toISOString(),
  }));
  const pipeline = measure(() => an.pipeline({ periodo: 'todos' }));
  assert.equal(an.pipeline({ periodo: 'todos' }).reduce((sum, c) => sum + c.qtd, 0), size);
  return { size, pipelineHelper: pipeline,
    mergeSortHistoryHelper: measure(() => w.leadHistoryEntries([], [], histories)) };
});
let unrelatedSubscriberCalls = 0;
const unsubscribe = store.subscribe(['oportunidades', 'atividades', 'notificacoes'], () => unrelatedSubscriberCalls++);
for (let i = 0; i < 100; i++) store.batch(() => store.insert('historicoAlteracoes', { id: 'synthetic-' + i }));
unsubscribe();
assert.equal(unrelatedSubscriberCalls, 0);
const main = read('assets/js/main.js');
const queryCode = main.slice(main.indexOf('let readSessionController'), main.indexOf('const deferredCommercialKeys'));
vm.runInContext(queryCode, context);
async function paginationCount(size) {
  let calls = 0;
  const rows = Array.from({ length: size }, (_, i) => ({ id: '00000000-0000-0000-0000-' + String(i).padStart(12, '0') }));
  const result = await context.readAllRows(() => {
    let after = '';
    return { order() { return this; }, gt(key, value) { after = value; return this; },
      limit() { return this; }, abortSignal() { calls++; return Promise.resolve({ data: rows.filter(r => r.id > after).slice(0, 500) }); } };
  });
  assert.equal(result.data.length, size);
  return { rows: size, requests: calls };
}
(async () => {
  console.log(JSON.stringify({ node: process.version, type: 'synthetic; no DOM/network', helpers,
    hundredHistoryBatches: { unrelatedSubscriberCalls },
    pagination: await Promise.all([0, 20, 2654, 10000].map(paginationCount)) }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
