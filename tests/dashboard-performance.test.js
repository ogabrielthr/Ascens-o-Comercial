const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// Small DOM boundary; the dashboard factories and motion scheduler run unmodified.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.props = {};
    this.style = {};
    this.parentNode = null;
    this.text = '';
    this.rect = { top: 10, left: 10, bottom: 30, right: 90 };
    this.visibility = 'visible';
    this.hasLayout = true;
  }
  get isConnected() { return this.rootConnected || Boolean(this.parentNode?.isConnected); }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    this.text = String(value);
  }
  appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.props[name] = value; }
  getClientRects() { return this.hasLayout ? [this.rect] : []; }
  getBoundingClientRect() { return this.rect; }
}

function h(tag, ...args) {
  const el = new Element(tag);
  if (args[0] && !(args[0] instanceof Element) && !Array.isArray(args[0]) && typeof args[0] === 'object') {
    el.props = { ...args.shift() };
    el.style = { ...el.props.style };
    if ('text' in el.props) el.textContent = el.props.text;
    if ('checked' in el.props) el.checked = el.props.checked;
  }
  for (const child of args.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.appendChild(child instanceof Element ? child : h('text', { text: child }));
  }
  return el;
}

const walk = el => [el, ...el.children.flatMap(walk)];
const snapshot = el => ({ tag: el.tag, props: plain(el.props), text: el.text, children: el.children.map(snapshot) });
const allKeys = ['metas', 'kpis', 'kpis', 'producao', 'funil', 'equipe', 'canais', 'atividades', 'saude'];

