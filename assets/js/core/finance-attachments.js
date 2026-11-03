(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var BUCKET = 'ascensao-finance-documents', MAX_SIZE = 10485760;
  var ALLOWED = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'text/plain': 'txt', 'text/csv': 'csv', 'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
  var openPromise;
  function db() {
    if (!global.indexedDB) return Promise.reject(new Error('O navegador não oferece armazenamento de anexos.'));
    if (!openPromise) openPromise = new Promise(function (resolve, reject) {
      var request = global.indexedDB.open('ascensao.finance.attachments.v1', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('files', { keyPath: 'id' }); };
      request.onsuccess = function () { var connection = request.result; connection.onversionchange = function () { connection.close(); openPromise = null; }; resolve(connection); };
      request.onerror = function () { openPromise = null; reject(request.error || new Error('Não foi possível abrir o armazenamento de anexos.')); };
      request.onblocked = function () { reject(new Error('Feche outras abas para atualizar o armazenamento de anexos.')); };
    });
    return openPromise;
  }
  function local(method, id, record) {
    return db().then(function (connection) { return new Promise(function (resolve, reject) {
      var transaction = connection.transaction('files', method === 'get' ? 'readonly' : 'readwrite'), store = transaction.objectStore('files');
      var request = method === 'put' ? store.put(record) : method === 'delete' ? store.delete(id) : store.get(id), result;
      request.onsuccess = function () { result = request.result; };
      transaction.oncomplete = function () { resolve(result); };
      transaction.onerror = transaction.onabort = function () { reject(transaction.error || new Error('Não foi possível salvar o anexo.')); };
    }); });
  }
  function remote() { return global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase'; }
  function scope() { return String(AGIR.store.get('session.organizationId') || 'local'); }
  function find(id) {
    var entries = AGIR.fin.state().lancamentos || [];
    for (var i = 0; i < entries.length; i++) {
      var item = (entries[i].anexos || []).find(function (file) { return file.id === id; });
      if (item) return { entryId: entries[i].id, attachment: item };
    }
    throw new Error('Anexo não encontrado nesta empresa.');
  }
  async function put(entryId, file) {
    await AGIR.fin.ready();
    if (!(file instanceof Blob) || !file.size || file.size > MAX_SIZE) throw new Error('Selecione um arquivo de até 10 MB.');
    var type = file.type || '', extension = String(file.name || '').split('.').pop().toLowerCase();
    if (!type && extension === 'csv') type = 'text/csv';
    if (!ALLOWED[type]) throw new Error('Use PDF, PNG, JPG, WEBP, TXT, CSV ou Excel.');
    if (!(AGIR.fin.state().lancamentos || []).some(function (entry) { return entry.id === entryId; })) throw new Error('Salve o lançamento antes de anexar arquivos.');
    var id = global.crypto.randomUUID(), key = scope() + '/' + entryId + '/' + id + '.' + ALLOWED[type];
    var metadata = { id: id, name: String(file.name || ('Anexo.' + ALLOWED[type])).slice(0, 200), size: file.size, type: type, path: key, createdAt: new Date().toISOString() };
    if (remote()) {
      var result = await global.AGIR_BACKEND.client.storage.from(BUCKET).upload(key, file, { contentType: type, upsert: false });
      if (result.error) throw new Error('Não foi possível enviar o anexo: ' + result.error.message);
    } else await local('put', id, { id: id, scope: scope(), blob: file });
    try { await AGIR.fin.command('attachFile', { entryId: entryId, attachment: metadata }); }
    catch (error) {
      if (remote()) await global.AGIR_BACKEND.client.storage.from(BUCKET).remove([key]); else await local('delete', id);
      throw error;
    }
    return metadata;
  }
  async function get(id) {
    await AGIR.fin.ready();
    var metadata = find(id).attachment;
    if (remote()) {
      var response = await global.AGIR_BACKEND.client.storage.from(BUCKET).download(metadata.path);
      if (response.error) throw new Error('Não foi possível baixar o anexo: ' + response.error.message);
      return response.data;
    }
    var result = await local('get', id);
    if (!result || result.scope !== scope()) throw new Error('Este anexo não está disponível neste navegador.');
    return result.blob;
  }
  async function remove(id) {
    await AGIR.fin.ready();
    var reference = find(id), blob = await get(id), metadata = reference.attachment;
    await AGIR.fin.command('detachFile', { entryId: reference.entryId, attachmentId: id });
    try {
      if (remote()) { var response = await global.AGIR_BACKEND.client.storage.from(BUCKET).remove([metadata.path]); if (response.error) throw response.error; }
      else await local('delete', id);
    } catch (error) {
      // Mantém a referência recuperável quando o armazenamento recusa a exclusão.
      await AGIR.fin.command('attachFile', { entryId: reference.entryId, attachment: metadata });
      throw new Error('O anexo foi preservado porque sua exclusão não foi concluída.');
    }
    return blob.size;
  }
  AGIR.financeAttachments = {
    put: put, get: get, remove: remove,
    list: function (entryId) { var entry = (AGIR.fin.state().lancamentos || []).find(function (item) { return item.id === entryId; }); return entry ? (entry.anexos || []).slice() : []; },
    open: async function (id) { var blob = await get(id), metadata = find(id).attachment, url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = metadata.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000); }
  };
})(window);
