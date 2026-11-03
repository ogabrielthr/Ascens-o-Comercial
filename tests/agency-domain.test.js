'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../assets/js/core');
const plain = value => JSON.parse(JSON.stringify(value));
function domain(production = false) {
  const window = { AGIR: {}, AGIR_BACKEND: { mode: production ? 'supabase' : 'demo' } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'agency-domain.js'), 'utf8'), { window, Set });
  return window.AGIR.agencyDomain;
}

test('agency income adaptation replaces every legacy credit line without changing amounts or account references', () => {
  const api = domain(), labels = ['Consignado INSS', 'Servidor/Militar', 'FGTS e Cartão', 'Portabilidade'];
  const state = { planoContas: labels.map((nome, i) => ({ id: ['pc_com_inss', 'pc_com_serv', 'pc_com_fgts', 'pc_com_port'][i], nome: 'Comissão — ' + nome, tipo: 'receita', grupo: 'Receita operacional' })),
    lancamentos: ['Consignado INSS', 'Consignado Servidor', 'Consignado Militar', 'Antecipação FGTS', 'Portabilidade + Refin', 'Refinanciamento', 'Cartão Benefício', 'Crédito CLT'].map((nome, i) => ({ id: 'entry' + i, descricao: 'Comissão ' + nome + ' — Cliente', tipo: 'receita', valorCentavos: 10001 + i, contaId: 'pc_com_inss', vencimento: '2026-10-29', oportunidadeId: 'op' + i })),
    auditoria: [{ descricao: 'Comissão INSS' }], contasBancarias: [{ nome: 'Itaú Consignado', saldoInicialCentavos: 10000 }] };
  const before = plain(state); api.applyFinance(state);
  assert.doesNotMatch(state.planoContas.map(c => c.nome).join(' '), /INSS|FGTS|Consignado|Portabilidade|Militar/);
  assert.doesNotMatch(state.lancamentos.map(e => e.descricao).join(' '), /INSS|FGTS|Consignado|Portabilidade|Refinanciamento|Comissão/);
  state.lancamentos.forEach((e, i) => assert.deepEqual({ ...e, descricao: before.lancamentos[i].descricao }, before.lancamentos[i]));
  assert.deepEqual(state.contasBancarias, before.contasBancarias);
  assert.deepEqual(state.auditoria, before.auditoria);
  assert.equal(api.financePlan(state).added.length, 0);
  assert.equal(api.financePlan(state).changes.length, 0);
});

test('local demo conversion preserves custom data, finance markers, identifiers and historical evidence', () => {
  const api = domain(), db = { meta: { version: 1, seededAt: '2026-10-28' },
    produtos: [{ id: 'prod_inss', nome: 'Consignado INSS', ticket: [6000, 32000] }, { id: 'custom', nome: 'Meu serviço especial' }],
    oportunidades: [{ id: 'op1', titulo: 'Portabilidade + Refin — Cliente', valor: 1234.56, criadoEm: '2026-10-28', matricula: 'INSS-42' }],
    empresa: { nome: 'Ascensão Comercial', segmento: 'Correspondente bancário — crédito consignado' },
    empresas: [{ nome: 'Prefeitura de São Paulo', cnpj: '00000000000000', tipo: 'Convênio' }],
    financeiro: { schemaVersion: 2, external: true, revision: 12 },
    historicoAlteracoes: [{ descricao: 'Consignado INSS', valor: 42 }], anexos: [{ nome: 'Contrato INSS.pdf' }] };
  const before = plain(db); assert.equal(api.migrateDemo(db), true);
  assert.equal(db.produtos[0].nome, 'Gestão de marketing mensal');
  assert.deepEqual(db.produtos[1], before.produtos[1]);
  assert.equal(db.oportunidades[0].valor, before.oportunidades[0].valor);
  assert.equal(db.oportunidades[0].matricula, 'INSS-42');
  assert.equal(db.empresas[0].cnpj, ''); assert.equal(db.empresas[0].tipo, 'Cliente');
  for (const key of ['financeiro', 'historicoAlteracoes', 'anexos']) assert.deepEqual(db[key], before[key]);
  const once = plain(db); assert.equal(api.migrateDemo(db), false); assert.deepEqual(db, once);
  const production = plain(before); assert.equal(domain(true).migrateDemo(production), false); assert.deepEqual(production, before);
});

test('new demonstration data contains marketing services instead of credit products and commissions as income', () => {
  const window = { AGIR: {} }, context = vm.createContext({ window, console });
  for (const file of ['format.js', 'seed.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  const db = window.AGIR.seed.build();
  const displayed = [].concat(db.produtos, db.convenios, db.bancos, db.financeiro.planoContas, db.financeiro.lancamentos, db.emails, db.automacoes, db.empresas);
  displayed.forEach(record => assert.doesNotMatch([record.nome, record.titulo, record.descricao, record.assunto, record.acao].filter(Boolean).join(' '), /\b(INSS|FGTS|consignad[oa]|portabilidade|refinanciamento|averbação)\b/i));
  assert.ok(db.financeiro.lancamentos.some(e => e.tipo === 'receita'));
  db.financeiro.lancamentos.filter(e => e.tipo === 'receita').forEach(e => assert.doesNotMatch(e.descricao, /^Comissão/));
});
