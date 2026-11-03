'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/core/finance.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function legacy() {
  return { planoContas: [
    { id: 'revenue', nome: 'Serviços', tipo: 'receita', grupo: 'Receita operacional' },
    { id: 'cost', nome: 'Custo direto', tipo: 'despesa', grupo: 'Custo variável' },
    { id: 'expense', nome: 'Aluguel', tipo: 'despesa', grupo: 'Custo fixo' },
    { id: 'tax', nome: 'Impostos', tipo: 'despesa', grupo: 'Deduções' }
  ], centrosCusto: [{ id: 'commercial', nome: 'Comercial' }], lancamentos: [], orcamento: [] };
}
function harness(options = {}) {
  let saved = options.saved ? plain(options.saved) : null;
  const memory = { financeiro: options.legacy || legacy(), meta: { seededAt: options.seededAt || null }, session: { userId: 'user_admin', role: options.role || 'admin' } };
  let failure = null, saveCount = 0;
  const repo = {
    load: async () => saved && plain(saved),
    loadLegacy: async () => options.legacy || legacy(),
    save: async (snapshot, info) => {
      saveCount++;
      if (failure) throw failure;
      assert.equal(info.expectedRevision, saved ? saved.revision : 0, 'repository enforces CAS');
      assert.equal(snapshot.revision, info.expectedRevision + 1);
      saved = plain(snapshot);
      if (options.serverAudit) saved.auditoria.push({ id: 'server_' + saved.revision, action: 'workspace.save', actorId: 'server_user', at: '2026-10-28T15:00:00.000Z', revision: saved.revision, details: {} });
      return plain(saved);
    }
  };
  const events = [];
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-28T15:00:00Z'])); }
    static now() { return new Date('2026-10-28T15:00:00Z').getTime(); }
  }
  const global = { AGIR: { store: { get: k => k.split('.').reduce((value, key) => value && value[key], memory), set: (k, v) => { memory[k] = v; }, currentUser: () => ({ id: 'user_admin' }) } },
    AGIR_FINANCE_REPOSITORY: options.noRepo ? undefined : repo,
    AGIR_BACKEND: { mode: options.production ? 'supabase' : 'demo' },
    Date: FixedDate, Intl, Set, Map, console,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, dispatchEvent: event => events.push(event)
  };
  global.window = global;
  if (options.catalog) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/core/finance-catalog.js'), 'utf8'), global);
  if (options.agency) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/core/agency-domain.js'), 'utf8'), global);
  vm.runInNewContext(source, global, { filename: 'finance.js' });
  return { fin: global.AGIR.fin, repo, global, memory, events, saved: () => plain(saved), saveCount: () => saveCount,
    fail: code => { failure = Object.assign(new Error('storage rejected'), { code }); }, recover: () => { failure = null; } };
}
async function setup(options) { const h = harness(options); await h.fin.ready(); return h; }
async function title(h, patch = {}) {
  return (await h.fin.command('entry.save', Object.assign({ tipo: 'receita', contaId: 'revenue', centroId: 'commercial', descricao: 'Contrato mensal', competencia: '2026-10', data: '2026-10-01', vencimento: '2026-10-20', valorCentavos: 10000 }, patch))).data;
}
async function settle(h, e, patch = {}) { return (await h.fin.command('entry.settle', Object.assign({ id: e.id, data: '2026-10-21', contaBancariaId: 'bank_default', valorCentavos: e.valorCentavos }, patch))).data; }

