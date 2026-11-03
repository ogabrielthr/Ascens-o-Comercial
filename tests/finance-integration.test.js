'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const plain = value => JSON.parse(JSON.stringify(value));
const source = name => fs.readFileSync(path.join(__dirname, '../assets/js/core', name), 'utf8');

function financial(version) {
  const value = { planoContas: [{ id: 'category', nome: 'Receita', tipo: 'receita' }], centrosCusto: [],
    lancamentos: [{ id: 'real-entry', descricao: 'Contrato real preservado', valor: 123.45 }], orcamento: [] };
  return version === 1 ? value : { ...value, schemaVersion: 2, revision: 7,
    lancamentos: [{ id: 'real-entry', descricao: 'Contrato real preservado', valorCentavos: 12345,
      pagamentos: [{ id: 'payment', valorCentavos: 2345, estornado: false }] }],
    contasBancarias: [{ id: 'bank', saldoInicialCentavos: 10000 }], auditoria: [{ id: 'audit', action: 'entry.save' }] };
}

function storeHarness(version) {
  const memory = new Map(), timers = new Map(); let timerId = 0, seedBuilds = 0;
  const window = { localStorage: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value); },
    removeItem: key => { memory.delete(key); }
  }, AGIR: { seed: { build() {
    seedBuilds++;
    return { meta: { version: 1 }, session: {}, settings: {}, usuarios: [],
      oportunidades: [{ id: 'seed-lead', titulo: 'Exemplo do CRM' }], financeiro: financial(version) };
  } } } };
  vm.runInNewContext(source('store.js'), { window, console,
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => { timers.delete(id); } }, { filename: 'store.js' });
  const store = window.AGIR.store; store.load();
  return { store, memory, window, seedBuilds: () => seedBuilds,
    persisted: () => JSON.parse(memory.get(store.KEY)), flush: () => store.save(true) };
}

for (const version of [1, 2]) {
  test(`general CRM backup round-trips without replacing financial v${version}`, () => {
    const app = storeHarness(version), current = financial(version);
    app.store.set('financeiro', plain(current));
    app.store.set('oportunidades', [{ id: 'crm-real', titulo: 'Contrato original do CRM' }]);
    const exported = app.store.exportJSON(), backup = JSON.parse(exported);
    assert.equal(backup.meta.financialBackup, 'separate');
    assert.equal(Object.hasOwn(backup, 'financeiro'), false);
    assert.equal(backup.oportunidades[0].id, 'crm-real');
    const newest = plain(current); newest.lancamentos.push({ id: 'new-financial-entry', descricao: 'Posterior ao backup' });
    app.store.set('financeiro', newest);
    app.store.set('oportunidades', [{ id: 'crm-changed', titulo: 'Alteração posterior' }]);
    app.store.importJSON(exported); app.flush();
    assert.deepEqual(plain(app.store.get('oportunidades')), backup.oportunidades);
    assert.deepEqual(plain(app.store.get('financeiro')), newest, 'general backup must not roll finance back');
    assert.equal(JSON.parse(app.store.exportJSON()).oportunidades[0].id, 'crm-real');
  });

  test(`reset recreates CRM examples while preserving all financial v${version} data`, () => {
    const app = storeHarness(version), current = financial(version);
    current.lancamentos.push({ id: 'customer-entry', descricao: 'Dado local criado pelo usuário' });
    app.store.set('financeiro', current);
    app.store.set('oportunidades', [{ id: 'custom-crm', titulo: 'Será recriado pelo reset autorizado' }]);
    const before = plain(app.store.get('financeiro'));
    app.store.reset();
    assert.equal(app.seedBuilds(), 2);
    assert.deepEqual(plain(app.store.get('financeiro')), before);
    assert.equal(app.store.get('oportunidades')[0].id, 'seed-lead');
    if (version === 1) assert.deepEqual(app.persisted().financeiro, before, 'legacy finance remains safely serialized until migration');
    else assert.deepEqual(app.persisted().financeiro, { schemaVersion: 2, external: true, revision: 7 });
  });

  test(`importing an older wrapped database preserves current financial v${version}`, () => {
    const app = storeHarness(version), current = plain(app.store.get('financeiro'));
    const incoming = { meta: { version: 1 }, settings: {}, usuarios: [], session: {},
      oportunidades: [{ id: 'restored-crm', titulo: 'CRM do arquivo antigo' }],
      financeiro: { schemaVersion: 2, revision: 99, lancamentos: [{ id: 'foreign-financial-data' }] } };
    app.store.importJSON(JSON.stringify(incoming));
    assert.equal(app.store.get('oportunidades')[0].id, 'restored-crm');
    assert.deepEqual(plain(app.store.get('financeiro')), current);
  });
}

