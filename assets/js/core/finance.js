/* Ascensão Comercial — financeiro. Valores monetários canônicos em centavos.
 * O commit só publica a alteração depois da gravação atômica do repositório.
 */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var collections = ['planoContas', 'centrosCusto', 'lancamentos', 'orcamento', 'contasBancarias', 'contatos', 'transferencias', 'extrato', 'conciliacoes', 'fechamentos', 'auditoria'];
  var current = null, readyPromise = null, queue = Promise.resolve(), repository = null, sessionEpoch = 0;
  var DB_NAME = 'ascensao.finance.v2';
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function error(code, message) { var e = new Error(message); e.code = code; throw e; }
  function assert(condition, code, message) { if (!condition) error(code, message); }
  function uid(prefix) { return prefix + '_' + (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function today() { var parts = new Intl.DateTimeFormat('en-CA', { timeZone: global.AGIR_FINANCE_TIMEZONE || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()), value = {}; parts.forEach(function (p) { value[p.type] = p.value; }); return value.year + '-' + value.month + '-' + value.day; }
  function day(value) {
    assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'INVALID_DATE', 'Informe uma data válida (AAAA-MM-DD).');
    var p = value.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2], 12);
    assert(d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2], 'INVALID_DATE', 'A data informada não existe.');
    return value;
  }
  function month(value) { assert(typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value), 'INVALID_MONTH', 'Informe uma competência válida (AAAA-MM).'); return value; }
  function nextDay(value, amount) { var p = day(value).split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2] + amount, 12); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addMonths(value, count) {
    var p = day(value).split('-').map(Number), d = new Date(p[0], p[1] - 1 + count, 1, 12);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(Math.min(last, p[2]));
  }
  function daysBetween(a, b) { var x = day(a).split('-').map(Number), y = day(b).split('-').map(Number); return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000); }
  function integer(value, label, allowNegative) {
    assert(Number.isSafeInteger(value) && (allowNegative || value >= 0), 'INVALID_AMOUNT', (label || 'Valor') + ' deve ser um número inteiro de centavos válido.');
    return value;
  }
  function toCents(value) {
    if (typeof value === 'number') {
      assert(Number.isFinite(value), 'INVALID_AMOUNT', 'Valor monetário inválido.');
      if (Math.abs(value) < 0.005) return 0;
      assert(Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100, 'INVALID_AMOUNT', 'Valor monetário excede o limite suportado.');
      // A representação decimal evita o erro clássico 10.075 * 100 = 1007.499…
      return toCents(String(value));
    }
    assert(typeof value === 'string', 'INVALID_AMOUNT', 'Informe um valor monetário.');
    var s = value.trim().replace(/R\$|\s/g, ''), negative = /^\(.*\)$/.test(s);
    if (negative) s = '-' + s.slice(1, -1);
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    assert(/^[+-]?\d+(\.\d+)?$/.test(s), 'INVALID_AMOUNT', 'Valor monetário inválido.');
    var parts = s.replace(/^[+-]/, '').split('.'), fraction = (parts[1] || '') + '000';
    var result = Number(parts[0]) * 100 + Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);
    if (s[0] === '-') result *= -1;
    return integer(result, 'Valor', true);
  }
  function money(obj, field, legacy, fallback) { return obj[field] !== undefined ? integer(obj[field], field, true) : obj[legacy] !== undefined ? toCents(obj[legacy]) : (fallback || 0); }
  function total(values) { return values.reduce(function (a, b) { return integer(a + b, 'Total', true); }, 0); }
  function find(state, collection, id) { return state[collection].find(function (x) { return x.id === id; }); }
  function required(state, collection, id, name) { var x = find(state, collection, id); assert(x, 'NOT_FOUND', (name || 'Registro') + ' não encontrado.'); return x; }
  function name(value, label) { assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 500, 'INVALID_NAME', (label || 'Nome') + ' é obrigatório e deve ter até 500 caracteres.'); return value.trim(); }
  function actor() {
    var s = AGIR.store && AGIR.store.get ? AGIR.store.get('session') || {} : {};
    var user = AGIR.store && AGIR.store.currentUser ? AGIR.store.currentUser() || {} : {};
    return { id: s.userId || user.id || 'local', role: s.role || user.role || (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase' ? '' : 'admin') };
  }
  function admin() { assert(/^(admin|administrator|administrador|owner|finance|financeiro|gestor|diretor)$/i.test(actor().role), 'FORBIDDEN', 'Seu perfil não permite aprovar ou alterar controles financeiros.'); }
  function cash(p) { return p.valorCentavos + (p.jurosCentavos || 0) + (p.multaCentavos || 0) - (p.descontoCentavos || 0); }
  function activePayments(e) { return (e.pagamentos || []).filter(function (p) { return !p.estornado; }); }
  function paid(e) { return total(activePayments(e).map(function (p) { return p.valorCentavos; })); }
  function outstanding(e) { return e.cancelado ? 0 : e.valorCentavos - paid(e); }
  function approvalNeeded(s, e) { return e.tipo === 'despesa' && s.politicas.exigirAprovacao && e.valorCentavos >= s.politicas.limiteAprovacaoCentavos; }
  function locked(s, date) { if (!date) return; var m = date.slice(0, 7); assert(!s.fechamentos.some(function (x) { return x.month === m && x.fechado; }), 'PERIOD_CLOSED', 'O período ' + m + ' está fechado. Reabra-o antes de alterar.'); }
  function lockEntry(s, e) { locked(s, e.competencia); locked(s, e.vencimento); activePayments(e).forEach(function (p) { locked(s, p.data); }); }
  function defaults() {
    return { schemaVersion: 2, revision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      planoContas: [], centrosCusto: [], lancamentos: [], orcamento: [], contasBancarias: [], contatos: [], transferencias: [], extrato: [], conciliacoes: [], fechamentos: [], auditoria: [],
      politicas: { exigirAprovacao: false, limiteAprovacaoCentavos: 0 } };
  }
  function normalize(raw) {
    if (raw && raw.schemaVersion === 2 && !raw.external) {
      collections.forEach(function (key) { assert(Array.isArray(raw[key]), 'INVALID_STATE', 'O banco financeiro possui uma coleção ausente ou inválida: ' + key); });
      raw.lancamentos.forEach(function (e) { assert(Array.isArray(e.pagamentos), 'INVALID_STATE', 'O lançamento possui pagamentos inválidos.'); });
    }
    var s = Object.assign(defaults(), clone(raw || {}));
    collections.forEach(function (key) { assert(s[key] === undefined || Array.isArray(s[key]), 'INVALID_STATE', 'Coleção financeira inválida: ' + key); s[key] = s[key] || []; });
    s.schemaVersion = 2;
    s.storageMode = global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase' ? 'supabase' : 'indexeddb';
    s.revision = Number.isSafeInteger(s.revision) ? s.revision : 0;
    s.politicas = Object.assign({ exigirAprovacao: false, limiteAprovacaoCentavos: 0 }, s.politicas || {});
    // A conta de migração identifica os pagamentos do legado sem inventar saldo.
    if (!s.contasBancarias.length) s.contasBancarias.push({ id: 'bank_default', nome: 'Conta principal', banco: '', agencia: '', numero: '', saldoInicialCentavos: 0, dataSaldoInicial: '1900-01-01', ativo: true });
    s.contasBancarias.forEach(function (a) { a.saldoInicialCentavos = money(a, 'saldoInicialCentavos', 'saldoInicial'); a.dataSaldoInicial = a.dataSaldoInicial || '1900-01-01'; a.ativo = a.ativo !== false; });
    s.lancamentos.forEach(function (e) {
      e.valorCentavos = money(e, 'valorCentavos', 'valor'); e.valor = e.valorCentavos / 100;
      e.vencimento = e.vencimento || e.data; e.data = e.data || e.vencimento; e.competencia = (e.competencia || e.data || today()).slice(0, 7);
      e.contaBancariaId = e.contaBancariaId || s.contasBancarias[0].id;
      e.cancelado = !!e.cancelado || e.status === 'cancelado' || e.status === 'estornado';
      e.aprovacao = e.aprovacao || (approvalNeeded(s, e) ? 'pendente' : 'dispensada');
      if (!Array.isArray(e.pagamentos)) {
        var historicallyPaid = (e.status === 'realizado' || e.status === 'pago') && e.data <= today();
        e.pagamentos = historicallyPaid ? [{ id: 'migration_' + e.id, data: e.data, valorCentavos: e.valorCentavos, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, contaBancariaId: e.contaBancariaId, estornado: false, migrado: true }] : [];
        if (!historicallyPaid && (e.status === 'realizado' || e.status === 'pago')) e.status = 'previsto';
      }
      e.pagamentos.forEach(function (p) { p.jurosCentavos = p.jurosCentavos || 0; p.multaCentavos = p.multaCentavos || 0; p.descontoCentavos = p.descontoCentavos || 0; p.estornado = !!p.estornado; });
    });
    s.orcamento.forEach(function (b) { b.valorCentavos = money(b, 'valorCentavos', 'valor'); b.valor = b.valorCentavos / 100; });
    return s;
  }
  // Agency expense catalog. Existing custom names and DRE groups are preserved.
  var AGENCY_EXPENSES = [
    ['pc_imposto','Impostos sobre serviços de marketing','Deduções','Impostos sobre receita'],
    ['pc_estorno','Estornos e cancelamentos de contratos','Deduções','Estornos e cancelamentos'],
    ['pc_comissao','Comissões comerciais e indicações','Custo variável','Comissionamento do time'],
    ['pc_mkt','Marketing e mídia da agência','Custo variável','Marketing e tráfego pago'],
    ['pc_lead','Prospecção e aquisição de leads','Custo variável','Compra de mailing / leads'],
    ['pc_folha','Equipe fixa, salários e encargos','Custo fixo','Folha e encargos'],
    ['pc_alug','Escritório, coworking e condomínio','Custo fixo','Aluguel e condomínio'],
    ['pc_tel','Internet, telefonia e comunicação','Custo fixo','Telefonia e discador'],
    ['pc_soft','Ferramentas e assinaturas da agência','Custo fixo','Software e sistemas'],
    ['pc_admin','Contabilidade, jurídico e administração','Custo fixo','Administrativo e contabilidade'],
    ['pc_ag_design','Freelancers de design e direção de arte','Custo variável'],
    ['pc_ag_copy','Freelancers de redação e copywriting','Custo variável'],
    ['pc_ag_video','Produção audiovisual, fotografia e edição','Custo variável'],
    ['pc_ag_web','Desenvolvimento de sites e landing pages','Custo variável'],
    ['pc_ag_media','Verba de mídia de clientes','Custo variável'],
    ['pc_ag_creators','Influenciadores, creators e UGC','Custo variável'],
    ['pc_ag_print','Impressão e produção gráfica','Custo variável'],
    ['pc_ag_studio','Locação de estúdio e equipamentos','Custo variável'],
    ['pc_ag_hosting','Hospedagem e domínios de projetos','Custo variável'],
    ['pc_ag_rights','Bancos de imagem, trilhas e licenças','Custo variável'],
    ['pc_ag_travel','Deslocamentos e viagens de produção','Custo variável'],
    ['pc_ag_training','Cursos, capacitação e eventos do setor','Custo fixo'],
    ['pc_ag_office','Energia, limpeza e materiais de escritório','Custo fixo'],
    ['pc_ag_it','Manutenção de equipamentos e suporte de TI','Custo fixo'],
    ['pc_ag_benefits','Benefícios e bem-estar da equipe','Custo fixo'],
    ['pc_ag_fees','Tarifas bancárias e meios de pagamento','Despesas financeiras'],
    ['pc_ag_interest','Juros e multas financeiras','Despesas financeiras']
  ];
  function agencyExpenseTemplatePlan(s){
    var renamed=[],added=[];
    AGENCY_EXPENSES.forEach(function(item){var existing=s.planoContas.find(function(c){return c.id===item[0];});
      if(existing&&existing.tipo==='despesa'){
        if(item[3]&&existing.nome===item[3])renamed.push({id:existing.id,before:existing.nome,after:item[1]});
        return;
      }
      if(s.planoContas.some(function(c){return c.tipo==='despesa'&&fold(c.nome).trim()===fold(item[1]).trim();}))return;
      added.push({id:existing?uid('agency_category'):item[0],nome:item[1],tipo:'despesa',grupo:item[2]});
    });
    return {template:'marketing-agency-v1',renamed:renamed,added:added};
  }
  function applyAgencyExpenseTemplate(s){var plan=agencyExpenseTemplatePlan(s);plan.renamed.forEach(function(change){required(s,'planoContas',change.id).nome=change.after;});plan.added.forEach(function(category){s.planoContas.push(clone(category));});return plan;}

  function validate(s) {
    integer(s.revision, 'Revisão');
    assert(s.politicas && typeof s.politicas.exigirAprovacao === 'boolean', 'INVALID_STATE', 'Política de aprovação inválida.');
    integer(s.politicas.limiteAprovacaoCentavos, 'Limite de aprovação');
    collections.forEach(function (key) { var ids = new Set(); assert(Array.isArray(s[key]), 'INVALID_STATE', 'Coleção inválida: ' + key); s[key].forEach(function (x) { assert(x && typeof x.id === 'string' && x.id.length && !ids.has(x.id), 'DUPLICATE_ID', 'Identificador ausente ou duplicado em ' + key + '.'); ids.add(x.id); }); });
    s.planoContas.forEach(function (c) { name(c.nome); assert(c.tipo === 'receita' || c.tipo === 'despesa', 'INVALID_TYPE', 'Categoria deve ser receita ou despesa.'); });
    s.centrosCusto.concat(s.contatos).forEach(function (x) { name(x.nome); });
    s.contasBancarias.forEach(function (a) { name(a.nome); integer(a.saldoInicialCentavos, 'Saldo inicial', true); day(a.dataSaldoInicial); });
    s.lancamentos.forEach(function (e) {
      name(e.descricao, 'Descrição'); assert(e.tipo === 'receita' || e.tipo === 'despesa', 'INVALID_TYPE', 'Tipo de lançamento inválido.');
      assert(integer(e.valorCentavos, 'Valor') > 0, 'INVALID_AMOUNT', 'O valor do lançamento deve ser maior que zero.'); day(e.data); day(e.vencimento); month(e.competencia);
      var category = required(s, 'planoContas', e.contaId, 'Categoria'); assert(category.tipo === e.tipo, 'INVALID_CATEGORY', 'A categoria deve ter o mesmo tipo do lançamento.');
      if (e.centroId) required(s, 'centrosCusto', e.centroId, 'Centro de custo'); if (e.contatoId) required(s, 'contatos', e.contatoId, 'Contato');
      if (e.contaBancariaId) required(s, 'contasBancarias', e.contaBancariaId, 'Conta bancária');
      assert(['dispensada', 'pendente', 'aprovada', 'rejeitada'].includes(e.aprovacao), 'INVALID_APPROVAL', 'Situação de aprovação inválida.');
      var paymentIds = new Set();
      e.pagamentos.forEach(function (p) {
        assert(p.id && !paymentIds.has(p.id), 'DUPLICATE_PAYMENT', 'Identificador de pagamento duplicado.'); paymentIds.add(p.id);
        day(p.data); assert(integer(p.valorCentavos, 'Principal') > 0, 'INVALID_AMOUNT', 'Principal do pagamento deve ser maior que zero.');
        integer(p.jurosCentavos, 'Juros'); integer(p.multaCentavos, 'Multa'); integer(p.descontoCentavos, 'Desconto'); assert(cash(p) >= 0 && Number.isSafeInteger(cash(p)), 'INVALID_DISCOUNT', 'Desconto não pode exceder o principal mais os acréscimos.');
        var a = required(s, 'contasBancarias', p.contaBancariaId, 'Conta do pagamento'); assert(p.data >= a.dataSaldoInicial, 'BEFORE_OPENING_BALANCE', 'O pagamento antecede a data do saldo inicial da conta.');
      });
      assert(paid(e) <= e.valorCentavos, 'OVERPAYMENT', 'Os pagamentos excedem o principal do lançamento.');
      assert(!e.cancelado || !activePayments(e).length, 'PAID_ENTRY', 'Não é possível cancelar um lançamento com pagamentos ativos.');
      assert(!activePayments(e).length || ['dispensada', 'aprovada'].includes(e.aprovacao), 'APPROVAL_REQUIRED', 'O lançamento possui pagamentos sem aprovação válida.');
    });
    s.orcamento.forEach(function (b) { required(s, 'planoContas', b.contaId, 'Categoria'); if (b.centroId) required(s, 'centrosCusto', b.centroId, 'Centro de custo'); month(b.competencia); integer(b.valorCentavos, 'Orçamento'); });
    s.transferencias.forEach(function (t) { day(t.data); assert(t.origemId !== t.destinoId, 'SAME_ACCOUNT', 'Contas de origem e destino devem ser diferentes.'); var a = required(s, 'contasBancarias', t.origemId), b = required(s, 'contasBancarias', t.destinoId); assert(t.data >= a.dataSaldoInicial && t.data >= b.dataSaldoInicial, 'BEFORE_OPENING_BALANCE', 'Transferência anterior ao saldo inicial da conta.'); assert(integer(t.valorCentavos, 'Transferência') > 0, 'INVALID_AMOUNT', 'Valor da transferência deve ser maior que zero.'); });
    s.extrato.forEach(function (x) { required(s, 'contasBancarias', x.accountId, 'Conta do extrato'); day(x.date); integer(x.amountCentavos, 'Valor do extrato', true); });
    var matchedStatements = new Set(), matchedPayments = new Set();
    s.conciliacoes.filter(function (c) { return !c.cancelado; }).forEach(function (c) {
      var x = required(s, 'extrato', c.statementId, 'Linha de extrato'), e = required(s, 'lancamentos', c.entryId, 'Lançamento'); var p = e.pagamentos.find(function (p) { return p.id === c.paymentId && !p.estornado; });
      assert(p && x.accountId === p.contaBancariaId && x.amountCentavos === cash(p) * (e.tipo === 'receita' ? 1 : -1), 'RECONCILIATION_MISMATCH', 'A conciliação exige a mesma conta e o mesmo valor do pagamento.');
      assert(!matchedStatements.has(x.id) && !matchedPayments.has(e.id + '/' + p.id), 'ALREADY_RECONCILED', 'Cada linha de extrato e pagamento só pode ser conciliada uma vez.'); matchedStatements.add(x.id); matchedPayments.add(e.id + '/' + p.id);
    });
    s.fechamentos.forEach(function (f) { month(f.month); });
    total(s.contasBancarias.map(function (a) { return Math.abs(a.saldoInicialCentavos); }).concat(s.lancamentos.map(function (e) { return e.valorCentavos + total(activePayments(e).map(function (p) { return p.jurosCentavos + p.multaCentavos + p.descontoCentavos; })); }), s.orcamento.map(function (b) { return b.valorCentavos; }), s.transferencias.map(function (t) { return t.valorCentavos; })));
    return s;
  }
  function localRepository() {
    var dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { var e = new Error('O navegador não disponibilizou o banco financeiro. Habilite o armazenamento local.'); e.code = 'STORAGE_UNAVAILABLE'; reject(e); return; }
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('snapshots'); };
      req.onsuccess = function () { var db = req.result; db.onversionchange = function () { db.close(); }; resolve(db); };
      req.onerror = function () { reject(req.error || new Error('Não foi possível abrir o banco financeiro.')); };
      req.onblocked = function () { reject(new Error('Feche outras abas antigas para atualizar o banco financeiro.')); };
    });
    return {
      load: function () { return dbPromise.then(function (db) { return new Promise(function (resolve, reject) { var tx = db.transaction('snapshots', 'readonly'), req = tx.objectStore('snapshots').get('state'); req.onsuccess = function () { resolve(req.result || null); }; req.onerror = function () { reject(req.error); }; }); }); },
      save: function (state, options) { return dbPromise.then(function (db) { return new Promise(function (resolve, reject) {
        var tx = db.transaction('snapshots', 'readwrite'), store = tx.objectStore('snapshots'), read = store.get('state'), failure = null;
        read.onsuccess = function () { if ((read.result ? read.result.revision : 0) !== options.expectedRevision) { failure = new Error('Os dados foram alterados em outra aba. Atualize antes de salvar.'); failure.code = 'CONFLICT'; tx.abort(); return; } store.put(clone(state), 'state'); };
        tx.oncomplete = function () { resolve(clone(state)); }; tx.onerror = function () { reject(failure || tx.error || new Error('Não foi possível salvar o financeiro.')); }; tx.onabort = function () { reject(failure || tx.error || new Error('A gravação financeira foi cancelada.')); };
      }); }); }
    };
  }
  function publish(s) {
    current = clone(s);
    if (AGIR.store && AGIR.store.set) AGIR.store.set('financeiro', clone(s));
    if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new global.CustomEvent('ascensao:finance-updated', { detail: { revision: s.revision } }));
  }
  function ready() {
    if (readyPromise) return readyPromise;
    var epoch = sessionEpoch;
    readyPromise = (async function () {
      var production = global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase';
      assert(!production || global.AGIR_FINANCE_REPOSITORY, 'REPOSITORY_REQUIRED', 'Conecte o repositório financeiro da empresa antes de continuar.');
      var repo = global.AGIR_FINANCE_REPOSITORY || localRepository(); repository = repo;
      var raw = await repo.load();
      assert(epoch === sessionEpoch, 'SESSION_CHANGED', 'A sessão foi alterada. Abra novamente o financeiro.');
      if (!raw) {
        var legacy = production ? (repo.loadLegacy ? await repo.loadLegacy() : null) : (AGIR.store && AGIR.store.get ? AGIR.store.get('financeiro') : null);
        assert(epoch === sessionEpoch, 'SESSION_CHANGED', 'A sessão foi alterada. Abra novamente o financeiro.');
        assert(!legacy || !legacy.external, 'MISSING_DATABASE', 'O banco financeiro deste navegador não foi encontrado. Restaure um backup ou retorne ao navegador onde os dados foram salvos.');
        var migrated = normalize(legacy);if(!production&&AGIR.agencyDomain)AGIR.agencyDomain.applyFinance(migrated);if(!production&&migrated.planoContas.some(function(c){return c.id==='pc_mkt'&&c.tipo==='despesa';}))applyAgencyExpenseTemplate(migrated);validate(migrated);
        if (!production && legacy && !legacy.schemaVersion && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'demo' && AGIR.store && AGIR.store.get && AGIR.store.get('meta.seededAt')) migrated.seededFromDemo = true;
        migrated.revision = 1; migrated.updatedAt = new Date().toISOString();
        var saved = await repo.save(clone(migrated), { expectedRevision: 0 }); raw = saved && saved.schemaVersion === 2 ? saved : migrated;
      }
      assert(epoch === sessionEpoch, 'SESSION_CHANGED', 'A sessão foi alterada. Abra novamente o financeiro.');
      publish(validate(normalize(raw))); return clone(current);
    })().catch(function (e) { if (epoch === sessionEpoch) { readyPromise = null; repository = null; } throw e; });
    return readyPromise;
  }
  function state() { assert(current, 'NOT_READY', 'Aguarde o carregamento do financeiro.'); return clone(current); }
  function range(filters) {
    var f = filters || {}, m = f.month || f.competencia;
    if (m) { month(m); return { from: m + '-01', to: addMonths(m + '-01', 1) && nextDay(addMonths(m + '-01', 1), -1) }; }
    return { from: f.from ? day(f.from) : '1900-01-01', to: f.to ? day(f.to) : '9999-12-31' };
  }
  function inRange(date, r) { return date >= r.from && date <= r.to; }
  function entryMatches(e, f) {
    return (!f.accountId || (f.basis === 'caixa' ? activePayments(e).some(function (p) { return p.contaBancariaId === f.accountId; }) : e.contaBancariaId === f.accountId)) &&
      (!f.categoryId || e.contaId === f.categoryId) && (!f.costCenterId || e.centroId === f.costCenterId) && (!f.type || e.tipo === f.type) &&
      (!f.contactId || e.contatoId === f.contactId) && (!f.search || fold(e.descricao + ' ' + (e.contatoNome || '') + ' ' + (e.documento || '')).includes(fold(f.search)));
  }
  function enrich(s, e, asOf) {
    var copy = clone(e), p = paid(e), open = outstanding(e), due = e.vencimento < asOf && open > 0;
    copy.pagoCentavos = p; copy.abertoCentavos = open; copy.diasAtraso = due ? daysBetween(e.vencimento, asOf) : 0;
    copy.status = e.cancelado ? 'cancelado' : open === 0 ? 'pago' : due ? 'atrasado' : p > 0 ? 'parcial' : 'aberto';
    copy.categoriaNome = (find(s, 'planoContas', e.contaId) || {}).nome || ''; copy.centroNome = (find(s, 'centrosCusto', e.centroId) || {}).nome || '';
    copy.contatoNome = (find(s, 'contatos', e.contatoId) || {}).nome || ''; copy.contaBancariaNome = (find(s, 'contasBancarias', e.contaBancariaId) || {}).nome || '';
    return copy;
  }
  function entries(filters) {
    var s = current; assert(s, 'NOT_READY', 'Aguarde o carregamento do financeiro.'); var f = filters || {}, r = range(f), asOf = f.asOf ? day(f.asOf) : today();
    return s.lancamentos.map(function (e) { return enrich(s, e, asOf); }).filter(function (e) {
      var matchesDate = f.basis === 'caixa' ? activePayments(e).some(function (p) { return inRange(p.data, r) && (!f.accountId || p.contaBancariaId === f.accountId); }) : f.basis === 'vencimento' ? inRange(e.vencimento, r) : inRange(e.competencia + '-01', { from: r.from.slice(0, 7) + '-01', to: r.to });
      return matchesDate && entryMatches(e, f) && (!f.status || e.status === f.status) && (!f.approval || e.aprovacao === f.approval);
    }).sort(function (a, b) { return a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao); });
  }
  function balance(accountId, date) {
    assert(current, 'NOT_READY', 'Aguarde o carregamento do financeiro.'); var asOf = date ? day(date) : today(), s = current;
    if (accountId) required(s, 'contasBancarias', accountId, 'Conta');
    var amounts = s.contasBancarias.filter(function (a) { return (!accountId || a.id === accountId) && a.dataSaldoInicial <= asOf; }).map(function (a) { return a.saldoInicialCentavos; });
    s.lancamentos.filter(function (e) { return !e.cancelado; }).forEach(function (e) { activePayments(e).forEach(function (p) { if (p.data <= asOf && (!accountId || p.contaBancariaId === accountId)) amounts.push(cash(p) * (e.tipo === 'receita' ? 1 : -1)); }); });
    s.transferencias.filter(function (t) { return !t.cancelado && t.data <= asOf; }).forEach(function (t) { if (accountId === t.origemId) amounts.push(-t.valorCentavos); if (accountId === t.destinoId) amounts.push(t.valorCentavos); });
    return total(amounts);
  }
  function realizedAmount(e, f) { var r = range(f); return total(activePayments(e).filter(function (p) { return inRange(p.data, r) && (!f.accountId || p.contaBancariaId === f.accountId); }).map(cash)); }
  function financialAdjustments(filters) {
    var f = filters || {}, r = range(f), adjustments = [];
    current.lancamentos.forEach(function (e) {
      var enriched = enrich(current, e, f.asOf || today());
      if (e.cancelado || e.aprovacao === 'rejeitada' || !entryMatches(enriched, Object.assign({}, f, { accountId: null })) || f.status && enriched.status !== f.status || f.approval && e.aprovacao !== f.approval) return;
      activePayments(e).filter(function (p) { return inRange(p.data, r) && (!f.accountId || p.contaBancariaId === f.accountId); }).forEach(function (p) {
        var effect = (cash(p) - p.valorCentavos) * (e.tipo === 'receita' ? 1 : -1);
        if (effect) adjustments.push({ entry: e, amount: Math.abs(effect), direction: effect > 0 ? 'income' : 'expense' });
      });
    });
    return adjustments;
  }
  function summary(filters) {
    var f = filters || {}, list = entries(f).filter(function (e) { return !e.cancelado && e.aprovacao !== 'rejeitada'; });
    var income = 0, expenses = 0, receive = 0, pay = 0, overdue = 0;
    list.forEach(function (e) { var value = f.basis === 'caixa' ? realizedAmount(e, f) : e.valorCentavos;
      if (e.tipo === 'receita') { income += value; receive += e.abertoCentavos; } else { expenses += value; pay += e.abertoCentavos; } if (e.diasAtraso > 0) overdue += e.abertoCentavos;
    });
    var incomeAdjustments = 0, expenseAdjustments = 0;
    if (f.basis !== 'caixa') financialAdjustments(f).forEach(function (a) { if (a.direction === 'income') incomeAdjustments += a.amount; else expenseAdjustments += a.amount; });
    income += incomeAdjustments; expenses += expenseAdjustments;
    var r = range(f), asOf = r.to < today() ? r.to : today();
    return { saldoCentavos: balance(f.accountId, asOf), receitasCentavos: income, despesasCentavos: expenses, resultadoCentavos: income - expenses, ajustesReceitasCentavos: incomeAdjustments, ajustesDespesasCentavos: expenseAdjustments, aReceberCentavos: receive, aPagarCentavos: pay, atrasadosCentavos: overdue, entradas: list.filter(function (e) { return e.tipo === 'receita'; }).length, saidas: list.filter(function (e) { return e.tipo === 'despesa'; }).length, quantidade: list.length };
  }
  function dre(filters) {
    var f = filters || {}, list = entries(f).filter(function (e) { return !e.cancelado && e.aprovacao !== 'rejeitada'; }), groups = { gross: [], deductions: [], costs: [], operations: [], depreciation: [], financialIncome: [], financialExpense: [], incomeTax: [] };
    list.forEach(function (e) {
      var category = find(current, 'planoContas', e.contaId), group = fold(category.grupo || ''); var key;
      if (e.tipo === 'receita') key = /financeir|nao operacional/.test(group) ? 'financialIncome' : 'gross';
      else if (/dedu/.test(group)) key = 'deductions'; else if (/depreci|amortiza/.test(group)) key = 'depreciation'; else if (/lucro|irpj|csll/.test(group)) key = 'incomeTax'; else if (/financeir/.test(group)) key = 'financialExpense'; else if (/variavel|custo direto|cmv|servico prestado/.test(group)) key = 'costs'; else key = 'operations';
      groups[key].push({ e: e, amount: f.basis === 'caixa' ? realizedAmount(e, f) : e.valorCentavos });
    });
    var sums = {}; Object.keys(groups).forEach(function (k) { sums[k] = total(groups[k].map(function (x) { return x.amount; })); });
    // Acréscimos/descontos de baixas são financeiros; o principal permanece na competência.
    if (f.basis !== 'caixa') financialAdjustments(f).forEach(function (a) { var key = a.direction === 'income' ? 'financialIncome' : 'financialExpense'; groups[key].push({ e: a.entry, amount: a.amount }); sums[key] += a.amount; });
    var gross = sums.gross, net = gross - sums.deductions, profit = net - sums.costs, ebitda = profit - sums.operations, final = ebitda - sums.depreciation + sums.financialIncome - sums.financialExpense - sums.incomeTax;
    function row(key, label, amount, kind, keys) { return { key: key, label: label, centavos: amount, kind: kind, entryIds: Array.from(new Set((keys || [key]).reduce(function (a, k) { return a.concat((groups[k] || []).map(function (x) { return x.e.id; })); }, []))) }; }
    return { rows: [row('gross', '(=) Receita bruta', gross, 'total'), row('deductions', '(-) Deduções e impostos sobre receita', -sums.deductions, 'detail'), row('net', '(=) Receita líquida', net, 'total', ['gross', 'deductions']), row('costs', '(-) Custos diretos e variáveis', -sums.costs, 'detail'), row('profit', '(=) Lucro bruto', profit, 'total', ['gross', 'deductions', 'costs']), row('operations', '(-) Despesas operacionais', -sums.operations, 'detail'), row('ebitda', '(=) EBITDA', ebitda, 'total', ['gross', 'deductions', 'costs', 'operations']), row('depreciation', '(-) Depreciação e amortização', -sums.depreciation, 'detail'), row('financialIncome', '(+) Receitas financeiras e outras receitas', sums.financialIncome, 'detail'), row('financialExpense', '(-) Despesas financeiras', -sums.financialExpense, 'detail'), row('incomeTax', '(-) Impostos sobre o lucro', -sums.incomeTax, 'detail'), row('final', '(=) Lucro líquido', final, 'total', Object.keys(groups))], receitaBrutaCentavos: gross, receitaLiquidaCentavos: net, lucroBrutoCentavos: profit, ebitdaCentavos: ebitda, lucroLiquidoCentavos: final, margemBruta: net ? profit / net * 100 : 0, margemEbitda: net ? ebitda / net * 100 : 0, margemLiquida: net ? final / net * 100 : 0 };
  }
  function cashflow(filters) {
    assert(current, 'NOT_READY', 'Aguarde o carregamento do financeiro.'); var f = Object.assign({}, filters || {}); if (!f.month && !f.from && !f.to) f.month = today().slice(0, 7);
    var r = range(f); assert(r.from <= r.to && daysBetween(r.from, r.to) <= 1096, 'INVALID_RANGE', 'Selecione até três anos para o fluxo de caixa.');
    var map = {}, rows = [], initial = balance(f.accountId, nextDay(r.from, -1));
    for (var d = r.from; d <= r.to; d = nextDay(d, 1)) { var row = { date: d, entradasRealCentavos: 0, saidasRealCentavos: 0, entradasPlanCentavos: 0, saidasPlanCentavos: 0, transferenciasCentavos: 0, ajusteInicialCentavos: 0 }; map[d] = row; rows.push(row); }
    current.contasBancarias.filter(function (a) { return (!f.accountId || a.id === f.accountId) && inRange(a.dataSaldoInicial, r); }).forEach(function (a) { map[a.dataSaldoInicial].ajusteInicialCentavos += a.saldoInicialCentavos; });
    current.lancamentos.filter(function (e) { return !e.cancelado && e.aprovacao !== 'rejeitada' && entryMatches(enrich(current, e, today()), Object.assign({}, f, { accountId: null })); }).forEach(function (e) {
      var direction = e.tipo === 'receita' ? 'entradas' : 'saidas';
      activePayments(e).forEach(function (p) { if (inRange(p.data, r) && (!f.accountId || p.contaBancariaId === f.accountId)) map[p.data][direction + 'RealCentavos'] += cash(p); });
      var open = outstanding(e), due = e.vencimento < r.from ? r.from : e.vencimento;
      if (open > 0 && due <= r.to && (!f.accountId || e.contaBancariaId === f.accountId)) map[due][direction + 'PlanCentavos'] += open;
    });
    current.transferencias.filter(function (t) { return !t.cancelado && inRange(t.data, r); }).forEach(function (t) { if (f.accountId === t.origemId) map[t.data].transferenciasCentavos -= t.valorCentavos; if (f.accountId === t.destinoId) map[t.data].transferenciasCentavos += t.valorCentavos; });
    var real = initial, projected = initial, minimum = initial;
    rows.forEach(function (row) { real += row.entradasRealCentavos - row.saidasRealCentavos + row.transferenciasCentavos + row.ajusteInicialCentavos; projected += row.entradasRealCentavos - row.saidasRealCentavos + row.transferenciasCentavos + row.ajusteInicialCentavos + row.entradasPlanCentavos - row.saidasPlanCentavos; row.saldoRealCentavos = real; row.saldoProjetadoCentavos = projected; minimum = Math.min(minimum, projected); });
    return { rows: rows, saldoInicialCentavos: initial, saldoAtualCentavos: balance(f.accountId, r.to < today() ? r.to : today()), saldoFinalCentavos: projected, menorSaldoCentavos: minimum };
  }
  function report(kind, filters) {
    var f = filters || {};
    if (kind === 'entries') return entries(f);
    if (kind === 'dre') return dre(f);
    if (kind === 'cashflow') return cashflow(f);
    if (kind === 'audit') return state().auditoria.filter(function (a) { return (!f.search || fold(a.action + ' ' + a.actorId + ' ' + JSON.stringify(a.details)).includes(fold(f.search))) && inRange(a.at.slice(0, 10), range(f)); }).reverse();
    if (kind === 'aging') {
      var bins = [{ faixa: 'A vencer', min: 0, max: 0 }, { faixa: '1 a 7 dias', min: 1, max: 7 }, { faixa: '8 a 30 dias', min: 8, max: 30 }, { faixa: '31 a 60 dias', min: 31, max: 60 }, { faixa: '61 a 90 dias', min: 61, max: 90 }, { faixa: 'Acima de 90 dias', min: 91, max: Infinity }];
      bins.forEach(function (b) { b.aReceberCentavos = 0; b.aPagarCentavos = 0; b.quantidade = 0; b.entryIds = []; });
      entries(f).filter(function (e) { return e.abertoCentavos > 0 && !e.cancelado && e.aprovacao !== 'rejeitada'; }).forEach(function (e) { var b = bins.find(function (b) { return e.diasAtraso >= b.min && e.diasAtraso <= b.max; }); b[e.tipo === 'receita' ? 'aReceberCentavos' : 'aPagarCentavos'] += e.abertoCentavos; b.quantidade++; b.entryIds.push(e.id); }); return bins;
    }
    if (kind === 'categories') return current.planoContas.map(function (c) { var list = entries(Object.assign({}, f, { categoryId: c.id })).filter(function (e) { return !e.cancelado && e.aprovacao !== 'rejeitada'; }); return { id: c.id, nome: c.nome, tipo: c.tipo, centavos: total(list.map(function (e) { return f.basis === 'caixa' ? realizedAmount(e, f) : e.valorCentavos; })), entryIds: list.map(function (e) { return e.id; }) }; });
    if (kind === 'budget') return current.orcamento.filter(function (b) { return inRange(b.competencia + '-01', range(f)) && (!f.categoryId || b.contaId === f.categoryId) && (!f.costCenterId || b.centroId === f.costCenterId); }).map(function (b) {
      var actual = total(entries({ month: b.competencia, categoryId: b.contaId, costCenterId: b.centroId, basis: f.basis || 'competencia' }).filter(function (e) { return !e.cancelado && e.aprovacao !== 'rejeitada'; }).map(function (e) { return f.basis === 'caixa' ? realizedAmount(e, { month: b.competencia }) : e.valorCentavos; }));
      return Object.assign({}, clone(b), { categoriaNome: (find(current, 'planoContas', b.contaId) || {}).nome || '', realizadoCentavos: actual, desvioCentavos: actual - b.valorCentavos, percentual: b.valorCentavos ? actual / b.valorCentavos * 100 : null });
    });
    error('UNKNOWN_REPORT', 'Relatório desconhecido: ' + kind);
  }
  function fold(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function hash(value) { var h = [2166136261, 3339675911, 2246822507, 3266489909]; for (var i = 0; i < value.length; i++) for (var j = 0; j < h.length; j++) { h[j] ^= value.charCodeAt(i) + j * 7919; h[j] = Math.imul(h[j], 16777619 + j * 2); } return h.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join(''); }
  function statementDate(value) { var s = String(value || '').trim(), match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (match) return day(match[3] + '-' + match[2] + '-' + match[1]); if (/^\d{8}/.test(s)) return day(s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8)); return day(s.slice(0, 10)); }
  function csvRows(text, delimiter) {
    var rows = [], row = [], field = '', quoted = false;
    for (var i = 0; i < text.length; i++) { var c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; } else if (c === delimiter && !quoted) { row.push(field); field = ''; } else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(function (x) { return x.trim(); })) rows.push(row); row = []; field = ''; } else field += c; }
    assert(!quoted, 'INVALID_CSV', 'O CSV possui aspas sem fechamento.'); row.push(field); if (row.some(function (x) { return x.trim(); })) rows.push(row); return rows;
  }
  function parseStatement(text, format) {
    assert(typeof text === 'string' && text.trim(), 'EMPTY_STATEMENT', 'O extrato está vazio.'); assert(text.length <= 25 * 1024 * 1024, 'FILE_TOO_LARGE', 'Importe extratos de até 25 MB por vez.');
    var items = [], type = (format || (/<OFX/i.test(text) ? 'ofx' : 'csv')).toLowerCase();
    if (type === 'ofx') {
      var blocks = text.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi) || [];
      blocks.forEach(function (b) { function tag(t) { var m = b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; } var amount = tag('TRNAMT'); assert(amount, 'INVALID_OFX', 'Linha OFX sem valor.'); items.push({ externalId: tag('FITID') || null, date: statementDate(tag('DTPOSTED')), description: [tag('NAME'), tag('MEMO')].filter(Boolean).join(' — ') || 'Movimentação bancária', amountCentavos: toCents(amount) }); });
    } else {
      assert(type === 'csv', 'INVALID_FORMAT', 'Use um extrato CSV ou OFX.'); var clean = text.replace(/^\uFEFF/, ''), header = clean.split(/\r?\n/)[0], delimiter = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',', rows = csvRows(clean, delimiter);
      assert(rows.length >= 2, 'INVALID_CSV', 'O CSV deve conter cabeçalho e movimentações.'); var names = rows.shift().map(function (x) { return fold(x).replace(/[^a-z0-9]/g, ''); });
      function column(options) { return names.findIndex(function (x) { return options.includes(x); }); }
      var dateCol = column(['data', 'date', 'datamovimento', 'datalancamento', 'datatransacao']), descCol = column(['descricao', 'description', 'historico', 'memo', 'lancamento', 'titulo']), valueCol = column(['valor', 'value', 'amount', 'valorr', 'valorbrl', 'valortransacao']), debitCol = column(['debito', 'debit', 'saida']), creditCol = column(['credito', 'credit', 'entrada']), idCol = column(['id', 'fitid', 'identificador', 'idtransacao', 'documento']), typeCol = column(['tipo', 'type', 'natureza']);
      assert(dateCol >= 0 && (valueCol >= 0 || debitCol >= 0 || creditCol >= 0), 'INVALID_CSV_HEADERS', 'O CSV precisa das colunas Data e Valor (ou Crédito/Débito).');
      rows.forEach(function (r, index) { try {
        var amount = valueCol >= 0 ? toCents(r[valueCol]) : (creditCol >= 0 && r[creditCol] ? Math.abs(toCents(r[creditCol])) : 0) - (debitCol >= 0 && r[debitCol] ? Math.abs(toCents(r[debitCol])) : 0);
        if (typeCol >= 0 && /^(d|debito|saida|despesa)$/.test(fold(r[typeCol]))) amount = -Math.abs(amount);
        items.push({ externalId: idCol >= 0 && r[idCol] ? r[idCol].trim() : null, date: statementDate(r[dateCol]), description: descCol >= 0 ? r[descCol].trim() : 'Movimentação bancária', amountCentavos: amount });
      } catch (e) { e.message = 'Linha ' + (index + 2) + ': ' + e.message; throw e; } });
    }
    assert(items.length, 'EMPTY_STATEMENT', 'Nenhuma movimentação válida foi encontrada no extrato.');
    var seen = {}, external = new Set(); return items.filter(function (x) { if (x.amountCentavos === 0) return false; if (!x.externalId) return true; if (external.has(x.externalId)) return false; external.add(x.externalId); return true; }).map(function (x) { var base = x.date + '|' + x.amountCentavos + '|' + fold(x.description).replace(/\s+/g, ' ').trim(); seen[base] = (seen[base] || 0) + 1; x.fingerprint = x.externalId ? 'external:' + x.externalId : 'csv:' + hash(base) + ':' + seen[base]; return x; });
  }
  function setRecord(s, collection, payload, prefix) { var record = payload.id ? required(s, collection, payload.id) : null; if (record) Object.assign(record, payload); else { record = Object.assign({ id: uid(prefix) }, payload); s[collection].push(record); } return record; }
  function settle(s, payload) {
    var e = required(s, 'lancamentos', payload.id, 'Lançamento'); lockEntry(s, e); assert(!e.cancelado, 'CANCELLED_ENTRY', 'O lançamento está cancelado.');
    assert(e.aprovacao !== 'rejeitada' && (!approvalNeeded(s, e) || e.aprovacao === 'aprovada'), 'APPROVAL_REQUIRED', 'A despesa precisa ser aprovada antes do pagamento.');
    var d = day(payload.data || today()); locked(s, d); assert(d <= today(), 'FUTURE_PAYMENT', 'Pagamentos futuros devem permanecer como previsão.');
    var a = required(s, 'contasBancarias', payload.contaBancariaId || e.contaBancariaId, 'Conta bancária'); assert(a.ativo !== false, 'INACTIVE_ACCOUNT', 'A conta bancária está inativa.');
    var principal = payload.valorCentavos === undefined ? outstanding(e) : integer(payload.valorCentavos, 'Principal'); assert(principal > 0 && principal <= outstanding(e), 'OVERPAYMENT', 'Informe um principal maior que zero e até o saldo em aberto.');
    var p = { id: uid('pay'), data: d, valorCentavos: principal, jurosCentavos: integer(payload.jurosCentavos || 0, 'Juros'), multaCentavos: integer(payload.multaCentavos || 0, 'Multa'), descontoCentavos: integer(payload.descontoCentavos || 0, 'Desconto'), contaBancariaId: a.id, estornado: false, actorId: actor().id, createdAt: new Date().toISOString() };
    assert(cash(p) >= 0, 'INVALID_DISCOUNT', 'Desconto não pode exceder o principal e acréscimos.'); e.pagamentos.push(p); return p;
  }
  function mutate(s, action, p) {
    var e, record, collection, old;
    if (action === 'entry.save') {
      e = p.id ? required(s, 'lancamentos', p.id, 'Lançamento') : null;
      if (e) { lockEntry(s, e); assert(!e.cancelado, 'CANCELLED_ENTRY', 'Um lançamento cancelado não pode ser editado.'); }
      var data = Object.assign({}, e || {}, p); delete data.parcelas; delete data.recorrencia;
      data.descricao = name(data.descricao, 'Descrição'); data.tipo = data.tipo || 'despesa'; data.valorCentavos = p.valorCentavos !== undefined ? integer(p.valorCentavos, 'Valor') : p.valor !== undefined ? toCents(p.valor) : data.valorCentavos;
      data.vencimento = day(data.vencimento || data.data || today()); data.data = day(data.data || data.vencimento); data.competencia = month(data.competencia || data.vencimento.slice(0, 7)); data.contaBancariaId = data.contaBancariaId || s.contasBancarias[0].id;
      locked(s, data.competencia); locked(s, data.vencimento);
      var installments = p.parcelas === undefined ? 1 : p.parcelas, recurrence = p.recorrencia === undefined ? 1 : p.recorrencia;
      assert(Number.isInteger(installments) && installments >= 1 && installments <= 360 && Number.isInteger(recurrence) && recurrence >= 1 && recurrence <= 360 && (installments === 1 || recurrence === 1), 'INVALID_INSTALLMENTS', 'Use de 1 a 360 parcelas ou recorrências, sem combinar as duas opções.');
      assert(!e || (installments === 1 && recurrence === 1), 'INVALID_INSTALLMENTS', 'Parcelamento e recorrência só são definidos na criação.');
      assert(data.valorCentavos > 0 && data.valorCentavos >= installments, 'INVALID_AMOUNT', 'Cada parcela deve ter ao menos um centavo.');
      // Não aceita pagamentos/status/aprovação forjados pela edição do título.
      data.pagamentos = e ? clone(e.pagamentos) : []; data.cancelado = false;
      var material = !e || ['tipo', 'valorCentavos', 'contaId', 'centroId', 'contatoId', 'contaBancariaId', 'vencimento', 'competencia'].some(function (k) { return e[k] !== data[k]; });
      if (e && activePayments(e).length && material) error('PAID_ENTRY', 'Estorne os pagamentos antes de alterar valor, classificação ou datas do título.');
      data.aprovacao = e && !material ? e.aprovacao : approvalNeeded(s, data) ? 'pendente' : 'dispensada';
      var count = Math.max(installments, recurrence), seriesId = count > 1 ? uid('series') : null, result = [];
      for (var i = 0; i < count; i++) {
        record = clone(data); record.id = e ? e.id : uid('entry'); record.createdAt = e ? e.createdAt : new Date().toISOString(); record.updatedAt = new Date().toISOString();
        if (count > 1) { record.serieId = seriesId; record.parcela = i + 1; record.totalParcelas = installments > 1 ? count : null; record.recorrente = recurrence > 1; record.vencimento = addMonths(data.vencimento, i); record.data = addMonths(data.data, i); record.competencia = addMonths(data.competencia + '-01', i).slice(0, 7); record.descricao = data.descricao + ' (' + (i + 1) + '/' + count + ')'; }
        if (installments > 1) record.valorCentavos = Math.floor(data.valorCentavos / count) + (i < data.valorCentavos % count ? 1 : 0);
        record.valor = record.valorCentavos / 100; record.aprovacao = e && !material ? e.aprovacao : approvalNeeded(s, record) ? 'pendente' : 'dispensada'; locked(s, record.competencia); locked(s, record.vencimento);
        if (e) Object.assign(e, record); else s.lancamentos.push(record); result.push(record);
      }
      return count === 1 ? result[0] : result;
    }
    if (action === 'entry.delete') { e = required(s, 'lancamentos', p.id); lockEntry(s, e); assert(!activePayments(e).length, 'PAID_ENTRY', 'Estorne os pagamentos antes de cancelar o título.'); e.cancelado = true; e.canceladoEm = new Date().toISOString(); return e; }
    if (action === 'entry.settle') return settle(s, p);
    if (action === 'entry.reversePayment') {
      e = required(s, 'lancamentos', p.id); lockEntry(s, e); var payment = e.pagamentos.find(function (x) { return x.id === p.paymentId; }); assert(payment && !payment.estornado, 'PAYMENT_NOT_FOUND', 'Pagamento ativo não encontrado.'); name(p.motivo, 'Motivo do estorno');
      payment.estornado = true; payment.estornadoEm = new Date().toISOString(); payment.motivoEstorno = p.motivo; s.conciliacoes.filter(function (c) { return c.paymentId === payment.id && c.entryId === e.id && !c.cancelado; }).forEach(function (c) { c.cancelado = true; c.motivo = 'Estorno do pagamento'; }); return payment;
    }
    if (action === 'entry.approve' || action === 'entry.reject') { admin(); e = required(s, 'lancamentos', p.id); lockEntry(s, e); assert(!e.cancelado && !activePayments(e).length, 'PAID_ENTRY', 'Não é possível alterar a aprovação de título cancelado ou com pagamentos.'); e.aprovacao = action === 'entry.approve' ? 'aprovada' : 'rejeitada'; e.aprovadoPor = actor().id; e.aprovadoEm = new Date().toISOString(); e.motivoAprovacao = p.motivo || ''; return e; }
    if(action==='workspace.applyAgencyContext'){admin();assert(AGIR.agencyDomain,'UPDATE_REQUIRED','Atualize a página para carregar o contexto da agência.');return AGIR.agencyDomain.applyFinance(s);}
    if(action==='category.applyAgencyTemplate'){admin();return applyAgencyExpenseTemplate(s);}
    var lookup = { account: ['contasBancarias', 'bank'], contact: ['contatos', 'contact'], category: ['planoContas', 'category'], costCenter: ['centrosCusto', 'center'] }, parts = action.split('.');
    if (lookup[parts[0]]) {
      collection = lookup[parts[0]][0];
      if (parts[1] === 'save') {
        var allowedFields = { account: ['nome', 'banco', 'agencia', 'numero', 'saldoInicialCentavos', 'dataSaldoInicial', 'ativo'], contact: ['nome', 'tipo', 'documento', 'email', 'telefone'], category: ['nome', 'tipo', 'grupo'], costCenter: ['nome'] }[parts[0]], input = {};
        if (p.id) input.id = p.id; allowedFields.forEach(function (k) { if (p[k] !== undefined) input[k] = p[k]; });
        old = p.id ? required(s, collection, p.id) : null;
        if (collection === 'planoContas' && old && ((p.tipo && p.tipo !== old.tipo) || (p.grupo && p.grupo !== old.grupo))) s.lancamentos.filter(function (x) { return x.contaId === old.id; }).forEach(function (x) { lockEntry(s, x); });
        if (collection === 'contasBancarias') {
          admin(); if (!old) { input.saldoInicialCentavos = input.saldoInicialCentavos || 0; input.dataSaldoInicial = input.dataSaldoInicial || today(); input.ativo = input.ativo !== false; }
          if (old && ((p.saldoInicialCentavos !== undefined && p.saldoInicialCentavos !== old.saldoInicialCentavos) || (p.dataSaldoInicial && p.dataSaldoInicial !== old.dataSaldoInicial))) {
            locked(s, old.dataSaldoInicial); locked(s, input.dataSaldoInicial || old.dataSaldoInicial);
            assert(!s.lancamentos.some(function (x) { return activePayments(x).some(function (pay) { return pay.contaBancariaId === old.id; }); }) && !s.transferencias.some(function (x) { return !x.cancelado && (x.origemId === old.id || x.destinoId === old.id); }), 'ACCOUNT_HAS_MOVEMENTS', 'A conta já tem movimentos. Registre um lançamento de ajuste para preservar o histórico.');
          }
          if (input.dataSaldoInicial) locked(s, input.dataSaldoInicial);
          if ((!old || p.saldoInicialCentavos !== undefined && p.saldoInicialCentavos !== old.saldoInicialCentavos || p.dataSaldoInicial && p.dataSaldoInicial !== old.dataSaldoInicial) && (input.saldoInicialCentavos || old && old.saldoInicialCentavos)) assert(!s.fechamentos.some(function (x) { return x.fechado && x.month >= (input.dataSaldoInicial || old.dataSaldoInicial).slice(0, 7); }), 'PERIOD_CLOSED', 'Esse saldo inicial alteraria um período já fechado.');
        }
        return setRecord(s, collection, input, lookup[parts[0]][1]);
      }
      if (parts[1] === 'delete') {
        record = required(s, collection, p.id);
        if (collection === 'contasBancarias') { admin(); assert(s.contasBancarias.length > 1, 'LAST_ACCOUNT', 'Mantenha pelo menos uma conta bancária.'); assert(!s.lancamentos.some(function (x) { return x.contaBancariaId === p.id || x.pagamentos.some(function (pay) { return pay.contaBancariaId === p.id; }); }) && !s.transferencias.some(function (x) { return x.origemId === p.id || x.destinoId === p.id; }) && !s.extrato.some(function (x) { return x.accountId === p.id; }), 'REFERENCED_RECORD', 'A conta possui movimentos ou títulos vinculados. Desative-a em vez de excluir.'); }
        else { var field = { planoContas: 'contaId', centrosCusto: 'centroId', contatos: 'contatoId' }[collection]; assert(!s.lancamentos.some(function (x) { return x[field] === p.id; }) && !s.orcamento.some(function (x) { return x[field] === p.id; }), 'REFERENCED_RECORD', 'O cadastro já está vinculado a lançamentos ou orçamento.'); }
        s[collection] = s[collection].filter(function (x) { return x.id !== p.id; }); return record;
      }
    }
    if (action === 'transfer.create') { day(p.data || today()); locked(s, p.data || today()); assert((p.data || today()) <= today(), 'FUTURE_PAYMENT', 'Transferências futuras devem aguardar a data de efetivação.'); var from = required(s, 'contasBancarias', p.origemId), dest = required(s, 'contasBancarias', p.destinoId); assert(from.ativo !== false && dest.ativo !== false, 'INACTIVE_ACCOUNT', 'Use contas bancárias ativas.'); record = { id: uid('transfer'), origemId: p.origemId, destinoId: p.destinoId, data: p.data || today(), valorCentavos: integer(p.valorCentavos, 'Transferência'), descricao: p.descricao || 'Transferência entre contas', cancelado: false }; s.transferencias.push(record); return record; }
    if (action === 'transfer.cancel') { record = required(s, 'transferencias', p.id); locked(s, record.data); name(p.motivo, 'Motivo do estorno'); assert(!record.cancelado, 'ALREADY_CANCELLED', 'A transferência já foi estornada.'); record.cancelado = true; record.motivo = p.motivo; return record; }
    if (action === 'budget.save') { locked(s, month(p.competencia)); if (p.id) locked(s, required(s, 'orcamento', p.id).competencia); var duplicate = s.orcamento.find(function (x) { return x.id !== p.id && x.contaId === p.contaId && (x.centroId || '') === (p.centroId || '') && x.competencia === p.competencia; }); assert(!duplicate, 'DUPLICATE_BUDGET', 'Já existe orçamento para essa categoria, centro e competência.'); var budgetInput = { contaId: p.contaId, centroId: p.centroId || null, competencia: p.competencia, valorCentavos: integer(p.valorCentavos, 'Orçamento'), valor: p.valorCentavos / 100 }; if (p.id) budgetInput.id = p.id; return setRecord(s, 'orcamento', budgetInput, 'budget'); }
    if (action === 'budget.delete') { record = required(s, 'orcamento', p.id); locked(s, record.competencia); s.orcamento = s.orcamento.filter(function (x) { return x.id !== p.id; }); return record; }
    if (action === 'statement.import') {
      required(s, 'contasBancarias', p.accountId, 'Conta do extrato'); var parsed = parseStatement(p.text, p.format), existing = new Set(s.extrato.filter(function (x) { return x.accountId === p.accountId; }).map(function (x) { return x.fingerprint; })), inserted = [], skipped = 0;
      parsed.forEach(function (x) { if (existing.has(x.fingerprint)) { skipped++; return; } locked(s, x.date); var row = Object.assign({ id: uid('stmt'), accountId: p.accountId, importedAt: new Date().toISOString() }, x); s.extrato.push(row); inserted.push(row); existing.add(x.fingerprint); });
      return { imported: inserted.length, skipped: skipped, rows: inserted };
    }
    if (action === 'reconciliation.match') {
      var statement = required(s, 'extrato', p.statementId, 'Linha de extrato'); locked(s, statement.date); e = required(s, 'lancamentos', p.entryId, 'Lançamento'); lockEntry(s, e);
      assert(!s.conciliacoes.some(function (c) { return !c.cancelado && c.statementId === statement.id; }), 'ALREADY_RECONCILED', 'A linha de extrato já foi conciliada.');
      assert(statement.amountCentavos * (e.tipo === 'receita' ? 1 : -1) > 0, 'RECONCILIATION_MISMATCH', 'O sinal do extrato não corresponde ao tipo do título.');
      var pay = p.paymentId ? e.pagamentos.find(function (x) { return x.id === p.paymentId && !x.estornado; }) : null;
      if (!p.paymentId) pay = settle(s, { id: e.id, data: statement.date, contaBancariaId: statement.accountId, valorCentavos: Math.abs(statement.amountCentavos) });
      assert(pay, 'PAYMENT_NOT_FOUND', 'Pagamento ativo não encontrado.'); record = { id: uid('rec'), statementId: statement.id, entryId: e.id, paymentId: pay.id, data: today(), cancelado: false }; s.conciliacoes.push(record); return record;
    }
    if (action === 'reconciliation.unmatch') { record = required(s, 'conciliacoes', p.id); var stmt = required(s, 'extrato', record.statementId); locked(s, stmt.date); lockEntry(s, required(s, 'lancamentos', record.entryId)); assert(!record.cancelado, 'ALREADY_CANCELLED', 'A conciliação já foi desfeita.'); record.cancelado = true; return record; }
    if (action === 'policy.save') { admin(); s.politicas = Object.assign({}, s.politicas, { exigirAprovacao: p.exigirAprovacao === undefined ? s.politicas.exigirAprovacao : p.exigirAprovacao, limiteAprovacaoCentavos: p.limiteAprovacaoCentavos === undefined ? s.politicas.limiteAprovacaoCentavos : p.limiteAprovacaoCentavos }); s.lancamentos.filter(function (x) { return !x.cancelado && !activePayments(x).length && approvalNeeded(s, x) && x.aprovacao === 'dispensada'; }).forEach(function (x) { x.aprovacao = 'pendente'; }); return s.politicas; }
    if (action === 'period.close' || action === 'period.reopen') { admin(); month(p.month); if (action === 'period.reopen') assert(name(p.motivo, 'Motivo da reabertura').length >= 3, 'INVALID_REASON', 'Descreva o motivo da reabertura em pelo menos três caracteres.'); record = s.fechamentos.find(function (x) { return x.month === p.month; }); if (!record) { record = { id: uid('close'), month: p.month }; s.fechamentos.push(record); } assert(record.fechado !== (action === 'period.close'), 'PERIOD_UNCHANGED', action === 'period.close' ? 'O período já está fechado.' : 'O período já está aberto.'); Object.assign(record, { fechado: action === 'period.close', motivo: p.motivo || '', closedAt: new Date().toISOString(), actorId: actor().id }); return record; }
    if (action === 'backup.import') {
      admin(); assert(p.state && p.state.schemaVersion === 2, 'INVALID_BACKUP', 'Selecione um backup financeiro versão 2.'); var imported = validate(normalize(p.state)); assert(!s.fechamentos.some(function (x) { return x.fechado; }), 'PERIOD_CLOSED', 'Reabra os períodos fechados antes de restaurar um backup.');
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        ['lancamentos', 'transferencias', 'extrato', 'conciliacoes'].forEach(function (key) { s[key].forEach(function (x) { var restored = find(imported, key, x.id); assert(restored, 'BACKUP_HISTORY_CONFLICT', 'A cópia não preserva todo o histórico da empresa. Restaure em uma base vazia ou use uma cópia mais recente.');
          if (key === 'lancamentos') x.pagamentos.forEach(function (oldPayment) { var restoredPayment = restored.pagamentos.find(function (p) { return p.id === oldPayment.id; }); assert(restoredPayment && ['data', 'valorCentavos', 'jurosCentavos', 'multaCentavos', 'descontoCentavos', 'contaBancariaId'].every(function (k) { return restoredPayment[k] === oldPayment[k]; }) && (!oldPayment.estornado || restoredPayment.estornado), 'BACKUP_HISTORY_CONFLICT', 'A cópia removeria ou alteraria uma liquidação já registrada.'); });
          else { var fields = key === 'transferencias' ? ['origemId', 'destinoId', 'data', 'valorCentavos'] : key === 'conciliacoes' ? ['statementId', 'entryId', 'paymentId'] : ['accountId', 'date', 'description', 'amountCentavos', 'fingerprint']; assert(fields.every(function (k) { return restored[k] === x[k]; }) && (!x.cancelado || restored.cancelado), 'BACKUP_HISTORY_CONFLICT', 'A cópia alteraria movimentos já registrados.'); }
        }); });
      }
      var revision = s.revision, audit = s.auditoria, createdAt = s.createdAt; Object.keys(s).forEach(function (k) { delete s[k]; }); Object.assign(s, imported, { revision: revision, auditoria: audit, createdAt: createdAt }); return { imported: s.lancamentos.length };
    }
    if (action === 'attachFile') { e = required(s, 'lancamentos', p.entryId, 'Lançamento'); lockEntry(s, e); assert(p.attachment && typeof p.attachment.id === 'string' && typeof p.attachment.name === 'string' && Number.isSafeInteger(p.attachment.size) && p.attachment.size > 0, 'INVALID_ATTACHMENT', 'Metadados de anexo inválidos.'); e.anexos = e.anexos || []; assert(!e.anexos.some(function (a) { return a.id === p.attachment.id; }), 'DUPLICATE_ATTACHMENT', 'O anexo já existe.'); e.anexos.push(clone(p.attachment)); return p.attachment; }
    if (action === 'detachFile') { e = required(s, 'lancamentos', p.entryId, 'Lançamento'); lockEntry(s, e); record = (e.anexos || []).find(function (a) { return a.id === p.attachmentId; }); assert(record, 'NOT_FOUND', 'Anexo não encontrado.'); e.anexos = e.anexos.filter(function (a) { return a.id !== p.attachmentId; }); return record; }
    error('UNKNOWN_COMMAND', 'Operação financeira desconhecida: ' + action);
  }
  function command(action, payload) {
    var epoch = sessionEpoch;
    var task = queue.then(async function () {
      assert(epoch === sessionEpoch, 'SESSION_CHANGED', 'A sessão foi alterada. Abra novamente o financeiro.');
      await ready(); assert(epoch === sessionEpoch, 'SESSION_CHANGED', 'A sessão foi alterada. Abra novamente o financeiro.'); var repo = repository, draft = clone(current), previous = current.revision, data = mutate(draft, action, clone(payload || {}));
      draft.revision = previous + 1; draft.updatedAt = new Date().toISOString();
      var auditPayload = (action==='category.applyAgencyTemplate'||action==='workspace.applyAgencyContext')?clone(data):clone(payload || {}); if (auditPayload.text) auditPayload.text = '[extrato importado]'; if (auditPayload.state) auditPayload.state = '[backup restaurado]';
      draft.auditoria.push({ id: uid('audit'), action: action, actorId: actor().id, at: draft.updatedAt, revision: draft.revision, entityId: payload && (payload.id || payload.entryId || payload.statementId) || data && data.id || null, details: auditPayload });
      validate(draft); var saved = await repo.save(clone(draft), { expectedRevision: previous }); if (saved && saved.schemaVersion === 2) draft = validate(normalize(saved));
      assert(epoch === sessionEpoch, 'SESSION_CHANGED', 'A sessão foi alterada durante a gravação. Reabra o financeiro para confirmar o resultado.');
      publish(draft); return { ok: true, action: action, data: clone(data), revision: draft.revision };
    });
    queue = task.catch(function () {}); return task;
  }
  function reload() { var epoch = sessionEpoch; return queue.then(async function () { await ready(); var repo = repository, s = await repo.load(); assert(epoch === sessionEpoch, 'SESSION_CHANGED', 'A sessão foi alterada.'); assert(s, 'MISSING_DATABASE', 'O banco financeiro não foi encontrado.'); publish(validate(normalize(s))); return state(); }); }
  function resetSession() { sessionEpoch++; current = null; readyPromise = null; repository = null; queue = Promise.resolve(); }
  AGIR.fin = { ready: ready, state: state, command: command, entries: entries, summary: summary, dre: dre, cashflow: cashflow, balance: balance, report: report, agencyContextPlan:function(){return AGIR.agencyDomain?clone(AGIR.agencyDomain.financePlan(current)):null;}, agencyExpenseTemplatePlan:function(){return clone(agencyExpenseTemplatePlan(current));}, parseStatement: parseStatement, toCents: toCents, reload: reload, resetSession: resetSession, today: today };
})(window);