test('money parsing uses exact cents with Brazilian and decimal notation', async () => {
  const { fin } = await setup();
  for (const [input, cents] of [['R$ 1.234,56', 123456], ['1234.56', 123456], ['0,005', 1], ['-1,005', -101], [1.005, 101], [10.075, 1008], [-10.075, -1008], [1e-7, 0], ['(45,90)', -4590], [0.29, 29]]) assert.equal(fin.toCents(input), cents);
  for (const input of ['', '1.2.3', 'não', NaN, Infinity]) assert.throws(() => fin.toCents(input), { code: 'INVALID_AMOUNT' });
});
test('migration preserves IDs and creates realized payments once across reloads', async () => {
  const data = legacy(); data.lancamentos.push({ id: 'old', descricao: 'Venda antiga', tipo: 'receita', contaId: 'revenue', data: '2026-10-10', competencia: '2026-10', valor: 10.51, status: 'realizado' });
  const h = await setup({ legacy: data });
  assert.equal(h.fin.balance('bank_default', '2026-10-28'), 1051);
  assert.equal(h.fin.state().lancamentos[0].pagamentos[0].id, 'migration_old');
  const another = await setup({ saved: h.saved() });
  assert.equal(another.fin.state().lancamentos[0].pagamentos.length, 1);
  assert.equal(another.saveCount(), 0);
});
test('demonstration migration is marked explicitly and starting a private base keeps its audit', async () => {
  const h = await setup({ seededAt: '2026-10-28T12:00:00Z' }); assert.equal(h.fin.state().seededFromDemo, true);
  await title(h); const clean = h.fin.state(); clean.lancamentos = []; clean.seededFromDemo = false;
  await h.fin.command('backup.import', { state: clean }); assert.equal(h.fin.state().seededFromDemo, false); assert.equal(h.fin.entries().length, 0); assert.equal(h.fin.state().auditoria.length, 2);
  const production = await setup({ production: true, seededAt: '2026-10-28T12:00:00Z' }); assert.equal(production.fin.state().seededFromDemo, undefined);
});
test('the complete existing demonstration dataset migrates without losing titles or cents', async () => {
  const context = vm.createContext({ window: { AGIR: {} }, console }); for (const file of ['format.js', 'seed.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/core/', file), 'utf8'), context);
  const original = context.window.AGIR.seed.build().financeiro, h = await setup({ legacy: original });
  assert.ok(original.lancamentos.length > 100);
  assert.equal(h.fin.state().lancamentos.length, original.lancamentos.length);
  assert.equal(h.fin.state().orcamento.length, original.orcamento.length);
  const realized = original.lancamentos.filter(e => e.status === 'realizado' && e.data <= h.fin.today()).reduce((sum, e) => sum + Math.round(e.valor * 100) * (e.tipo === 'receita' ? 1 : -1), 0);
  assert.equal(h.fin.balance('bank_default', '9999-12-31'), realized);
  assert.equal(h.fin.state().lancamentos.reduce((sum, e) => sum + e.valorCentavos, 0), original.lancamentos.reduce((sum, e) => sum + Math.round(e.valor * 100), 0));
});
test('state and reports are defensive snapshots', async () => {
  const h = await setup(), e = await title(h), copy = h.fin.state(); copy.lancamentos[0].valorCentavos = 1;
  const list = h.fin.entries(); list[0].pagamentos.push({ valorCentavos: 2 });
  assert.equal(h.fin.state().lancamentos[0].valorCentavos, e.valorCentavos);
  assert.equal(h.fin.state().lancamentos[0].pagamentos.length, 0);
});
test('invalid dates, category mismatches and missing references fail atomically', async () => {
  const h = await setup(), before = JSON.stringify(h.fin.state());
  for (const patch of [{ vencimento: '2026-02-30' }, { contaId: 'expense' }, { centroId: 'missing' }, { valorCentavos: 0 }, { valorCentavos: 100.2 }]) await assert.rejects(title(h, patch));
  assert.equal(JSON.stringify(h.fin.state()), before);
  assert.equal(h.saveCount(), 1);
});
test('partial settlement separates principal from fees and discount; reversal restores payable and balance', async () => {
  const h = await setup(), e = await title(h, { tipo: 'despesa', contaId: 'expense' });
  const p = await settle(h, e, { valorCentavos: 4000, jurosCentavos: 200, multaCentavos: 100, descontoCentavos: 50 });
  let line = h.fin.entries()[0]; assert.equal(line.pagoCentavos, 4000); assert.equal(line.abertoCentavos, 6000); assert.equal(h.fin.balance(), -4250);
  assert.equal(h.fin.summary({ month: '2026-10', basis: 'caixa' }).despesasCentavos, 4250);
  assert.equal(h.fin.dre({ month: '2026-10' }).lucroLiquidoCentavos, -10250);
  await h.fin.command('entry.reversePayment', { id: e.id, paymentId: p.id, motivo: 'Pagamento duplicado' });
  line = h.fin.entries()[0]; assert.equal(line.abertoCentavos, 10000); assert.equal(h.fin.balance(), 0); assert.equal(line.pagamentos[0].estornado, true);
});
test('total settlement with discount closes the principal and uses only paid cash', async () => {
  const h = await setup(), e = await title(h); await settle(h, e, { descontoCentavos: 1000 });
  assert.equal(h.fin.entries()[0].status, 'pago'); assert.equal(h.fin.balance(), 9000);
  assert.equal(h.fin.dre({ month: '2026-10' }).lucroLiquidoCentavos, 9000);
  assert.equal(h.fin.summary({ month: '2026-10' }).resultadoCentavos, 9000);
  assert.equal(h.fin.summary({ month: '2026-10' }).ajustesDespesasCentavos, 1000);
});
test('dashboard and DRE agree on interest and discounts recognized in the same payment month', async () => {
  const h = await setup(), income = await title(h), expense = await title(h, { tipo: 'despesa', contaId: 'expense', valorCentavos: 5000 });
  await settle(h, income, { jurosCentavos: 300, descontoCentavos: 100 }); await settle(h, expense, { jurosCentavos: 200, descontoCentavos: 400 });
  const s = h.fin.summary({ month: '2026-10' }), d = h.fin.dre({ month: '2026-10' });
  assert.equal(s.receitasCentavos, 10400); assert.equal(s.despesasCentavos, 5000); assert.equal(s.resultadoCentavos, 5400); assert.equal(s.resultadoCentavos, d.lucroLiquidoCentavos);
  assert.equal(h.fin.summary({ month: '2026-10', basis: 'caixa' }).resultadoCentavos, 5400);
});
test('financial adjustments from a prior competence affect the payment month and obey report filters', async () => {
  const h = await setup(), e = await title(h, { competencia: '2026-09', vencimento: '2026-09-20' });
  await settle(h, e, { jurosCentavos: 300, descontoCentavos: 800 });
  assert.equal(h.fin.summary({ month: '2026-09' }).resultadoCentavos, 10000);
  assert.equal(h.fin.summary({ month: '2026-09' }).resultadoCentavos, h.fin.dre({ month: '2026-09' }).lucroLiquidoCentavos);
  assert.equal(h.fin.summary({ month: '2026-10' }).resultadoCentavos, -500);
  assert.equal(h.fin.summary({ month: '2026-10' }).resultadoCentavos, h.fin.dre({ month: '2026-10' }).lucroLiquidoCentavos);
  for (const filters of [{ month: '2026-10', categoryId: 'expense' }, { month: '2026-10', status: 'aberto' }, { month: '2026-10', search: 'não encontrado' }]) {
    assert.equal(h.fin.summary(filters).resultadoCentavos, 0); assert.equal(h.fin.dre(filters).lucroLiquidoCentavos, 0);
  }
});
test('overpayment, impossible discounts and future realization cannot mutate data', async () => {
  const h = await setup(), e = await title(h), before = JSON.stringify(h.fin.state());
  await assert.rejects(settle(h, e, { valorCentavos: 10001 }), { code: 'OVERPAYMENT' });
  await assert.rejects(settle(h, e, { descontoCentavos: 10001 }), { code: 'INVALID_DISCOUNT' });
  await assert.rejects(settle(h, e, { data: '2026-10-29' }), { code: 'FUTURE_PAYMENT' });
  assert.equal(JSON.stringify(h.fin.state()), before);
});
test('installments sum exactly with cent remainders and calendar month clamping', async () => {
  const h = await setup(), result = await title(h, { valorCentavos: 10000, vencimento: '2026-01-31', data: '2026-01-01', competencia: '2026-01', parcelas: 3 });
  assert.deepEqual(plain(result.map(e => e.valorCentavos)), [3334, 3333, 3333]);
  assert.deepEqual(plain(result.map(e => e.vencimento)), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(plain(result.map(e => e.competencia)), ['2026-01', '2026-02', '2026-03']);
  assert.equal(result.reduce((sum, e) => sum + e.valorCentavos, 0), 10000);
  await assert.rejects(title(h, { valorCentavos: 1, parcelas: 2 }), { code: 'INVALID_AMOUNT' });
});
test('recurrences copy full value and preserve the document date separately', async () => {
  const h = await setup(), rows = await title(h, { recorrencia: 3, valorCentavos: 9999, data: '2026-10-05', vencimento: '2026-10-31' });
  assert.equal(rows.reduce((sum, x) => sum + x.valorCentavos, 0), 29997); assert.equal(rows[1].data, '2026-11-05'); assert.equal(rows[1].vencimento, '2026-11-30');
  await assert.rejects(title(h, { recorrencia: 2, parcelas: 2 }), { code: 'INVALID_INSTALLMENTS' });
});
test('transfers change individual accounts while preserving consolidated balance and DRE', async () => {
  const h = await setup();
  await h.fin.command('account.save', { id: 'bank_default', saldoInicialCentavos: 50000 });
  const second = (await h.fin.command('account.save', { nome: 'Reserva', saldoInicialCentavos: 20000, dataSaldoInicial: '2026-10-01' })).data;
  const t = (await h.fin.command('transfer.create', { origemId: 'bank_default', destinoId: second.id, data: '2026-10-20', valorCentavos: 10000 })).data;
  assert.equal(h.fin.balance('bank_default'), 40000); assert.equal(h.fin.balance(second.id), 30000); assert.equal(h.fin.balance(), 70000);
  assert.equal(h.fin.dre({ month: '2026-10' }).lucroLiquidoCentavos, 0);
  const flow = h.fin.cashflow({ month: '2026-10', accountId: second.id }); assert.equal(flow.saldoFinalCentavos, 30000);
  await h.fin.command('transfer.cancel', { id: t.id, motivo: 'Transferência incorreta' }); assert.equal(h.fin.balance(second.id), 20000);
});
test('cash flow starts at prior realized balance and projects open titles exactly once', async () => {
  const h = await setup(); await h.fin.command('account.save', { id: 'bank_default', saldoInicialCentavos: 50000 });
  const e = await title(h, { valorCentavos: 10000 }); await settle(h, e, { valorCentavos: 4000 }); await title(h, { tipo: 'despesa', contaId: 'expense', valorCentavos: 3000 });
  const f = h.fin.cashflow({ month: '2026-10' });
  assert.equal(f.rows.length, 31); assert.equal(f.saldoInicialCentavos, 50000); assert.equal(f.saldoAtualCentavos, 54000); assert.equal(f.saldoFinalCentavos, 57000);
  assert.equal(f.rows.reduce((s, r) => s + r.entradasPlanCentavos, 0), 6000);
});
test('settlement through a different bank is counted once in each accounting regime and cash projection', async () => {
  const h = await setup(), bank = (await h.fin.command('account.save', { nome: 'Conta alternativa', dataSaldoInicial: '2026-10-01', saldoInicialCentavos: 0 })).data, e = await title(h);
  await settle(h, e, { contaBancariaId: bank.id, valorCentavos: 4000, jurosCentavos: 200 });
  assert.equal(h.fin.summary({ month: '2026-10', accountId: 'bank_default' }).receitasCentavos, 10000);
  assert.equal(h.fin.summary({ month: '2026-10', accountId: bank.id }).receitasCentavos, 200);
  assert.equal(h.fin.summary({ month: '2026-10', accountId: 'bank_default', basis: 'caixa' }).receitasCentavos, 0);
  assert.equal(h.fin.summary({ month: '2026-10', accountId: bank.id, basis: 'caixa' }).receitasCentavos, 4200);
  assert.equal(h.fin.cashflow({ month: '2026-10', accountId: 'bank_default' }).saldoFinalCentavos, 6000);
  assert.equal(h.fin.cashflow({ month: '2026-10', accountId: bank.id }).saldoFinalCentavos, 4200);
  assert.equal(h.fin.dre({ month: '2026-10', accountId: 'bank_default' }).lucroLiquidoCentavos, 10000);
  assert.equal(h.fin.dre({ month: '2026-10', accountId: bank.id }).lucroLiquidoCentavos, 200);
  assert.equal(h.fin.summary({ month: '2026-10', accountId: bank.id }).resultadoCentavos, h.fin.dre({ month: '2026-10', accountId: bank.id }).lucroLiquidoCentavos);
});
test('initial balances dated inside report appear on the correct day without creating revenue', async () => {
  const h = await setup(); const bank = (await h.fin.command('account.save', { nome: 'Nova conta', saldoInicialCentavos: 5000, dataSaldoInicial: '2026-10-15' })).data;
  const f = h.fin.cashflow({ month: '2026-10', accountId: bank.id });
  assert.equal(f.rows[13].saldoRealCentavos, 0); assert.equal(f.rows[14].saldoRealCentavos, 5000); assert.equal(f.rows[14].entradasRealCentavos, 0);
  await assert.rejects(h.fin.command('entry.settle', { id: (await title(h)).id, data: '2026-10-10', contaBancariaId: bank.id, valorCentavos: 1000 }), { code: 'BEFORE_OPENING_BALANCE' });
});
test('aging derives overdue days and includes partial principal remaining', async () => {
  const h = await setup(), e = await title(h, { vencimento: '2026-10-01' }); await settle(h, e, { valorCentavos: 4000 });
  const rows = h.fin.entries({ asOf: '2026-10-28' }); assert.equal(rows[0].diasAtraso, 27); assert.equal(rows[0].status, 'atrasado');
  const bucket = h.fin.report('aging').find(x => x.faixa === '8 a 30 dias'); assert.equal(bucket.aReceberCentavos, 6000); assert.equal(bucket.quantidade, 1);
});
test('approval policy blocks payment until authorized approval and changing material fields invalidates approval', async () => {
  const h = await setup(); await h.fin.command('policy.save', { exigirAprovacao: true, limiteAprovacaoCentavos: 5000 });
  const e = await title(h, { tipo: 'despesa', contaId: 'expense' }); assert.equal(e.aprovacao, 'pendente');
  await assert.rejects(settle(h, e), { code: 'APPROVAL_REQUIRED' }); await h.fin.command('entry.approve', { id: e.id });
  await h.fin.command('entry.save', { id: e.id, valorCentavos: 9000 }); assert.equal(h.fin.entries()[0].aprovacao, 'pendente');
  await h.fin.command('entry.approve', { id: e.id }); await settle(h, e, { valorCentavos: 9000 });
  await assert.rejects(h.fin.command('entry.reject', { id: e.id }), { code: 'PAID_ENTRY' });
});
test('operators cannot alter policies, approve, change bank balances or reopen periods', async () => {
  const h = await setup({ role: 'operador' }), e = await title(h);
  for (const [action, p] of [['policy.save', { exigirAprovacao: false }], ['entry.approve', { id: e.id }], ['account.save', { id: 'bank_default', saldoInicialCentavos: 99 }], ['period.close', { month: '2026-10' }]]) await assert.rejects(h.fin.command(action, p), { code: 'FORBIDDEN' });
});
test('title save cannot forge payments, cancellation or approval through payload', async () => {
  const h = await setup(); await h.fin.command('policy.save', { exigirAprovacao: true, limiteAprovacaoCentavos: 1 });
  const e = await title(h, { tipo: 'despesa', contaId: 'expense', aprovacao: 'aprovada', cancelado: true, pagamentos: [{ id: 'forged' }] });
  assert.equal(e.aprovacao, 'pendente'); assert.equal(e.cancelado, false); assert.equal(e.pagamentos.length, 0);
});
test('paid titles cannot be deleted or have financial fields changed without reversal', async () => {
  const h = await setup(), e = await title(h); await settle(h, e);
  await assert.rejects(h.fin.command('entry.delete', { id: e.id }), { code: 'PAID_ENTRY' });
  await assert.rejects(h.fin.command('entry.save', { id: e.id, valorCentavos: 9000 }), { code: 'PAID_ENTRY' });
  await h.fin.command('entry.save', { id: e.id, descricao: 'Detalhe corrigido' }); assert.equal(h.fin.entries()[0].descricao, 'Detalhe corrigido');
});
test('closing blocks new titles, edits, settlement, reversals, budgets and retroactive balance changes', async () => {
  const h = await setup(), e = await title(h), p = await settle(h, e, { valorCentavos: 1000 });
  await h.fin.command('period.close', { month: '2026-10' });
  for (const [action, input] of [['entry.save', { id: e.id, descricao: 'muda' }], ['entry.settle', { id: e.id, data: '2026-10-22', valorCentavos: 1000 }], ['entry.reversePayment', { id: e.id, paymentId: p.id, motivo: 'erro' }], ['budget.save', { contaId: 'expense', competencia: '2026-10', valorCentavos: 1000 }], ['account.save', { nome: 'Retroativa', saldoInicialCentavos: 1000, dataSaldoInicial: '2026-01-01' }]]) await assert.rejects(h.fin.command(action, input), { code: 'PERIOD_CLOSED' });
  await assert.rejects(title(h), { code: 'PERIOD_CLOSED' });
  await assert.rejects(h.fin.command('period.reopen', { month: '2026-10', motivo: 'x' }), { code: 'INVALID_REASON' });
  await h.fin.command('period.reopen', { month: '2026-10', motivo: 'Ajuste autorizado' }); await h.fin.command('entry.save', { id: e.id, descricao: 'Ajustado' });
});
test('budget uniqueness and actual variance use category and competence', async () => {
  const h = await setup(); await title(h, { valorCentavos: 10000 });
  const b = (await h.fin.command('budget.save', { contaId: 'revenue', competencia: '2026-10', valorCentavos: 8000 })).data;
  const line = h.fin.report('budget', { month: '2026-10' })[0]; assert.equal(line.realizadoCentavos, 10000); assert.equal(line.desvioCentavos, 2000); assert.equal(line.percentual, 125);
  await assert.rejects(h.fin.command('budget.save', { contaId: 'revenue', competencia: '2026-10', valorCentavos: 1000 }), { code: 'DUPLICATE_BUDGET' });
  await h.fin.command('budget.save', { id: b.id, contaId: 'revenue', competencia: '2026-10', valorCentavos: 10000 }); assert.equal(h.fin.report('budget')[0].desvioCentavos, 0);
});
test('CSV handles Brazilian values, quotes and multiple identical legitimate rows; repeat import skips them', async () => {
  const h = await setup(), text = 'Data;Descrição;Valor\n20/10/2026;"Cliente; A";1.000,50\n20/10/2026;"Cliente; A";1.000,50\n21/10/2026;Tarifa;-5,25';
  const parsed = h.fin.parseStatement(text, 'csv'); assert.equal(parsed.length, 3); assert.equal(parsed[0].description, 'Cliente; A'); assert.equal(parsed[0].amountCentavos, 100050); assert.notEqual(parsed[0].fingerprint, parsed[1].fingerprint);
  const one = await h.fin.command('statement.import', { text, format: 'csv', accountId: 'bank_default' }); assert.equal(one.data.imported, 3);
  const two = await h.fin.command('statement.import', { text, format: 'csv', accountId: 'bank_default' }); assert.equal(two.data.imported, 0); assert.equal(two.data.skipped, 3);
});
test('CSV debit/credit columns and type-based debit imports are normalized', async () => {
  const h = await setup();
  assert.equal(h.fin.parseStatement('Data;Histórico;Crédito;Débito\n20/10/2026;Taxa;;10,00', 'csv')[0].amountCentavos, -1000);
  assert.equal(h.fin.parseStatement('Data;Descrição;Valor;Tipo\n20/10/2026;Taxa;10,00;Débito', 'csv')[0].amountCentavos, -1000);
  assert.throws(() => h.fin.parseStatement('Data;Valor\n30/02/2026;10,00', 'csv'), { code: 'INVALID_DATE' });
});
test('OFX preserves bank FITID and dates without timezone shifts and deduplicates duplicate IDs', async () => {
  const h = await setup(), block = '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001000000[-3:BRT]<TRNAMT>-12.34<FITID>bank-1<MEMO>Pagamento</STMTTRN>';
  const parsed = h.fin.parseStatement('<OFX><BANKTRANLIST>' + block + block + '</BANKTRANLIST></OFX>', 'ofx'); assert.equal(parsed.length, 1); assert.equal(parsed[0].date, '2026-10-01'); assert.equal(parsed[0].amountCentavos, -1234); assert.equal(parsed[0].fingerprint, 'external:bank-1');
});
test('reconciliation is one statement to one payment and reversal cancels the match', async () => {
  const h = await setup(), e = await title(h), p = await settle(h, e);
  const imported = await h.fin.command('statement.import', { accountId: 'bank_default', text: 'Data;Descrição;Valor\n21/10/2026;Recebimento;100,00\n21/10/2026;Recebimento duplicado;100,00', format: 'csv' });
  await h.fin.command('reconciliation.match', { statementId: imported.data.rows[0].id, entryId: e.id, paymentId: p.id });
  const before = JSON.stringify(h.fin.state());
  await assert.rejects(h.fin.command('reconciliation.match', { statementId: imported.data.rows[1].id, entryId: e.id, paymentId: p.id }), { code: 'ALREADY_RECONCILED' });
  assert.equal(JSON.stringify(h.fin.state()), before);
  await h.fin.command('entry.reversePayment', { id: e.id, paymentId: p.id, motivo: 'Baixa duplicada' }); assert.equal(h.fin.state().conciliacoes[0].cancelado, true);
});
test('reconciliation can create partial settlement atomically and cannot match wrong signs or values', async () => {
  const h = await setup(), e = await title(h);
  const imported = await h.fin.command('statement.import', { accountId: 'bank_default', text: 'Data;Descrição;Valor\n21/10/2026;Parcial;40,00\n21/10/2026;Taxa;-10,00', format: 'csv' });
  const rec = await h.fin.command('reconciliation.match', { statementId: imported.data.rows[0].id, entryId: e.id });
  assert.equal(h.fin.entries()[0].abertoCentavos, 6000); assert.equal(h.fin.balance(), 4000);
  await assert.rejects(h.fin.command('reconciliation.match', { statementId: imported.data.rows[1].id, entryId: e.id }), { code: 'RECONCILIATION_MISMATCH' });
  await h.fin.command('reconciliation.unmatch', { id: rec.data.id }); assert.equal(h.fin.entries()[0].abertoCentavos, 6000, 'undoing match does not erase an actual payment');
});
test('failed persistence leaves memory and notifications unchanged and later commands recover', async () => {
  const h = await setup(), before = JSON.stringify(h.fin.state()), events = h.events.length;
  h.fail('QUOTA_EXCEEDED'); await assert.rejects(title(h), { code: 'QUOTA_EXCEEDED' });
  assert.equal(JSON.stringify(h.fin.state()), before); assert.equal(h.events.length, events);
  h.recover(); await title(h); assert.equal(h.fin.entries().length, 1); assert.equal(h.fin.state().auditoria.length, 1);
});
test('concurrent commands serialize and cannot overpay a title', async () => {
  const h = await setup(), e = await title(h);
  const settled = await Promise.allSettled([settle(h, e, { valorCentavos: 7000 }), settle(h, e, { valorCentavos: 7000 })]);
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1); assert.equal(h.fin.entries()[0].abertoCentavos, 3000);
});
test('production never falls back to demo data if repository is absent or fails', async () => {
  const missing = harness({ production: true, noRepo: true }); await assert.rejects(missing.fin.ready(), { code: 'REPOSITORY_REQUIRED' });
  const h = harness({ production: true }); h.repo.load = async () => { throw new Error('Network unavailable'); }; await assert.rejects(h.fin.ready(), /Network unavailable/); assert.throws(() => h.fin.state(), { code: 'NOT_READY' });
});
test('initial loading can be retried after a transient repository failure', async () => {
  const h = harness({ production: true }); let attempts = 0;
  h.repo.load = async () => { if (++attempts === 1) throw new Error('Temporary network error'); return null; };
  await assert.rejects(h.fin.ready(), /Temporary network error/);
  const loaded = await h.fin.ready(); assert.equal(loaded.schemaVersion, 2); assert.equal(attempts, 2); assert.equal(h.saveCount(), 1);
});
test('a missing local database marker causes an explicit recovery error', async () => {
  const h = harness({ legacy: { schemaVersion: 2, external: true, revision: 10 } }); await assert.rejects(h.fin.ready(), { code: 'MISSING_DATABASE' }); assert.equal(h.saveCount(), 0);
});
test('server confirmed audit is adopted after persistence', async () => {
  const h = await setup({ serverAudit: true }); await title(h);
  assert.equal(h.fin.state().auditoria.at(-1).actorId, 'server_user'); assert.equal(h.memory.financeiro.revision, h.fin.state().revision);
});
test('backup validation is atomic and keeps audit continuity', async () => {
  const h = await setup(), e = await title(h), backup = h.fin.state();
  const bad = plain(backup); bad.lancamentos[0].contaId = 'missing'; await assert.rejects(h.fin.command('backup.import', { state: bad }), { code: 'NOT_FOUND' }); assert.equal(h.fin.entries()[0].id, e.id);
  const broken = plain(backup); delete broken.lancamentos; await assert.rejects(h.fin.command('backup.import', { state: broken }), { code: 'INVALID_STATE' });
  await h.fin.command('backup.import', { state: backup }); assert.equal(h.fin.state().auditoria.at(-1).action, 'backup.import');
});
test('attachments are audited metadata and respect closed periods', async () => {
  const h = await setup(), e = await title(h), attachment = { id: 'file1', name: 'nota.pdf', size: 1200, type: 'application/pdf', path: 'company/title/file1.pdf' };
  await h.fin.command('attachFile', { entryId: e.id, attachment }); assert.equal(h.fin.entries()[0].anexos[0].name, 'nota.pdf');
  await h.fin.command('period.close', { month: '2026-10' }); await assert.rejects(h.fin.command('detachFile', { entryId: e.id, attachmentId: 'file1' }), { code: 'PERIOD_CLOSED' });
});
test('session reset prevents an in-flight save from publishing into another organization', async () => {
  const h = await setup(); let release, started;
  const began = new Promise(resolve => { started = resolve; }); const original = h.repo.save;
  h.repo.save = async (s, options) => { started(); await new Promise(resolve => { release = resolve; }); return original(s, options); };
  const work = title(h); await began; h.fin.resetSession(); release();
  await assert.rejects(work, { code: 'SESSION_CHANGED' }); assert.throws(() => h.fin.state(), { code: 'NOT_READY' });
});