test('local store persists only the v2 finance pointer and retains the complete in-memory ledger', () => {
  const app = storeHarness(2), current = financial(2);
  app.store.set('financeiro', current); app.flush();
  const persisted = app.persisted();
  assert.deepEqual(persisted.financeiro, { schemaVersion: 2, external: true, revision: 7 });
  assert.equal(Object.hasOwn(persisted.financeiro, 'lancamentos'), false);
  assert.equal(Object.hasOwn(persisted.financeiro, 'auditoria'), false);
  assert.deepEqual(plain(app.store.get('financeiro')), current);
  app.store.load();
  assert.deepEqual(plain(app.store.get('financeiro')), persisted.financeiro, 'reload preserves the pointer for the finance repository');
  assert.equal(app.seedBuilds(), 1, 'reload must not recreate financial sample data');
});

function attachmentHarness() {
  const organizationId = '00000000-0000-4000-8000-000000000001', entryId = 'entry-1';
  const state = { lancamentos: [{ id: entryId, anexos: [] }] }, files = new Map(), calls = [];
  const failures = { upload: null, download: null, remove: null, attach: null, detach: null };
  const bucket = {
    async upload(key, blob, options) {
      calls.push({ operation: 'upload', key, blob, options });
      if (failures.upload) return { error: failures.upload };
      files.set(key, blob); return { data: { path: key }, error: null };
    },
    async download(key) {
      calls.push({ operation: 'download', key });
      if (failures.download) return { error: failures.download };
      return files.has(key) ? { data: files.get(key), error: null } : { data: null, error: new Error('not found') };
    },
    async remove(keys) {
      calls.push({ operation: 'remove', keys });
      if (failures.remove) return { error: failures.remove };
      keys.forEach(key => files.delete(key)); return { data: keys, error: null };
    }
  };
  const window = { crypto: crypto.webcrypto, AGIR_BACKEND: { mode: 'supabase', client: { storage: {
    from(name) { assert.equal(name, 'ascensao-finance-documents'); return bucket; }
  } } }, AGIR: {
    store: { get: key => key === 'session.organizationId' ? organizationId : undefined },
    fin: {
      ready: async () => state, state: () => plain(state),
      async command(action, payload) {
        calls.push({ operation: action, payload: plain(payload) });
        const entry = state.lancamentos.find(row => row.id === payload.entryId);
        assert.ok(entry, 'metadata must be linked to an existing title');
        if (action === 'attachFile') {
          if (failures.attach) throw failures.attach;
          assert.ok(!entry.anexos.some(row => row.id === payload.attachment.id), 'attachment must not be linked twice');
          entry.anexos.push(plain(payload.attachment));
        } else if (action === 'detachFile') {
          if (failures.detach) throw failures.detach;
          entry.anexos = entry.anexos.filter(row => row.id !== payload.attachmentId);
        } else assert.fail('unexpected finance command: ' + action);
        return { ok: true };
      }
    }
  } };
  vm.runInNewContext(source('finance-attachments.js'), { window, Blob, Date, console }, { filename: 'finance-attachments.js' });
  return { api: window.AGIR.financeAttachments, state, files, calls, failures, organizationId, entryId,
    file: () => new File(['Comprovante financeiro de teste'], 'recibo.pdf', { type: 'application/pdf' }) };
}

test('remote attachment upload commits private scoped metadata and download returns the original file', async () => {
  const app = attachmentHarness(), file = app.file();
  const metadata = await app.api.put(app.entryId, file);
  assert.match(metadata.path, new RegExp('^' + app.organizationId + '/' + app.entryId + '/[a-f0-9-]+\\.pdf$'));
  assert.equal(metadata.name, 'recibo.pdf'); assert.equal(metadata.type, 'application/pdf'); assert.equal(metadata.size, file.size);
  assert.ok(!Number.isNaN(Date.parse(metadata.createdAt)));
  assert.deepEqual(plain(app.calls[0].options), { contentType: 'application/pdf', upsert: false });
  assert.equal(app.calls[0].operation, 'upload'); assert.equal(app.calls[1].operation, 'attachFile');
  assert.deepEqual(plain(app.api.list(app.entryId)), [plain(metadata)]);
  const downloaded = await app.api.get(metadata.id);
  assert.equal(downloaded, file); assert.equal(await downloaded.text(), await file.text());
  assert.equal(app.calls.at(-1).key, metadata.path);
});

