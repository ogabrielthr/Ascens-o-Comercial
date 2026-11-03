/* ==========================================================================
   AGIR — CRM / Relatórios Gerenciais
   Seis lentes sobre a mesma operação. Cada aba responde uma pergunta:
   "vamos bater?", "onde trava?", "quem?", "o quê?", "por que perde?",
   "com que esforço?".
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  var ABAS = [
    { value: 'visao',    label: 'Visão geral',        icon: 'gauge',    pergunta: 'Vamos bater a meta?' },
    { value: 'funil',    label: 'Funil',              icon: 'filter',   pergunta: 'Onde o funil trava?' },
    { value: 'time',     label: 'Vendedores',         icon: 'users',    pergunta: 'Quem puxa e quem trava?' },
    { value: 'mix',      label: 'Produtos e canais',  icon: 'layers',   pergunta: 'O que vende e de onde vem?' },
    { value: 'perdas',   label: 'Perdas',             icon: 'trendDown',pergunta: 'Por que a gente perde?' },
    { value: 'esforco',  label: 'Esforço',            icon: 'phone',    pergunta: 'Quanto custa cada venda?' }
  ];

  AGIR.pages.crmRelatorios = function (node, ctx) {
    var q = ctx.query || {};
    var f = W.readFilters(q);
    var aba = q.aba || 'visao';
    var abaDef = ABAS.find(function (a) { return a.value === aba; }) || ABAS[0];

    node.appendChild(W.pageHead({
      icon: 'chart',
      title: 'Relatórios gerenciais',
      sub: abaDef.pergunta,
      actions: [
        h('button.btn.btn--sm', { onClick: function () { global.print(); } },
          icon('download'), h('span', { text: 'Imprimir / PDF' })),
        h('button.btn.btn--sm', { onClick: exportarResumo },
          icon('filetext'), h('span', { text: 'Exportar CSV' }))
      ]
    }));

    node.appendChild(UI.tabs(ABAS.map(function (a) {
      return { value: a.value, label: a.label, icon: a.icon };
    }), aba, function (v) { AGIR.router.setQuery({ aba: v === 'visao' ? null : v }); }));

    node.appendChild(W.filterBar(ctx, ['periodo', 'owner', 'equipe', 'produto', 'origem', 'banco']));

    var host = h('div');
    node.appendChild(host);
    D.mount(host, UI.skeletonChart(420));
    M.defer(function () {
      D.mount(host, ({
        visao: abaVisao, funil: abaFunil, time: abaTime,
        mix: abaMix, perdas: abaPerdas, esforco: abaEsforco
      }[aba] || abaVisao)());
      M.initReveal(host);
    });

    /* ======================================================================
       Aba 1 — Visão geral
       ====================================================================== */
    function abaVisao() {
      var K = An.kpis(f), a = K.atual, d = K.d;
      var sr = An.serie(f, ['vendasValor', 'comissao', 'vendasQtd', 'perdidasValor', 'leads']);
      var pace = An.paceMes(f);

      return h('div.col.gap-6',
        h('div.grid.g-4',
          W.kpi({ label: 'Estorno solicitado ganho', raw: a.vendasValor, format: F.moneyShort,
            icon: 'coins', tone: 'brand', delta: d.vendasValor, spark: sr.s.vendasValor }),
          W.kpi({ label: 'Receita de serviços', raw: a.comissao, format: F.moneyShort,
            icon: 'percent', tone: 'ok', delta: d.comissao, spark: sr.s.comissao }),
          W.kpi({ label: 'Contratos fechados', raw: a.vendasQtd, icon: 'trophy',
            tone: 'info', delta: d.vendasQtd, spark: sr.s.vendasQtd }),
          W.kpi({ label: 'Estorno solicitado perdido', raw: a.perdidasValor, format: F.moneyShort,
            icon: 'trendDown', tone: 'bad', delta: d.perdidasValor, invertDelta: true,
            sub: F.plural(a.perdidasQtd, 'oportunidade', 'oportunidades') })
        ),

        W.section({
          title: 'Estorno solicitado diário × acumulado',
          sub: 'Barra é o dia, linha é o acumulado do período',
          body: box(320, function (el) {
            C.area(el, {
              uid: 'rel-prod', height: 300, labels: sr.labels,
              series: [
                { name: 'Estorno solicitado do dia', values: sr.s.vendasValor, kind: 'bar', color: 'var(--series-1)' },
                { name: 'Acumulado', values: An.acumular(sr.s.vendasValor), kind: 'area', color: 'var(--series-3)', axis: 'y2' }
              ],
              yFormat: F.moneyShort, y2Format: F.moneyShort
            });
          })
        }),

        h('div.grid.g-2',
          W.section({
            title: 'Ganho × perdido',
            sub: 'Estorno Solicitado que entrou e que escapou',
            body: box(260, function (el) {
              C.bars(el, {
                height: 240, labels: sr.labels,
                series: [
                  { name: 'Ganho', values: sr.s.vendasValor, color: 'var(--ok-500)' },
                  { name: 'Perdido', values: sr.s.perdidasValor, color: 'var(--bad-500)' }
                ],
                yFormat: F.moneyShort
              });
            })
          }),
          W.section({
            title: 'Resumo do período',
            body: h('div.col.gap-3',
              linha('Leads novos', F.num(a.leadsNovos), d.leadsNovos),
              linha('Ligações feitas', F.num(a.ligacoes), d.ligacoes),
              linha('Contatos efetivos', F.num(a.ligacoesAtendidas), d.ligacoesAtendidas),
              linha('Agendamentos', F.num(a.agendamentos), d.agendamentos),
              linha('Reuniões realizadas', F.num(a.reunioes), d.reunioes),
              linha('Propostas enviadas', F.num(a.propostas), d.propostas),
              linha('Contratos fechados', F.num(a.vendasQtd), d.vendasQtd),
              h('hr'),
              linha('Estorno médio por venda', F.money0(a.ticket), d.ticket),
              linha('Ciclo médio', F.num(a.ciclo, 0) + ' dias', d.ciclo, true),
              linha('Taxa de ganho', F.pct(a.winRate, 1), d.winRate),
              linha('Tempo médio em linha', W.duracao(Math.round(a.tma)), null)
            )
          })
        ),

        pace.vendasValor.meta ? W.section({
          title: 'Projeção da meta de Estorno Solicitado',
          sub: 'Considera o Estorno Solicitado dos leads ganhos, com ' + F.plural(pace.uteisRestantes, 'dia útil', 'dias úteis') + ' restantes',
          body: h('div.grid.g-4',
            W.miniStat('Estorno solicitado', F.money0(pace.vendasValor.realizado), 'coins'),
            W.miniStat('Meta', F.money0(pace.vendasValor.meta), 'target'),
            W.miniStat('Projeção', F.money0(pace.vendasValor.projecao), 'trendUp',
              F.pct(pace.vendasValor.meta ? pace.vendasValor.projecao / pace.vendasValor.meta * 100 : 0, 0) + ' da meta'),
            W.miniStat('Precisa por dia', F.money0(pace.uteisRestantes
              ? Math.max(0, pace.vendasValor.meta - pace.vendasValor.realizado) / pace.uteisRestantes : 0),
              'flame', 'para fechar no alvo')
          )
        }) : null
      );
    }

    /* ======================================================================
       Aba 2 — Funil
       ====================================================================== */
    function abaFunil() {
      var steps = An.funil(f);
      var K = An.kpis(f), a = K.atual, d = K.d;
      var cols = An.pipeline(f);

      return h('div.col.gap-6',
        h('div.grid.g-2',
          W.section({
            title: 'Funil do período',
            sub: 'Estorno Solicitado por etapa e a queda entre elas',
            body: box(420, function (el) {
              C.funnel(el, { steps: steps, rowH: 58, goodRate: 50, warnRate: 30 });
            })
          }),
          W.section({
            title: 'Diagnóstico das passagens',
            sub: 'Comparação com a referência de conversão da agência',
            body: h('div.col.gap-5', [
              ['Ligação → agendamento', a.convLigAgend, d.convLigAgend, 6,
                'Se está abaixo, o problema costuma ser abertura da ligação ou qualidade do mailing.'],
              ['Agendamento → reunião', a.convAgendReuni, d.convAgendReuni, 65,
                'Abaixo disso é no-show. Confirmação D-1 e lembrete no dia resolvem a maior parte.'],
              ['Reunião → proposta', a.convReuniProp, d.convReuniProp, 55,
                'Abaixo disso é qualificação fraca: está reunindo com quem não tem margem.'],
              ['Proposta → venda', a.convPropVenda, d.convPropVenda, 30,
                'Abaixo disso é preço, prazo de resposta ou falta de follow-up estruturado.']
            ].map(function (r) { return diagnostico(r[0], r[1], r[2], r[3], r[4]); }))
          })
        ),

        W.section({
          title: 'Onde o Estorno Solicitado está parado agora',
          sub: 'Foto do pipeline aberto neste momento, por etapa',
          flush: true,
          body: W.dataTable({
            rows: cols,
            onRowClick: function () { AGIR.router.go('/crm/pipeline'); },
            columns: [
              { key: 'nome', label: 'Etapa', sortable: false,
                render: function (r) {
                  return h('span.row.gap-2', h('i.dot', { style: { background: r.etapa.cor } }),
                    h('b', { text: r.etapa.nome }));
                } },
              { key: 'qtd', label: 'Qtde', align: 'right', sortable: false,
                render: function (r) { return h('span.strong.t-num', { text: F.num(r.qtd) }); } },
              { key: 'valor', label: 'Estorno solicitado', align: 'right', sortable: false,
                render: function (r) { return h('span.t-num', { text: F.moneyShort(r.valor) }); } },
              { key: 'prob', label: 'Prob.', align: 'right', sortable: false,
                render: function (r) { return h('span.badge', { text: r.etapa.prob + '%' }); } },
              { key: 'pond', label: 'Ponderado', align: 'right', sortable: false,
                render: function (r) { return h('span.strong.t-num', { text: F.moneyShort(r.ponderado) }); } },
              { key: 'ticket', label: 'Estorno médio', align: 'right', sortable: false,
                render: function (r) {
                  return h('span.t-num.t-dim', { text: r.qtd ? F.moneyShort(r.valor / r.qtd) : '—' });
                } },
              { key: 'sla', label: 'Fora do prazo', align: 'right', sortable: false,
                render: function (r) {
                  if (!r.estourados) return h('span.badge.badge--ok', { text: 'em dia' });
                  return h('span.badge.badge--bad', { text: r.estourados + ' de ' + r.qtd });
                } }
            ]
          })
        }),

        W.section({
          title: 'Oportunidades mais críticas',
          sub: 'Ordenadas por valor × dias de atraso — comece por aqui',
          flush: true,
          body: (function () {
            var criticas = An.slaEstourado(f).slice(0, 15);
            if (!criticas.length) {
              return UI.empty({ icon: 'checkcircle', title: 'Nenhuma oportunidade fora do prazo',
                text: 'Todo o funil está dentro do SLA configurado para cada etapa.' });
            }
            return W.dataTable({
              rows: criticas,
              onRowClick: function (r) { AGIR.pages.oppDrawer(r.op.id); },
              columns: [
                { key: 'cliente', label: 'Cliente', sortable: false,
                  render: function (r) {
                    return h('div',
                      h('div.strong', { text: r.op.cliente }),
                      h('div.t-tiny.t-dimmer', { text: (S().byId('produtos', r.op.produtoId) || {}).nome })
                    );
                  } },
                { key: 'etapa', label: 'Etapa', sortable: false,
                  render: function (r) { return W.etapaBadge(r.op.etapaId); } },
                { key: 'valor', label: 'Estorno solicitado', align: 'right', sortable: false,
                  render: function (r) { return h('span.strong.t-num', { text: F.money0(An.valorCRM(r.op)) }); } },
                { key: 'dias', label: 'Parada há', align: 'right', sortable: false,
                  render: function (r) { return h('span.t-num', { text: F.plural(r.dias, 'dia') }); } },
                { key: 'excesso', label: 'Atraso', align: 'right', sortable: false,
                  render: function (r) {
                    return h('span.badge.badge--bad', { text: '+' + r.excesso + 'd sobre o SLA' });
                  } },
                { key: 'owner', label: 'Responsável', sortable: false,
                  render: function (r) { return W.ownerChip(r.op.ownerId, 'xs'); } }
              ]
            });
          })()
        })
      );
    }

    /* ======================================================================
       Aba 3 — Vendedores
       ====================================================================== */
    function abaTime() {
      var rk = An.ranking(f);
      var comAtividade = rk.filter(function (r) {
        return r.c.vendasValor || r.c.ligacoes || r.c.propostas;
      });

      return h('div.col.gap-6',
        h('div.grid.g-2',
          W.section({
            title: 'Estorno solicitado por vendedor',
            body: box(comAtividade.length * 34 + 20, function (el) {
              C.ranking(el, {
                items: comAtividade.map(function (r, i) {
                  return {
                    label: r.usuario.nome, value: r.c.vendasValor,
                    color: i === 0 ? 'var(--brand-500)' : 'var(--series-2)',
                    sub: r.metaValor ? F.pct(r.pctMeta, 0) + ' da meta' : ''
                  };
                }),
                format: F.moneyShort
              });
            })
          }),
          W.section({
            title: 'Esforço por vendedor',
            sub: 'Ligações e propostas no período',
            body: box(260, function (el) {
              C.bars(el, {
                height: 240,
                labels: comAtividade.map(function (r) { return F.firstName(r.usuario.nome); }),
                series: [
                  { name: 'Ligações', values: comAtividade.map(function (r) { return r.c.ligacoes; }), color: 'var(--series-2)' },
                  { name: 'Propostas', values: comAtividade.map(function (r) { return r.c.propostas; }), color: 'var(--series-6)' }
                ],
                yFormat: F.numShort
              });
            })
          })
        ),

        W.section({
          title: 'Tabela completa',
          sub: 'Clique para abrir o painel individual do vendedor',
          flush: true,
          body: W.dataTable({
            rows: rk,
            sort: { key: 'produzido', dir: 'desc' },
            onRowClick: function (r) { AGIR.pages.vendedorDrawer(r.usuario.id); },
            columns: [
              { key: 'nome', label: 'Vendedor', width: '20%',
                value: function (r) { return r.usuario.nome; },
                render: function (r) {
                  var c = S().byId('cargos', r.usuario.cargoId) || {};
                  var eq = S().byId('equipes', r.usuario.equipeId) || {};
                  return h('div.row.gap-3', AGIR.avatar(r.usuario, 'sm'),
                    h('div', { style: { minWidth: 0 } },
                      h('div.strong.truncate', { text: r.usuario.nome }),
                      h('div.t-tiny.t-dimmer', { text: c.nome + ' · ' + eq.nome })
                    ));
                } },
              { key: 'produzido', label: 'Estorno solicitado', align: 'right',
                value: function (r) { return r.c.vendasValor; },
                render: function (r) { return h('span.strong.t-num', { text: F.moneyShort(r.c.vendasValor) }); } },
              { key: 'meta', label: '% meta', align: 'right',
                value: function (r) { return r.pctMeta; },
                render: function (r) {
                  if (!r.metaValor) return h('span.t-dimmer', { text: '—' });
                  return h('span.badge' + (r.pctMeta >= 100 ? '.badge--ok' : r.pctMeta >= 70 ? '.badge--warn' : '.badge--bad'),
                    { text: F.pct(r.pctMeta, 0) });
                } },
              { key: 'vendas', label: 'Vendas', align: 'right',
                value: function (r) { return r.c.vendasQtd; },
                render: function (r) { return h('span.t-num', { text: F.num(r.c.vendasQtd) }); } },
              { key: 'ticket', label: 'Estorno médio', align: 'right',
                value: function (r) { return r.c.ticket; },
                render: function (r) { return h('span.t-num', { text: r.c.ticket ? F.moneyShort(r.c.ticket) : '—' }); } },
              { key: 'lig', label: 'Ligações', align: 'right',
                value: function (r) { return r.c.ligacoes; },
                render: function (r) { return h('span.t-num', { text: F.num(r.c.ligacoes) }); } },
              { key: 'agend', label: 'Agend.', align: 'right',
                value: function (r) { return r.c.agendamentos; },
                render: function (r) { return h('span.t-num', { text: F.num(r.c.agendamentos) }); } },
              { key: 'prop', label: 'Propostas', align: 'right',
                value: function (r) { return r.c.propostas; },
                render: function (r) { return h('span.t-num', { text: F.num(r.c.propostas) }); } },
              { key: 'convp', label: 'Prop→venda', align: 'right',
                value: function (r) { return r.c.convPropVenda; },
                render: function (r) {
                  var v = r.c.convPropVenda;
                  return h('span.badge' + (v >= 30 ? '.badge--ok' : v >= 18 ? '.badge--warn' : '.badge--bad'),
                    { text: F.pct(v, 0) });
                } },
              { key: 'ciclo', label: 'Ciclo', align: 'right',
                value: function (r) { return r.c.ciclo; },
                render: function (r) { return h('span.t-num', { text: r.c.ciclo ? F.num(r.c.ciclo, 0) + 'd' : '—' }); } },
              { key: 'tend', label: 'Tendência', sortable: false,
                render: function (r) {
                  return C.sparkline(r.tendencia, { width: 76, height: 24,
                    color: r.dVendas >= 0 ? 'var(--ok-500)' : 'var(--bad-500)' });
                } }
            ]
          })
        }),

        W.section({
          title: 'Comparativo de eficiência',
          sub: 'Quantas ligações cada vendedor precisa para fechar uma venda',
          body: h('div.col.gap-4', comAtividade.map(function (r) {
            var porVenda = r.c.vendasQtd ? r.c.ligacoes / r.c.vendasQtd : 0;
            var maxV = Math.max.apply(null, comAtividade.map(function (x) {
              return x.c.vendasQtd ? x.c.ligacoes / x.c.vendasQtd : 0;
            }).concat([1]));
            return h('div.col.gap-2',
              h('div.row.between',
                h('span.row.gap-2', AGIR.avatar(r.usuario, 'xs'),
                  h('span.t-small', { text: r.usuario.nome })),
                h('b.t-small.t-num', {
                  text: porVenda ? F.num(porVenda, 0) + ' ligações por venda' : 'sem venda no período'
                })
              ),
              M.progress(porVenda ? (porVenda / maxV) * 100 : 0, {
                thin: true,
                color: porVenda && porVenda <= maxV * 0.55 ? 'var(--ok-500)' : 'var(--warn-500)'
              })
            );
          }))
        })
      );
    }

    /* ======================================================================
       Aba 4 — Produtos e canais
       ====================================================================== */
    function abaMix() {
      var porProduto = An.porDimensao(f, 'produtoId', 'valor');
      var porOrigem = An.porDimensao(f, 'origemId', 'qtd');
      var porBanco = An.porDimensao(f, 'bancoId', 'valor');

      return h('div.col.gap-6',
        h('div.grid.g-2',
          W.section({
            title: 'Estorno solicitado por produto',
            body: box(220, function (el) {
              C.donut(el, {
                height: 210, items: porProduto,
                center: { value: F.moneyShort(porProduto.reduce(function (a, i) { return a + i.value; }, 0)), label: 'estorno solicitado' },
                format: F.moneyShort, unitLabel: 'Estorno solicitado'
              });
            })
          }),
          W.section({
            title: 'Rentabilidade por produto',
            sub: 'Receita gerada e taxa de ganho de cada linha',
            flush: true,
            body: W.dataTable({
              rows: porProduto,
              sort: { key: 'comissao', dir: 'desc' },
              columns: [
                { key: 'label', label: 'Produto',
                  render: function (r) {
                    var p = S().byId('produtos', r.id) || {};
                    return h('span.row.gap-2', h('i.dot', { style: { background: p.cor } }),
                      h('span.strong', { text: r.label }));
                  } },
                { key: 'qtd', label: 'Ops', align: 'right',
                  render: function (r) { return h('span.t-num', { text: F.num(r.qtd) }); } },
                { key: 'valor', label: 'Estorno solicitado', align: 'right',
                  render: function (r) { return h('span.t-num', { text: F.moneyShort(r.valor) }); } },
                { key: 'comissao', label: 'Receita prevista', align: 'right',
                  render: function (r) { return h('span.strong.t-num', { text: F.moneyShort(r.comissao) }); } },
                { key: 'winRate', label: 'Taxa de ganho', align: 'right',
                  render: function (r) {
                    return h('span.badge' + (r.winRate >= 40 ? '.badge--ok' : r.winRate >= 25 ? '.badge--warn' : '.badge--bad'),
                      { text: F.pct(r.winRate, 0) });
                  } }
              ]
            })
          })
        ),

        W.section({
          title: 'Desempenho por canal de origem',
          sub: 'Quem traz mais Estorno Solicitado não é necessariamente quem traz mais conversão',
          flush: true,
          body: W.dataTable({
            rows: porOrigem,
            sort: { key: 'qtd', dir: 'desc' },
            columns: [
              { key: 'label', label: 'Origem',
                render: function (r) {
                  return h('span.row.gap-2', h('i.dot', { style: { background: r.color } }),
                    h('span.strong', { text: r.label }));
                } },
              { key: 'qtd', label: 'Leads', align: 'right',
                render: function (r) { return h('span.t-num', { text: F.num(r.qtd) }); } },
              { key: 'ganhos', label: 'Ganhos', align: 'right',
                render: function (r) { return h('span.t-num', { text: F.num(r.ganhos) }); } },
              { key: 'winRate', label: 'Conversão', align: 'right', width: '18%',
                render: function (r) {
                  return h('div.col.gap-1',
                    h('b.t-num', { style: { color: r.winRate >= 30 ? 'var(--ok-500)' : 'var(--ink-2)' },
                      text: F.pct(r.winRate, 1) }),
                    M.progress(Math.min(100, r.winRate * 2), { thin: true, color: r.color || 'var(--brand-500)' })
                  );
                } },
              { key: 'valor', label: 'Estorno solicitado', align: 'right',
                render: function (r) { return h('span.t-num', { text: F.moneyShort(r.valor) }); } },
              { key: 'ticket', label: 'Estorno médio', align: 'right',
                value: function (r) { return r.ganhos ? r.valor / r.ganhos : 0; },
                render: function (r) {
                  return h('span.t-num.strong', { text: r.ganhos ? F.moneyShort(r.valor / r.ganhos) : '—' });
                } }
            ]
          })
        }),

        W.section({
          title: 'Concentração por banco',
          sub: 'Dependência excessiva de um banco é risco operacional',
          body: box(porBanco.length * 34 + 20, function (el) {
            C.ranking(el, {
              items: porBanco.map(function (r, i) {
                return { label: r.label, value: r.valor, sub: F.plural(r.qtd, 'op'), color: C.PALETTE[i % 8] };
              }),
              format: F.moneyShort
            });
          })
        })
      );
    }

    /* ======================================================================
       Aba 5 — Perdas
       ====================================================================== */
    function abaPerdas() {
      var motivos = An.porDimensao(f, 'motivoPerdaId', 'qtd');
      var totalQtd = motivos.reduce(function (a, m) { return a + m.qtd; }, 0);
      var totalValor = motivos.reduce(function (a, m) { return a + m.valor; }, 0);
      var K = An.kpis(f).atual;

      if (!totalQtd) {
        return W.section({
          body: UI.empty({
            icon: 'checkcircle', title: 'Nenhuma perda registrada no período',
            text: 'Ou o time está impecável, ou não está marcando o motivo ao perder. Vale conferir no pipeline.'
          })
        });
      }

      return h('div.col.gap-6',
        h('div.grid.g-4',
          W.kpi({ label: 'Oportunidades perdidas', raw: totalQtd, icon: 'x', tone: 'bad' }),
          W.kpi({ label: 'Estorno solicitado perdido', raw: totalValor, format: F.moneyShort, icon: 'coins', tone: 'bad' }),
          W.kpi({ label: 'Receita potencial perdida', raw: motivos.reduce(function (a, m) { return a + m.comissao; }, 0),
            format: F.moneyShort, icon: 'percent', tone: 'warn' }),
          W.kpi({ label: 'Taxa de ganho', raw: K.winRate, format: function (v) { return F.pct(v, 1); },
            icon: 'target', tone: K.winRate >= 40 ? 'ok' : 'warn' })
        ),

        h('div.grid.g-2',
          W.section({
            title: 'Distribuição dos motivos',
            body: box(220, function (el) {
              C.donut(el, {
                height: 210,
                items: motivos.map(function (m, i) {
                  return { label: m.label, value: m.qtd, color: C.PALETTE[i % 8] };
                }),
                center: { value: F.num(totalQtd), label: 'perdas' },
                format: F.num, unitLabel: 'Perdas'
              });
            })
          }),
          W.section({
            title: 'Impacto financeiro por motivo',
            sub: 'Quantidade não é impacto — olhe o valor',
            body: box(motivos.length * 34 + 20, function (el) {
              C.ranking(el, {
                items: motivos.slice().sort(function (a, b) { return b.valor - a.valor; })
                  .map(function (m) {
                    return { label: m.label, value: m.valor, sub: F.plural(m.qtd, 'perda'),
                      color: 'var(--bad-500)' };
                  }),
                format: F.moneyShort
              });
            })
          })
        ),

        W.section({
          title: 'O que fazer com cada motivo',
          sub: 'Cada perda tem um caminho diferente de recuperação',
          body: h('div.col.gap-3', motivos.slice(0, 6).map(function (m) {
            return h('div.insight.insight--' + (m.qtd / totalQtd >= 0.25 ? 'bad' : 'warn'),
              h('div.insight__ico', icon(ACAO[m.id] ? ACAO[m.id].icon : 'info')),
              h('div.grow',
                h('div.insight__title', {
                  text: m.label + ' — ' + F.pct(m.qtd / totalQtd * 100, 0) + ' das perdas (' +
                    F.moneyShort(m.valor) + ')'
                }),
                h('div.insight__text', { text: (ACAO[m.id] || {}).texto || 'Revisar com o time em reunião de pipeline.' })
              )
            );
          }))
        }),

        W.section({
          title: 'Perdas recentes',
          flush: true,
          body: (function () {
            var r = An.range(f.periodo);
            var perdidas = An.opps(f).filter(function (o) {
              return o.status === 'perdido' && An.inRange(o.fechadoEm, r);
            }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 20);
            return W.dataTable({
              rows: perdidas,
              onRowClick: function (o) { AGIR.pages.oppDrawer(o.id); },
              columns: [
                { key: 'cliente', label: 'Cliente', sortable: false,
                  render: function (o) { return h('span.strong', { text: o.cliente }); } },
                { key: 'produto', label: 'Produto', sortable: false,
                  render: function (o) { return h('span', { text: (S().byId('produtos', o.produtoId) || {}).nome }); } },
                { key: 'motivo', label: 'Motivo', sortable: false,
                  render: function (o) {
                    return h('span.badge.badge--bad', { text: (S().byId('motivosPerda', o.motivoPerdaId) || {}).nome || '—' });
                  } },
                { key: 'valor', label: 'Estorno solicitado', align: 'right', sortable: false,
                  render: function (o) { return h('span.strong.t-num', { text: F.money0(An.valorCRM(o)) }); } },
                { key: 'owner', label: 'Responsável', sortable: false,
                  render: function (o) { return W.ownerChip(o.ownerId, 'xs'); } },
                { key: 'quando', label: 'Perdida em', align: 'right', sortable: false,
                  render: function (o) { return h('span.t-dim', { text: F.date(o.fechadoEm) }); } }
              ]
            });
          })()
        })
      );
    }

    var ACAO = {
      mp_margem: { icon: 'calc', texto: 'Margem é bloqueio de sistema, não objeção. Vale qualificar a margem ANTES de agendar reunião e criar uma régua de reativação para 90 dias, quando a margem volta.' },
      mp_taxa:   { icon: 'percent', texto: 'Perder por taxa recorrente indica tabela desalinhada ou banco errado para o perfil. Compare a taxa média das perdas com a dos ganhos por banco.' },
      mp_sumiu:  { icon: 'phone', texto: 'Cliente que some é falha de cadência, não de interesse. Estruture 5 toques em canais diferentes antes de dar como perdido.' },
      mp_desist: { icon: 'lightbulb', texto: 'Desistência costuma esconder objeção não tratada. Vale ouvir a gravação das últimas três e mapear onde o assunto morreu.' },
      mp_recusa: { icon: 'shield', texto: 'Recusa do banco é filtro de crédito. Se está alta, revise o perfil que está entrando no funil e o banco escolhido para cada faixa.' },
      mp_outro:  { icon: 'clock', texto: 'Compare o prazo de resposta e o valor apresentado pela agência. Meça o intervalo entre a proposta e o primeiro follow-up.' },
      mp_doc:    { icon: 'filetext', texto: 'Documentação incompleta é processo, não venda. Um checklist enviado junto com a proposta reduz muito esse número.' },
      mp_perfil: { icon: 'filter', texto: 'Fora do perfil no fim do funil significa qualificação fraca no começo. Ajuste o critério de aceite do lead.' }
    };

    /* ======================================================================
       Aba 6 — Esforço
       ====================================================================== */
    function abaEsforco() {
      var K = An.kpis(f), a = K.atual, d = K.d;
      var sr = An.serie(f, ['ligacoes', 'atendidas', 'agendamentos', 'propostas', 'vendasQtd']);
      var hm = An.heatAtividade(f);
      var comp = An.competenciaAtual();
      var mkt = An.marketing(comp);

      var ligacoesPorVenda = a.vendasQtd ? a.ligacoes / a.vendasQtd : 0;
      var propostasPorVenda = a.vendasQtd ? a.propostas / a.vendasQtd : 0;

      return h('div.col.gap-6',
        h('div.grid.g-4',
          W.kpi({ label: 'Ligações por venda', raw: ligacoesPorVenda,
            format: function (v) { return F.num(v, 0); }, icon: 'phone', tone: 'info',
            sub: 'quanto menor, mais eficiente' }),
          W.kpi({ label: 'Propostas por venda', raw: propostasPorVenda,
            format: function (v) { return F.num(v, 1); }, icon: 'filetext', tone: 'plum' }),
          W.kpi({ label: 'Tempo médio em linha', raw: a.tma,
            format: function (v) { return W.duracao(Math.round(v)); }, icon: 'clock', tone: 'brand',
            sub: 'nas ligações atendidas' }),
          W.kpi({ label: 'Taxa de atendimento', raw: a.taxaAtendimento,
            format: function (v) { return F.pct(v, 1); }, icon: 'inbox',
            tone: a.taxaAtendimento >= 35 ? 'ok' : 'warn', delta: d.taxaAtendimento })
        ),

        W.section({
          title: 'Esforço × resultado ao longo do período',
          sub: 'Se a linha de esforço sobe e a de resultado não acompanha, o problema é qualidade, não volume',
          body: box(300, function (el) {
            C.area(el, {
              uid: 'rel-esf', height: 280, labels: sr.labels,
              series: [
                { name: 'Ligações', values: sr.s.ligacoes, kind: 'bar', color: 'var(--series-2)' },
                { name: 'Contatos efetivos', values: sr.s.atendidas, kind: 'line', color: 'var(--series-7)' },
                { name: 'Agendamentos', values: sr.s.agendamentos, kind: 'line', color: 'var(--series-4)', axis: 'y2' },
                { name: 'Vendas', values: sr.s.vendasQtd, kind: 'line', color: 'var(--ok-500)', axis: 'y2' }
              ],
              yFormat: F.numShort, y2Format: F.numShort
            });
          })
        }),

        h('div.grid.g-2',
          W.section({
            title: 'Melhor horário para falar com o cliente',
            sub: 'Quanto mais claro o quadrado, maior o volume de contato registrado',
            body: box(220, function (el) {
              C.heatmap(el, { rows: hm.rows, cols: hm.cols, data: hm.data, cellH: 26, unit: 'Contatos' });
            })
          }),
          W.section({
            title: 'Retorno de marketing pago',
            sub: 'Competência ' + F.monthYear(F.toDate(comp + '-01')) + ' — Meta Ads e Google Ads',
            body: h('div.col.gap-3',
              linha('Investimento', F.money0(mkt.investimento)),
              linha('Leads gerados', F.num(mkt.leads)),
              linha('Custo por lead (CPL)', F.money0(mkt.cpl)),
              linha('Vendas originadas', F.num(mkt.vendas)),
              linha('Custo de aquisição (CAC)', F.money0(mkt.cac)),
              linha('Receita de serviços', F.money0(mkt.receita)),
              h('hr'),
              h('div.row.between',
                h('span.t-small.t-dim', { text: 'ROI' }),
                h('b.t-h4.t-num', {
                  style: { color: mkt.roi > 0 ? 'var(--ok-500)' : 'var(--bad-500)' },
                  text: F.pctSigned(mkt.roi, 0)
                })
              ),
              h('div.t-tiny.t-dimmer', {
                text: mkt.roi > 0
                  ? 'Cada R$ 1 investido devolveu ' + F.money(1 + mkt.roi / 100) + ' em receita.'
                  : 'O canal pago ainda não se pagou nesta competência.'
              })
            )
          })
        )
      );
    }

    /* ======================================================================
       Auxiliares
       ====================================================================== */
    function linha(label, valor, delta, inverter) {
      return h('div.row.between.gap-3',
        h('span.t-small.t-dim', { text: label }),
        h('span.row.gap-2',
          (delta !== undefined && delta !== null && isFinite(delta) && Math.abs(delta) >= 0.5)
            ? h('span.delta.delta--' + ((inverter ? delta < 0 : delta > 0) ? 'up' : 'down'),
                h('span', { text: F.pctSigned(delta, 0) }))
            : null,
          h('b.t-small.t-num', { text: valor })
        )
      );
    }

    function diagnostico(label, valor, delta, ref, dica) {
      var ok = valor >= ref;
      return h('div.col.gap-2',
        h('div.row.between.gap-2',
          h('span.t-small', { style: { fontWeight: 600 }, text: label }),
          h('span.row.gap-2',
            h('span.t-tiny.t-dimmer', { text: 'ref. ' + F.pct(ref, 0) }),
            h('b.t-num', { style: { color: ok ? 'var(--ok-500)' : 'var(--bad-500)' }, text: F.pct(valor, 1) })
          )
        ),
        M.progress(Math.min(100, (valor / Math.max(ref, valor || 1)) * 100), {
          thin: true, color: ok ? 'var(--ok-500)' : 'var(--bad-500)'
        }),
        !ok ? h('div.t-tiny.t-dimmer', { text: dica }) : null
      );
    }

    function box(minH, draw) {
      var el = h('div', { style: { minHeight: minH + 'px' } });
      M.defer(function () { draw(el); });
      return el;
    }

    function exportarResumo() {
      var rk = An.ranking(f);
      var linhas = [['Vendedor', 'Cargo', 'Estorno solicitado', 'Meta', '% meta', 'Vendas', 'Estorno médio',
        'Ligações', 'Agendamentos', 'Propostas', 'Prop→venda %', 'Ciclo (dias)']];
      rk.forEach(function (r) {
        linhas.push([
          r.usuario.nome,
          (S().byId('cargos', r.usuario.cargoId) || {}).nome,
          br(r.c.vendasValor), br(r.metaValor), br(r.pctMeta), r.c.vendasQtd,
          br(r.c.ticket), r.c.ligacoes, r.c.agendamentos, r.c.propostas,
          br(r.c.convPropVenda), br(r.c.ciclo)
        ]);
      });
      AGIR.util.baixarCSV(linhas, 'ascensao-relatorio-' + f.periodo + '-' + F.iso(new Date()) + '.csv');
    }
    function br(n) { return String(Math.round((n || 0) * 100) / 100).replace('.', ','); }
  };
})(window);