test('agency expense adaptation preserves titles, budgets, custom categories and closed-period DRE',async()=>{const seed=await setup(),saved=seed.fin.state();saved.planoContas.push({id:'pc_mkt',nome:'Marketing e tráfego pago',tipo:'despesa',grupo:'Custo variável'},{id:'pc_soft',nome:'Minhas ferramentas personalizadas',tipo:'despesa',grupo:'Custo fixo'});const h=await setup({saved});await title(h,{tipo:'despesa',contaId:'pc_mkt',valorCentavos:15001});await h.fin.command('budget.save',{contaId:'pc_mkt',competencia:'2026-10',valorCentavos:20000});await h.fin.command('period.close',{month:'2026-10',motivo:'Conferido'});const before=h.fin.state(),dreBefore=plain(h.fin.dre({month:'2026-10'})),balance=h.fin.balance();const result=await h.fin.command('category.applyAgencyTemplate',{}),after=h.fin.state();assert.equal(after.planoContas.find(c=>c.id==='pc_mkt').nome,'Marketing e mídia da agência');assert.equal(after.planoContas.find(c=>c.id==='pc_soft').nome,'Minhas ferramentas personalizadas');assert.deepEqual(after.lancamentos,before.lancamentos);assert.deepEqual(after.orcamento,before.orcamento);assert.deepEqual(after.fechamentos,before.fechamentos);assert.deepEqual(plain(h.fin.dre({month:'2026-10'})),dreBefore);assert.equal(h.fin.balance(),balance);assert.ok(result.data.renamed.some(c=>c.id==='pc_mkt'));assert.ok(after.auditoria.at(-1).details.added.length>0);const plan=h.fin.agencyExpenseTemplatePlan();assert.equal(plan.added.length,0);assert.equal(plan.renamed.length,0);});