test('failed attachment metadata commit cleans up the uploaded file and reports the original persistence error', async () => {
  const app = attachmentHarness(), failure = new Error('Finance revision conflict'); app.failures.attach = failure;
  await assert.rejects(app.api.put(app.entryId, app.file()), error => error === failure);
  assert.deepEqual(app.calls.map(call => call.operation), ['upload', 'attachFile', 'remove']);
  assert.equal(app.calls[2].keys[0], app.calls[0].key);
  assert.equal(app.files.size, 0); assert.equal(app.api.list(app.entryId).length, 0);
});

test('failed attachment upload never commits metadata or attempts to delete an uncreated file', async () => {
  const app = attachmentHarness(); app.failures.upload = new Error('Storage unavailable');
  await assert.rejects(app.api.put(app.entryId, app.file()), /Storage unavailable/);
  assert.deepEqual(app.calls.map(call => call.operation), ['upload']);
  assert.equal(app.files.size, 0); assert.equal(app.api.list(app.entryId).length, 0);
});

test('attachment download errors preserve the stored reference and missing ids never request arbitrary files', async () => {
  const app = attachmentHarness(), metadata = await app.api.put(app.entryId, app.file());
  app.failures.download = new Error('Temporary download failure');
  await assert.rejects(app.api.get(metadata.id), /Temporary download failure/);
  assert.equal(app.api.list(app.entryId).length, 1); assert.equal(app.files.size, 1);
  const count = app.calls.length;
  await assert.rejects(app.api.get('another-organization-file'), /não encontrado nesta empresa/);
  assert.equal(app.calls.length, count);
});

test('failed storage deletion restores the attachment reference and leaves the original document recoverable', async () => {
  const app = attachmentHarness(), file = app.file(), metadata = await app.api.put(app.entryId, file);
  const start = app.calls.length; app.failures.remove = new Error('Storage deletion refused');
  await assert.rejects(app.api.remove(metadata.id), /anexo foi preservado/);
  assert.deepEqual(app.calls.slice(start).map(call => call.operation), ['download', 'detachFile', 'remove', 'attachFile']);
  assert.deepEqual(plain(app.api.list(app.entryId)), [plain(metadata)]);
  assert.equal(await app.api.get(metadata.id), file);
  assert.equal(app.files.get(metadata.path), file);
});

test('failed metadata removal retains the binary, while successful removal deletes metadata before the file', async () => {
  const app = attachmentHarness(), file = app.file(), metadata = await app.api.put(app.entryId, file);
  app.failures.detach = new Error('Financial database unavailable');
  const start = app.calls.length;
  await assert.rejects(app.api.remove(metadata.id), /Financial database unavailable/);
  assert.deepEqual(app.calls.slice(start).map(call => call.operation), ['download', 'detachFile']);
  assert.equal(app.files.size, 1); assert.equal(app.api.list(app.entryId).length, 1);
  app.failures.detach = null;
  assert.equal(await app.api.remove(metadata.id), file.size);
  assert.equal(app.files.size, 0); assert.equal(app.api.list(app.entryId).length, 0);
  assert.deepEqual(app.calls.slice(-3).map(call => call.operation), ['download', 'detachFile', 'remove']);
});

test('attachment validation rejects empty, oversized, unsupported files and unknown titles before upload', async () => {
  const app = attachmentHarness();
  await assert.rejects(app.api.put(app.entryId, new File([], 'empty.pdf', { type: 'application/pdf' })), /até 10 MB/);
  await assert.rejects(app.api.put(app.entryId, new File([new Uint8Array(10485761)], 'large.pdf', { type: 'application/pdf' })), /até 10 MB/);
  await assert.rejects(app.api.put(app.entryId, new File(['x'], 'program.exe', { type: 'application/x-msdownload' })), /Use PDF/);
  await assert.rejects(app.api.put('unknown-title', app.file()), /Salve o lançamento/);
  assert.equal(app.calls.length, 0);
});