function dashboardHarness({ selected, query = {}, empty = false, dashboardSource } = {}) {
  const deferred = [], disposers = [], calls = [], charts = [], kpis = [], tables = [], effects = [];
  const settings = { dashboardWidgets: selected };
  const metrics = {
    vendasValor: [100, 300], estornoSolicitado: [100, 300], comissao: [10, 30],
    ligacoes: [8, 12], propostas: [2, 3], vendasQtd: [1, 1], leads: [5, 6]
  };
  const kpiData = {
    atual: { vendasValor: 400, comissao: 40, vendasQtd: 2, perdidasQtd: 3, ticket: 200,
      ciclo: 7.5, winRate: 40, convPropVenda: 40, propostas: 5 },
    d: { vendasValor: 25, comissao: -20, vendasQtd: 0, ticket: 2, ciclo: -5, winRate: 1.2, convPropVenda: -3 },
    range: { comparacao: 'mês anterior', uteis: 8, uteisPrev: 22 }
  };
  const pace = { uteisRestantes: 10, vendasValor: {
    meta: 1000, realizado: 400, esperado: 500, projecao: 800, pct: 40, pace: 50, gap: -100
  } };
  const steps = [{ label: 'Lead', conversion: 100 }, { label: 'Proposta', conversion: 60 }, { label: 'Ganho', conversion: 25 }];
  const dimension = empty ? [] : Array.from({ length: 9 }, (_, i) => ({
    label: 'Item ' + i, value: i + 1, qtd: i + 2, valor: (i + 1) * 100, winRate: i * 10
  }));
  const ranking = empty ? [] : [
    { usuario: { id: 'seller', nome: 'Ana', cargoId: 'role' }, c: { ...kpiData.atual, ligacoes: 20 },
      prev: { vendasValor: 200 }, dVendas: 100, tendencia: [100, 300], pctMeta: 40, metaRealizado: 400, metaValor: 1000 },
    { usuario: { id: 'idle' }, c: { vendasValor: 0, ligacoes: 0, propostas: 0 } }
  ];
  const data = {
    kpis: () => kpiData, paceMes: () => pace,
    serie: (f, keys) => ({ labels: ['01', '02'], s: Object.fromEntries(keys.map(key => [key, metrics[key]])) }),
    insights: () => [{ title: 'Meta em risco' }], funil: () => steps,
    ranking: () => ranking, porDimensao: () => dimension,
    heatAtividade: () => ({ rows: ['Seg'], cols: ['09h'], data: [[3]] }),
    pipeline: () => empty ? [] : [{ etapa: { nome: 'Lead', prob: 10, sla: 2, cor: 'orange' }, qtd: 4, valor: 800, estourados: 1 }]
  };
  const an = Object.fromEntries(Object.entries(data).map(([name, fn]) => [name, (...args) => {
    calls.push({ name, args: plain(args) });
    return fn(...args);
  }]));
  an.acumular = values => { let sum = 0; return values.map(value => sum += value); };
  let modal;
  const dom = { h, icon: name => h('icon', { name }), clear: el => { el.textContent = ''; },
    mount: (el, child) => { el.textContent = ''; el.appendChild(child); } };
  const fmt = { money: v => 'R$' + v, moneyShort: v => 'R$' + v, money0: v => 'R$' + v,
    num: v => String(v), numShort: v => String(v), pct: v => v + '%', pctSigned: v => '+' + v + '%',
    plural: (v, label) => v + ' ' + label, MES_LONGO: Array(12).fill('Setembro') };
  const ascensao = {
    dom, fmt, an, onPageDispose: fn => disposers.push(fn), avatar: user => h('avatar', { text: user.nome }),
    store: {
      get: key => key === 'settings' ? settings : [], byId: () => ({ nome: 'Equipe A' }),
      pref: (key, value) => { settings[key] = value; }
    },
    router: { href: (route, q) => '#' + route + '?' + new URLSearchParams(q),
      go: route => effects.push(route), resolve: () => effects.push('resolve') },
    shell: { persistPrefs: () => effects.push('persist') },
    pages: { novaOportunidade: () => effects.push('new'), vendedorDrawer: id => effects.push(id),
      crmMetas: (host, ctx) => { effects.push(ctx); host.appendChild(h('embedded-metas')); } },
    ui: { skeletonCards: () => h('skeleton'), skeletonChart: () => h('skeleton'),
      empty: opts => h('empty', { text: opts.text || opts.title }), modal: opts => { modal = opts; },
      toast: { warn: text => effects.push(text) } },
    motion: { defer: fn => deferred.push(fn), initReveal: () => {},
      progress: (value, opts) => h('progress', { value, ...opts }) },
    charts: { PALETTE: ['orange', 'blue'], sparkline: values => h('spark', { values }),
      stackbar: values => h('stack', { values }) },
    w: {
      readFilters: q => ({ periodo: q.periodo || 'mes', ownerId: q.owner, equipeId: q.equipe,
        produtoId: q.produto, origemId: q.origem }), rotuloPeriodo: p => p,
      pageHead: opts => h('header', opts.actions), filterBar: () => h('filters'),
      section: opts => h('section', { title: opts.title, sub: opts.sub, flush: opts.flush }, opts.actions, opts.body),
      insightList: (items, max) => h('insights', { items, max }),
      kpi: opts => { kpis.push(opts); return h('kpi', opts); },
      dataTable: opts => {
        tables.push(opts);
        return h('table', opts.rows.map((row, index) => h('tr', opts.columns.map(col => col.render(row, index)))));
      }
    }
  };
  for (const name of ['gauge', 'area', 'funnel', 'donut', 'ranking', 'heatmap']) {
    ascensao.charts[name] = (box, opts) => {
      assert.equal(box.isConnected, true, name + ' must receive a mounted host');
      const chart = { name, opts, box, destroyed: false };
      charts.push(chart);
      ascensao.onPageDispose(() => { chart.destroyed = true; });
    };
  }
  const window = { AGIR: ascensao, print: () => effects.push('print') };
  vm.runInNewContext(dashboardSource || source('assets/js/pages/crm/dashboard.js'), { window, setTimeout, clearTimeout });
  const root = h('root'); root.rootConnected = true;
  const node = h('page'); root.appendChild(node);
  ascensao.pages.crmDashboard(node, { query });
  const flush = () => { while (deferred.length) deferred.shift()(); };
  const rows = () => walk(node).filter(el => el.props['data-dashboard-widget']);
  return { ascensao, node, calls, charts, kpis, tables, effects, settings, pace, metrics, kpiData,
    flush, flushMount: () => deferred.shift()(), rows, keys: () => rows().map(el => el.props['data-dashboard-widget']),
    dispose: () => disposers.splice(0).forEach(fn => fn()), modal: () => modal };
}

const dependencies = {
  metas: ['paceMes', 'insights'], kpis: ['kpis', 'serie'], producao: ['paceMes', 'serie'],
  funil: ['funil'], equipe: ['ranking'], canais: ['porDimensao', 'porDimensao', 'porDimensao'],
  atividades: ['serie', 'heatAtividade'], saude: ['pipeline']
};
const seriesKeys = { kpis: ['vendasValor', 'comissao', 'vendasQtd'], producao: ['estornoSolicitado'],
  atividades: ['ligacoes', 'propostas', 'leads'] };

