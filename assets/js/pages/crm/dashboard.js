/* ==========================================================================
   AGIR — CRM / Dashboard
   Leitura executiva: o que está acontecendo, onde está o problema e o que
   fazer hoje. A narrativa vem antes dos gráficos.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  AGIR.pages.crmDashboard = function (node, ctx) {
    var disposed = false, refreshTimer = null;
    function onDataChange() {
      if (disposed || refreshTimer) return;
      refreshTimer = setTimeout(function () { refreshTimer = null; if (!disposed) AGIR.router.resolve(); }, 350);
    }
    if (typeof global.addEventListener === 'function') global.addEventListener('ascensao:crm-refreshed', onDataChange);
    if (typeof AGIR.onPageDispose === 'function') {
      AGIR.onPageDispose(function () {
        disposed = true; clearTimeout(refreshTimer);
        if (typeof global.removeEventListener === 'function') global.removeEventListener('ascensao:crm-refreshed', onDataChange);
      });
    }
    var f = W.readFilters(ctx.query || {});
    var view = (ctx.query || {}).view || 'visao';
    var views = [
      { id: 'visao', label: 'Visao geral', icon: 'gauge' },
      { id: 'metas', label: 'Metas da equipe', icon: 'target' },
      { id: 'funil', label: 'Funil de conversao', icon: 'filter' },
      { id: 'equipe', label: 'Desempenho da equipe', icon: 'users' },
      { id: 'canais', label: 'Origens e perdas', icon: 'chart' },
      { id: 'atividades', label: 'Atividades', icon: 'activity' }
    ];
    if (!views.some(function (item) { return item.id === view; })) view = 'visao';
    var escopo = f.ownerId ? (S().byId('usuarios', f.ownerId) || {}).nome
      : f.equipeId ? (S().byId('equipes', f.equipeId) || {}).nome : 'Toda a equipe';

    node.appendChild(W.pageHead({
      icon: 'gauge',
      title: 'Dashboard comercial',
      sub: escopo + ' · ' + (view === 'metas' && (ctx.query || {}).ano && (ctx.query || {}).mes ? F.monthYear(new Date(+ctx.query.ano, +ctx.query.mes - 1, 1)) : W.rotuloPeriodo(f.periodo)),
      actions: [
        h('button.btn.btn--sm', { onClick: function () { global.print(); } },
          icon('download'), h('span', { text: 'Exportar' })),
        h('a.btn.btn--sm', { href: '#/crm/relatorios' + qs(ctx) },
          icon('chart'), h('span', { text: 'Relatórios detalhados' })),
        h('button.btn.btn--primary', { onClick: function () { AGIR.pages.novaOportunidade(); } },
          icon('plus'), h('span', { text: 'Nova oportunidade' }))
      ]
    }));

    if (view !== 'metas') node.appendChild(W.filterBar(ctx, ['periodo', 'owner', 'equipe', 'produto', 'origem']));

    var host = h('div');
    node.appendChild(h('div.dashboard-layout', dashboardNav(), host));
    D.mount(host, view === 'metas' ? UI.skeletonCards(4, 'g-4') : esqueleto());
    M.defer(function () {
      if (disposed || !host.isConnected) return;
      var finishMeasurement = AGIR.perf ? AGIR.perf.start('dashboard.mount') : function () {};
      if (view === 'metas') {
        D.clear(host);
        var metaQuery = Object.assign({}, ctx.query || {});
        if (metaQuery.periodo && (!metaQuery.ano || !metaQuery.mes)) {
          var ref = An.range(f.periodo).from; metaQuery.ano = ref.getFullYear(); metaQuery.mes = ref.getMonth() + 1;
        }
        AGIR.pages.crmMetas(host, { query: metaQuery, embedded: true, readonly: true });
      } else D.mount(host, montar());
      M.initReveal(host);
      finishMeasurement();
    });

    function dashboardNav() {
      return h('aside.dashboard-nav',
        h('div.dashboard-nav__eyebrow', { text: 'Analise de dados' }),
        h('nav.dashboard-nav__items', views.map(function (item) {
          return h('a.dashboard-nav__item' + (item.id === view ? '.is-active' : ''), {
            href: AGIR.router.href('/crm/dashboard', Object.assign({}, ctx.query || {}, { view: item.id }))
          }, icon(item.icon), h('span', { text: item.label }), item.id === view ? icon('chevRight') : null);
        })),
        h('div.dashboard-nav__foot',
          h('button.btn.btn--sm.btn--block', { onClick: personalizarDashboard },
            icon('settings'), h('span', { text: 'Escolher indicadores' }))
        )
      );
    }

    var widgetOptions = [
      { id: 'metas', label: 'Meta e alertas', text: 'Ritmo da meta e pontos que exigem atencao.' },
      { id: 'kpis', label: 'Indicadores comerciais', text: 'Estorno solicitado, vendas, ticket, ciclo e conversoes.' },
      { id: 'producao', label: 'Estorno acumulado', text: 'Realizado, ritmo ideal e projecao do mes.' },
      { id: 'funil', label: 'Funil de conversao', text: 'Avanco real entre as etapas do pipeline.' },
      { id: 'equipe', label: 'Desempenho da equipe', text: 'Ranking, resultado e atingimento individual.' },
      { id: 'canais', label: 'Origens e perdas', text: 'Produtos, fontes de lead e motivos de perda.' },
      { id: 'atividades', label: 'Ritmo de atividades', text: 'Volume diario e melhores horarios de contato.' },
      { id: 'saude', label: 'Saude do pipeline', text: 'Distribuicao por etapa e oportunidades fora do SLA.' }
    ];

    function selectedWidgets() {
      var saved = (S().get('settings') || {}).dashboardWidgets;
      return Array.isArray(saved) && saved.length ? saved : widgetOptions.map(function (item) { return item.id; });
    }

    function personalizarDashboard() {
      var selected = selectedWidgets();
      var checks = Object.create(null);
      UI.modal({
        title: 'Escolher indicadores',
        sub: 'Monte uma visao de trabalho com apenas as informacoes que ajudam sua rotina.',
        body: h('div.dashboard-widget-picker', widgetOptions.map(function (item) {
          checks[item.id] = h('input', { type: 'checkbox', checked: selected.indexOf(item.id) >= 0 });
          return h('label.dashboard-widget-option',
            checks[item.id],
            h('span.dashboard-widget-option__check', icon('check')),
            h('span.grow', h('b.t-small', { text: item.label }), h('span.t-tiny.t-dimmer', { text: item.text }))
          );
        })),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: api.close }),
            h('button.btn.btn--primary', { text: 'Aplicar selecao', onClick: function () {
              var next = widgetOptions.filter(function (item) { return checks[item.id].checked; })
                .map(function (item) { return item.id; });
              if (!next.length) return UI.toast.warn('Escolha ao menos um indicador');
              S().pref('dashboardWidgets', next);
              AGIR.shell.persistPrefs();
              api.close();
              AGIR.router.resolve();
            } })
          ];
        }
      });
    }

    /* ==================================================================== */
    function montar() {
      var viewWidgets = {
        visao: selectedWidgets(),
        funil: ['funil', 'saude'],
        equipe: ['metas', 'equipe'],
        canais: ['canais'],
        atividades: ['atividades']
      };
      var selected = viewWidgets[view] || [];
      var factories = {
        metas: montarMetas, kpis: montarKpis, producao: montarProducao,
        funil: montarFunil, equipe: montarEquipe, canais: montarCanais,
        atividades: montarAtividades, saude: montarSaude
      };
      /* Cache somente desta montagem: filtros/dados novos nunca reutilizam valores antigos. */
      var pace, serie;
      function getPace() {
        if (!pace) pace = An.paceMes(f);
        return pace;
      }
      function getSerie() {
        if (!serie) {
          var metrics = [];
          if (selected.indexOf('kpis') >= 0) metrics.push('vendasValor', 'comissao', 'vendasQtd');
          if (selected.indexOf('producao') >= 0) metrics.push('estornoSolicitado');
          if (selected.indexOf('atividades') >= 0) metrics.push('ligacoes', 'propostas', 'leads');
          serie = An.serie(f, metrics);
        }
        return serie;
      }
      var wrap = h('div.col.gap-6');
      widgetOptions.forEach(function (item) {
        if (selected.indexOf(item.id) < 0) return;
        var children = factories[item.id]();
        (Array.isArray(children) ? children : [children]).forEach(function (child) {
          child.setAttribute('data-dashboard-widget', item.id);
          wrap.appendChild(child);
        });
      });
      return wrap;

      /* ---------- 1. Meta + insights lado a lado ---------------------- */
      function montarMetas() {
        return h('div.grid', { style: { gridTemplateColumns: 'minmax(0,340px) minmax(0,1fr)' } },
          cardMeta(getPace()),
          W.section({
            title: 'O que merece sua atenção agora',
            sub: 'Gerado a partir do que o time preencheu — ordenado por urgência',
            body: W.insightList(An.insights(f), 4)
          })
        );
      }

      /* ---------- 2. KPIs ---------------------------------------------- */
      function montarKpis() {
        var K = An.kpis(f), a = K.atual, d = K.d, sr = getSerie();
        return [h('div.grid.g-3', { 'data-reveal': true },
          W.kpi({
            label: 'Estorno solicitado', raw: a.vendasValor, format: F.money,
            icon: 'coins', tone: 'brand', delta: d.vendasValor,
            spark: sr.s.vendasValor, deltaLabel: 'vs. ' + K.range.comparacao,
            tip: 'Variação calculada sobre a média por dia útil — ' +
              K.range.uteis + ' dias úteis agora contra ' + K.range.uteisPrev + ' na comparação.'
          }),
          W.kpi({
            label: 'Receita de serviços', raw: a.comissao, format: F.money,
            icon: 'percent', tone: 'ok', delta: d.comissao,
            spark: sr.s.comissao,
            sub: F.pct(a.vendasValor ? a.comissao / a.vendasValor * 100 : 0, 1) + ' do estorno solicitado'
          }),
          W.kpi({
            label: 'Vendas fechadas', raw: a.vendasQtd, icon: 'trophy', tone: 'info',
            delta: d.vendasQtd, spark: sr.s.vendasQtd,
            sub: F.plural(a.perdidasQtd, 'perda') + ' no período'
          })
        ),
        h('div.grid.g-4', { 'data-reveal': true },
          W.kpi({ label: 'Estorno médio por venda', raw: a.ticket, format: F.money, icon: 'receipt',
            tone: 'plum', delta: d.ticket }),
          W.kpi({ label: 'Ciclo médio', raw: a.ciclo, format: function (v) { return F.num(v, 0); },
            unit: ' dias', icon: 'clock', tone: 'warn', delta: d.ciclo, invertDelta: true,
            sub: 'do lead ao contrato' }),
          W.kpi({ label: 'Taxa de ganho', raw: a.winRate, format: function (v) { return F.pct(v, 1); },
            icon: 'target', tone: 'ok', delta: d.winRate,
            sub: a.vendasQtd + ' ganhos · ' + a.perdidasQtd + ' perdas' }),
          W.kpi({ label: 'Proposta → venda', raw: a.convPropVenda, format: function (v) { return F.pct(v, 1); },
            icon: 'handshake', tone: 'brand', delta: d.convPropVenda,
            sub: F.num(a.propostasLeads || 0) + ' leads com proposta · ' + F.num(a.vendasDePropostas || 0) + ' convertidos' })
        )];
      }

      /* ---------- 3. Produção acumulada vs meta ------------------------ */
      function montarProducao() {
        var pace = getPace(), sr = getSerie();
        return W.section({
          title: 'Estorno solicitado acumulado × meta do período',
          sub: 'Realizado dos leads ganhos no recorte selecionado; metas sem divisão por produto ou origem.',
          actions: [legendaChip('Realizado', 'var(--series-1)'), legendaChip('Ritmo ideal', 'var(--ink-3)')],
          body: chartHost(340, function (box) {
            var acum = An.acumular(sr.s.estornoSolicitado);
            var metaTotal = pace.vendasValor.meta;
            var n = sr.labels.length;
            var ideal = sr.labels.map(function (_, i) {
              if (sr.datas && pace.inicio && pace.uteisTotal) {
                var end = sr.porMes ? F.endOfMonth(sr.datas[i]) : sr.datas[i];
                end = new Date(Math.min(end.getTime(), sr.range.to.getTime()));
                if (pace.meses) return pace.meses.reduce(function (sum, month) {
                  var until = new Date(Math.min(end.getTime(), month.fim.getTime()));
                  return sum + (until >= month.inicio ? F.businessDays(month.inicio, until) * month.valorPorDia : 0);
                }, 0);
                return metaTotal * Math.min(1, F.businessDays(pace.inicio, end) / pace.uteisTotal);
              }
              return metaTotal * ((i + 1) / n) * (pace.fracao === undefined ? 1 : pace.fracao);
            });
            /* projeção linear a partir do ritmo atual */
            var ultimo = acum[acum.length - 1] || 0;
            var ritmo = n ? ultimo / n : 0;
            var proj = sr.labels.map(function (_, i) { return ritmo * (i + 1); });

            C.area(box, {
              uid: 'dash-acum', height: 320,
              labels: sr.labels,
              series: [
                { name: 'Realizado acumulado', values: acum, kind: 'area', color: 'var(--series-1)' },
                metaTotal ? { name: 'Ritmo ideal', values: ideal, kind: 'dash', color: 'var(--ink-3)' } : null,
                { name: 'Ritmo médio no período', values: proj, kind: 'dash', color: 'var(--series-4)' },
                { name: 'Estorno solicitado no dia', values: sr.s.estornoSolicitado, kind: 'bar', color: 'var(--series-3)' }
              ].filter(Boolean),
              yFormat: F.moneyShort, tooltipFormat: F.money,
              target: metaTotal ? { value: metaTotal, label: 'meta ' + F.moneyShort(metaTotal) } : null
            });
          })
        });
      }

      /* ---------- 4. Funil + conversões -------------------------------- */
      function montarFunil() {
        var funnelSteps = An.funil(f);
        var stageRateRows = funnelSteps.slice(1).map(function (step, index) {
          return [funnelSteps[index].label + ' -> ' + step.label, step.conversion, undefined, 50];
        });
        return h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)' }, 'data-reveal': true },
          W.section({
            title: 'Funil de conversão',
            sub: 'Onde o Estorno Solicitado se perde entre uma etapa e a próxima',
            body: chartHost(380, function (box) {
              C.funnel(box, { steps: funnelSteps, rowH: 54, goodRate: 50, warnRate: 30 });
            })
          }),
          W.section({
            title: 'Taxas do período',
            sub: 'Avanço entre as etapas no período selecionado',
            body: h('div.col.gap-4', stageRateRows.map(function (r) { return linhaTaxa(r[0], r[1], r[2], r[3]); }))
          })
        );
      }

      /* ---------- 5. Ranking ------------------------------------------- */
      function montarEquipe() {
        var rk = An.ranking(f).filter(function (x) {
          return x.c.vendasValor > 0 || x.c.vendasQtd > 0 || x.c.perdidasQtd > 0 || x.c.leadsNovos > 0 || x.c.ligacoes > 0 || x.c.propostas > 0 || x.c.whatsapp > 0 || x.c.reunioes > 0 || x.c.agendamentos > 0;
        });
        return W.section({
          title: 'Desempenho por vendedor',
          sub: 'Clique na linha para abrir o painel individual',
          actions: [h('a.btn.btn--sm.btn--ghost', { href: '#/performance/ranking' },
            h('span', { text: 'Ver ranking completo' }), icon('arrowRight'))],
          flush: true,
          body: rk.length ? tabelaVendedores(rk) : UI.empty({
            icon: 'users', title: 'Sem movimentação no período',
            text: 'Nenhum vendedor registrou atividade ou venda no recorte selecionado.'
          })
        });
      }

      /* ---------- 6. Mix -------------------------------------------------- */
      function montarCanais() {
        return h('div.grid.g-3', { 'data-reveal': true },
          W.section({
            title: 'Estorno solicitado por produto',
            sub: 'Onde o dinheiro entra',
            body: (function () {
              var itens = An.porDimensao(f, 'produtoId', 'valor');
              if (itens.length > 6) {
                var rest = itens.slice(5);
                itens = itens.slice(0, 5).concat([{ label: 'Outros', value: rest.reduce(function (sum, item) { return sum + item.value; }, 0), color: 'var(--ink-3)' }]);
              }
              if (!itens.length) return vazio();
              return h('div',
                chartHost(190, function (box) {
                  C.donut(box, {
                    height: 180, items: itens.slice(0, 6),
                    center: { value: F.moneyShort(itens.reduce(function (s2, i) { return s2 + i.value; }, 0)), label: 'total' },
                    format: F.moneyShort, unitLabel: 'Estorno solicitado'
                  });
                }),
                listaMix(itens.slice(0, 6), F.moneyShort)
              );
            })()
          }),
          W.section({
            title: 'Origem dos leads',
            sub: 'Qual canal traz e qual canal converte',
            body: (function () {
              var itens = An.porDimensao(f, 'origemId', 'qtd');
              if (!itens.length) return vazio();
              return h('div.col.gap-4',
                C.stackbar(itens, { format: F.num }),
                h('div.col.gap-2', itens.slice(0, 6).map(function (i) {
                  return h('div.row.between.gap-3',
                    h('span.t-small.truncate', { text: i.label }),
                    h('span.row.gap-3',
                      h('span.t-tiny.t-dimmer.t-num', { text: F.num(i.qtd) + ' leads' }),
                      h('span.badge' + (i.winRate >= 30 ? '.badge--ok' : i.winRate >= 15 ? '.badge--warn' : '.badge--bad'), {
                        'data-tip': 'Taxa de ganho desta origem',
                        text: F.pct(i.winRate, 0)
                      })
                    )
                  );
                }))
              );
            })()
          }),
          W.section({
            title: 'Motivos de perda',
            sub: 'O que atacar para virar o jogo',
            body: (function () {
              var itens = An.porDimensao(f, 'motivoPerdaId', 'qtd');
              if (!itens.length) return vazio('Nenhuma perda registrada no período. Ótimo — ou o time não está preenchendo o motivo.');
              return chartHost(itens.length * 34 + 10, function (box) {
                C.ranking(box, {
                  items: itens.slice(0, 8).map(function (i, idx) {
                    return { label: i.label, value: i.qtd, sub: F.moneyShort(i.valor),
                      color: 'var(--series-5)' };
                  }),
                  format: F.num, rowH: 34
                });
              });
            })()
          })
        );
      }

      /* ---------- 7. Ritmo de atividade ----------------------------------- */
      function montarAtividades() {
        var sr = getSerie();
        return h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }, 'data-reveal': true },
          W.section({
            title: 'Atividade diária',
            sub: 'Ligações, propostas e leads novos no período',
            body: chartHost(260, function (box) {
              C.area(box, {
                uid: 'dash-atv', height: 240, labels: sr.labels,
                series: [
                  { name: 'Ligações', values: sr.s.ligacoes, kind: 'bar', color: 'var(--series-2)' },
                  { name: 'Leads novos', values: sr.s.leads, kind: 'line', color: 'var(--series-4)', axis: 'y2' },
                  { name: 'Propostas', values: sr.s.propostas, kind: 'line', color: 'var(--series-6)', axis: 'y2' }
                ],
                yFormat: F.numShort, y2Format: F.numShort
              });
            })
          }),
          W.section({
            title: 'Volume de ligações e WhatsApp',
            sub: 'Atividades concluídas por dia da semana e hora no período selecionado',
            body: chartHost(200, function (box) {
              var hm = An.heatAtividade(f);
              C.heatmap(box, { rows: hm.rows, cols: hm.cols, data: hm.data, cellH: 24, unit: 'Contatos' });
            })
          })
        );
      }

      /* ---------- 8. Saúde do funil por etapa ------------------------------ */
      function montarSaude() {
        return W.section({
          title: 'Saúde do funil por etapa',
          sub: 'Situação atual dos leads criados no período selecionado; SLA calculado até hoje',
          flush: true,
          body: tabelaEtapas()
        });
      }
    }

    /* ==================================================================== */
    function cardMeta(p) {
      var v = p.vendasValor;
      var risco = v.meta > 0 && v.gap < 0;
      var faltaDia = p.uteisRestantes ? Math.max(0, v.meta - v.realizado) / p.uteisRestantes : 0;

      return h('div.card.card--pad.col.gap-4', {
        style: { '--accent': risco ? 'var(--bad-500)' : 'var(--brand-grad)' }, class: 'card--accent'
      },
        h('div.row.between',
          h('div',
            h('div.t-eyebrow', { text: 'Meta de Estorno Solicitado' }),
            h('div.t-h4', { style: { marginTop: '2px' }, text: p.label || W.rotuloPeriodo(f.periodo) })
          ),
          h('span.badge' + (risco ? '.badge--bad' : v.pct >= 100 ? '.badge--ok' : '.badge--brand'), {
            text: !v.meta ? 'Sem meta' : risco ? (p.emAndamento === false ? 'Abaixo da meta' : 'Em risco') : v.pct >= 100 ? 'Batida' : 'No ritmo'
          })
        ),
        chartHost(180, function (box) {
          C.gauge(box, { size: 170, value: v.pct, pace: Math.min(100, v.pace), label: 'da meta' });
        }),
        h('div.col.gap-3',
          linhaMeta('Realizado', F.money(v.realizado), 'var(--brand-500)'),
          linhaMeta('Meta', v.meta ? F.money(v.meta) : 'não definida', 'var(--ink-2)'),
          linhaMeta(p.emAndamento === false ? 'Meta do período' : 'Deveria estar em', F.money(v.esperado), 'var(--ink-3)'),
          linhaMeta(p.emAndamento === false ? 'Resultado do período' : 'Projeção de fechamento', F.money(v.projecao),
            v.projecao >= v.meta ? 'var(--ok-500)' : 'var(--bad-500)')
        ),
        p.metaCompativel === false ? h('p.t-small.t-dimmer', { text: 'Metas são definidas por usuário. Este filtro de produto ou origem não possui meta própria.' }) : p.emAndamento === false ? h('p.t-small.t-dimmer', { text: 'Resultado do período selecionado.' }) : h('div', { style: { padding: 'var(--sp-3)', background: 'var(--bg-elev-2)', borderRadius: 'var(--r-md)' } },
          h('div.row.between',
            h('span.t-tiny.t-dimmer', { text: 'Faltam' }),
            h('b.t-small.t-num', { text: F.plural(p.uteisRestantes, 'dia útil', 'dias úteis') })
          ),
          h('div.row.between', { style: { marginTop: '4px' } },
            h('span.t-tiny.t-dimmer', { text: 'Precisa fazer por dia' }),
            h('b.t-small.t-num', {
              style: { color: risco ? 'var(--bad-500)' : 'var(--ok-500)' },
              text: F.money(faltaDia)
            })
          )
        ),
        h('a.btn.btn--sm.btn--block', { href: AGIR.router.href('/crm/dashboard', Object.assign({}, ctx.query || {}, { view: 'metas' })) },
          icon('target'), h('span', { text: 'Ver metas por vendedor' }))
      );
    }

    function linhaMeta(label, valor, cor) {
      return h('div.row.between',
        h('span.t-small.t-dimmer', { text: label }),
        h('b.t-small.t-num', { style: { color: cor }, text: valor })
      );
    }

    function linhaTaxa(label, valor, delta, referencia) {
      var ok = valor >= referencia;
      return h('div.col.gap-2',
        h('div.row.between.gap-2',
          h('span.t-small', { text: label }),
          h('div.row.gap-2',
            delta !== undefined && isFinite(delta) && Math.abs(delta) >= 0.5
              ? h('span.delta.delta--' + (delta > 0 ? 'up' : 'down'),
                  icon(delta > 0 ? 'arrowUp' : 'arrowDown'),
                  h('span', { text: F.pct(Math.abs(delta), 0) }))
              : null,
            h('b.t-num', { style: { color: ok ? 'var(--ok-500)' : 'var(--warn-500)' }, text: F.pct(valor, 1) })
          )
        ),
        M.progress(Math.min(100, (valor / Math.max(referencia, valor || 1)) * 100), {
          thin: true, color: ok ? 'var(--ok-500)' : 'var(--warn-500)',
          tick: valor ? Math.min(100, (referencia / Math.max(referencia, valor)) * 100) : undefined,
          tickLabel: 'Referência: ' + F.pct(referencia, 0)
        })
      );
    }

    function tabelaVendedores(rk) {
      return W.dataTable({
        rows: rk,
        sort: { key: 'valor', dir: 'desc' },
        onRowClick: function (r) { AGIR.pages.vendedorDrawer(r.usuario.id); },
        columns: [
          { key: 'nome', label: 'Vendedor', width: '24%',
            value: function (r) { return r.usuario.nome; },
            render: function (r, i) {
              var cargo = S().byId('cargos', r.usuario.cargoId) || {};
              return h('div.row.gap-3',
                h('span.t-tiny.t-dimmer.t-num', { style: { width: '18px' }, text: '#' + (i + 1) }),
                AGIR.avatar(r.usuario, 'sm'),
                h('div', { style: { minWidth: 0 } },
                  h('div.strong.truncate', { text: r.usuario.nome }),
                  h('div.t-tiny.t-dimmer', { text: cargo.nome })
                )
              );
            } },
          { key: 'valor', label: 'Estorno solicitado', align: 'right', width: '13%',
            value: function (r) { return r.c.vendasValor; },
            render: function (r) {
              return h('div',
                h('div.strong.t-num', { text: F.moneyShort(r.c.vendasValor) }),
                isFinite(r.dVendas) && r.prev.vendasValor
                  ? h('div.t-tiny', {
                      style: { color: r.dVendas >= 0 ? 'var(--ok-500)' : 'var(--bad-500)' },
                      text: F.pctSigned(r.dVendas, 0)
                    })
                  : h('div.t-tiny.t-dimmer', { text: '—' })
              );
            } },
          { key: 'tend', label: 'Tendência', width: '11%', sortable: false,
            render: function (r) {
              return C.sparkline(r.tendencia, {
                width: 84, height: 26,
                color: r.dVendas >= 0 ? 'var(--ok-500)' : 'var(--bad-500)'
              });
            } },
          { key: 'meta', label: 'Meta de estorno', align: 'right', width: '15%',
            value: function (r) { return r.pctMeta; },
            render: function (r) {
              if (!r.metaValor) return h('span.t-dimmer', { text: 'sem meta' });
              return h('div.col.gap-1',
                h('div.row.between.gap-2',
                  h('span.t-tiny.t-dimmer', { text: F.moneyShort(r.metaRealizado) + ' / ' + F.moneyShort(r.metaValor) }),
                  h('b.t-tiny.t-num', {
                    style: { color: r.pctMeta >= 100 ? 'var(--ok-500)' : r.pctMeta >= 70 ? 'var(--brand-500)' : 'var(--bad-500)' },
                    text: F.pct(r.pctMeta, 0)
                  })
                ),
                M.progress(Math.min(100, r.pctMeta), { thin: true,
                  color: r.pctMeta >= 100 ? 'var(--ok-500)' : r.pctMeta >= 70 ? 'var(--brand-500)' : 'var(--bad-500)' })
              );
            } },
          { key: 'vendas', label: 'Vendas', align: 'right', width: '8%',
            value: function (r) { return r.c.vendasQtd; },
            render: function (r) { return h('span.strong.t-num', { text: F.num(r.c.vendasQtd) }); } },
          { key: 'lig', label: 'Ligações', align: 'right', width: '9%',
            value: function (r) { return r.c.ligacoes; },
            render: function (r) { return h('span.t-num', { text: F.num(r.c.ligacoes) }); } },
          { key: 'prop', label: 'Propostas', align: 'right', width: '9%',
            value: function (r) { return r.c.propostas; },
            render: function (r) { return h('span.t-num', { text: F.num(r.c.propostas) }); } },
          { key: 'conv', label: 'Prop→venda', align: 'right', width: '11%',
            value: function (r) { return r.c.convPropVenda; },
            render: function (r) {
              var v = r.c.convPropVenda;
              return h('span.badge' + (v >= 30 ? '.badge--ok' : v >= 18 ? '.badge--warn' : '.badge--bad'),
                { text: F.pct(v, 0) });
            } }
        ]
      });
    }

    function tabelaEtapas() {
      var cols = An.pipeline(f);
      return W.dataTable({
        rows: cols,
        sort: null,
        onRowClick: function (r) { AGIR.router.go(AGIR.router.href('/crm/pipeline', Object.assign({}, ctx.query || {}, { view: null, status: 'aberto' })));  },
        columns: [
          { key: 'etapa', label: 'Etapa', sortable: false,
            render: function (r) {
              return h('div.row.gap-2',
                h('span.kcol__dot', { style: { background: r.etapa.cor } }),
                h('span.strong', { text: r.etapa.nome }),
                h('span.badge', { text: r.etapa.prob + '%' })
              );
            } },
          { key: 'qtd', label: 'Oportunidades', align: 'right', sortable: false,
            render: function (r) { return h('span.strong.t-num', { text: F.num(r.qtd) }); } },
          { key: 'valor', label: 'Estorno solicitado', align: 'right', sortable: false,
            render: function (r) { return h('span.t-num', { text: F.moneyShort(r.valor) }); } },
          { key: 'sla', label: 'SLA da etapa', align: 'right', sortable: false,
            render: function (r) { return h('span.t-dimmer', { text: r.etapa.sla + ' dias' }); } },
          { key: 'estour', label: 'Fora do prazo', align: 'right', sortable: false,
            render: function (r) {
              if (!r.estourados) return h('span.badge.badge--ok', { text: 'em dia' });
              return h('span.badge.badge--bad', icon('clock'),
                h('span', { text: r.estourados + ' de ' + r.qtd }));
            } },
          { key: 'dist', label: 'Distribuição', sortable: false, width: '18%',
            render: function (r) {
              var max = Math.max.apply(null, cols.map(function (c) { return c.valor; }).concat([1]));
              return M.progress((r.valor / max) * 100, { thin: true, color: r.etapa.cor });
            } }
        ]
      });
    }

    /* ---------- auxiliares ------------------------------------------------ */
    function listaMix(itens, fmt) {
      var total = itens.reduce(function (s2, i) { return s2 + i.value; }, 0) || 1;
      return h('div.col.gap-2.mt-4', itens.map(function (i, idx) {
        return h('div.row.between.gap-3',
          h('span.row.gap-2', { style: { minWidth: 0 } },
            h('i.dot', { style: { background: i.color || C.PALETTE[idx % C.PALETTE.length], width: '8px', height: '8px' } }),
            h('span.t-small.truncate', { text: i.label })
          ),
          h('span.row.gap-3',
            h('span.t-tiny.t-dimmer.t-num', { text: F.pct(i.value / total * 100, 0) }),
            h('b.t-small.t-num', { text: fmt(i.value) })
          )
        );
      }));
    }

    function legendaChip(label, cor) {
      return h('span.row.gap-2',
        h('i', { style: { width: '14px', height: '2.5px', borderRadius: '2px', background: cor, display: 'block' } }),
        h('span.t-tiny.t-dimmer', { text: label })
      );
    }

    function vazio(txt) {
      return h('div.empty', { style: { padding: 'var(--sp-7) 0' } },
        h('div.empty__text', { text: txt || 'Sem dados no período selecionado.' }));
    }

    function chartHost(minH, draw) {
      var box = h('div', { style: { minHeight: minH + 'px' } });
      M.defer(function () {
        if (disposed || !box.isConnected) return;
        draw(box);
      });
      return box;
    }

    function qs(c) {
      var q2 = c.query || {};
      var parts = Object.keys(q2).map(function (k) { return k + '=' + encodeURIComponent(q2[k]); });
      return parts.length ? '?' + parts.join('&') : '';
    }

    function esqueleto() {
      return h('div.col.gap-6',
        h('div.grid', { style: { gridTemplateColumns: 'minmax(0,340px) minmax(0,1fr)' } },
          h('div.sk', { style: { height: '460px', borderRadius: 'var(--r-lg)' } }),
          h('div.sk', { style: { height: '460px', borderRadius: 'var(--r-lg)' } })
        ),
        UI.skeletonCards(3, 'g-3'),
        UI.skeletonCards(4, 'g-4'),
        UI.skeletonChart(340),
        h('div.grid.g-2', UI.skeletonChart(380), UI.skeletonChart(380))
      );
    }
  };
})(window);
