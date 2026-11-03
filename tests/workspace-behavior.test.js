const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const norm = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const window = { AGIR: { dom: {}, fmt: { norm }, pages: {} } };
vm.runInNewContext(source('assets/js/core/widgets.js'), { window });
const widgets = window.AGIR.w;
const plain = value => JSON.parse(JSON.stringify(value));

test('tag search ignores accents and case without mutating the catalog', () => {
  const tags = [{ id: '1', nome: 'Órgão Público' }, { id: '2', nome: 'Recife' }];
  const original = JSON.stringify(tags);
  assert.deepEqual(plain(widgets.searchLeadTags(tags, '  ORGAO  ')).map(t => t.id), ['1']);
  assert.equal(widgets.searchLeadTags(tags, 'ausente').length, 0);
  assert.equal(widgets.searchLeadTags(tags, '').length, 2);
  assert.equal(JSON.stringify(tags), original);
});

test('history merges changes and messages; completed activities are never pending', () => {
  const activities = [
    { id: 'scheduled', status: 'scheduled', data: '2026-09-01', agendadoPara: '2026-10-01' },
    { id: 'done', status: 'completed', resultado: 'pendente', data: '2026-09-03' },
    { id: 'cancelled', status: 'cancelled', data: '2026-09-04' },
  ];
  const entries = widgets.leadHistoryEntries(activities,
    [{ id: 'chat', tipo: 'chat', criadoEm: '2026-09-05' }],
    [{ id: 'change', alteradoEm: '2026-09-06' }]);
  assert.deepEqual(plain(entries).map(e => e.data.id), ['scheduled', 'change', 'chat', 'done']);
  assert.equal(entries[0].pending, true);
  assert.equal(entries[3].pending, false);
});

const main = source('assets/js/main.js');
const queryCode = main.slice(main.indexOf('let readSessionController'), main.indexOf('const deferredCommercialKeys'));
const context = { window: {}, AbortController, DOMException, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(queryCode, context);
const uuid = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');

test('cursor pagination continues below server row cap and returns complete sorted data', async () => {
  const input = Array.from({ length: 1203 }, (_, i) => ({ id: uuid(i), position: 1203 - i }));
  let calls = 0;
  const factory = () => {
    let after = '';
    const query = { order() { return this; }, gt(key, value) { after = value; return this; },
      limit() { return this; }, abortSignal() { calls++; return Promise.resolve({ data: input.filter(r => r.id > after).slice(0, 137) }); } };
    return query;
  };
  const result = await context.readAllRows(factory, ['id'], [['position', true]]);
  assert.equal(result.data.length, 1203);
  assert.equal(result.data[0].position, 1);
  assert.equal(calls, 10);
});

test('cursor pagination rejects repeated pages and propagates backend failures', async () => {
  const query = { order() { return this; }, gt() { return this; }, limit() { return this; },
    abortSignal() { return Promise.resolve({ data: [{ id: uuid(1) }] }); } };
  await assert.rejects(context.readAllRows(() => query), /Paginacao inconsistente/);
  await assert.rejects(context.readAllRows(() => ({ ...query, abortSignal() { throw new Error('offline'); } })), /offline/);
});

test('query batches start at most four requests and preserve task ordering', async () => {
  let active = 0, peak = 0;
  const tasks = Array.from({ length: 13 }, (_, i) => async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--; return i;
  });
  const result = await context.runQueryBatches(tasks, 4);
  assert.equal(peak, 4);
  assert.deepEqual(plain(result), Array.from({ length: 13 }, (_, i) => i));
  await assert.rejects(context.runQueryBatches(tasks, 0), /batchSize/);
});

test('workspace styles are part of the production entry point', () => {
  const html = source('index.html');
  for (const file of ['lead-workspace', 'activity-workspace', 'pipeline-workspace']) {
    assert.ok(html.includes('assets/css/' + file + '.css'));
  }
});
