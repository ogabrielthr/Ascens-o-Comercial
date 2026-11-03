/* ==========================================================================
   AGIR — Financeiro / DRE gerencial
   Demonstração de resultado com linhas expansíveis e comparativo mensal.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  AGIR.pages.finDRE = function (node, ctx) {
    var q = ctx.query || {};
    var comps = An.competencias(13);
    var comp = q.comp || An.competenciaAtual();
    var somenteRealizado = q.real === '1';
    var idx = comps.findIndex(function (c) { return c.value === comp; });
    var compAnt = comps[idx + 1];

    var r = An.dre(comp, { somenteRealizado: somenteRealizado });
    var ant = compAnt ? An.dre(compAnt.value, { somenteRealizado: somenteRealizado }) : null;

    node.appendChild(W.pageHead({
      icon: 'receipt',
      title: 'DRE gerencial',
      sub: 'Competência ' + AGIR.util.rotuloComp(comp) +
        (ant ? ' · comparado com ' + AGIR.util.rotuloComp(compAnt.value) : ''),
      actions: [
        AGIR.util.seletorComp(comps, comp),
        h('label.switch', { 'data-tip': 'Ignora lançamentos previstos e mostra só o que já entrou/saiu' },
          h('input', { type: 'checkbox', checked: somenteRealizado,
            onChange: function () { AGIR.router.setQuery({ real: this.checked ? '1' : null }); } }),
          h('span.switch__track'), h('span.switch__thumb'),
          h('span.t-small.t-dim', { text: 'Só realizado' })
        ),
        h('button.btn.btn--sm', { onClick: exportar },
          icon('download'), h('span', { text: 'CSV' })),
        h('button.btn.btn--sm', { onClick: function () { global.print(); } },
          icon('filetext'), h('span', { text: 'PDF' }))
      ]
    }));

    /* ---------- Resumo -------------------------------------------------- */
    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Receita bruta', raw: r.receitaBruta, format: F.moneyShort, icon: 'coins',
        tone: 'brand', delta: ant ? An.delta(r.receitaBruta, ant.receitaBruta) : undefined }),
      W.kpi({ label: 'Custo total', raw: r.custoVariavel + r.custoFixo + (r.receitaBruta - r.receitaLiquida),
        format: F.moneyShort, icon: 'trendDown', tone: 'warn', invertDelta: true,
        delta: ant ? An.delta(r.custoVariavel + r.custoFixo, ant.custoVariavel + ant.custoFixo) : undefined }),
      W.kpi({ label: 'Resultado', raw: r.resultado, format: F.moneyShort,
        icon: r.resultado >= 0 ? 'trendUp' : 'alert', tone: r.resultado >= 0 ? 'ok' : 'bad',
        delta: ant ? An.delta(r.resultado, ant.resultado) : undefined }),
      W.kpi({ label: 'Margem líquida', raw: r.margemPct, format: function (v) { return F.pct(v, 1); },
        icon: 'percent', tone: r.margemPct >= 15 ? 'ok' : r.margemPct >= 0 ? 'warn' : 'bad',
        sub: ant ? 'antes: ' + F.pct(ant.margemPct, 1) : null })
    ));

    /* ---------- Cascata ------------------------------------------------- */
    node.appendChild(W.section({
      title: 'Como a receita vira resultado',
      sub: 'Cada barra desconta a anterior',
      body: (function () {
        var el = h('div', { style: { minHeight: '250px' } });
        M.defer(function () {
          var passos = [
            { label: 'Receita', value: r.receitaBruta, cor: 'var(--ok-500)' },
            { label: 'Deduções', value: r.receitaBruta - r.receitaLiquida, cor: 'var(--series-6)' },
            { label: 'C. variável', value: r.custoVariavel, cor: 'var(--series-5)' },
            { label: 'C. fixo', value: r.custoFixo, cor: 'var(--series-4)' },
            { label: 'Resultado', value: Math.abs(r.resultado), cor: r.resultado >= 0 ? 'var(--brand-500)' : 'var(--bad-500)' }
          ];
          C.bars(el, {
            height: 240,
            labels: passos.map(function (p) { return p.label; }),
            series: [{ name: 'Valor', values: passos.map(function (p) { return p.value; }),
              color: 'var(--series-1)' }],
            yFormat: F.moneyShort, showValues: true, valueFormat: F.moneyShort, legend: false
          });
          /* recolore cada barra individualmente */
          M.defer(function () {
            D.qsa('.ch-bar', el).forEach(function (b, i) {
              if (passos[i]) b.setAttribute('fill', passos[i].cor);
            });
          });
        });
        return el;
      })()
    }));

    /* ---------- Tabela DRE ---------------------------------------------- */
    node.appendChild(W.section({
      title: 'Demonstração do resultado',
      sub: 'Clique numa linha com seta para abrir o detalhe por conta',
      flush: true,
      body: tabelaDRE()
    }));

    /* ---------- Evolução ------------------------------------------------- */
    node.appendChild(W.section({
      title: 'Evolução do resultado',
      sub: 'Últimos 6 meses',
      body: (function () {
        var el = h('div', { style: { minHeight: '280px' } });
        var serie = An.serieDRE(6);
        M.defer(function () {
          C.area(el, {
            uid: 'dre-evo', height: 260,
            labels: serie.map(function (x) { return x.label; }),
            series: [
              { name: 'Receita', values: serie.map(function (x) { return x.receita; }), kind: 'area', color: 'var(--series-3)' },
              { name: 'Custo', values: serie.map(function (x) { return x.custo; }), kind: 'line', color: 'var(--series-5)' },
              { name: 'Margem %', values: serie.map(function (x) { return x.margem; }), kind: 'line', color: 'var(--brand-500)', axis: 'y2' }
            ],
            yFormat: F.moneyShort, y2Format: function (v) { return F.pct(v, 0); }
          });
        });
        return el;
      })()
    }));

    /* ==================================================================== */
    function tabelaDRE() {
      var wrap = h('div.table-wrap');
      var table = h('table.table');

      table.appendChild(h('thead', h('tr',
        h('th', h('span', { text: 'Linha' })),
        h('th', { style: { textAlign: 'right', width: '18%' } },
          h('span', { text: AGIR.util.rotuloComp(comp) })),
        h('th', { style: { textAlign: 'right', width: '14%' } }, h('span', { text: '% receita' })),
        ant ? h('th', { style: { textAlign: 'right', width: '18%' } },
          h('span', { text: AGIR.util.rotuloComp(compAnt.value) })) : null,
        ant ? h('th', { style: { textAlign: 'right', width: '12%' } },
          h('span', { text: 'Variação' })) : null
      )));

      var tbody = h('tbody');

      r.linhas.forEach(function (l, li) {
        var temItens = l.itens && l.itens.length;
        var aberto = false;
        var valorAnt = ant ? ant.linhas[li].valor : null;
        var variacao = valorAnt ? An.delta(Math.abs(l.valor), Math.abs(valorAnt)) : null;
        var pctReceita = F.rate(Math.abs(l.valor), r.receitaBruta);
        var subLinhas = [];

        var tr = h('tr', {
          class: temItens ? 'is-clickable' : '',
          style: {
            background: l.tipo === 'resultado' ? 'var(--bg-elev-2)' : 'transparent',
            fontWeight: l.destaque ? 650 : 400
          },
          onClick: temItens ? alternar : null
        },
          h('td',
            h('div.row.gap-2',
              temItens ? icon('chevRight', 'ico-toggle') : h('span', { style: { width: '18px' } }),
              h('span', {
                style: {
                  color: l.tipo === 'resultado'
                    ? (l.valor >= 0 ? 'var(--ok-500)' : 'var(--bad-500)')
                    : l.destaque ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: l.destaque ? 700 : 500,
                  fontSize: l.tipo === 'resultado' ? 'var(--fs-md)' : 'var(--fs-sm)'
                },
                text: l.label
              })
            )
          ),
          h('td', { class: 'num' },
            h('b.t-num', {
              style: {
                color: l.tipo === 'resultado' ? (l.valor >= 0 ? 'var(--ok-500)' : 'var(--bad-500)')
                  : l.valor < 0 ? 'var(--ink-2)' : 'var(--ink)',
                fontSize: l.tipo === 'resultado' ? 'var(--fs-lg)' : 'var(--fs-sm)'
              },
              text: F.money0(l.valor)
            })
          ),
          h('td', { class: 'num' },
            h('span.t-dimmer.t-num', { text: r.receitaBruta ? F.pct(pctReceita, 1) : '—' })),
          ant ? h('td', { class: 'num' },
            h('span.t-dim.t-num', { text: F.money0(valorAnt) })) : null,
          ant ? h('td', { class: 'num' },
            variacao !== null && isFinite(variacao)
              ? h('span.badge' + (ehBom(l, variacao) ? '.badge--ok' : '.badge--bad'),
                  { text: F.pctSigned(variacao, 0) })
              : h('span.t-dimmer', { text: '—' })) : null
        );

        tbody.appendChild(tr);

        if (temItens) {
          l.itens.forEach(function (it) {
            var sub = h('tr.detalhe-dre', {
              style: { display: 'none', background: 'var(--bg-inset)' }
            },
              h('td', h('div.row.gap-2', { style: { paddingLeft: '30px' } },
                h('i.dot', { style: { background: 'var(--ink-4)' } }),
                h('span.t-small.t-dim', { text: it.label })
              )),
              h('td', { class: 'num' }, h('span.t-small.t-num', { text: F.money0(it.valor) })),
              h('td', { class: 'num' },
                h('span.t-tiny.t-dimmer.t-num', { text: F.pct(F.rate(it.valor, r.receitaBruta), 1) })),
              ant ? h('td', { class: 'num' }, h('span.t-tiny.t-dimmer', { text: '' })) : null,
              ant ? h('td') : null
            );
            subLinhas.push(sub);
            tbody.appendChild(sub);
          });
        }

        function alternar() {
          aberto = !aberto;
          subLinhas.forEach(function (s2) { s2.style.display = aberto ? '' : 'none'; });
          var chev = D.qs('.ico-toggle', tr);
          if (chev) {
            chev.style.transform = aberto ? 'rotate(90deg)' : '';
            chev.style.transition = 'transform var(--dur-2) var(--ease-out)';
          }
        }
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    /** Em despesa, cair é bom; em receita, subir é bom. */
    function ehBom(linha, variacao) {
      if (linha.tipo === 'despesa') return variacao <= 0;
      return variacao >= 0;
    }

    function exportar() {
      var linhas = [['Linha', AGIR.util.rotuloComp(comp), '% receita',
        ant ? AGIR.util.rotuloComp(compAnt.value) : '']];
      r.linhas.forEach(function (l, i) {
        linhas.push([l.label, br(l.valor), br(F.rate(Math.abs(l.valor), r.receitaBruta)),
          ant ? br(ant.linhas[i].valor) : '']);
        (l.itens || []).forEach(function (it) {
          linhas.push(['   ' + it.label, br(it.valor), '', '']);
        });
      });
      AGIR.util.baixarCSV(linhas, 'ascensao-dre-' + comp + '.csv');
    }
    function br(n) { return String(Math.round((n || 0) * 100) / 100).replace('.', ','); }
  };
})(window);
