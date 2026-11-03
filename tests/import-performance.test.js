const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const IO = require('../assets/js/core/lead-io.js');
const taskModule = import('../assets/js/core/import-task.mjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('catalog indexes are built once per validation, but fresh edits are visible on next review', () => {
  let reads = 0;
  const product = { id: 'p', get nome() { reads++; return 'Refinanciamento'; } };
  const rows = Array.from({ length: 500 }, (_, i) => ({ line: i + 2, values: { name: 'Nome', product: 'Refinanciamento' } }));
  const ctx = { products: [product], defaultOwner: { id: 'u' }, defaultStage: { id: 's' } };
  const validated = IO.validateRows(rows, ctx);
  assert.equal(validated.length, 500); assert.ok(reads <= 2, 'names are not re-indexed 500 times');
  assert.equal(validated[0].value.product.id, 'p');
  ctx.products = [{ id: 'p2', nome: 'Refinanciamento' }];
  assert.equal(IO.validateRows(rows, ctx)[0].value.product.id, 'p2');
  assert.equal(ctx._catalogIndexes, undefined, 'no cache leaks into caller state');
});

test('worker runs the real pure parser/matcher/validator and rejects unsupported methods', () => {
  const messages = [];
  const self = { postMessage: message => messages.push(message) };
  const ctx = vm.createContext({ self });
  vm.runInContext(read('assets/js/core/lead-io.js'), ctx);
  vm.runInContext(read('assets/js/core/import-worker.mjs').replace("import './lead-io.js';", ''), ctx);
  const csv = 'Nome do cliente;CPF;Matrícula;Etiqueta\nTeste;12345678901;001;Prioridade';
  self.onmessage({ data: { method: 'parseCsv', args: [csv] } });
  assert.deepEqual(JSON.parse(JSON.stringify(messages.pop().result)), IO.parseCsv(csv));
  const rows = IO.parseCsv(csv).rows;
  const context = { tags: [{ id: 't', nome: 'Prioridade' }], defaultOwner: { id: 'u' }, defaultStage: { id: 's' } };
  for (const method of ['unmatchedCatalogValues', 'validateRows']) {
    self.onmessage({ data: { method, args: [rows, context] } });
    assert.deepEqual(JSON.parse(JSON.stringify(messages.pop().result)), JSON.parse(JSON.stringify(IO[method](rows, context))));
  }
  self.onmessage({ data: { method: 'rpc', args: [] } });
  assert.match(messages.pop().error, /inválida/);
});

test('worker lifecycle prevents overlapping jobs, terminates on completion/cancel and ignores late events', async () => {
  const { createImportTask } = await taskModule;
  const workers = [];
  const task = createImportTask(() => {
    const worker = { terminated: 0, terminate() { this.terminated++; }, postMessage(data) { this.data = data; } };
    workers.push(worker); return worker;
  });
  const first = task.run('parseCsv', ['csv']);
  await assert.rejects(task.run('parseCsv', ['other']), /Aguarde/);
  workers[0].onmessage({ data: { result: 'parsed' } });
  assert.equal(await first, 'parsed'); assert.equal(workers[0].terminated, 1);
  const second = task.run('validateRows', []);
  workers[0].onerror(); // stale callback cannot clear the second task
  task.cancel();
  await assert.rejects(second, { name: 'AbortError' });
  assert.equal(workers[1].terminated, 1);
  assert.equal(workers[0].terminated, 1);
});

test('worker timeout and load errors are bounded and do not retry or silently run expensive fallback', async () => {
  const { createImportTask } = await taskModule;
  let starts = 0, stops = 0;
  const task = createImportTask(() => { starts++; return { terminate() { stops++; }, postMessage() {} }; }, 5);
  await assert.rejects(task.run('parseCsv', []), /demorou/);
  assert.equal(starts, 1); assert.equal(stops, 1);
  const failed = createImportTask(() => { throw Error('blocked'); });
  await assert.rejects(failed.run('parseCsv', []), /blocked/);
});

test('preparation UI blocks duplicate actions and restores controls, but never renders after close', async () => {
  const source = read('assets/js/pages/crm/pipeline.js');
  let renders = 0, actions = 0, release;
  const ctx = { closed: false, preparing: false, state: {}, modal: { body: {} }, importButton: {}, cancelButton: {}, importButtonLabel: {},
    renderBody() { renders++; }, UI: { toast: { bad() { throw Error('unexpected'); } } } };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('      async function preparationAction('), source.indexOf('      function defaultSource(')), ctx);
  const pending = ctx.preparationAction(() => { actions++; return new Promise(resolve => { release = resolve; }); });
  assert.equal(ctx.modal.body.inert, true); assert.equal(ctx.importButton.disabled, true);
  await ctx.preparationAction(() => { actions++; }); assert.equal(actions, 1);
  release(); await pending;
  assert.equal(ctx.modal.body.inert, false); assert.equal(ctx.preparing, false); assert.equal(renders, 1);
  await ctx.preparationAction(async () => { ctx.closed = true; });
  assert.equal(renders, 1);
});