test('each selected widget runs only its factories and required analytics', () => {
  const full = dashboardHarness(); full.flush();
  assert.deepEqual(full.keys(), allKeys);
  for (const key of Object.keys(dependencies)) {
    const run = dashboardHarness({ selected: [key] }); run.flush();
    assert.deepEqual(run.keys(), key === 'kpis' ? ['kpis', 'kpis'] : [key]);
    assert.deepEqual(run.calls.map(call => call.name).sort(), [...dependencies[key]].sort(), key);
    assert.deepEqual(run.rows().map(snapshot), full.rows().filter(row => row.props['data-dashboard-widget'] === key).map(snapshot));
    if (seriesKeys[key]) assert.deepEqual(run.calls.find(call => call.name === 'serie').args[1], seriesKeys[key]);
    assert.equal(run.kpis.length, key === 'kpis' ? 7 : 0);
    const names = run.charts.map(chart => chart.name);
    assert.deepEqual(names, { metas: ['gauge'], kpis: [], producao: ['area'], funil: ['funnel'], equipe: [],
      canais: ['donut', 'ranking'], atividades: ['area', 'heatmap'], saude: [] }[key]);
  }
});

test('specialized views override overview preferences and preserve canonical layout', () => {
  for (const [view, expected] of Object.entries({ funil: ['funil', 'saude'], equipe: ['metas', 'equipe'],
    canais: ['canais'], atividades: ['atividades'] })) {
    const run = dashboardHarness({ selected: ['kpis'], query: { view } }); run.flush();
    assert.deepEqual(run.keys(), expected);
    assert.deepEqual(run.calls.map(call => call.name).sort(), expected.flatMap(key => dependencies[key]).sort());
  }
  const custom = dashboardHarness({ selected: ['saude', 'kpis', 'kpis', 'unknown', 'metas'], query: { view: 'invalid' } });
  custom.flush(); assert.deepEqual(custom.keys(), ['metas', 'kpis', 'kpis', 'saude']);
  for (const selected of [undefined, [], 'invalid']) {
    const run = dashboardHarness({ selected }); run.flush(); assert.deepEqual(run.keys(), allKeys);
  }
});

test('shared series/pace run once per mount and carry the original filters and exact chart values', () => {
  const run = dashboardHarness({ query: { periodo: 'semana', owner: 'u1', equipe: 'e1', produto: 'p1', origem: 'o1' } });
  run.flush();
  assert.equal(run.calls.filter(call => call.name === 'serie').length, 1);
  assert.equal(run.calls.filter(call => call.name === 'paceMes').length, 1);
  assert.deepEqual(run.calls.find(call => call.name === 'serie').args[1].sort(), Object.keys(run.metrics).sort());
  for (const call of run.calls) assert.deepEqual(call.args[0], {
    periodo: 'semana', ownerId: 'u1', equipeId: 'e1', produtoId: 'p1', origemId: 'o1'
  });
  assert.deepEqual(run.kpis.map(kpi => kpi.raw), [400, 40, 2, 200, 7.5, 40, 40]);
  assert.deepEqual(run.kpis.map(kpi => kpi.delta), [25, -20, 0, 2, -5, 1.2, -3]);
  assert.equal(run.kpis[0].deltaLabel, 'vs. mês anterior');
  assert.match(run.kpis[0].tip, /8 dias úteis agora contra 22/);
  const production = run.charts.find(chart => chart.opts.uid === 'dash-acum').opts;
  assert.deepEqual(plain(production.series.map(series => series.values)), [[100, 400], [500, 1000], [200, 400], [100, 300]]);
  assert.deepEqual(plain(production.target), { value: 1000, label: 'meta R$1000' });
  const activity = run.charts.find(chart => chart.opts.uid === 'dash-atv').opts;
  assert.deepEqual(plain(activity.series.map(series => series.values)), [[8, 12], [5, 6], [2, 3]]);
  assert.deepEqual(plain(run.charts.find(chart => chart.name === 'heatmap').opts.data), [[3]]);
  assert.match(run.node.textContent, /Lead -> Proposta/);
  assert.match(run.node.textContent, /Proposta -> Ganho/);
  const donut = run.charts.find(chart => chart.name === 'donut').opts;
  assert.equal(donut.items.length, 6);
  assert.equal(donut.items.reduce((sum,item)=>sum+item.value,0),45);
  assert.equal(donut.center.value, 'R$45'); // Total includes the items beyond the displayed top six.
  assert.equal(run.charts.find(chart => chart.name === 'ranking').opts.items.length, 8);
  assert.equal(run.tables[0].rows.length, 1);
  run.tables[0].onRowClick(run.tables[0].rows[0]);
  run.tables[1].onRowClick(run.tables[1].rows[0]);
  assert.equal(run.effects[0], 'seller');
  assert.match(run.effects[1], /crm\/pipeline\?periodo=semana&owner=u1&equipe=e1&produto=p1&origem=o1/);
});

