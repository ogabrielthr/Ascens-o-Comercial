/* ==========================================================================
   AGIR — store.js
   Camada de dados. Hoje persiste em localStorage; a interface pública
   (get/set/insert/update/remove/query/subscribe) é a mesma que um backend
   real usaria, então trocar por Supabase/API não toca nas telas.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};

  var KEY = 'ascensao.db.v1';
  var SCHEMA_VERSION = 1;

  var db = null;
  var subs = [];          // { keys:Set|null, fn }
  var saveTimer = null;
  var muted = 0;          // batch: silencia notificações
  var changedKeys = new Set();
  var revisions = new Map(), indexes = new Map();

  function backendReal() {
    return global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase';
  }

  function productionBase() {
    return {
      meta: { version: SCHEMA_VERSION, mode: 'supabase' },
      session: { userId: null, organizationId: null, role: null, autenticado: false },
      settings: {
        theme: 'dark', density: 'normal', sidebarCollapsed: false,
        modulo: null, moedaOculta: false, primeiroAcesso: false,
        humorAtivo: true, humorAdiado: {}, dashboardWidgets: []
      },
      empresa: {}, cargos: [], equipes: [], usuarios: [], pipelines: [],
      produtos: [], convenios: [], bancos: [], origens: [], motivosPerda: [],
      escalaHumor: [], fatoresHumor: [], humor: [], empresas: [], etiquetas: [],
      contatos: [], oportunidades: [], historicoEtapas: [], historicoAlteracoes: [], atividades: [], metas: [],
      mensagensLead: [], comprovantesPagamento: [], notificacoes: [],
      trilhas: [], progresso: [], progressoAulas: [],
      planosEstudo: [], planoTrilhas: [], categoriasArquivo: [], arquivos: [],
      automacoes: [], emails: [],
      financeiro: { planoContas: [], centrosCusto: [], lancamentos: [], orcamento: [] },
      gamificacao: {
        pontosAula: 0, pontosConclusaoTrilha: 0, pontosLigacao: 0,
        pontosAgendamento: 0, pontosProposta: 0, pontosVenda: 0
      }
    };
  }

  /* ---------- Persistência --------------------------------------------- */
  function load() {
    indexes.clear(); revisions.clear(); changedKeys.clear();
    if (backendReal()) {
      try { global.localStorage.removeItem(KEY); } catch (e) {}
      db = productionBase();
      return db;
    }
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { /* modo privado */ }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.meta && parsed.meta.version === SCHEMA_VERSION) {
          /* Evolução não destrutiva do modo demonstração: navegadores que já
             tinham a base v1 recebem as novas coleções sem perder cadastros. */
          ['progressoAulas', 'planosEstudo', 'planoTrilhas', 'historicoEtapas', 'historicoAlteracoes', 'comprovantesPagamento', 'notificacoes'].forEach(function (key) {
            if (!Array.isArray(parsed[key])) parsed[key] = [];
          });
          db = parsed;if(AGIR.agencyDomain)AGIR.agencyDomain.migrateDemo(db);
          save(true);
          return db;
        }
      } catch (e) { console.warn('[store] base corrompida, recriando', e); }
    }
    db = AGIR.seed.build();if(AGIR.agencyDomain)AGIR.agencyDomain.migrateDemo(db);
    save(true);
    return db;
  }

  var avisouFalha = false;

  function save(now) {
    if (backendReal()) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = null;
      try {
        var serialized = db;
        if (db && db.financeiro && db.financeiro.schemaVersion === 2 && db.financeiro.external !== false) {
          serialized = Object.assign({}, db, { financeiro: { schemaVersion: 2, external: true, revision: db.financeiro.revision || 0 } });
        }
        global.localStorage.setItem(KEY, JSON.stringify(serialized));
        avisouFalha = false;
      } catch (e) {
        console.warn('[store] falha ao salvar', e);
        /* Falhar em silêncio aqui seria o pior caso: o usuário continua
           trabalhando achando que salvou. Avisa uma vez por sessão. */
        if (!avisouFalha) {
          avisouFalha = true;
          var cota = e && (e.name === 'QuotaExceededError' || e.code === 22);
          if (AGIR.ui && AGIR.ui.toast) {
            AGIR.ui.toast({
              title: 'Não foi possível salvar neste navegador',
              text: cota
                ? 'O armazenamento local encheu. Exporte a base em Configurações > Geral > Dados e depois recrie os dados de exemplo.'
                : 'O navegador bloqueou o armazenamento local (janela anônima?). Suas alterações valem só até fechar a aba.',
              tone: 'bad', ms: 0
            });
          }
        }
      }
    };
    if (now) write(); else saveTimer = setTimeout(write, 250);
  }

  function reset() {
    var financial = db && db.financeiro && typeof db.financeiro === 'object' ? db.financeiro : null;
    indexes.clear();
    try { global.localStorage.removeItem(KEY); } catch (e) {}
    db = AGIR.seed.build();if(AGIR.agencyDomain)AGIR.agencyDomain.migrateDemo(db);
    if (financial) db.financeiro = financial;
    save(true);
    notify('*');
  }

  function exportJSON() {
    var exported = Object.assign({}, db);
    delete exported.financeiro;
    exported.meta = Object.assign({}, db.meta, { financialBackup: 'separate' });
    return JSON.stringify(exported, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || !parsed.meta) throw new Error('Arquivo inválido');
    if (db && db.financeiro) parsed.financeiro = db.financeiro;
    else if (parsed.financeiro && parsed.financeiro.schemaVersion === 2) throw new Error('Restaure os registros financeiros pelo Financeiro antes de importar este arquivo de dados gerais.');
    db = parsed;if(AGIR.agencyDomain)AGIR.agencyDomain.migrateDemo(db);
    indexes.clear();
    save(true);
    notify('*');
  }

  /* ---------- Pub/sub --------------------------------------------------- */
  /**
   * subscribe(fn) ou subscribe(['oportunidades','atividades'], fn)
   * devolve função de cancelamento.
   */
  function subscribe(keys, fn) {
    if (typeof keys === 'function') { fn = keys; keys = null; }
    var entry = { keys: keys ? keys.slice() : null, fn: fn };
    subs.push(entry);
    return function () {
      var i = subs.indexOf(entry);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  function publish(keys) {
    subs.slice().forEach(function (s) {
      if (!s.keys || keys.has('*') || s.keys.some(function (key) { return keys.has(key); })) {
        try { s.fn(keys.size === 1 ? Array.from(keys)[0] : Array.from(keys)); }
        catch (e) { console.error('[store] erro em subscriber', e); }
      }
    });
  }
  function notify(key) {
    revisions.set(key, (revisions.get(key) || 0) + 1);
    if (key === '*') indexes.clear();
    if (muted) { changedKeys.add(key); return; }
    publish(new Set([key]));
  }

  /** Agrupa várias mutações numa notificação só. */
  function batch(fn) {
    muted++;
    try { fn(); } finally {
      muted--;
      if (!muted && changedKeys.size) {
        var keys = changedKeys; changedKeys = new Set();
        save(); publish(keys);
      }
    }
  }

  /* ---------- Acesso ---------------------------------------------------- */
  function all() { return db; }

  /** get('oportunidades') | get('financeiro.lancamentos') */
  function get(path) {
    if (!path) return db;
    return path.split('.').reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, db);
  }

  function set(path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) {
      if (o[k] === undefined || o[k] === null) o[k] = {};
      return o[k];
    }, db);
    target[last] = value;
    indexes.delete(path);
    save();
    notify(keys[0] || last);
    return value;
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function insert(path, record) {
    var list = get(path);
    if (!Array.isArray(list)) throw new Error('[store] ' + path + ' não é lista');
    if (!record.id) record.id = uid(path.split('.').pop().slice(0, 3));
    list.unshift(record);
    var cached = indexes.get(path);
    if (cached && cached.list === list) { cached.ids.set(record.id, record); cached.length = list.length; }
    save();
    notify(path.split('.')[0]);
    return record;
  }

  function update(path, id, patch) {
    var list = get(path);
    var item = list && byId(path, id);
    if (!item) return null;
    if (Object.keys(patch).every(function (k) { return Object.is(item[k], patch[k]); })) return item;
    Object.keys(patch).forEach(function (k) { item[k] = patch[k]; });
    if (item.id !== id) indexes.delete(path);
    save();
    notify(path.split('.')[0]);
    return item;
  }

  function remove(path, id) {
    var list = get(path);
    if (!list) return null;
    var i = list.findIndex(function (r) { return r.id === id; });
    if (i < 0) return null;
    var gone = list.splice(i, 1)[0];
    var cached = indexes.get(path);
    if (cached && cached.list === list) { cached.ids.delete(id); cached.length = list.length; }
    save();
    notify(path.split('.')[0]);
    return gone;
  }

  /** Restaura um registro removido na posição original (usado pelo "desfazer"). */
  function restore(path, record, index) {
    var list = get(path);
    if (!list) return null;
    list.splice(index === undefined ? 0 : index, 0, record);
    var cached = indexes.get(path);
    if (cached && cached.list === list) { cached.ids.set(record.id, record); cached.length = list.length; }
    save();
    notify(path.split('.')[0]);
    return record;
  }

  function byId(path, id) {
    var list = get(path) || [];
    var cached = indexes.get(path);
    if (!cached || cached.list !== list || cached.length !== list.length) {
      cached = { list: list, length: list.length, ids: new Map(), keys: new Map() };
      list.forEach(function (r) { cached.ids.set(r.id, r); });
      indexes.set(path, cached);
    }
    return cached.ids.get(id) || null;
  }

  /** Índice id -> registro, para joins baratos em laços. */
  function indexBy(path, key) {
    byId(path, null);
    var cached = indexes.get(path), rev = revisions.get(path.split('.')[0]) || 0;
    key = key || 'id';
    var previous = cached.keys.get(key);
    if (previous && previous.revision === rev) return previous.map;
    var map = Object.create(null);
    (get(path) || []).forEach(function (r) { map[r[key]] = r; });
    cached.keys.set(key, { revision: rev, map: map });
    return map;
  }

  function query(path, pred) {
    return (get(path) || []).filter(pred || function () { return true; });
  }

  /* ---------- Sessão e preferências -------------------------------------- */
  function currentUser() {
    return byId('usuarios', get('session.userId')) || (get('usuarios') || [])[0] || null;
  }

  function pref(key, value) {
    if (value === undefined) return get('settings')[key];
    db.settings[key] = value;
    save();
    notify('settings');
    return value;
  }

  AGIR.store = {
    load: load, save: save, reset: reset,
    exportJSON: exportJSON, importJSON: importJSON,
    subscribe: subscribe, notify: notify, batch: batch,
    all: all, get: get, set: set, uid: uid,
    insert: insert, update: update, remove: remove, restore: restore,
    byId: byId, indexBy: indexBy, query: query,
    revision: function (path) { return revisions.get(path) || 0; },
    currentUser: currentUser, pref: pref,
    KEY: KEY
  };
})(window);