test('agency template deduplicates existing expense names and preserves all revenue categories',async()=>{const h=await setup();await h.fin.command('category.save',{nome:'Freelancers de design e direção de arte',tipo:'despesa',grupo:'Custo variável'});const revenues=h.fin.state().planoContas.filter(c=>c.tipo==='receita');await h.fin.command('category.applyAgencyTemplate',{});const categories=h.fin.state().planoContas;assert.equal(categories.filter(c=>c.nome==='Freelancers de design e direção de arte').length,1);assert.deepEqual(categories.filter(c=>c.tipo==='receita'),revenues);assert.ok(categories.some(c=>c.nome==='Verba de mídia de clientes'));assert.ok(categories.some(c=>c.nome==='Marketing e mídia da agência'));const count=categories.length;await h.fin.command('category.applyAgencyTemplate',{});assert.equal(h.fin.state().planoContas.length,count);});

test('agency template is atomic on repository failure and operators cannot apply it',async()=>{const h=await setup(),before=h.fin.state();h.fail('OFFLINE');await assert.rejects(h.fin.command('category.applyAgencyTemplate',{}),{code:'OFFLINE'});assert.deepEqual(h.fin.state(),before);const operator=await setup({role:'seller'});await assert.rejects(operator.fin.command('category.applyAgencyTemplate',{}),{code:'FORBIDDEN'});});