test('empty data and missing production targets keep their existing output', () => {
  const empty = dashboardHarness({ selected: ['equipe', 'canais', 'saude'], empty: true }); empty.flush();
  assert.equal(empty.charts.length, 0);
  assert.match(empty.node.textContent, /Nenhum vendedor registrou/);
  assert.match(empty.node.textContent, /Nenhuma perda registrada/);
  const run = dashboardHarness({ selected: ['producao'] });
  run.pace.vendasValor.meta = 0; run.metrics.estornoSolicitado = [0, 0]; run.flush();
  assert.equal(run.charts[0].opts.target, null);
  assert.deepEqual(plain(run.charts[0].opts.series.map(series => series.values)), [[0, 0], [0, 0], [0, 0]]);
});

test('preferences, links and header actions remain functional', () => {
  const run = dashboardHarness({ selected: ['kpis'], query: { owner: 'u1' } }); run.flush();
  const nodes = walk(run.node);
  nodes.find(el => el.textContent === 'Exportar' && el.props.onClick).props.onClick();
  nodes.find(el => el.textContent === 'Nova oportunidade' && el.props.onClick).props.onClick();
  assert.ok(nodes.some(el => el.props.href === '#/crm/relatorios?owner=u1'));
  assert.ok(nodes.some(el => el.props.href === '#/crm/dashboard?owner=u1&view=funil'));
  nodes.find(el => el.props.onClick && el.textContent === 'Escolher indicadores').props.onClick();
  const modal = run.modal();
  const checks = walk(modal.body).filter(el => el.tag === 'input');
  assert.equal(checks[1].checked, true);
  checks.forEach(check => { check.checked = false; });
  const buttons = modal.footer({ close: () => run.effects.push('close') });
  buttons[1].props.onClick();
  assert.equal(run.effects.at(-1), 'Escolha ao menos um indicador');
  checks[7].checked = true; buttons[1].props.onClick();
  assert.deepEqual(plain(run.settings.dashboardWidgets), ['saude']);
  assert.deepEqual(run.effects.slice(-3), ['persist', 'close', 'resolve']);
});

test('embedded goals bypass dashboard factories', () => {
  const run = dashboardHarness({ query: { view: 'metas', owner: 'u1' } }); run.flush();
  assert.deepEqual(run.calls, []); assert.deepEqual(run.keys(), []);
  assert.equal(walk(run.node).some(el => el.tag === 'filters'), false);
  assert.deepEqual(plain(run.effects), [{ query: { view: 'metas', owner: 'u1' }, embedded: true, readonly: true }]);
});

test('navigation cancels deferred mounts/charts and preserves registered chart disposal', () => {
  for (const query of [{}, { view: 'metas' }]) {
    for (const cancel of [run => run.dispose(), run => run.node.remove()]) {
      const run = dashboardHarness({ query }); cancel(run); run.flush();
      assert.deepEqual(run.calls, []); assert.deepEqual(run.effects, []);
    }
  }
  for (const cancel of [run => run.dispose(), run => run.node.remove()]) {
    const run = dashboardHarness({ selected: ['atividades'] }); run.flushMount(); cancel(run); run.flush();
    assert.equal(run.charts.length, 0);
    assert.equal(run.calls.some(call => call.name === 'heatAtividade'), false);
  }
  const run = dashboardHarness(); run.flush(); run.dispose(); run.dispose();
  assert.ok(run.charts.length > 0 && run.charts.every(chart => chart.destroyed));
});

function motionHarness() {
  const frames = new Map(), listeners = new Map(), disposers = [];
  let nextId = 0, reduced = false;
  const document = {
    hidden: false,
    addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn)
  };
  const window = { innerHeight: 800, innerWidth: 1200, getComputedStyle: el => ({ visibility: el.visibility }),
    matchMedia: () => ({ matches: reduced }),
    AGIR: { dom: { h }, fmt: { num: String }, onPageDispose: fn => disposers.push(fn) } };
  vm.runInNewContext(source('assets/js/core/motion.js'), { window, document,
    requestAnimationFrame: fn => { frames.set(++nextId, fn); return nextId; }, cancelAnimationFrame: id => frames.delete(id) });
  const root = h('root'); root.rootConnected = true;
  return { motion: window.AGIR.motion, root, frames, listeners, disposers, document,
    reduced: value => { reduced = value; }, element: () => root.appendChild(h('span')),
    tick: ts => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(ts)); },
    dispose: () => disposers.splice(0).forEach(fn => fn()),
    hide: () => { document.hidden = true; [...(listeners.get('visibilitychange') || [])].forEach(fn => fn()); } };
}

