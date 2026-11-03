/* ==========================================================================
   AGIR — Performance / Análise de Ligações
   Volume, qualidade e horário. Onde o discador está desperdiçando tempo.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  var RESULTADOS = [
    { id: 'atendeu',         label: 'Atendeu',          cor: 'var(--ok-500)',     bom: true },
    { id: 'agendou',         label: 'Agendou',          cor: 'var(--brand-500)',  bom: true },
    { id: 'nao_atendeu',     label: 'Não atendeu',      cor: 'var(--ink-4)',      bom: false },
    { id: 'sem_interesse',   label: 'Sem interesse',    cor: 'var(--warn-500)',   bom: false },
    { id: 'numero_invalido', label: 'Número inválido',  cor: 'var(--bad-500)',    bom: false }
  ];

  AGIR.pages.perfLigacoes = function (node, ctx) {
    node.appendChild(W.pageHead({
      icon: 'phone', title: 'Análise de ligações',
      sub: 'Estamos preparando a integração com a telefonia da operação.'
    }));
    node.appendChild(UI.empty({
      icon: 'layers', title: 'Em desenvolvimento',
      text: 'Em breve, esta área reunirá volume, qualidade, duração e resultados das ligações.'
    }));
    return;
    /* A implementação analítica permanece abaixo para ser reativada quando a
       integração de telefonia estiver homologada. */
    var f = W.readFilters(ctx.query || {});

    node.appendChild(W.pageHead({
      icon: 'phone',
      title: 'Análise de ligações',
      sub: 'Volume, taxa de atendimento, tempo em linha e o melhor horário para discar.',
      actions: [
        h('button.btn.btn--sm', { onClick: exportar },
          icon('download'), h('span', { text: 'Exportar CSV' }))
      ]
    }));

    node.appendChild(W.filterBar(ctx, ['periodo', 'owner', 'equipe']));

    var host = h('div');
    node.appendChild(host);
    D.mount(host, UI.skeletonCards(4));
    M.defer(function () { D.mount(host, montar()); M.initReveal(host); });

    /* ==================================================================== */
    function montar() {
      var r = An.range(f.periodo);
      var ligacoes = An.acts(f).filter(function (a) {
        return a.tipo === 'ligacao' && a.resultado !== 'pendente' && An.inRange(a.data, r);
      });
      var K = An.kpis(f), a = K.atual, d = K.d;
      var sr = An.serie(f, ['ligacoes', 'atendidas', 'agendamentos']);
      var hm = An.heatAtividade(f);

      var porResultado = RESULTADOS.map(function (res) {
        var n = ligacoes.filter(function (l) { return l.resultado === res.id; }).length;
        return { label: res.label, value: n, color: res.cor, bom: res.bom };
      });

      var uteis = ligacoes.filter(function (l) { return l.resultado === 'atendeu' || l.resultado === 'agendou'; });
      var tempoTotal = uteis.reduce(function (s2, l) { return s2 + (l.duracaoSeg || 0); }, 0);

      /* faixas de duração — separa "alô e desligou" de conversa real */
      var faixas = [
        { label: '0–30s',     min: 0,   max: 30,   cor: 'var(--bad-500)' },
        { label: '31s–2min',  min: 31,  max: 120,  cor: 'var(--warn-500)' },
        { label: '2–5min',    min: 121, max: 300,  cor: 'var(--series-2)' },
        { label: '5–10min',   min: 301, max: 600,  cor: 'var(--ok-500)' },
        { label: '10min+',    min: 601, max: 1e9,  cor: 'var(--brand-500)' }
      ].map(function (fx) {
        return {
          label: fx.label, color: fx.cor,
          value: uteis.filter(function (l) {
            return (l.duracaoSeg || 0) >= fx.min && (l.duracaoSeg || 0) <= fx.max;
          }).length
        };
      });

      var porVendedor = An.usuariosDoFiltro(f).map(function (u) {
        var lig = ligacoes.filter(function (l) { return l.ownerId === u.id; });
        var at = lig.filter(function (l) { return l.resultado === 'atendeu' || l.resultado === 'agendou'; });
        var ag = lig.filter(function (l) { return l.resultado === 'agendou'; });
        var tempo = at.reduce(function (s2, l) { return s2 + (l.duracaoSeg || 0); }, 0);
        return {
          usuario: u, total: lig.length, atendidas: at.length, agendou: ag.length,
          taxa: F.rate(at.length, lig.length),
          conversao: F.rate(ag.length, lig.length),
          tempo: tempo, tma: at.length ? tempo / at.length : 0
        };
      }).filter(function (x) { return x.total > 0; })
        .sort(function (x, y) { return y.total - x.total; });

      /* melhor janela horária */
      var melhorHora = null, melhorVal = -1;
      hm.data.forEach(function (linha, i) {
        linha.forEach(function (v, j) {
          if (v > melhorVal) { melhorVal = v; melhorHora = { dia: hm.rows[i], hora: hm.cols[j] }; }
        });
      });

      return h('div.col.gap-6',
        h('div.grid.g-4',
          W.kpi({ label: 'Ligações no período', raw: ligacoes.length, icon: 'phone', tone: 'info',
            delta: d.ligacoes, spark: sr.s.ligacoes }),
          W.kpi({ label: 'Taxa de atendimento', raw: a.taxaAtendimento,
            format: function (v) { return F.pct(v, 1); }, icon: 'checkcircle',
            tone: a.taxaAtendimento >= 35 ? 'ok' : 'warn', delta: d.taxaAtendimento,
            sub: 'referência: 35%' }),
          W.kpi({ label: 'Tempo total em linha', raw: tempoTotal / 3600,
            format: function (v) { return F.num(v, 1); }, unit: ' h', icon: 'clock', tone: 'plum',
            sub: 'média de ' + W.duracao(Math.round(a.tma)) + ' por contato' }),
          W.kpi({ label: 'Ligação → agendamento', raw: a.convLigAgend,
            format: function (v) { return F.pct(v, 2); }, icon: 'target',
            tone: a.convLigAgend >= 6 ? 'ok' : 'warn', delta: d.convLigAgend,
            sub: 'referência: 6%' })
        ),

        melhorHora ? h('div.insight.insight--info',
          h('div.insight__ico', icon('lightbulb')),
          h('div.grow',
            h('div.insight__title', { text: 'Melhor janela para discar: ' + melhorHora.dia + ', ' + melhorHora.hora }),
            h('div.insight__text', {
              text: 'É o horário com maior volume de contato efetivo no período. Concentrar a mesa nessa faixa costuma render mais que aumentar o volume total.'
            })
          )
        ) : null,

        W.section({
          title: 'Volume × contato efetivo',
          sub: 'A distância entre as duas linhas é o desperdício do mailing',
          body: box(280, function (el) {
            C.area(el, {
              uid: 'lig-vol', height: 260, labels: sr.labels,
              series: [
                { name: 'Ligações', values: sr.s.ligacoes, kind: 'bar', color: 'var(--series-2)' },
                { name: 'Contato efetivo', values: sr.s.atendidas, kind: 'area', color: 'var(--ok-500)' },
                { name: 'Agendamentos', values: sr.s.agendamentos, kind: 'line', color: 'var(--brand-500)', axis: 'y2' }
              ],
              yFormat: F.numShort, y2Format: F.numShort
            });
          })
        }),

        h('div.grid.g-3',
          W.section({
            title: 'Resultado das ligações',
            body: h('div',
              box(200, function (el) {
                C.donut(el, {
                  height: 190, items: porResultado.filter(function (x) { return x.value; }),
                  center: { value: F.numShort(ligacoes.length), label: 'ligações' },
                  format: F.num, unitLabel: 'Ligações'
                });
              }),
              h('div.col.gap-2.mt-4', porResultado.map(function (x) {
                return h('div.row.between.gap-3',
                  h('span.row.gap-2', h('i.dot', { style: { background: x.color, width: '8px', height: '8px' } }),
                    h('span.t-small', { text: x.label })),
                  h('span.row.gap-3',
                    h('span.t-tiny.t-dimmer', { text: F.pct(F.rate(x.value, ligacoes.length), 1) }),
                    h('b.t-small.t-num', { text: F.num(x.value) })
                  )
                );
              }))
            )
          }),
          W.section({
            title: 'Duração das conversas',
            sub: 'Muita ligação curta significa abertura fraca',
            body: box(faixas.length * 34 + 20, function (el) {
              C.ranking(el, { items: faixas, format: F.num, rowH: 34, labelW: 82 });
            })
          }),
          W.section({
            title: 'Mapa de calor',
            sub: 'Dia da semana × hora',
            body: box(200, function (el) {
              C.heatmap(el, { rows: hm.rows, cols: hm.cols, data: hm.data, cellH: 22, unit: 'Contatos' });
            })
          })
        ),

        W.section({
          title: 'Desempenho por vendedor',
          sub: 'Volume não é performance — olhe taxa de atendimento e conversão junto',
          flush: true,
          body: porVendedor.length ? W.dataTable({
            rows: porVendedor,
            sort: { key: 'total', dir: 'desc' },
            onRowClick: function (r2) { AGIR.pages.vendedorDrawer(r2.usuario.id); },
            columns: [
              { key: 'nome', label: 'Vendedor', width: '20%',
                value: function (r2) { return r2.usuario.nome; },
                render: function (r2) {
                  return h('div.row.gap-3', AGIR.avatar(r2.usuario, 'sm'),
                    h('div', { style: { minWidth: 0 } },
                      h('div.strong.truncate', { text: r2.usuario.nome }),
                      h('div.t-tiny.t-dimmer', { text: 'ramal ' + r2.usuario.ramal })
                    ));
                } },
              { key: 'total', label: 'Ligações', align: 'right',
                render: function (r2) { return h('span.strong.t-num', { text: F.num(r2.total) }); } },
              { key: 'atendidas', label: 'Efetivas', align: 'right',
                render: function (r2) { return h('span.t-num', { text: F.num(r2.atendidas) }); } },
              { key: 'taxa', label: 'Atendimento', align: 'right', width: '16%',
                render: function (r2) {
                  return h('div.col.gap-1',
                    h('b.t-num', { style: { color: r2.taxa >= 35 ? 'var(--ok-500)' : 'var(--warn-500)' },
                      text: F.pct(r2.taxa, 1) }),
                    M.progress(r2.taxa, { thin: true, color: r2.taxa >= 35 ? 'var(--ok-500)' : 'var(--warn-500)' })
                  );
                } },
              { key: 'agendou', label: 'Agendou', align: 'right',
                render: function (r2) { return h('span.t-num', { text: F.num(r2.agendou) }); } },
              { key: 'conversao', label: 'Lig→agend', align: 'right',
                render: function (r2) {
                  return h('span.badge' + (r2.conversao >= 6 ? '.badge--ok' : r2.conversao >= 3 ? '.badge--warn' : '.badge--bad'),
                    { text: F.pct(r2.conversao, 2) });
                } },
              { key: 'tma', label: 'Tempo médio', align: 'right',
                render: function (r2) { return h('span.t-num', { text: W.duracao(Math.round(r2.tma)) }); } },
              { key: 'tempo', label: 'Tempo total', align: 'right',
                render: function (r2) {
                  return h('span.t-num.t-dim', { text: F.num(r2.tempo / 3600, 1) + ' h' });
                } }
            ]
          }) : UI.empty({ icon: 'phone', title: 'Nenhuma ligação registrada no período' })
        })
      );
    }

    function box(minH, draw) {
      var el = h('div', { style: { minHeight: minH + 'px' } });
      M.defer(function () { draw(el); });
      return el;
    }

    function exportar() {
      var r = An.range(f.periodo);
      var lig = An.acts(f).filter(function (a) {
        return a.tipo === 'ligacao' && a.resultado !== 'pendente' && An.inRange(a.data, r);
      });
      var linhas = [['Data', 'Hora', 'Vendedor', 'Ramal', 'Cliente', 'Resultado', 'Duração (s)', 'Observação']];
      lig.slice(0, 5000).forEach(function (l) {
        var u = S().byId('usuarios', l.ownerId) || {};
        var op = l.oportunidadeId ? S().byId('oportunidades', l.oportunidadeId) : null;
        linhas.push([F.date(l.data), F.time(l.data), u.nome, u.ramal,
          op ? op.cliente : '', W.RESULTADO[l.resultado] || l.resultado,
          l.duracaoSeg || 0, l.nota || '']);
      });
      AGIR.util.baixarCSV(linhas, 'ascensao-ligacoes-' + F.iso(new Date()) + '.csv');
    }
  };
})(window);