test('agency context updates persisted income while preserving payments, budgets and closed financial totals', async () => {
  const data = legacy();
  data.planoContas.push({ id: 'pc_com_inss', nome: 'Comissão — Consignado INSS', tipo: 'receita', grupo: 'Receita operacional' });
  const original = await setup({ legacy: data });
  const e = await title(original, { contaId: 'pc_com_inss', descricao: 'Comissão Consignado INSS — Cliente A', valorCentavos: 10001 });
  await settle(original, e, { valorCentavos: 4000, jurosCentavos: 20 });
  await original.fin.command('budget.save', { contaId: 'pc_com_inss', competencia: '2026-10', valorCentavos: 20000 });
  await original.fin.command('period.close', { month: '2026-10' });
  const h = await setup({ saved: original.saved(), agency: true }), before = h.fin.state();
  const dre = plain(h.fin.dre({ month: '2026-10' })), balance = h.fin.balance();
  await h.fin.command('workspace.applyAgencyContext', {});
  const after = h.fin.state();
  assert.equal(after.planoContas.find(c => c.id === 'pc_com_inss').nome, 'Contratos mensais de marketing');
  assert.equal(after.lancamentos[0].descricao, 'Receita de serviços — Gestão de marketing mensal — Cliente A');
  assert.deepEqual(plain({ ...after.lancamentos[0], descricao: before.lancamentos[0].descricao }), plain(before.lancamentos[0]));
  for (const key of ['orcamento', 'fechamentos', 'contasBancarias', 'conciliacoes']) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(plain(h.fin.dre({ month: '2026-10' })), dre);
  assert.equal(h.fin.balance(), balance);
  assert.deepEqual(after.auditoria.slice(0, -1), before.auditoria);
  assert.ok(after.auditoria.at(-1).details.changes.some(c => c.before.includes('INSS')));
  assert.equal(h.fin.agencyContextPlan().changes.length, 0);
  assert.equal(h.fin.agencyContextPlan().added.length, 0);
  await h.fin.command('workspace.applyAgencyContext', {});
  assert.equal(h.fin.state().planoContas.length, after.planoContas.length);
  const reloaded = await setup({ saved: h.saved(), agency: true });
  assert.equal(reloaded.fin.entries()[0].descricao, after.lancamentos[0].descricao);
});

