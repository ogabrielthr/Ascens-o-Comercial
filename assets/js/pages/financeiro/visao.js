/* ==========================================================================
   AGIR — Financeiro / Visão geral
   O resultado do mês em uma tela: receita, margem, resultado, ponto de
   equilíbrio e retorno do investimento em marketing.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  AGIR.pages.finVisao = function (node, ctx) {
    var q = ctx.query || {};
    var comps = An.competencias(13);
    var comp = q.comp || An.competenciaAtual();
    var compAnt = comps[comps.findIndex(function (c) { return c.value === comp; }) + 1];

    node.appendChild(W.pageHead({
      icon: 'gauge',
      title: 'Visão financeira',
      sub: 'Resultado gerencial da operação, competência a competência.',
      actions: [
        seletorComp(comps, comp),
        h('a.btn.btn--sm', { href: '#/financeiro/dre?comp=' + comp },
          icon('receipt'), h('span', { text: 'Abrir DRE' })),
        h('button.btn.btn--sm', { onClick: function () { global.print(); } },
          icon('download'), h('span', { text: 'Exportar' }))
      ]
    }));

    var host = h('div');
    node.appendChild(host);
    D.mount(host, UI.skeletonCards(4));
    M.defer(function () { D.mount(host, montar()); M.initReveal(host); });

    /* ==================================================================== */
    function montar() {
      var r = An.dre(comp);
      var ant = compAnt ? An.dre(compAnt.value) : null;
      var serie = An.serieDRE(6);
      var mkt = An.marketing(comp);
      var fluxo = An.fluxoCaixa(75);
      var orc = An.orcadoRealizado(comp);

      var d = function (a, b) { return ant ? An.delta(a, b) : undefined; };

      return h('div.col.gap-6',
        /* ---------- KPIs ---------------------------------------------- */
        h('div.grid.g-4',
          W.kpi({ label: 'Receita bruta', raw: r.receitaBruta, format: F.moneyShort,
            icon: 'coins', tone: 'brand', delta: d(r.receitaBruta, ant && ant.receitaBruta),
            spark: serie.map(function (x) { return x.receita; }) }),
          W.kpi({ label: 'Margem de contribuição', raw: r.margemContribuicao, format: F.moneyShort,
            icon: 'percent', tone: 'info', delta: d(r.margemContribuicao, ant && ant.margemContribuicao),
            sub: F.pct(F.rate(r.margemContribuicao, r.receitaLiquida), 1) + ' da receita líquida' }),
          W.kpi({ label: 'Resultado do período', raw: r.resultado, format: F.moneyShort,
            icon: r.resultado >= 0 ? 'trendUp' : 'trendDown',
            tone: r.resultado >= 0 ? 'ok' : 'bad',
            delta: d(r.resultado, ant && ant.resultado),
            spark: serie.map(function (x) { return x.resultado; }) }),
          W.kpi({ label: 'Margem líquida', raw: r.margemPct,
            format: function (v) { return F.pct(v, 1); },
            icon: 'target', tone: r.margemPct >= 15 ? 'ok' : r.margemPct >= 0 ? 'warn' : 'bad',
            sub: 'referência saudável: 15%' })
        ),

        /* ---------- Alertas ------------------------------------------- */
        alertas(r, mkt, orc),

        /* ---------- Receita × custo × resultado ------------------------ */
        W.section({
          title: 'Receita, custo e resultado nos últimos 6 meses',
          sub: 'A linha é o resultado; as barras mostram de onde ele vem',
          body: box(320, function (el) {
            C.area(el, {
              uid: 'fin-serie', height: 300,
              labels: serie.map(function (x) { return x.label; }),
              series: [
                { name: 'Receita', values: serie.map(function (x) { return x.receita; }), kind: 'bar', color: 'var(--series-3)' },
                { name: 'Custo total', values: serie.map(function (x) { return x.custo; }), kind: 'bar', color: 'var(--series-5)' },
                { name: 'Resultado', values: serie.map(function (x) { return x.resultado; }), kind: 'line', color: 'var(--brand-500)' }
              ],
              yFormat: F.moneyShort
            });
          })
        }),

        /* ---------- Estrutura + ponto de equilíbrio -------------------- */
        h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' } },
          W.section({
            title: 'Para onde vai a receita',
            sub: 'Competência ' + rotulo(comp),
            body: (function () {
              var itens = [
                { label: 'Deduções e estornos', value: r.receitaBruta - r.receitaLiquida, color: 'var(--series-6)' },
                { label: 'Custo variável', value: r.custoVariavel, color: 'var(--series-5)' },
                { label: 'Custo fixo', value: r.custoFixo, color: 'var(--series-4)' },
                { label: 'Resultado', value: Math.max(0, r.resultado), color: 'var(--ok-500)' }
              ].filter(function (x) { return x.value > 0; });
              return h('div',
                box(200, function (el) {
                  C.donut(el, {
                    height: 190, items: itens,
                    center: { value: F.moneyShort(r.receitaBruta), label: 'receita' },
                    format: F.moneyShort, unitLabel: 'Valor'
                  });
                }),
                h('div.col.gap-2.mt-4', itens.map(function (x) {
                  return h('div.row.between.gap-3',
                    h('span.row.gap-2', h('i.dot', { style: { background: x.color, width: '8px', height: '8px' } }),
                      h('span.t-small', { text: x.label })),
                    h('span.row.gap-3',
                      h('span.t-tiny.t-dimmer', { text: F.pct(F.rate(x.value, r.receitaBruta), 1) }),
                      h('b.t-small.t-num', { text: F.moneyShort(x.value) })
                    )
                  );
                }))
              );
            })()
          }),
          W.section({
            title: 'Ponto de equilíbrio',
            sub: 'Quanto de receita a operação precisa só para não dar prejuízo',
            body: h('div.col.gap-5',
              h('div.col.gap-2',
                h('div.row.between',
                  h('span.t-small.t-dim', { text: 'Receita necessária' }),
                  h('b.t-h3.t-num', { text: F.money0(r.pontoEquilibrio) })
                ),
                M.progress(r.pontoEquilibrio ? Math.min(150, r.receitaLiquida / r.pontoEquilibrio * 100) : 0, {
                  thick: true,
                  color: r.receitaLiquida >= r.pontoEquilibrio ? 'var(--ok-500)' : 'var(--bad-500)',
                  tick: r.pontoEquilibrio ? 100 : undefined,
                  tickLabel: 'Ponto de equilíbrio'
                }),
                h('div.t-tiny.t-dimmer', {
                  text: r.receitaLiquida >= r.pontoEquilibrio
                    ? 'A operação passou do equilíbrio em ' + F.moneyShort(r.receitaLiquida - r.pontoEquilibrio) + '.'
                    : 'Faltam ' + F.moneyShort(r.pontoEquilibrio - r.receitaLiquida) + ' de receita para cobrir os custos.'
                })
              ),
              h('hr'),
              linha('Receita líquida', F.money0(r.receitaLiquida)),
              linha('Custo variável', F.money0(r.custoVariavel)),
              linha('Custo fixo', F.money0(r.custoFixo)),
              linha('Margem de contribuição %', F.pct(F.rate(r.margemContribuicao, r.receitaLiquida), 1)),
              h('hr'),
              h('div.row.between',
                h('span.t-small.t-dim', { text: 'Resultado' }),
                h('b.t-h4.t-num', {
                  style: { color: r.resultado >= 0 ? 'var(--ok-500)' : 'var(--bad-500)' },
                  text: F.money0(r.resultado)
                })
              )
            )
          })
        ),

        /* ---------- Marketing + fluxo --------------------------------- */
        h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' } },
          W.section({
            title: 'Retorno de marketing',
            sub: 'Meta Ads e Google Ads na competência',
            body: h('div.col.gap-3',
              linha('Investimento', F.money0(mkt.investimento)),
              linha('Leads gerados', F.num(mkt.leads)),
              linha('Custo por lead', F.money0(mkt.cpl)),
              linha('Vendas originadas', F.num(mkt.vendas)),
              linha('Custo de aquisição', F.money0(mkt.cac)),
              linha('Receita gerada', F.money0(mkt.receita)),
              h('hr'),
              h('div.row.between',
                h('span.t-small.t-dim', { text: 'ROI' }),
                h('b.t-h3.t-num', {
                  style: { color: mkt.roi > 0 ? 'var(--ok-500)' : 'var(--bad-500)' },
                  text: F.pctSigned(mkt.roi, 0)
                })
              ),
              h('div.t-tiny.t-dimmer', {
                text: mkt.investimento
                  ? (mkt.roi > 0
                      ? 'Cada R$ 1 investido devolveu ' + F.money(1 + mkt.roi / 100) + ' em receita.'
                      : 'O canal pago ainda não se pagou nesta competência.')
                  : 'Nenhum investimento lançado nesta competência.'
              })
            )
          }),
          W.section({
            title: 'Fluxo de caixa',
            sub: 'Saldo acumulado — a partir de hoje, os valores são previstos',
            actions: [h('a.btn.btn--sm.btn--ghost', { href: '#/financeiro/fluxo' },
              h('span', { text: 'Detalhar' }), icon('arrowRight'))],
            body: box(280, function (el) {
              C.area(el, {
                uid: 'fin-fluxo', height: 260,
                labels: fluxo.map(function (x) { return x.label; }),
                series: [
                  { name: 'Entradas', values: fluxo.map(function (x) { return x.entrada; }), kind: 'bar', color: 'var(--ok-500)' },
                  { name: 'Saídas', values: fluxo.map(function (x) { return x.saida; }), kind: 'bar', color: 'var(--bad-500)' },
                  { name: 'Saldo acumulado', values: fluxo.map(function (x) { return x.saldo; }), kind: 'area', color: 'var(--brand-500)', axis: 'y2' }
                ],
                yFormat: F.moneyShort, y2Format: F.moneyShort
              });
            })
          })
        ),

        /* ---------- Orçado × realizado --------------------------------- */
        W.section({
          title: 'Orçado × realizado',
          sub: 'Maiores desvios da competência ' + rotulo(comp),
          flush: true,
          actions: [h('a.btn.btn--sm.btn--ghost', { href: '#/financeiro/orcamento?comp=' + comp },
            h('span', { text: 'Ver completo' }), icon('arrowRight'))],
          body: W.dataTable({
            rows: orc.slice().sort(function (a, b) {
              return Math.abs(b.desvioValor) - Math.abs(a.desvioValor);
            }).slice(0, 8),
            sort: null,
            columns: [
              { key: 'conta', label: 'Conta', sortable: false,
                render: function (x) {
                  return h('div',
                    h('div.strong', { text: x.conta.nome }),
                    h('div.t-tiny.t-dimmer', { text: x.conta.grupo })
                  );
                } },
              { key: 'orcado', label: 'Orçado', align: 'right', sortable: false,
                render: function (x) { return h('span.t-num.t-dim', { text: F.money0(x.orcado) }); } },
              { key: 'real', label: 'Realizado', align: 'right', sortable: false,
                render: function (x) { return h('span.strong.t-num', { text: F.money0(x.realizado) }); } },
              { key: 'desvio', label: 'Desvio', align: 'right', sortable: false,
                render: function (x) {
                  return h('span.badge' + (x.bom ? '.badge--ok' : '.badge--bad'),
                    { text: F.pctSigned(x.desvioPct, 0) });
                } },
              { key: 'barra', label: '', width: '22%', sortable: false,
                render: function (x) {
                  var max = Math.max(x.orcado, x.realizado) || 1;
                  return h('div.col.gap-1',
                    M.progress(x.orcado / max * 100, { thin: true, color: 'var(--ink-4)' }),
                    M.progress(x.realizado / max * 100, { thin: true,
                      color: x.bom ? 'var(--ok-500)' : 'var(--bad-500)' })
                  );
                } }
            ]
          })
        })
      );
    }

    /* ==================================================================== */
    function alertas(r, mkt, orc) {
      var itens = [];

      if (r.resultado < 0) {
        itens.push({ tone: 'bad', icon: 'alert', title: 'Resultado negativo na competência',
          text: 'Prejuízo de ' + F.moneyShort(Math.abs(r.resultado)) + '. Faltam ' +
            F.moneyShort(Math.max(0, r.pontoEquilibrio - r.receitaLiquida)) + ' de receita para o equilíbrio.' });
      }
      if (r.margemPct > 0 && r.margemPct < 10) {
        itens.push({ tone: 'warn', icon: 'percent', title: 'Margem apertada',
          text: 'Margem líquida de ' + F.pct(r.margemPct, 1) + '. Qualquer estorno relevante zera o mês.' });
      }
      if (mkt.investimento && mkt.roi < 0) {
        itens.push({ tone: 'warn', icon: 'trendDown', title: 'Marketing pago no vermelho',
          text: F.moneyShort(mkt.investimento) + ' investidos geraram ' + F.moneyShort(mkt.receita) +
            ' de receita. CAC de ' + F.money0(mkt.cac) + '.' });
      }
      var estouro = orc.filter(function (x) {
        return x.conta.tipo === 'despesa' && x.orcado && x.desvioPct > 15;
      }).sort(function (a, b) { return b.desvioValor - a.desvioValor; })[0];
      if (estouro) {
        itens.push({ tone: 'warn', icon: 'calc', title: estouro.conta.nome + ' estourou o orçamento',
          text: F.money0(estouro.realizado) + ' contra ' + F.money0(estouro.orcado) +
            ' previstos (' + F.pctSigned(estouro.desvioPct, 0) + ').' });
      }
      if (r.resultado > 0 && r.margemPct >= 15) {
        itens.push({ tone: 'ok', icon: 'checkcircle', title: 'Operação saudável',
          text: 'Margem líquida de ' + F.pct(r.margemPct, 1) + ' com resultado de ' +
            F.moneyShort(r.resultado) + ' na competência.' });
      }

      if (!itens.length) return null;
      return W.section({
        title: 'Leitura do mês',
        body: W.insightList(itens, 4)
      });
    }

    function linha(label, valor) {
      return h('div.row.between.gap-3',
        h('span.t-small.t-dim', { text: label }),
        h('b.t-small.t-num', { text: valor })
      );
    }

    function box(minH, draw) {
      var el = h('div', { style: { minHeight: minH + 'px' } });
      M.defer(function () { draw(el); });
      return el;
    }
  };

  /* Seletor de competência compartilhado pelo módulo financeiro */
  function seletorComp(comps, atual) {
    return h('select.select', {
      style: { width: 'auto', minWidth: '180px' }, 'aria-label': 'Competência',
      onChange: function () { AGIR.router.setQuery({ comp: this.value }); }
    }, comps.map(function (c) {
      return h('option', { value: c.value, text: c.label, selected: c.value === atual });
    }));
  }

  function rotulo(comp) {
    var d = AGIR.fmt.toDate(comp + '-01');
    return AGIR.fmt.MES_LONGO[d.getMonth()] + '/' + d.getFullYear();
  }

  AGIR.util.seletorComp = seletorComp;
  AGIR.util.rotuloComp = rotulo;
})(window);
