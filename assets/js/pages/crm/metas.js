/* ==========================================================================
   AGIR — CRM / Metas
   Meta é contrato, não decoração: dá para editar direto na linha e ver na
   hora o ritmo necessário para bater.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  var CAMPOS = [
    { key: 'vendasValor', realKey: 'estornoSolicitado', label: 'Estorno solicitado (R$)', fmt: F.moneyShort, tipo: 'moeda' },
    { key: 'vendasQtd',   label: 'Vendas',      fmt: F.num },
    { key: 'propostas',   label: 'Propostas',   fmt: F.num },
    { key: 'reunioes',    label: 'Reuniões',    fmt: F.num },
    { key: 'agendamentos',label: 'Agendamentos',fmt: F.num },
    { key: 'ligacoes',    label: 'Ligações',    fmt: F.num }
  ];

  AGIR.pages.crmMetas = function (node, ctx) {
    var q = ctx.query || {};
    var embedded = ctx.embedded === true;
    var readonly = ctx.readonly === true;
    var hoje = new Date();
    var periodRef = readonly && q.periodo ? An.range(q.periodo).from : hoje;
    var ano = +(q.ano || periodRef.getFullYear());
    var mes = +(q.mes || (periodRef.getMonth() + 1));
    var scope = W.readFilters(q);
    var ref = new Date(ano, mes - 1, 1);
    var ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;

    var usuarios = (S().get('usuarios') || []).filter(function (u) {
      var role = u.role || String(u.cargoId || '').replace(/^role_/, '');
      return (!q.owner || u.id === q.owner) && (!q.equipe || u.equipeId === q.equipe) && (readonly || u.ativo !== false) && (
        ['manager', 'commercial', 'bdr'].indexOf(role) >= 0 ||
        ['cg_closer', 'cg_bdr', 'cg_gestor'].indexOf(u.cargoId) >= 0 ||
        (readonly && (An.metaDoMes(u.id, new Date(ano, mes - 1, 1)) || An.opps({ ownerId: u.id }).some(function (o) { return o.status === 'ganho' && An.inRange(o.fechadoEm, { from: new Date(ano, mes - 1, 1), to: new Date(ano, mes, 0, 23, 59, 59, 999) }); })))
      );
    });

    var goalsHeader = W.pageHead({
      icon: 'target',
      title: 'Metas',
      sub: 'Defina o alvo de cada vendedor e acompanhe o ritmo necessário para chegar lá.',
      actions: [
        h('div.row.gap-2',
          h('button.btn.btn--icon.btn--sm', { 'aria-label': 'Mês anterior',
            onClick: function () { navegar(-1); } }, icon('chevLeft')),
          h('div.chip.is-active', { style: { pointerEvents: 'none', minWidth: '150px', justifyContent: 'center' },
            text: F.MES_LONGO[mes - 1] + ' de ' + ano }),
          h('button.btn.btn--icon.btn--sm', { 'aria-label': 'Próximo mês',
            onClick: function () { navegar(1); } }, icon('chevRight'))
        ),
        h('button.btn.btn--sm', { onClick: copiarMesAnterior },
          icon('copy'), h('span', { text: 'Copiar mês anterior' })),
        h('button.btn.btn--primary', { onClick: distribuir },
          icon('sparkles'), h('span', { text: 'Distribuir meta da equipe' }))
      ]
    });
    if (!embedded) node.appendChild(goalsHeader);
    else node.appendChild(h('div.dashboard-goals-head',
      h('div',
        h('div.t-eyebrow', { text: readonly ? 'Desempenho comercial' : 'Configuracoes da operacao' }),
        h('h2.t-h3', { text: readonly ? 'Acompanhamento de metas' : 'Definicao de metas' }),
        h('p.t-small.t-dimmer', { text: readonly
          ? 'Compare o realizado da equipe com o alvo definido para o mes.'
          : 'Defina os objetivos que cada usuario herdara para o periodo.' })
      ),
      h('div.row.gap-2.wrap',
        h('button.btn.btn--icon.btn--sm', { 'aria-label': 'Mes anterior', onClick: function () { navegar(-1); } }, icon('chevLeft')),
        h('div.chip.is-active', { text: F.MES_LONGO[mes - 1] + ' de ' + ano }),
        h('button.btn.btn--icon.btn--sm', { 'aria-label': 'Proximo mes', onClick: function () { navegar(1); } }, icon('chevRight')),
        !readonly ? h('button.btn.btn--sm', { onClick: copiarMesAnterior }, icon('copy'), h('span', { text: 'Copiar mes anterior' })) : null,
        !readonly ? h('button.btn.btn--sm.btn--primary', { onClick: distribuir }, icon('sparkles'), h('span', { text: 'Distribuir meta' })) : null
      )
    ));

    /* ---------- Consolidado -------------------------------------------- */
    var linhas = usuarios.map(function (u) {
      var meta = An.metaDoMes(u.id, ref) || novaMeta(u.id);
      if (readonly && (scope.produtoId || scope.origemId || scope.bancoId || scope.convenioId)) meta = novaMeta(u.id);
      var real = realizado(u.id);
      return { usuario: u, meta: meta, real: real };
    });

    var totalMeta = linhas.reduce(function (a, l) { return a + (l.meta.vendasValor || 0); }, 0);
    var totalReal = linhas.reduce(function (a, l) { return a + l.real.estornoSolicitado; }, 0);
    var pace = An.paceMes({});
    var fracao = ehMesAtual ? pace.fracao : 1;
    var esperado = totalMeta * fracao;

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Meta de estorno solicitado', raw: totalMeta, format: F.moneyShort, icon: 'target', tone: 'brand',
        sub: F.plural(linhas.length, 'vendedor', 'vendedores') }),
      W.kpi({ label: 'Realizado', raw: totalReal, format: F.moneyShort, icon: 'coins',
        tone: totalReal >= esperado ? 'ok' : 'bad',
        progress: totalMeta ? Math.min(100, totalReal / totalMeta * 100) : 0,
        pace: ehMesAtual ? fracao * 100 : undefined,
        sub: totalMeta ? F.pct(totalReal / totalMeta * 100, 1) + ' da meta' : 'sem meta definida' }),
      W.kpi({ label: ehMesAtual ? 'Deveria estar em' : 'Diferença', raw: ehMesAtual ? esperado : (totalReal - totalMeta),
        format: F.moneyShort, icon: 'clock', tone: 'info',
        sub: ehMesAtual ? F.pct(fracao * 100, 0) + ' do mês decorrido' : 'realizado menos meta' }),
      W.kpi({ label: ehMesAtual ? 'Falta por dia útil' : 'Projeção',
        raw: ehMesAtual
          ? (pace.uteisRestantes ? Math.max(0, totalMeta - totalReal) / pace.uteisRestantes : 0)
          : totalReal,
        format: F.moneyShort, icon: 'flame',
        tone: totalReal >= esperado ? 'ok' : 'warn',
        sub: ehMesAtual ? F.plural(pace.uteisRestantes, 'dia útil', 'dias úteis') + ' restantes' : 'fechamento do mês' })
    ));

    /* ---------- Gráfico meta × realizado --------------------------------- */
    node.appendChild(W.section({
      title: 'Meta × realizado por vendedor',
      sub: 'Barra clara é a meta, barra colorida é o realizado',
      body: (function () {
        var el = h('div', { style: { minHeight: '260px' } });
        M.defer(function () {
          C.bars(el, {
            height: 250,
            labels: linhas.map(function (l) { return F.firstName(l.usuario.nome); }),
            series: [
              { name: 'Meta', values: linhas.map(function (l) { return l.meta.vendasValor || 0; }), color: 'var(--ink-4)' },
              { name: 'Realizado', values: linhas.map(function (l) { return l.real.estornoSolicitado; }), color: 'var(--brand-500)' }
            ],
            yFormat: F.moneyShort
          });
        });
        return el;
      })()
    }));

    /* ---------- Tabela editável ------------------------------------------ */
    node.appendChild(W.section({
      title: readonly ? 'Atingimento individual' : 'Metas individuais',
      sub: readonly
        ? 'Compare a meta definida com o resultado realizado por cada vendedor.'
        : 'Clique em qualquer número para editar. Salva automaticamente.',
      flush: true,
      body: tabela()
    }));

    /* ==================================================================== */
    function tabela() {
      var wrap = h('div.table-wrap');
      var table = h('table.table');

      table.appendChild(h('thead',
        h('tr',
          h('th', { style: { width: '22%' } }, h('span', { text: 'Vendedor' })),
          CAMPOS.map(function (c) {
            return h('th', { style: { textAlign: 'right' } }, h('span', { text: c.label }));
          }),
          h('th', { style: { textAlign: 'right', width: '14%' } }, h('span', { text: 'Progresso' }))
        )
      ));

      var tbody = h('tbody');
      linhas.forEach(function (l) {
        var pct = l.meta.vendasValor ? (l.real.estornoSolicitado / l.meta.vendasValor) * 100 : 0;
        var cargo = S().byId('cargos', l.usuario.cargoId) || {};

        tbody.appendChild(h('tr',
          h('td',
            h('div.row.gap-3',
              AGIR.avatar(l.usuario, 'sm'),
              h('div', { style: { minWidth: 0 } },
                h('div.strong.truncate', { text: l.usuario.nome }),
                h('div.t-tiny.t-dimmer', { text: cargo.nome })
              )
            )
          ),
          CAMPOS.map(function (c) {
            return h('td', { class: 'num' }, readonly ? celulaValor(l, c) : celulaEditavel(l, c));
          }),
          h('td', { class: 'num' },
            h('div.col.gap-1',
              h('div.row.between.gap-2',
                h('span.t-tiny.t-dimmer', { text: F.moneyShort(l.real.estornoSolicitado) }),
                h('b.t-tiny.t-num', {
                  style: { color: pct >= 100 ? 'var(--ok-500)' : pct >= 70 ? 'var(--brand-500)' : 'var(--bad-500)' },
                  text: l.meta.vendasValor ? F.pct(pct, 0) : '—'
                })
              ),
              M.progress(Math.min(100, pct), {
                thin: true,
                color: pct >= 100 ? 'var(--ok-500)' : pct >= 70 ? 'var(--brand-500)' : 'var(--bad-500)',
                tick: ehMesAtual ? fracao * 100 : undefined
              })
            )
          )
        ));
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    function celulaValor(l, campo) {
      var valorMeta = l.meta[campo.key] || 0;
      var valorReal = l.real[campo.realKey || campo.key] || 0;
      return h('div', { style: { textAlign: 'right', padding: '4px 6px' } },
        h('div.strong.t-num', { text: valorMeta ? campo.fmt(valorMeta) : '-' }),
        h('div.t-tiny.t-num', {
          style: { color: valorMeta && valorReal >= valorMeta ? 'var(--ok-500)' : 'var(--ink-4)' },
          text: campo.fmt(valorReal) + ' realizado'
        })
      );
    }

    /** Célula que vira input ao clicar, com realizado embaixo */
    function celulaEditavel(l, campo) {
      var valorMeta = l.meta[campo.key] || 0;
      var valorReal = l.real[campo.realKey || campo.key] || 0;
      var atingiu = valorMeta && valorReal >= valorMeta;

      var span = h('button.no-ripple', {
        style: {
          display: 'block', width: '100%', textAlign: 'right',
          padding: '4px 6px', borderRadius: 'var(--r-sm)',
          transition: 'background var(--dur-1) var(--ease-out)'
        },
        'data-tip': 'Clique para editar',
        onMouseenter: function () { this.style.background = 'var(--bg-elev-3)'; },
        onMouseleave: function () { this.style.background = ''; },
        onClick: editar
      },
        h('div.strong.t-num', { text: valorMeta ? campo.fmt(valorMeta) : '—' }),
        h('div.t-tiny.t-num', {
          style: { color: atingiu ? 'var(--ok-500)' : 'var(--ink-4)' },
          text: campo.fmt(valorReal)
        })
      );

      var cell = h('div', span);

      function editar() {
        var inp = h('input.input', {
          type: 'number', min: 0, value: valorMeta,
          style: { textAlign: 'right', height: '34px' },
          onBlur: salvar,
          onKeydown: function (e) {
            if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
            if (e.key === 'Escape') { D.mount(cell, span); }
          }
        });
        D.mount(cell, inp);
        inp.focus();
        inp.select();

        async function salvar() {
          var novo = Math.max(0, +inp.value || 0);
          if (novo !== valorMeta) {
            inp.disabled = true;
            try {
              await gravar(l, campo.key, novo);
            } catch (error) {
              inp.disabled = false;
              UI.toast.bad('Nao foi possivel salvar a meta', error.message || 'Tente novamente.');
              return;
            }
            UI.toast({
              title: 'Meta atualizada',
              text: F.firstName(l.usuario.nome) + ' · ' + campo.label + ' → ' + campo.fmt(novo),
              tone: 'ok', ms: 2600
            });
            AGIR.router.resolve();
          } else {
            D.mount(cell, span);
          }
        }
      }

      return cell;
    }

    /* ---------- Dados ---------------------------------------------------- */
    function novaMeta(usuarioId) {
      return { usuarioId: usuarioId, ano: ano, mes: mes,
        vendasValor: 0, vendasQtd: 0, propostas: 0, reunioes: 0, agendamentos: 0, ligacoes: 0 };
    }

    function goalPayload(meta) {
      return {
        userId: meta.usuarioId, year: meta.ano, month: meta.mes,
        requestedReversalAmount: meta.vendasValor, salesCount: meta.vendasQtd,
        proposals: meta.propostas, meetings: meta.reunioes,
        appointments: meta.agendamentos, calls: meta.ligacoes
      };
    }

    function applySaved(saved) {
      var local = {
        id: saved.id, usuarioId: saved.user_id, ano: saved.year, mes: saved.month,
        vendasValor: Number(saved.requested_reversal_amount == null
          ? saved.sales_amount : saved.requested_reversal_amount), vendasQtd: saved.sales_count,
        propostas: saved.proposals, reunioes: saved.meetings,
        agendamentos: saved.appointments, ligacoes: saved.calls
      };
      var existing = S().byId('metas', saved.id);
      if (existing) S().update('metas', saved.id, local);
      else S().insert('metas', local);
    }

    async function persistGoals(goals) {
      if (!(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')) return null;
      var saved = await global.AGIR_BACKEND.upsertGoals({
        organizationId: S().get('session.organizationId'), goals: goals.map(goalPayload)
      });
      saved.forEach(applySaved);
      return saved;
    }

    async function gravar(l, key, valor) {
      var existente = An.metaDoMes(l.usuario.id, ref);
      var meta;
      if (existente) {
        meta = Object.assign({}, existente); meta[key] = valor;
      } else {
        meta = novaMeta(l.usuario.id); meta[key] = valor;
      }
      if (await persistGoals([meta])) return;
      if (existente) { var patch = {}; patch[key] = valor; S().update('metas', existente.id, patch); }
      else S().insert('metas', meta);
    }

    function realizado(usuarioId) {
      var ini = new Date(ano, mes - 1, 1);
      var fim = new Date(ano, mes, 0, 23, 59, 59, 999);
      var fLocal = Object.assign({}, scope, { ownerId: usuarioId });
      return An.contar(An.opps(fLocal), An.acts(fLocal), ini, fim);
    }

    function navegar(delta) {
      var d = new Date(ano, mes - 1 + delta, 1);
      AGIR.router.setQuery({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
    }

    function copiarMesAnterior() {
      var ant = new Date(ano, mes - 2, 1);
      UI.confirm({
        title: 'Copiar metas de ' + F.MES_LONGO[ant.getMonth()] + '?',
        text: 'As metas do mês selecionado serão substituídas pelas do mês anterior.',
        okLabel: 'Copiar'
      }).then(async function (ok) {
        if (!ok) return;
        var n = 0;
        var metasCopiadas = [];
        usuarios.forEach(function (u) {
          var origem = An.metaDoMes(u.id, ant);
          if (!origem) return;
          var destino = An.metaDoMes(u.id, ref);
          var dados = {
            vendasValor: origem.vendasValor, vendasQtd: origem.vendasQtd,
            propostas: origem.propostas, reunioes: origem.reunioes,
            agendamentos: origem.agendamentos, ligacoes: origem.ligacoes
          };
          metasCopiadas.push(Object.assign({}, destino || novaMeta(u.id), dados)); n++;
        });
        try {
          if (!(await persistGoals(metasCopiadas))) {
            S().batch(function () { metasCopiadas.forEach(function (meta) {
              var destino = An.metaDoMes(meta.usuarioId, ref);
              var dados = {
                vendasValor: meta.vendasValor, vendasQtd: meta.vendasQtd,
                propostas: meta.propostas, reunioes: meta.reunioes,
                agendamentos: meta.agendamentos, ligacoes: meta.ligacoes
              };
              if (destino) S().update('metas', destino.id, dados);
              else S().insert('metas', Object.assign(novaMeta(meta.usuarioId), dados));
            }); });
          }
        } catch (error) { UI.toast.bad('Nao foi possivel copiar as metas', error.message || 'Tente novamente.'); return; }
        UI.toast.ok('Metas copiadas', n + ' vendedor(es) atualizado(s)');
        AGIR.router.resolve();
      });
    }

    function distribuir() {
      var inp, modo;
      UI.modal({
        title: 'Distribuir meta da equipe',
        sub: 'Informe o alvo total do mês e escolha como repartir.',
        body: h('div.col.gap-4',
          h('div.field',
            h('label.field__label', { text: 'Meta total de Estorno Solicitado (R$)' }),
            inp = h('input.input', { type: 'number', min: 0, step: 10000,
              value: totalMeta || 1000000, autofocus: true }),
            h('div.field__hint', { text: 'O valor será distribuído como meta de Estorno Solicitado.' })
          ),
          h('div.field',
            h('label.field__label', { text: 'Critério' }),
            modo = h('select.select',
              h('option', { value: 'igual', text: 'Igual para todos' }),
              h('option', { value: 'historico', text: 'Proporcional ao histórico (últimos 3 meses)', selected: true }),
              h('option', { value: 'atual', text: 'Manter a proporção das metas atuais' })
            )
          )
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { text: 'Distribuir', onClick: async function () {
              this.disabled = true;
              var ok = await aplicarDistribuicao(+inp.value || 0, modo.value);
              if (ok !== false) api.close(); else this.disabled = false;
            } })
          ];
        }
      });
    }

    async function aplicarDistribuicao(total, modo) {
      var alvo = usuarios.filter(function (u) { return u.cargoId !== 'cg_bdr'; });
      if (!alvo.length || !total) return UI.toast.bad('Nada para distribuir');

      var pesos = alvo.map(function (u) {
        if (modo === 'igual') return 1;
        if (modo === 'atual') {
          var m = An.metaDoMes(u.id, ref);
          return (m && m.vendasValor) || 1;
        }
        /* histórico dos últimos 3 meses */
        var soma = 0;
        for (var i = 1; i <= 3; i++) {
          var d = new Date(ano, mes - 1 - i, 1);
          var ini = new Date(d.getFullYear(), d.getMonth(), 1);
          var fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
          soma += An.contar(An.opps({ ownerId: u.id }), An.acts({ ownerId: u.id }), ini, fim).estornoSolicitado;
        }
        return soma || 1;
      });
      var somaPesos = pesos.reduce(function (a, b) { return a + b; }, 0) || 1;

      /* Distribui em centavos e entrega o residuo ao ultimo vendedor. Assim a
         soma permanece exatamente igual ao total informado, sem arredondar
         metas para milhares ou perder centavos. */
      var totalCentavos = Math.round(total * 100);
      var restanteCentavos = totalCentavos;
      var distribuidas = alvo.map(function (u, i) {
          var centavos = i === alvo.length - 1
            ? restanteCentavos
            : Math.round(totalCentavos * (pesos[i] / somaPesos));
          restanteCentavos -= centavos;
          var valor = centavos / 100;
          var existente = An.metaDoMes(u.id, ref);
          return Object.assign({}, existente || novaMeta(u.id), { vendasValor: valor });
      });
      try {
        if (!(await persistGoals(distribuidas))) {
          S().batch(function () { distribuidas.forEach(function (meta) {
            var existente = An.metaDoMes(meta.usuarioId, ref);
            if (existente) S().update('metas', existente.id, { vendasValor: meta.vendasValor });
            else S().insert('metas', meta);
          }); });
        }
      } catch (error) { UI.toast.bad('Nao foi possivel distribuir as metas', error.message || 'Tente novamente.'); return false; }

      UI.toast.ok('Meta distribuída', F.money(total) + ' entre ' + alvo.length + ' vendedores, sem arredondamento');
      AGIR.router.resolve();
    }
  };
})(window);
