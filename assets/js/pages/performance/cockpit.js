/* ==========================================================================
   AGIR — Performance / Cockpit do Gestor
   Uma tela para responder: o que está errado, onde está o problema e o que
   fazer hoje. Ações prioritárias vêm primeiro, número vem depois.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  AGIR.pages.perfCockpit = function (node, ctx) {
    var f = W.readFilters(ctx.query || {});
    var u = S().currentUser();

    node.appendChild(W.pageHead({
      eyebrow: F.weekdayLong(new Date()).toUpperCase(),
      title: 'Cockpit do gestor',
      sub: 'O que está errado, onde está o problema e o que fazer hoje.',
      actions: [
        h('button.btn.btn--sm', { onClick: function () { AGIR.router.resolve(); } },
          icon('refresh'), h('span', { text: 'Atualizar análise' })),
        h('a.btn.btn--sm', { href: '#/crm/relatorios' },
          icon('chart'), h('span', { text: 'Relatórios' }))
      ]
    }));

    node.appendChild(W.filterBar(ctx, ['periodo', 'owner', 'equipe']));

    var host = h('div');
    node.appendChild(host);
    D.mount(host, UI.skeletonCards(4));
    M.defer(function () { D.mount(host, montar()); M.initReveal(host); });

    /* ==================================================================== */
    function montar() {
      var K = An.kpis(f), a = K.atual, d = K.d;
      var pace = An.paceMes(f);
      var cob = An.cobertura(f);
      var ins = An.insights(f);
      var acoes = construirAcoes();
      var sr = An.serie(f, ['vendasValor', 'ligacoes', 'propostas']);
      var rk = An.ranking(f);

      return h('div.col.gap-6',
        /* ---------- 1. Ações prioritárias ------------------------------ */
        W.section({
          title: 'Ações prioritárias do dia',
          sub: acoes.length ? 'Ordenadas por impacto financeiro' : null,
          actions: acoes.length ? [h('span.badge.badge--brand', { text: acoes.length + ' pendentes' })] : null,
          body: acoes.length ? h('div.col.gap-3.stagger', acoes.map(cardAcao))
            : h('div.empty',
                h('div.empty__art', { style: { background: 'var(--ok-soft)', borderColor: 'transparent', color: 'var(--ok-500)' } },
                  icon('checkcircle')),
                h('div.empty__title', { text: 'Operação sob controle' }),
                h('div.empty__text', { text: 'Nenhum alerta crítico agora. Aproveite para dar feedback individual ou planejar a próxima semana.' })
              )
        }),

        /* ---------- 2. Visão executiva --------------------------------- */
        h('div',
          h('div.row.between.mb-4',
            h('h2.t-h3', { text: 'Visão executiva' }),
            h('span.t-tiny.t-dimmer', { text: W.rotuloPeriodo(f.periodo) })
          ),
          h('div.grid.g-5', { 'data-reveal': true },
            cartaoExec('Faturamento do mês', F.money0(a.comissao), d.comissao,
              a.comissao > 0 ? 'ok' : 'bad',
              a.comissao > 0 ? 'Receita de serviços realizada.' : 'Crítico. Concentre o time em propostas quentes hoje.'),
            cartaoExec('Meta de estorno vs realizado',
              pace.vendasValor.meta ? F.pct(pace.vendasValor.pct, 0) : '—',
              null,
              !pace.vendasValor.meta ? 'warn' : pace.vendasValor.gap >= 0 ? 'ok' : 'bad',
              !pace.vendasValor.meta ? 'Defina metas individuais em Configurações.'
                : pace.vendasValor.gap >= 0
                  ? 'No ritmo. Projeção de ' + F.moneyShort(pace.vendasValor.projecao) + '.'
                  : 'Atrás do ritmo em ' + F.moneyShort(Math.abs(pace.vendasValor.gap)) + '.'),
            cartaoExec('Ticket médio', a.ticket ? F.money0(a.ticket) : '—', d.ticket,
              a.ticket ? 'brand' : 'warn',
              a.ticket ? 'Média dos contratos fechados no período.' : 'Sem vendas no período. Foque em fechar a primeira hoje.'),
            cartaoExec('Conversão proposta→venda',
              a.propostas ? F.pct(a.convPropVenda, 1) : '—', d.convPropVenda,
              a.convPropVenda >= 30 ? 'ok' : 'bad',
              a.convPropVenda >= 30 ? 'Dentro da referência de mercado.'
                : 'Revisar quebra de objeções e velocidade de follow-up.'),
            cartaoExec('Pipeline ativo', F.moneyShort(cob.bruto), null,
              cob.saudavel ? 'ok' : 'bad',
              cob.gap ? 'Cobertura de ' + F.num(cob.x, 1) + 'x o gap. Saudável é 3x.'
                : 'Meta do mês já batida.')
          )
        ),

        /* ---------- 3. Receita + meta ----------------------------------- */
        h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }, 'data-reveal': true },
          W.section({
            title: 'Evolução de receita',
            sub: 'Receita realizada por dia no período',
            body: chartBox(280, function (el) {
              C.area(el, {
                uid: 'cp-rec', height: 260, labels: sr.labels,
                series: [
                  { name: 'Volume produzido', values: sr.s.vendasValor, kind: 'area', color: 'var(--series-1)' },
                  { name: 'Propostas', values: sr.s.propostas, kind: 'line', color: 'var(--series-6)', axis: 'y2' }
                ],
                yFormat: F.moneyShort, y2Format: F.numShort, legend: true
              });
            })
          }),
          W.section({
            title: 'Meta do mês',
            body: h('div.col.gap-4',
              chartBox(180, function (el) {
                C.gauge(el, { size: 176, value: pace.vendasValor.pct,
                  pace: Math.min(100, pace.vendasValor.pace), label: 'realizado' });
              }),
              h('div.col.gap-3',
                dupla('Realizado', F.money0(pace.vendasValor.realizado), 'var(--brand-500)'),
                dupla('Meta total', pace.vendasValor.meta ? F.money0(pace.vendasValor.meta) : '—', 'var(--ink-2)'),
                dupla('Projeção fim do mês', F.money0(pace.vendasValor.projecao),
                  pace.vendasValor.projecao >= pace.vendasValor.meta ? 'var(--ok-500)' : 'var(--bad-500)')
              ),
              h('div.t-tiny.t-dimmer', {
                text: F.plural(pace.uteisRestantes, 'dia útil restante', 'dias úteis restantes') +
                  ' · ' + F.pct(pace.fracao * 100, 0) + ' do mês decorrido'
              })
            )
          })
        ),

        /* ---------- 4. Diagnóstico narrativo ---------------------------- */
        W.section({
          title: 'Diagnóstico da operação',
          sub: 'Leitura automática dos dados preenchidos pelo time',
          body: W.insightList(ins, 8)
        }),

        /* ---------- 5. Termômetro do time ------------------------------- */
        W.section({
          title: 'Termômetro do time',
          sub: 'Quem precisa de atenção esta semana',
          flush: true,
          body: termometro(rk)
        })
      );
    }

    /* ==================================================================== */
    function construirAcoes() {
      var acoes = [];

      /* SLA estourado — as 3 mais valiosas */
      An.slaEstourado(f).slice(0, 3).forEach(function (x) {
        acoes.push({
          tone: 'bad', icon: 'clock',
          titulo: 'Destravar ' + x.op.cliente,
          texto: x.etapa.nome + ' há ' + F.plural(x.dias, 'dia') + ' (' + x.excesso +
            'd além do SLA) · ' + F.money0(x.op.valor),
          peso: x.op.valor * (1 + x.excesso / 10),
          botao: { label: 'Abrir', onClick: function () { AGIR.pages.oppDrawer(x.op.id); } },
          dono: x.op.ownerId
        });
      });

      /* Atrasadas na agenda */
      var atr = An.atrasadas(f);
      if (atr.length) {
        acoes.push({
          tone: 'warn', icon: 'calendar',
          titulo: F.plural(atr.length, 'compromisso vencido', 'compromissos vencidos'),
          texto: 'Tarefas marcadas que passaram da data e ninguém encostou.',
          peso: atr.length * 8000,
          botao: { label: 'Ver agenda', onClick: function () { AGIR.router.go('/crm/atividades?v=atrasadas'); } }
        });
      }

      /* Leads frios de alto valor */
      var frios = An.semToque(f, 5);
      if (frios.length) {
        var valor = frios.reduce(function (s2, o) { return s2 + o.valor; }, 0);
        acoes.push({
          tone: 'warn', icon: 'inbox',
          titulo: F.plural(frios.length, 'lead esfriando', 'leads esfriando'),
          texto: F.moneyShort(valor) + ' sem nenhum toque há 5 dias ou mais.',
          peso: valor * 0.5,
          botao: { label: 'Ver lista', onClick: function () { AGIR.router.go('/crm/leads?frios=1'); } }
        });
      }

      /* Vendedor em queda forte */
      An.ranking(f).filter(function (r) {
        return r.prev.vendasValor > 0 && r.dVendas <= -35;
      }).slice(0, 2).forEach(function (r) {
        acoes.push({
          tone: 'bad', icon: 'trendDown',
          titulo: '1:1 com ' + F.firstName(r.usuario.nome),
          texto: 'Caiu ' + F.pct(Math.abs(r.dVendas), 0) + ' de ' +
            F.moneyShort(r.prev.vendasValor) + ' para ' + F.moneyShort(r.c.vendasValor) + '.',
          peso: Math.abs(r.prev.vendasValor - r.c.vendasValor),
          botao: { label: 'Ver painel', onClick: function () { AGIR.pages.vendedorDrawer(r.usuario.id); } },
          dono: r.usuario.id
        });
      });

      /* Humor baixo ou em queda — conversa vale mais que cobrança */
      An.humorVsResultado(f).filter(function (x) {
        return x.alerta && x.respostas >= 3;
      }).slice(0, 2).forEach(function (x) {
        var queixa = x.topFatores[0];
        /* Só estima perda em reais para quem fecha contrato; para BDR o
           impacto aparece em reuniões, não em dinheiro. */
        var perda = (x.fechaContrato && x.impactoPct !== null && x.impactoPct < 0 && x.mediaAlto)
          ? (x.mediaAlto - x.mediaBaixo) * x.diasBaixos : 0;
        acoes.push({
          tone: 'bad', icon: 'sparkles',
          titulo: 'Conversar com ' + F.firstName(x.usuario.nome) + ' — clima em baixa',
          texto: 'Humor médio de ' + F.num(x.media, 1) + '/5' +
            (x.tendencia <= -0.4 ? ' e caindo' : '') +
            (queixa ? '. Cita "' + queixa.nome.toLowerCase() + '" com frequência' : '') + '.' +
            (perda ? ' Estimativa de ' + F.moneyShort(perda) + ' a menos nos dias ruins.' : ''),
          peso: perda || 40000,
          botao: { label: 'Ver painel', onClick: function () { AGIR.pages.vendedorDrawer(x.usuario.id); } },
          dono: x.usuario.id
        });
      });

      /* Vendedor sem atividade hoje */
      var semAtividade = An.usuariosDoFiltro(f).filter(function (usr) {
        if (['cg_closer', 'cg_bdr'].indexOf(usr.cargoId) < 0) return false;
        var hojeIso = F.iso(new Date());
        return !(S().get('atividades') || []).some(function (at) {
          return at.ownerId === usr.id && at.resultado !== 'pendente' && F.iso(at.data) === hojeIso;
        });
      });
      if (semAtividade.length && new Date().getHours() >= 11) {
        acoes.push({
          tone: 'warn', icon: 'phone',
          titulo: F.plural(semAtividade.length, 'vendedor sem atividade hoje', 'vendedores sem atividade hoje'),
          texto: semAtividade.map(function (x) { return F.firstName(x.nome); }).join(', ') +
            ' não registrou nenhum toque até agora.',
          peso: semAtividade.length * 15000,
          botao: { label: 'Ver equipe', onClick: function () { AGIR.router.go('/config?sec=geral&tab=usuarios'); } }
        });
      }

      return acoes.sort(function (a, b) { return b.peso - a.peso; }).slice(0, 6);
    }

    function cardAcao(a, i) {
      var dono = a.dono ? S().byId('usuarios', a.dono) : null;
      return h('div.insight.insight--' + a.tone, { style: { '--i': i } },
        h('div.insight__ico', icon(a.icon)),
        h('div.grow',
          h('div.insight__title', { text: a.titulo }),
          h('div.insight__text', { text: a.texto })
        ),
        dono ? h('span', { style: { alignSelf: 'center' }, 'data-tip': dono.nome }, AGIR.avatar(dono, 'sm')) : null,
        h('button.btn.btn--sm.btn--outline', {
          style: { alignSelf: 'center' }, text: a.botao.label, onClick: a.botao.onClick
        })
      );
    }

    function cartaoExec(label, valor, delta, tone, texto) {
      var cores = {
        ok: 'var(--ok-500)', bad: 'var(--bad-500)',
        warn: 'var(--warn-500)', brand: 'var(--brand-500)'
      };
      var icones = { ok: 'trendUp', bad: 'alert', warn: 'info', brand: 'coins' };
      return h('div.card.card--pad.card--accent.col.gap-2', {
        style: { '--accent': cores[tone] || 'var(--brand-grad)' }
      },
        h('div.row.between',
          h('span.kpi__icon', {
            style: { '--kpi-icon-bg': 'transparent', '--kpi-icon-fg': cores[tone] }
          }, icon(icones[tone] || 'info')),
          (delta !== undefined && delta !== null && isFinite(delta) && Math.abs(delta) >= 0.5)
            ? h('span.delta.delta--' + (delta > 0 ? 'up' : 'down'),
                icon(delta > 0 ? 'arrowUp' : 'arrowDown'),
                h('span', { text: F.pct(Math.abs(delta), 0) }))
            : null
        ),
        h('div.kpi__label', { text: label }),
        h('div.t-h1.t-num', { style: { letterSpacing: '-.04em' }, text: valor }),
        h('div.t-tiny.t-dimmer', { style: { lineHeight: 1.45 }, text: texto })
      );
    }

    function dupla(label, valor, cor) {
      return h('div.row.between',
        h('span.t-small.t-dimmer', { text: label }),
        h('b.t-small.t-num', { style: { color: cor }, text: valor })
      );
    }

    function termometro(rk) {
      var comDados = rk.filter(function (r) {
        return ['cg_closer', 'cg_bdr', 'cg_gestor'].indexOf(r.usuario.cargoId) >= 0;
      });
      if (!comDados.length) return UI.empty({ icon: 'users', title: 'Sem vendedores no recorte' });

      return W.dataTable({
        rows: comDados,
        sort: { key: 'pct', dir: 'desc' },
        onRowClick: function (r) { AGIR.pages.vendedorDrawer(r.usuario.id); },
        columns: [
          { key: 'nome', label: 'Vendedor', width: '22%',
            value: function (r) { return r.usuario.nome; },
            render: function (r) {
              var st = An.streak(r.usuario.id);
              return h('div.row.gap-3', AGIR.avatar(r.usuario, 'sm'),
                h('div', { style: { minWidth: 0 } },
                  h('div.strong.truncate', { text: r.usuario.nome }),
                  h('div.t-tiny.t-dimmer.row.gap-1',
                    icon('flame', 'ico'),
                    h('span', { text: F.plural(st, 'dia', 'dias') + ' de sequência' })
                  )
                ));
            } },
          { key: 'status', label: 'Termômetro', width: '14%', sortable: false,
            render: function (r) {
              var s2 = statusDe(r);
              return h('span.badge.badge--' + s2.tone, h('i.dot'), h('span', { text: s2.label }));
            } },
          { key: 'pct', label: '% da meta', align: 'right', width: '16%',
            value: function (r) { return r.pctMeta; },
            render: function (r) {
              if (!r.metaValor) return h('span.t-dimmer', { text: 'sem meta' });
              return h('div.col.gap-1',
                h('b.t-num', { text: F.pct(r.pctMeta, 0) }),
                M.progress(Math.min(100, r.pctMeta), { thin: true,
                  color: r.pctMeta >= 100 ? 'var(--ok-500)' : r.pctMeta >= 70 ? 'var(--brand-500)' : 'var(--bad-500)',
                  tick: An.paceMes(f).fracao * 100 }));
            } },
          { key: 'prod', label: 'Estorno solicitado', align: 'right', width: '13%',
            value: function (r) { return r.c.estornoSolicitado; },
            render: function (r) { return h('span.strong.t-num', { text: F.moneyShort(r.c.estornoSolicitado) }); } },
          { key: 'atv', label: 'Atividade', width: '16%', sortable: false,
            render: function (r) {
              return h('div.row.gap-3',
                h('span.t-tiny.t-dimmer', { 'data-tip': 'Ligações', text: F.num(r.c.ligacoes) + ' lig' }),
                h('span.t-tiny.t-dimmer', { 'data-tip': 'Agendamentos', text: F.num(r.c.agendamentos) + ' ag' }),
                h('span.t-tiny.t-dimmer', { 'data-tip': 'Propostas', text: F.num(r.c.propostas) + ' prop' })
              );
            } },
          { key: 'tend', label: 'Tendência', width: '11%', sortable: false,
            render: function (r) {
              return C.sparkline(r.tendencia, { width: 80, height: 24,
                color: r.dVendas >= 0 ? 'var(--ok-500)' : 'var(--bad-500)' });
            } },
          { key: 'acao', label: '', width: '90px', sortable: false, align: 'right',
            render: function (r) {
              return h('button.btn.btn--sm.btn--ghost.no-ripple', {
                style: { color: 'var(--brand-500)' },
                onClick: function (e) { e.stopPropagation(); AGIR.pages.vendedorDrawer(r.usuario.id); }
              }, h('span', { text: 'Abrir' }), icon('arrowRight'));
            } }
        ]
      });
    }

    function statusDe(r) {
      var pace = An.paceMes({ ownerId: r.usuario.id });
      if (!r.metaValor) return { tone: 'info', label: 'Sem meta' };
      if (r.pctMeta >= 100) return { tone: 'ok', label: 'Meta batida' };
      if (r.pctMeta >= pace.fracao * 100) return { tone: 'ok', label: 'No ritmo' };
      if (r.pctMeta >= pace.fracao * 70) return { tone: 'warn', label: 'Atenção' };
      return { tone: 'bad', label: 'Em risco' };
    }

    function chartBox(minH, draw) {
      var el = h('div', { style: { minHeight: minH + 'px' } });
      M.defer(function () { draw(el); });
      return el;
    }
  };

  /* ==========================================================================
     Performance / Início — a visão do vendedor
     ========================================================================== */
  AGIR.pages.perfInicio = function (node, ctx) {
    var u = S().currentUser();
    var f = { ownerId: u.id, periodo: 'mes' };
    var K = An.kpis(f), a = K.atual, d = K.d;
    var pace = An.paceMes(f);
    var pts = An.pontosDe(u.id);
    var st = An.streak(u.id);
    var agenda = An.agenda(f);
    var atrasadas = An.atrasadas(f);
    var rk = An.ranking({ periodo: 'mes' });
    var posicao = rk.findIndex(function (r) { return r.usuario.id === u.id; }) + 1;

    node.appendChild(W.pageHead({
      eyebrow: F.weekdayLong(new Date()).toUpperCase(),
      title: 'Bom dia, ' + F.firstName(u.nome),
      sub: agenda.length
        ? 'Você tem ' + F.plural(agenda.length, 'compromisso') + ' hoje.'
        : 'Sem compromissos marcados hoje — bom momento para prospectar.',
      actions: [
        h('a.btn.btn--sm', { href: '#/crm/atividades' }, icon('calendar'), h('span', { text: 'Minha agenda' })),
        h('button.btn.btn--primary', { onClick: function () { AGIR.pages.novaOportunidade({ ownerId: u.id }); } },
          icon('plus'), h('span', { text: 'Nova oportunidade' }))
      ]
    }));

    if (atrasadas.length) {
      node.appendChild(h('div.insight.insight--bad',
        h('div.insight__ico', icon('alert')),
        h('div.grow',
          h('div.insight__title', { text: F.plural(atrasadas.length, 'compromisso atrasado', 'compromissos atrasados') }),
          h('div.insight__text', { text: 'Resolver isso antes de abrir lead novo costuma render mais.' })
        ),
        h('a.btn.btn--sm.btn--outline', { style: { alignSelf: 'center' }, href: '#/crm/atividades?v=atrasadas', text: 'Ver agora' })
      ));
    }

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Seu estorno solicitado no mês', raw: a.estornoSolicitado, format: F.moneyShort,
        icon: 'coins', tone: 'brand', delta: d.estornoSolicitado,
        progress: pace.vendasValor.pct, pace: pace.vendasValor.pace,
        sub: pace.vendasValor.meta ? 'meta ' + F.moneyShort(pace.vendasValor.meta) : 'sem meta definida' }),
      W.kpi({ label: 'Posição no ranking', value: posicao ? '#' + posicao : '—',
        icon: 'trophy', tone: posicao === 1 ? 'ok' : 'info',
        sub: 'entre ' + rk.length + ' vendedores' }),
      W.kpi({ label: 'Seus pontos', raw: pts.total, icon: 'star', tone: 'plum',
        sub: pts.aulas + ' aula(s) concluída(s)' }),
      W.kpi({ label: 'Sequência', raw: st, unit: st === 1 ? ' dia' : ' dias', icon: 'flame',
        tone: st >= 5 ? 'ok' : 'warn', sub: 'dias úteis seguidos com atividade' })
    ));

    node.appendChild(h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' } },
      W.section({
        title: 'Sua agenda de hoje',
        sub: F.dateLong(new Date()),
        body: agenda.length
          ? h('div.col.gap-3', agenda.map(function (at) {
              var op = at.oportunidadeId ? S().byId('oportunidades', at.oportunidadeId) : null;
              var t = W.ATV[at.tipo] || W.ATV.nota;
              return h('button.card.card--pad.row.gap-3.no-ripple', {
                style: { textAlign: 'left', width: '100%' },
                onClick: function () { if (op) AGIR.pages.oppDrawer(op.id); }
              },
                h('span.badge', { style: { minWidth: '52px', justifyContent: 'center' },
                  text: F.time(at.agendadoPara || at.data) }),
                h('span.kpi__icon', { style: { '--kpi-icon-fg': t.cor, '--kpi-icon-bg': 'var(--bg-elev-2)' } }, icon(t.icon)),
                h('div.grow', { style: { minWidth: 0 } },
                  h('div.strong.t-small', { text: t.label + (op ? ' · ' + op.cliente : '') }),
                  at.nota ? h('div.t-tiny.t-dimmer.truncate', { text: at.nota }) : null
                ),
                op ? h('span.t-small.t-num.t-dim', { text: F.moneyShort(op.valor) }) : null
              );
            }))
          : UI.empty({ icon: 'calendar', title: 'Agenda livre',
              text: 'Sem compromissos hoje. Que tal atacar os leads parados?',
              action: { label: 'Ver meus leads', icon: 'users',
                onClick: function () { AGIR.router.go('/crm/leads?owner=' + u.id); } } })
      }),
      W.section({
        title: 'Onde focar hoje',
        sub: 'Suas oportunidades mais quentes e mais paradas',
        body: (function () {
          var quentes = An.opps({ ownerId: u.id })
            .filter(function (o) { return o.status === 'aberto'; })
            .map(function (o) {
              var e = An.etapaById(o.etapaId) || {};
              return { op: o, score: (o.valor || 0) * ((e.prob || 0) / 100) };
            })
            .sort(function (x, y) { return y.score - x.score; })
            .slice(0, 6);
          if (!quentes.length) {
            return UI.empty({ icon: 'layers', title: 'Sem oportunidades em aberto' });
          }
          return h('div.col.gap-2', quentes.map(function (x) {
            return h('button.row.gap-3.no-ripple', {
              style: { width: '100%', textAlign: 'left', padding: 'var(--sp-2)', borderRadius: 'var(--r-sm)' },
              onMouseenter: function () { this.style.background = 'var(--bg-elev-2)'; },
              onMouseleave: function () { this.style.background = ''; },
              onClick: function () { AGIR.pages.oppDrawer(x.op.id); }
            },
              h('div.grow', { style: { minWidth: 0 } },
                h('div.t-small.strong.truncate', { text: x.op.cliente }),
                h('div.row.gap-2', W.etapaBadge(x.op.etapaId), W.slaTag(x.op))
              ),
              h('div', { style: { textAlign: 'right' } },
                h('div.t-small.strong.t-num', { text: F.money0(x.op.valor) }),
                h('div.t-tiny.t-dimmer.t-num', { text: F.moneyShort(x.score) + ' pond.' })
              )
            );
          }));
        })()
      })
    ));

    node.appendChild(W.section({
      title: 'Continue de onde parou',
      sub: 'Trilhas com aula pendente',
      actions: [h('a.btn.btn--sm.btn--ghost', { href: '#/performance/conteudos' },
        h('span', { text: 'Ver todas' }), icon('arrowRight'))],
      body: (function () {
        var trilhas = S().get('trilhas') || [];
        var prog = (S().get('progresso') || []).filter(function (p) { return p.usuarioId === u.id; });
        var pendentes = trilhas.map(function (t) {
          var feitas = prog.filter(function (p) { return p.trilhaId === t.id; }).length;
          return { t: t, feitas: feitas, pct: t.aulas.length ? feitas / t.aulas.length * 100 : 0 };
        }).filter(function (x) { return x.pct < 100; })
          .sort(function (a, b) { return b.pct - a.pct; }).slice(0, 3);

        if (!pendentes.length) {
          return UI.empty({ icon: 'trophy', title: 'Todas as trilhas concluídas',
            text: 'Você já assistiu tudo que está publicado. Bom trabalho.' });
        }
        return h('div.grid.g-3', pendentes.map(function (x) {
          return h('a.card.card--pad.card--hover.col.gap-3', { href: '#/performance/conteudos?t=' + x.t.id },
            h('div.row.gap-2', icon('book', 'ico'), h('b.t-small', { text: x.t.titulo })),
            h('div.t-tiny.t-dimmer', { text: x.feitas + ' de ' + x.t.aulas.length + ' aulas' }),
            M.progress(x.pct, { thin: true })
          );
        }));
      })()
    }));
  };
})(window);