test('visible numbers preserve easing, duration, custom formatting and exact fractional endpoints', () => {
  const run = motionHarness(), el = run.element();
  run.motion.countUp(el, 10.25, { from: 2.25, ms: 100, format: v => v.toFixed(2) });
  run.tick(0); assert.equal(el.textContent, '2.25');
  run.tick(50); assert.equal(el.textContent, '9.25');
  run.tick(100); assert.equal(el.textContent, '10.25');
  assert.equal(run.frames.size, 0);
  assert.equal(run.listeners.get('visibilitychange').size, 0);
});

test('detached, hidden, reduced-motion and unchanged numbers avoid frame loops', () => {
  for (const setup of [el => el.remove(), (el, run) => run.hide(), (el, run) => run.reduced(true)]) {
    const run = motionHarness(), el = run.element(); setup(el, run);
    run.motion.countUp(el, 50, { format: v => '$' + v });
    assert.equal(el.textContent, '$50'); assert.equal(run.frames.size, 0);
  }
  for (const [to, opts] of [[0, {}], [8, { from: 8 }], [Infinity, {}], [NaN, {}]]) {
    const run = motionHarness(), el = run.element(); run.motion.countUp(el, to, opts);
    assert.equal(el.textContent, String(to)); assert.equal(run.frames.size, 0);
  }
  for (const setup of [el => { el.hasLayout = false; }, el => { el.visibility = 'hidden'; },
    el => { el.rect.top = 1000; el.rect.bottom = 1020; }, el => { el.rect.right = -1; }]) {
    const run = motionHarness(), el = run.element(); setup(el); run.motion.countUp(el, 50); run.tick(0);
    assert.equal(el.textContent, '50'); assert.equal(run.frames.size, 0);
  }
});

test('num allows synchronous mounting but stops after one frame if never attached', () => {
  const run = motionHarness();
  const mounted = run.motion.num(20), detached = run.motion.num(30);
  run.root.appendChild(mounted); run.tick(0);
  assert.equal(mounted.textContent, '0'); assert.equal(detached.textContent, '30');
  assert.equal(run.frames.size, 1); run.tick(900);
  assert.equal(mounted.textContent, '20'); assert.equal(run.frames.size, 0);
  run.hide(); assert.equal(run.motion.num(1234.5, { format: v => 'R$' + v }).textContent, 'R$1234.5');
  assert.equal(run.frames.size, 0);
});

test('detachment and tab hiding stop in-flight counts at their final values', () => {
  for (const finish of [(run, el) => { el.remove(); run.tick(50); }, run => run.hide()]) {
    const run = motionHarness(), el = run.element(); run.motion.countUp(el, 100); run.tick(0);
    finish(run, el); assert.equal(el.textContent, '100'); assert.equal(run.frames.size, 0);
    assert.equal(run.listeners.get('visibilitychange').size, 0);
  }
});

test('replacement and explicit cancellation cannot leave competing frame loops', () => {
  const run = motionHarness(), el = run.element();
  const oldCancel = run.motion.countUp(el, 100);
  const staleFrame = [...run.frames.values()][0];
  const cancel = run.motion.countUp(el, -20, { from: 10, ms: 100 });
  oldCancel(); staleFrame(0); assert.equal(run.frames.size, 1);
  run.tick(0); run.tick(100); assert.equal(el.textContent, '-20');
  cancel(); cancel(); assert.equal(run.frames.size, 0);
  const stop = run.motion.countUp(el, 200); run.tick(0); const text = el.textContent;
  stop(); run.tick(1000); assert.equal(el.textContent, text); assert.equal(run.frames.size, 0);
});

test('page disposal cancels active counts and pending num mounts without leaking page hooks', () => {
  const run = motionHarness();
  for (let page = 0; page < 3; page++) {
    const el = run.element(); run.motion.countUp(el, 100); run.tick(0);
    run.motion.num(40); run.motion.num(50);
    assert.equal(run.disposers.length, 1);
    const text = el.textContent, staleFrames = [...run.frames.values()];
    run.dispose(); run.dispose(); staleFrames.forEach(fn => fn(1000));
    assert.equal(el.textContent, text); assert.equal(run.frames.size, 0);
    assert.equal(run.listeners.get('visibilitychange').size, 0);
  }
});
