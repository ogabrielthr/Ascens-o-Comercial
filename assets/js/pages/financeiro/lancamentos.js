/* ==========================================================================
   AGIR — Financeiro / Lançamentos, Fluxo de caixa e Orçamento
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  /* ==========================================================================
     LANÇAMENTOS
     ========================================================================== */
  AGIR.pages.finLancamentos = function (node, ctx) {
    var q = ctx.query || {};
    var comps = An.competencias(13);
    var comp = q.comp || An.competenciaAtual();
    var tipo = q.tipo || '';
    var status = q.status || '';
    var termo = q.q || '';

    node.appendChild(W.pageHead({
      icon: 'filetext',
      title: 'Lançamentos',
      sub: 'Todo dinheiro que entra e sai, com origem rastreável até a oportunidade.',
      actions: [
        AGIR.util.seletorComp(comps, comp),
        h('div.search', { style: { width: 'min(260px,38vw)' } },
          icon('search'),
          h('input.input', {
            placeholder: 'Descrição…', value: termo,
            onInput: AGIR.util.deb(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260)
          })
        ),
        h('button.btn.btn--sm', { onClick: exportar }, icon('download'), h('span', { text: 'CSV' })),
        h('button.btn.btn--primary', { onClick: function () { formLancamento(null, comp); } },
          icon('plus'), h('span', { text: 'Novo lançamento' }))
      ]
    }));

    node.appendChild(h('div.filterbar',
      UI.segmented([
        { value: '', label: 'Tudo' },
        { value: 'receita', label: 'Receitas', icon: 'arrowUp' },
        { value: 'despesa', label: 'Despesas', icon: 'arrowDown' }
      ], tipo, function (v) { AGIR.router.setQuery({ tipo: v || null }); }),
      UI.segmented([
        { value: '', label: 'Todos' },
        { value: 'realizado', label: 'Realizados' },
        { value: 'previsto', label: 'Previstos' }
      ], status, function (v) { AGIR.router.setQuery({ status: v || null }); })
    ));

    var contas = S().indexBy('financeiro.planoContas');
    var centros = S().indexBy('financeiro.centrosCusto');

    var lista = (S().get('financeiro.lancamentos') || []).filter(function (l) {
      if (l.competencia !== comp) return false;
      if (tipo && l.tipo !== tipo) return false;
      if (status && l.status !== status) return false;
      if (termo && F.norm(l.descricao).indexOf(F.norm(termo)) < 0) return false;
      return true;
    });

    var receitas = lista.filter(function (l) { return l.tipo === 'receita'; })
      .reduce(function (a, l) { return a + l.valor; }, 0);
    var despesas = lista.filter(function (l) { return l.tipo === 'despesa'; })
      .reduce(function (a, l) { return a + l.valor; }, 0);
    var previstos = lista.filter(function (l) { return l.status === 'previsto'; }).length;

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Lançamentos', raw: lista.length, icon: 'filetext', tone: 'info',
        sub: previstos ? previstos + ' ainda previstos' : 'todos realizados' }),
      W.kpi({ label: 'Entradas', raw: receitas, format: F.moneyShort, icon: 'arrowUp', tone: 'ok' }),
      W.kpi({ label: 'Saídas', raw: despesas, format: F.moneyShort, icon: 'arrowDown', tone: 'bad' }),
      W.kpi({ label: 'Resultado', raw: receitas - despesas, format: F.moneyShort,
        icon: 'coins', tone: receitas - despesas >= 0 ? 'ok' : 'bad' })
    ));

    node.appendChild(W.section({
      flush: true,
      body: W.dataTable({
        rows: lista,
        sort: { key: 'data', dir: 'desc' },
        maxHeight: 720,
        onRowClick: function (l) { formLancamento(l, comp); },
        empty: UI.empty({ icon: 'inbox', title: 'Nenhum lançamento neste filtro',
          action: { label: 'Novo lançamento', icon: 'plus',
            onClick: function () { formLancamento(null, comp); } } }),
        columns: [
          { key: 'data', label: 'Data', width: '9%',
            value: function (l) { return l.data; },
            render: function (l) { return h('span.t-num', { text: F.date(l.data) }); } },
          { key: 'descricao', label: 'Descrição', width: '30%',
            render: function (l) {
              var op = l.oportunidadeId ? S().byId('oportunidades', l.oportunidadeId) : null;
              return h('div',
                h('div.strong.truncate', { text: l.descricao }),
                op ? h('button.t-tiny.t-brand.no-ripple', {
                  onClick: function (e) { e.stopPropagation(); AGIR.pages.oppDrawer(op.id); },
                  text: 'ver oportunidade →'
                }) : null
              );
            } },
          { key: 'conta', label: 'Conta', width: '18%',
            value: function (l) { return (contas[l.contaId] || {}).nome; },
            render: function (l) {
              var c = contas[l.contaId] || {};
              return h('div',
                h('div.t-small.truncate', { text: c.nome }),
                h('div.t-tiny.t-dimmer', { text: c.grupo })
              );
            } },
          { key: 'centro', label: 'Centro', width: '11%',
            value: function (l) { return (centros[l.centroId] || {}).nome; },
            render: function (l) {
              return h('span.badge', { text: (centros[l.centroId] || {}).nome || '—' });
            } },
          { key: 'valor', label: 'Valor', align: 'right', width: '13%',
            value: function (l) { return l.tipo === 'receita' ? l.valor : -l.valor; },
            render: function (l) {
              return h('span.strong.t-num', {
                style: { color: l.tipo === 'receita' ? 'var(--ok-500)' : 'var(--bad-500)' },
                text: (l.tipo === 'receita' ? '+' : '−') + F.money0(l.valor).replace('R$', 'R$')
              });
            } },
          { key: 'status', label: 'Status', align: 'right', width: '10%',
            render: function (l) {
              return h('span.badge' + (l.status === 'realizado' ? '.badge--ok' : '.badge--warn'),
                { text: l.status === 'realizado' ? 'Realizado' : 'Previsto' });
            } },
          { key: 'acao', label: '', width: '48px', sortable: false, align: 'right',
            render: function (l) {
              return h('button.btn.btn--icon.btn--sm.btn--ghost.no-ripple', {
                'aria-label': 'Ações',
                onClick: function (e) { e.stopPropagation(); menu(e.currentTarget, l); }
              }, icon('more'));
            } }
        ]
      })
    }));

    function menu(anchor, l) {
      UI.popover(anchor, [
        { label: 'Editar', icon: 'edit', onClick: function () { formLancamento(l, comp); } },
        { label: l.status === 'realizado' ? 'Marcar como previsto' : 'Marcar como realizado',
          icon: 'check',
          onClick: function () {
            S().update('financeiro.lancamentos', l.id, {
              status: l.status === 'realizado' ? 'previsto' : 'realizado'
            });
            UI.toast.ok('Status atualizado');
            AGIR.router.resolve();
          } },
        { sep: true },
        { label: 'Excluir', icon: 'trash', danger: true, onClick: function () {
          var idx = (S().get('financeiro.lancamentos') || []).findIndex(function (x) { return x.id === l.id; });
          S().remove('financeiro.lancamentos', l.id);
          UI.toast({ title: 'Lançamento excluído', tone: 'warn',
            action: { label: 'Desfazer', onClick: function () {
              S().restore('financeiro.lancamentos', l, idx); AGIR.router.resolve();
            } } });
          AGIR.router.resolve();
        } }
      ], { align: 'right' });
    }

    function exportar() {
      var linhas = [['Data', 'Competência', 'Tipo', 'Conta', 'Grupo', 'Centro de custo',
        'Descrição', 'Valor', 'Status']];
      lista.forEach(function (l) {
        var c = contas[l.contaId] || {};
        linhas.push([F.date(l.data), l.competencia, l.tipo, c.nome, c.grupo,
          (centros[l.centroId] || {}).nome, l.descricao,
          String(l.valor).replace('.', ','), l.status]);
      });
      AGIR.util.baixarCSV(linhas, 'ascensao-lancamentos-' + comp + '.csv');
    }
  };

  /* Formulário de lançamento — usado para criar e editar */
  function formLancamento(l, comp) {
    var f = {};
    var contas = S().get('financeiro.planoContas') || [];
    var centros = S().get('financeiro.centrosCusto') || [];

    function sel(key, label, lista, atual) {
      f[key] = h('select.select', lista.map(function (o) {
        return h('option', { value: o.id, text: o.nome, selected: o.id === atual });
      }));
      return h('div.field', h('label.field__label', { text: label }), f[key]);
    }

    UI.modal({
      title: l ? 'Editar lançamento' : 'Novo lançamento',
      wide: true,
      body: h('div.col.gap-4',
        h('div.field',
          h('label.field__label', { text: 'Descrição' }),
          f.descricao = h('input.input', {
            value: l ? l.descricao : '', placeholder: 'Ex.: Contrato mensal de marketing', autofocus: true
          })
        ),
        h('div.grid.g-3',
          (function () {
            f.tipo = h('select.select', {
              onChange: function () { filtrarContas(); }
            },
              h('option', { value: 'receita', text: 'Receita', selected: l && l.tipo === 'receita' }),
              h('option', { value: 'despesa', text: 'Despesa', selected: !l || l.tipo === 'despesa' })
            );
            return h('div.field', h('label.field__label', { text: 'Tipo' }), f.tipo);
          })(),
          h('div.field',
            h('label.field__label', { text: 'Valor (R$)' }),
            f.valor = h('input.input', { type: 'number', min: 0, step: 100, value: l ? l.valor : '' })
          ),
          h('div.field',
            h('label.field__label', { text: 'Data' }),
            f.data = h('input.input', { type: 'date', value: l ? F.iso(l.data) : F.iso(new Date()) })
          )
        ),
        h('div.grid.g-3',
          sel('contaId', 'Conta', contas, l ? l.contaId : null),
          sel('centroId', 'Centro de custo', centros, l ? l.centroId : null),
          (function () {
            f.status = h('select.select',
              h('option', { value: 'realizado', text: 'Realizado', selected: !l || l.status === 'realizado' }),
              h('option', { value: 'previsto', text: 'Previsto', selected: l && l.status === 'previsto' })
            );
            return h('div.field', h('label.field__label', { text: 'Status' }), f.status);
          })()
        ),
        h('div.field',
          h('label.field__label', { text: 'Competência' }),
          f.competencia = h('input.input', { type: 'month', value: l ? l.competencia : comp }),
          h('div.field__hint', { text: 'Competência é o mês a que o valor pertence — pode ser diferente da data de pagamento.' })
        )
      ),
      footer: function (api) {
        return [
          h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
          h('button.btn.btn--primary', { text: 'Salvar', onClick: salvar })
        ];
        function salvar() {
          if (!f.descricao.value.trim()) return UI.toast.bad('Falta a descrição');
          var valor = +f.valor.value || 0;
          if (!valor) return UI.toast.bad('Informe um valor');
          var dados = {
            descricao: f.descricao.value.trim(), tipo: f.tipo.value, valor: valor,
            data: f.data.value, contaId: f.contaId.value, centroId: f.centroId.value,
            status: f.status.value, competencia: f.competencia.value
          };
          if (l) {
            S().update('financeiro.lancamentos', l.id, dados);
            UI.toast.ok('Lançamento atualizado');
          } else {
            dados.oportunidadeId = null;
            dados.usuarioId = (S().currentUser() || {}).id;
            S().insert('financeiro.lancamentos', dados);
            UI.toast.ok('Lançamento criado');
          }
          api.close();
          AGIR.router.resolve();
        }
      }
    });

    filtrarContas();
    function filtrarContas() {
      var t = f.tipo.value;
      D.qsa('option', f.contaId).forEach(function (o) {
        var c = S().byId('financeiro.planoContas', o.value);
        o.hidden = c && c.tipo !== t;
      });
      var atual = S().byId('financeiro.planoContas', f.contaId.value);
      if (!atual || atual.tipo !== t) {
        var primeira = (S().get('financeiro.planoContas') || []).find(function (c) { return c.tipo === t; });
        if (primeira) f.contaId.value = primeira.id;
      }
    }
  }

  /* ==========================================================================
     FLUXO DE CAIXA
     ========================================================================== */
  AGIR.pages.finFluxo = function (node, ctx) {
    var q = ctx.query || {};
    var janela = +(q.dias || 90);
    var fluxo = An.fluxoCaixa(janela);
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    var realizado = fluxo.filter(function (x) { return !x.previsto; });
    var previsto = fluxo.filter(function (x) { return x.previsto; });
    var saldoHoje = realizado.length ? realizado[realizado.length - 1].saldo : 0;
    var saldoFinal = fluxo.length ? fluxo[fluxo.length - 1].saldo : 0;
    var menorSaldo = fluxo.reduce(function (m, x) { return x.saldo < m.saldo ? x : m; }, fluxo[0] || { saldo: 0 });

    node.appendChild(W.pageHead({
      icon: 'coins',
      title: 'Fluxo de caixa',
      sub: 'Entradas, saídas e saldo acumulado — com projeção do que ainda vai cair.',
      actions: [
        UI.segmented([
          { value: '30', label: '30 dias' },
          { value: '60', label: '60 dias' },
          { value: '90', label: '90 dias' },
          { value: '180', label: '6 meses' }
        ], String(janela), function (v) { AGIR.router.setQuery({ dias: v }); }),
        h('a.btn.btn--sm', { href: '#/financeiro/lancamentos' },
          icon('filetext'), h('span', { text: 'Lançamentos' }))
      ]
    }));

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Saldo hoje', raw: saldoHoje, format: F.moneyShort, icon: 'wallet',
        tone: saldoHoje >= 0 ? 'ok' : 'bad', sub: 'considerando só o realizado' }),
      W.kpi({ label: 'Saldo projetado', raw: saldoFinal, format: F.moneyShort, icon: 'trendUp',
        tone: saldoFinal >= 0 ? 'ok' : 'bad', sub: 'ao fim da janela selecionada' }),
      W.kpi({ label: 'A receber', raw: previsto.reduce(function (a, x) { return a + x.entrada; }, 0),
        format: F.moneyShort, icon: 'arrowUp', tone: 'info' }),
      W.kpi({ label: 'A pagar', raw: previsto.reduce(function (a, x) { return a + x.saida; }, 0),
        format: F.moneyShort, icon: 'arrowDown', tone: 'warn' })
    ));

    if (menorSaldo && menorSaldo.saldo < 0) {
      node.appendChild(h('div.insight.insight--bad',
        h('div.insight__ico', icon('alert')),
        h('div.grow',
          h('div.insight__title', { text: 'Caixa fica negativo em ' + F.date(menorSaldo.date) }),
          h('div.insight__text', {
            text: 'O saldo projetado chega a ' + F.moneyShort(menorSaldo.saldo) +
              '. Vale antecipar recebíveis ou renegociar vencimentos antes dessa data.'
          })
        )
      ));
    }

    node.appendChild(W.section({
      title: 'Movimentação diária',
      sub: 'Barras verdes entram, vermelhas saem; a linha é o saldo acumulado',
      body: (function () {
        var el = h('div', { style: { minHeight: '340px' } });
        M.defer(function () {
          C.area(el, {
            uid: 'fluxo-dia', height: 320,
            labels: fluxo.map(function (x) { return x.label; }),
            series: [
              { name: 'Entradas', values: fluxo.map(function (x) { return x.entrada; }), kind: 'bar', color: 'var(--ok-500)' },
              { name: 'Saídas', values: fluxo.map(function (x) { return x.saida; }), kind: 'bar', color: 'var(--bad-500)' },
              { name: 'Saldo acumulado', values: fluxo.map(function (x) { return x.saldo; }), kind: 'area', color: 'var(--brand-500)', axis: 'y2' }
            ],
            yFormat: F.moneyShort, y2Format: F.moneyShort
          });
        });
        return el;
      })()
    }));

    node.appendChild(W.section({
      title: 'Detalhe por dia',
      sub: 'Dias sem movimentação são omitidos',
      flush: true,
      body: W.dataTable({
        rows: fluxo.filter(function (x) { return x.entrada || x.saida; }),
        sort: null,
        maxHeight: 560,
        columns: [
          { key: 'data', label: 'Data', sortable: false,
            render: function (x) {
              return h('div.row.gap-2',
                h('span.t-num', { text: F.date(x.date) }),
                x.previsto ? h('span.badge.badge--warn', { text: 'previsto' }) : null
              );
            } },
          { key: 'entrada', label: 'Entradas', align: 'right', sortable: false,
            render: function (x) {
              return h('span.t-num', { style: { color: x.entrada ? 'var(--ok-500)' : 'var(--ink-4)' },
                text: x.entrada ? '+' + F.money0(x.entrada) : '—' });
            } },
          { key: 'saida', label: 'Saídas', align: 'right', sortable: false,
            render: function (x) {
              return h('span.t-num', { style: { color: x.saida ? 'var(--bad-500)' : 'var(--ink-4)' },
                text: x.saida ? '−' + F.money0(x.saida) : '—' });
            } },
          { key: 'liq', label: 'Líquido do dia', align: 'right', sortable: false,
            render: function (x) {
              var v = x.entrada - x.saida;
              return h('span.t-num', { style: { color: v >= 0 ? 'var(--ok-500)' : 'var(--bad-500)' },
                text: F.money0(v) });
            } },
          { key: 'saldo', label: 'Saldo acumulado', align: 'right', sortable: false,
            render: function (x) {
              return h('span.strong.t-num', {
                style: { color: x.saldo >= 0 ? 'var(--ink)' : 'var(--bad-500)' },
                text: F.money0(x.saldo)
              });
            } }
        ]
      })
    }));
  };

  /* ==========================================================================
     ORÇAMENTO
     ========================================================================== */
  AGIR.pages.finOrcamento = function (node, ctx) {
    var q = ctx.query || {};
    var comps = An.competencias(13);
    var comp = q.comp || An.competenciaAtual();
    var linhas = An.orcadoRealizado(comp);

    var receitas = linhas.filter(function (x) { return x.conta.tipo === 'receita'; });
    var despesas = linhas.filter(function (x) { return x.conta.tipo === 'despesa'; });

    function soma(lista, campo) {
      return lista.reduce(function (a, x) { return a + x[campo]; }, 0);
    }

    node.appendChild(W.pageHead({
      icon: 'calc',
      title: 'Orçamento',
      sub: 'Orçado × realizado por conta. Onde estourou e onde sobrou.',
      actions: [
        AGIR.util.seletorComp(comps, comp),
        h('button.btn.btn--sm', { onClick: exportar }, icon('download'), h('span', { text: 'CSV' }))
      ]
    }));

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Receita orçada', raw: soma(receitas, 'orcado'), format: F.moneyShort,
        icon: 'target', tone: 'info' }),
      W.kpi({ label: 'Receita realizada', raw: soma(receitas, 'realizado'), format: F.moneyShort,
        icon: 'coins', tone: soma(receitas, 'realizado') >= soma(receitas, 'orcado') ? 'ok' : 'bad',
        progress: soma(receitas, 'orcado')
          ? Math.min(150, soma(receitas, 'realizado') / soma(receitas, 'orcado') * 100) : 0,
        sub: F.pct(F.rate(soma(receitas, 'realizado'), soma(receitas, 'orcado')), 0) + ' do previsto' }),
      W.kpi({ label: 'Despesa orçada', raw: soma(despesas, 'orcado'), format: F.moneyShort,
        icon: 'calc', tone: 'info' }),
      W.kpi({ label: 'Despesa realizada', raw: soma(despesas, 'realizado'), format: F.moneyShort,
        icon: 'trendDown', tone: soma(despesas, 'realizado') <= soma(despesas, 'orcado') ? 'ok' : 'bad',
        progress: soma(despesas, 'orcado')
          ? Math.min(150, soma(despesas, 'realizado') / soma(despesas, 'orcado') * 100) : 0,
        sub: F.pct(F.rate(soma(despesas, 'realizado'), soma(despesas, 'orcado')), 0) + ' do previsto' })
    ));

    [['Receitas', receitas], ['Despesas', despesas]].forEach(function (bloco) {
      node.appendChild(W.section({
        title: bloco[0],
        sub: 'Clique no valor orçado para ajustar',
        flush: true,
        body: tabela(bloco[1])
      }));
    });

    function tabela(lista) {
      var wrap = h('div.table-wrap');
      var table = h('table.table');
      table.appendChild(h('thead', h('tr',
        h('th', h('span', { text: 'Conta' })),
        h('th', { style: { textAlign: 'right', width: '15%' } }, h('span', { text: 'Orçado' })),
        h('th', { style: { textAlign: 'right', width: '15%' } }, h('span', { text: 'Realizado' })),
        h('th', { style: { textAlign: 'right', width: '12%' } }, h('span', { text: 'Desvio' })),
        h('th', { style: { width: '26%' } }, h('span', { text: 'Comparativo' }))
      )));

      var tbody = h('tbody');
      lista.forEach(function (x) {
        var max = Math.max(x.orcado, x.realizado) || 1;
        tbody.appendChild(h('tr',
          h('td',
            h('div',
              h('div.strong', { text: x.conta.nome }),
              h('div.t-tiny.t-dimmer', { text: x.conta.grupo })
            )
          ),
          h('td', { class: 'num' }, celulaOrcado(x)),
          h('td', { class: 'num' }, h('b.t-num', { text: F.money0(x.realizado) })),
          h('td', { class: 'num' },
            x.orcado
              ? h('span.badge' + (x.bom ? '.badge--ok' : '.badge--bad'),
                  { text: F.pctSigned(x.desvioPct, 0) })
              : h('span.t-dimmer', { text: 'sem orçamento' })
          ),
          h('td',
            h('div.col.gap-1',
              h('div.row.gap-2',
                h('span.t-tiny.t-dimmer', { style: { width: '52px' }, text: 'orçado' }),
                h('div.grow', M.progress(x.orcado / max * 100, { thin: true, color: 'var(--ink-4)' }))
              ),
              h('div.row.gap-2',
                h('span.t-tiny.t-dimmer', { style: { width: '52px' }, text: 'real' }),
                h('div.grow', M.progress(x.realizado / max * 100, {
                  thin: true, color: x.bom ? 'var(--ok-500)' : 'var(--bad-500)'
                }))
              )
            )
          )
        ));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    function celulaOrcado(x) {
      var cell = h('div');
      var span = h('button.no-ripple', {
        style: { display: 'block', width: '100%', textAlign: 'right', padding: '4px 6px', borderRadius: 'var(--r-sm)' },
        'data-tip': 'Clique para editar o orçamento',
        onMouseenter: function () { this.style.background = 'var(--bg-elev-3)'; },
        onMouseleave: function () { this.style.background = ''; },
        onClick: editar
      }, h('span.t-num.t-dim', { text: x.orcado ? F.money0(x.orcado) : '—' }));
      D.mount(cell, span);

      function editar() {
        var inp = h('input.input', {
          type: 'number', min: 0, step: 500, value: x.orcado,
          style: { textAlign: 'right', height: '34px' },
          onBlur: salvar,
          onKeydown: function (e) {
            if (e.key === 'Enter') this.blur();
            if (e.key === 'Escape') D.mount(cell, span);
          }
        });
        D.mount(cell, inp);
        inp.focus(); inp.select();

        function salvar() {
          var novo = Math.max(0, +inp.value || 0);
          if (novo === x.orcado) return D.mount(cell, span);
          var reg = (S().get('financeiro.orcamento') || []).find(function (o) {
            return o.contaId === x.conta.id && o.competencia === comp;
          });
          if (reg) S().update('financeiro.orcamento', reg.id, { valor: novo });
          else S().insert('financeiro.orcamento', { contaId: x.conta.id, competencia: comp, valor: novo });
          UI.toast.ok('Orçamento atualizado', x.conta.nome + ' → ' + F.money0(novo));
          AGIR.router.resolve();
        }
      }
      return cell;
    }

    function exportar() {
      var l = [['Conta', 'Grupo', 'Tipo', 'Orçado', 'Realizado', 'Desvio R$', 'Desvio %']];
      linhas.forEach(function (x) {
        l.push([x.conta.nome, x.conta.grupo, x.conta.tipo,
          String(x.orcado).replace('.', ','), String(x.realizado).replace('.', ','),
          String(Math.round(x.desvioValor)).replace('.', ','),
          String(Math.round(x.desvioPct)).replace('.', ',')]);
      });
      AGIR.util.baixarCSV(l, 'ascensao-orcamento-' + comp + '.csv');
    }
  };
})(window);