test('agency context is atomic on failed persistence and restricted to administrators', async () => {
  const original = await setup(), h = await setup({ saved: original.saved(), agency: true });
  const before = h.fin.state(); h.fail('OFFLINE');
  await assert.rejects(h.fin.command('workspace.applyAgencyContext', {}), { code: 'OFFLINE' });
  assert.deepEqual(h.fin.state(), before);
  const seller = await setup({ saved: original.saved(), agency: true, role: 'seller' });
  await assert.rejects(seller.fin.command('workspace.applyAgencyContext', {}), { code: 'FORBIDDEN' });
});

test('standard financial catalogs initialize existing workspaces once and preserve ledger and custom names', async () => {
  const original = await setup();
  await title(original);
  const saved = original.saved();
  saved.planoContas.push({id:'pc_soft',nome:'Minha ferramenta personalizada',tipo:'despesa',grupo:'Custo fixo'});
  saved.planoContas.push({id:'pc_com_inss',nome:'Contratos mensais de marketing',tipo:'receita',grupo:'Receita operacional'});
  const before = plain(saved.lancamentos);
  const h = await setup({saved,catalog:true,production:true});
  assert.deepEqual(plain(h.fin.state().lancamentos),before);
  assert.equal(h.fin.state().planoContas.find(x=>x.id==='pc_soft').nome,'Minha ferramenta personalizada');
  assert.equal(h.fin.state().planoContas.find(x=>x.id==='pc_com_inss').nome,'Contratos recorrentes');
  assert.ok(h.fin.state().centrosCusto.some(x=>x.nome==='Administrativo e financeiro'));
  assert.ok(h.fin.state().planoContas.some(x=>x.nome==='Prestação de serviços'));
  assert.equal(h.fin.state().auditoria.at(-1).action,'catalog.applyStandard');
  const reloaded = await setup({saved:h.saved(),catalog:true,production:true});
  assert.equal(reloaded.saveCount(),0);
  assert.equal(reloaded.fin.state().revision,h.fin.state().revision);
});

test('standard catalog migration fails atomically and preserves existing workspace on retry', async () => {
  const original=await setup(), h=harness({saved:original.saved(),catalog:true});
  h.fail('OFFLINE');
  await assert.rejects(h.fin.ready(),{code:'OFFLINE'});
  assert.deepEqual(h.saved(),original.saved());
  h.recover(); await h.fin.ready();
  assert.equal(h.fin.state().standardCatalogVersion,1);
  const seller=await setup({saved:original.saved(),catalog:true,role:'seller'});
  assert.equal(seller.saveCount(),0);
  await assert.rejects(seller.fin.command('catalog.applyStandard',{}),{code:'FORBIDDEN'});
});

