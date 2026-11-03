/* ==========================================================================
   AGIR — widgets.js
   Peças de tela reutilizadas por todos os módulos: KPI, barra de filtros,
   tabela, cabeçalho de página, drawer de oportunidade e formulários.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, M = AGIR.motion, C = AGIR.charts, UI = AGIR.ui;
  var S = function () { return AGIR.store; };

  /* ==========================================================================
     Cabeçalho de página
     ========================================================================== */
  function pageHead(opts) {
    return h('div.page__head',
      h('div',
        opts.eyebrow ? h('div.t-eyebrow', { text: opts.eyebrow }) : null,
        h('h1.page__title',
          opts.icon ? icon(opts.icon, 'ico') : null,
          h('span', { text: opts.title }),
          opts.badge || null
        ),
        opts.sub ? h('p.page__sub', { text: opts.sub }) : null
      ),
      opts.actions ? h('div.page__actions', opts.actions) : null
    );
  }

  /* ==========================================================================
     Card de seção
     ========================================================================== */
  function section(opts) {
    var body = h('div' + (opts.flush ? '' : '.card__body'), opts.body || null);
    return h('div.card' + (opts.flush ? '.card--flush' : ''),
      (opts.title || opts.actions) ? h('div.card__head',
        h('div',
          h('div.card__title', { text: opts.title || '' }),
          opts.sub ? h('div.card__sub', { style: { marginTop: '2px' }, text: opts.sub }) : null
        ),
        opts.actions ? h('div.row.gap-2', opts.actions) : null
      ) : null,
      body
    );
  }

  /* ==========================================================================
     KPI
     opts: { label, value, format, raw, icon, tone, delta, deltaLabel,
             sub, spark:[], gauge:{value,pace}, invertDelta }
     ========================================================================== */
  var TONES = {
    brand: ['var(--brand-500)', 'var(--brand-grad-soft)', 'rgba(255,149,0,.10)'],
    ok:    ['var(--ok-500)',    'var(--ok-soft)',    'rgba(45,212,167,.09)'],
    bad:   ['var(--bad-500)',   'var(--bad-soft)',   'rgba(251,110,110,.09)'],
    warn:  ['var(--warn-500)',  'var(--warn-soft)',  'rgba(251,191,36,.09)'],
    info:  ['var(--info-500)',  'var(--info-soft)',  'rgba(90,185,245,.09)'],
    plum:  ['var(--plum-500)',  'var(--plum-soft)',  'rgba(167,139,250,.09)'],
    neutro:['var(--ink-2)',     'var(--bg-elev-2)',  'transparent']
  };

  function kpi(opts) {
    var tone = TONES[opts.tone || 'brand'] || TONES.brand;
    var fmt = opts.format || F.num;
    var valueEl;

    if (opts.raw !== undefined && typeof opts.raw === 'number' && !M.reduced()) {
      valueEl = M.num(opts.raw, { format: fmt, ms: 850 });
    } else {
      valueEl = h('span', { text: opts.value !== undefined ? opts.value : fmt(opts.raw || 0) });
    }

    var d = opts.delta;
    var deltaEl = null;
    if (d !== undefined && d !== null && isFinite(d)) {
      var up = opts.invertDelta ? d < 0 : d > 0;
      var flat = Math.abs(d) < 0.5;
      deltaEl = h('span.delta.delta--' + (flat ? 'flat' : up ? 'up' : 'down'),
        flat ? null : icon(d > 0 ? 'arrowUp' : 'arrowDown'),
        h('span', { text: flat ? '—' : F.pct(Math.abs(d), Math.abs(d) < 10 ? 1 : 0) })
      );
    }

    return h('div.kpi', {
      style: { '--kpi-tint': tone[2], '--kpi-icon-bg': tone[1], '--kpi-icon-fg': tone[0] },
      'data-tip': opts.tip || null
    },
      h('div.kpi__top',
        h('span.kpi__label', { text: opts.label }),
        opts.icon ? h('span.kpi__icon', icon(opts.icon)) : null
      ),
      h('div.kpi__value', valueEl, opts.unit ? h('small', { text: opts.unit }) : null),
      h('div.kpi__foot',
        deltaEl,
        h('span', { text: opts.sub || (deltaEl ? (opts.deltaLabel || 'vs. período anterior') : '') })
      ),
      opts.spark && opts.spark.length
        ? h('div.kpi__spark', C.sparkline(opts.spark, { width: 220, height: 34, color: tone[0] }))
        : null,
      opts.progress !== undefined
        ? h('div', { style: { marginTop: '4px' } },
            M.progress(opts.progress, { thin: true, color: tone[0], tick: opts.pace })
          )
        : null
    );
  }

  /* ==========================================================================
     Barra de filtros — sincronizada com a query string da URL
     campos: ['periodo','owner','equipe','produto','origem','banco','status']
     ========================================================================== */
  function readFilters(query) {
    return {
      periodo: query.periodo || 'mes',
      ownerId: query.owner || '',
      equipeId: query.equipe || '',
      produtoId: query.produto || '',
      convenioId: query.convenio || '',
      origemId: query.origem || '',
      bancoId: query.banco || '',
      status: query.status || '',
      etapaId: query.etapa || '',
      etiquetaId: query.etiqueta || '',
      dataInicio: query.inicio || '',
      dataFim: query.fim || '',
      modificacaoInicio: query.modinicio || '',
      modificacaoFim: query.modfim || ''
    };
  }

  function filterBar(ctx, campos, onChange) {
    var q = ctx.query || {};
    var f = readFilters(q);
    campos = campos || ['periodo', 'owner'];

    function set(k, v) {
      var patch = {};
      patch[k] = v || null;
      AGIR.router.setQuery(patch);
      if (onChange) onChange();
    }

    function sel(key, queryKey, placeholder, options, valorAtual) {
      var s = h('select.select', {
        'aria-label': placeholder,
        style: { width: 'auto', minWidth: '150px' },
        onChange: function () { set(queryKey, this.value); }
      },
        h('option', { value: '', text: placeholder }),
        options.map(function (o) {
          return h('option', { value: o.id, text: o.nome, selected: o.id === valorAtual });
        })
      );
      if (valorAtual) s.classList.add('is-on');
      return s;
    }

    var itens = [];

    if (campos.indexOf('periodo') >= 0) {
      itens.push(h('select.select', {
        'aria-label': 'Período', style: { width: 'auto', minWidth: '160px' },
        onChange: function () { set('periodo', this.value); }
      }, (ctx.allTimePeriod ? [{ value: 'todos', label: 'Todo o histórico' }].concat(AGIR.an.PRESETS) : AGIR.an.PRESETS).map(function (p) {
        return h('option', { value: p.value, text: p.label, selected: p.value === f.periodo });
      })));
    }
    if (campos.indexOf('owner') >= 0) {
      var us = (S().get('usuarios') || []).map(function (u) {
        return Object.assign({}, u, { nome: u.nome + (u.ativo === false ? ' (inativo)' : '') });
      });
      itens.push(sel('owner', 'owner', 'Toda a equipe', us, f.ownerId));
    }
    if (campos.indexOf('equipe') >= 0) {
      itens.push(sel('equipe', 'equipe', 'Todas as equipes', S().get('equipes') || [], f.equipeId));
    }
    if (campos.indexOf('produto') >= 0) {
      itens.push(sel('produto', 'produto', 'Todos os produtos', S().get('produtos') || [], f.produtoId));
    }
    if (campos.indexOf('convenio') >= 0) {
      itens.push(sel('convenio', 'convenio', 'Todos os segmentos', S().get('convenios') || [], f.convenioId));
    }
    if (campos.indexOf('origem') >= 0) {
      itens.push(sel('origem', 'origem', 'Todas as origens', S().get('origens') || [], f.origemId));
    }
    if (campos.indexOf('banco') >= 0) {
      itens.push(sel('banco', 'banco', 'Todos os parceiros', S().get('bancos') || [], f.bancoId));
    }
    if (campos.indexOf('etapa') >= 0) {
      itens.push(sel('etapa', 'etapa', 'Todas as etapas', AGIR.an.etapas() || [], f.etapaId));
    }
    if (campos.indexOf('etiqueta') >= 0) {
      itens.push(sel('etiqueta', 'etiqueta', 'Todas as etiquetas', S().get('etiquetas') || [], f.etiquetaId));
    }
    if (campos.indexOf('status') >= 0) {
      itens.push(sel('status', 'status', 'Leads em aberto', [
        { id: 'aberto', nome: 'Em aberto' }, { id: 'ganho', nome: 'Ganhos' },
        { id: 'perdido', nome: 'Perdidos' }, { id: 'todos', nome: 'Todos os status' }
      ], f.status));
    }
    if (campos.indexOf('dataCriacao') >= 0) {
      itens.push(h('label.filter-date', h('span', { text: 'Criado de' }), h('input.input', {
        type: 'date', value: f.dataInicio, onChange: function () { set('inicio', this.value); }
      })));
      itens.push(h('label.filter-date', h('span', { text: 'até' }), h('input.input', {
        type: 'date', value: f.dataFim, onChange: function () { set('fim', this.value); }
      })));
    }
    if (campos.indexOf('meus') >= 0) {
      var current = S().currentUser();
      if (current) itens.push(h('button.btn.btn--sm' + (f.ownerId === current.id ? '.btn--primary' : ''), {
        onClick: function () { set('owner', f.ownerId === current.id ? null : current.id); }
      }, icon('user'), h('span', { text: 'Meus leads' })));
    }

    /* chips de filtro ativo — dá visibilidade e permite limpar em 1 clique */
    var ativos = [];
    if (f.ownerId) ativos.push(['owner', (S().byId('usuarios', f.ownerId) || {}).nome]);
    if (f.equipeId) ativos.push(['equipe', (S().byId('equipes', f.equipeId) || {}).nome]);
    if (f.produtoId) ativos.push(['produto', (S().byId('produtos', f.produtoId) || {}).nome]);
    if (f.convenioId) ativos.push(['convenio', (S().byId('convenios', f.convenioId) || {}).nome]);
    if (f.origemId) ativos.push(['origem', (S().byId('origens', f.origemId) || {}).nome]);
    if (f.bancoId) ativos.push(['banco', (S().byId('bancos', f.bancoId) || {}).nome]);
    if (f.etapaId) ativos.push(['etapa', (AGIR.an.etapaById(f.etapaId) || {}).nome]);
    if (f.etiquetaId) ativos.push(['etiqueta', (S().byId('etiquetas', f.etiquetaId) || {}).nome]);
    if (f.status) ativos.push(['status', f.status === 'ganho' ? 'Ganhos' : f.status === 'perdido' ? 'Perdidos' : f.status === 'todos' ? 'Todos os status' : 'Em aberto']);

    var bar = h('div.filterbar',
      itens,
      ativos.length ? h('div.row.gap-2.wrap',
        ativos.map(function (a) {
          return h('button.chip.is-active', { onClick: function () { set(a[0], null); } },
            h('span', { text: a[1] }), icon('x', 'chip__x'));
        }),
        h('button.btn.btn--sm.btn--ghost', {
          text: 'Limpar', onClick: function () {
            AGIR.router.setQuery({ owner: null, equipe: null, produto: null, convenio: null, origem: null, banco: null, etapa: null, etiqueta: null, status: null, inicio: null, fim: null });
            if (onChange) onChange();
          }
        })
      ) : null,
      h('div.spacer'),
      h('div.t-tiny.t-dimmer.row.gap-2',
        icon('calendar', 'ico'),
        h('span', { text: rotuloPeriodo(f.periodo) })
      )
    );
    bar.filtros = f;
    return bar;
  }

  function rotuloPeriodo(preset) {
    if (preset === 'todos') return 'Todo o histórico';
    var r = AGIR.an.range(preset);
    if (preset === 'hoje') return F.dateLong(r.from);
    return F.dayMon(r.from) + ' — ' + F.dayMon(r.to);
  }

  /* ==========================================================================
     Tabela de dados
     opts: {
       columns: [{ key, label, width, align, sortable, render(row), value(row) }],
       rows: [],
       sort: { key, dir },
       onRowClick(row),
       empty: Node,
       maxHeight,
       pageSize   // 0 desliga a paginação; padrão 60
     }

     Pagina por padrão: renderizar 3.000 linhas de uma vez derruba a rolagem
     e é a diferença entre um sistema que o time usa e um que ele evita.
     ========================================================================== */
  var PAGE_SIZE_PADRAO = 60;

  function dataTable(opts) {
    var sort = opts.sort ? Object.assign({}, opts.sort) : null;
    var pageSize = opts.pageSize === undefined ? PAGE_SIZE_PADRAO : opts.pageSize;
    var page = 0;

    var root = h('div.col', { style: { gap: 0, minWidth: 0 } });
    var wrap = h('div.table-wrap', opts.maxHeight ? { style: { maxHeight: opts.maxHeight + 'px', overflowY: 'auto' } } : null);
    var table = h('table.table');
    var thead = h('thead');
    var tbody = h('tbody');
    var rodape = h('div');

    function valueOf(row, col) {
      if (col.value) return col.value(row);
      return row[col.key];
    }

    function buildHead() {
      D.clear(thead);
      thead.appendChild(h('tr', opts.columns.map(function (col) {
        var sorted = sort && sort.key === col.key;
        return h('th', {
          class: col.sortable !== false ? 'is-sortable' : '',
          style: {
            width: col.width || 'auto',
            textAlign: col.align || 'left'
          },
          onClick: col.sortable === false ? null : function () {
            if (sorted) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
            else sort = { key: col.key, dir: col.defaultDir || 'desc' };
            page = 0;
            buildHead(); buildBody();
          }
        },
          h('span', { text: col.label }),
          col.sortable === false ? null
            : icon(sorted ? (sort.dir === 'asc' ? 'chevUp' : 'chevDown') : 'chevUpDown')
        );
      })));
    }

    /** Aplica a ordenação e devolve a lista completa já ordenada. */
    function ordenar() {
      var rows = opts.rows.slice();
      if (!sort) return rows;
      var col = opts.columns.find(function (c) { return c.key === sort.key; });
      if (!col) return rows;
      rows.sort(function (a, b) {
        var va = valueOf(a, col), vb = valueOf(b, col);
        if (typeof va === 'string' || typeof vb === 'string') {
          va = F.norm(va); vb = F.norm(vb);
          return sort.dir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
        }
        return sort.dir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
      });
      return rows;
    }

    function linha(row, i) {
      return h('tr', {
        class: opts.onRowClick ? 'is-clickable' : '',
        tabindex: opts.onRowClick ? 0 : null,
        onClick: opts.onRowClick ? function () { opts.onRowClick(row); } : null,
        onKeydown: opts.onRowClick ? function (e) {
          if (e.key === 'Enter') { e.preventDefault(); opts.onRowClick(row); }
        } : null
      }, opts.columns.map(function (col) {
        var content = col.render ? col.render(row, i) : valueOf(row, col);
        return h('td', {
          class: col.align === 'right' ? 'num' : '',
          style: col.align ? { textAlign: col.align } : null
        }, content === null || content === undefined ? '' :
          (content.nodeType ? content : String(content)));
      }));
    }

    function buildBody() {
      var todas = ordenar();
      var total = todas.length;
      var paginado = pageSize > 0 && total > pageSize;
      var ini = paginado ? page * pageSize : 0;
      var fim = paginado ? Math.min(total, ini + pageSize) : total;
      var visiveis = paginado ? todas.slice(ini, fim) : todas;

      D.clear(tbody);
      visiveis.forEach(function (row, i) { tbody.appendChild(linha(row, ini + i)); });

      /* estado vazio */
      D.qsa('.empty', root).forEach(function (n) { n.remove(); });
      if (!total) {
        wrap.appendChild(opts.empty || UI.empty({ icon: 'inbox', title: 'Nenhum registro' }));
      }

      buildRodape(total, ini, fim, paginado);
    }

    function buildRodape(total, ini, fim, paginado) {
      D.clear(rodape);
      if (!total) return;

      var paginas = paginado ? Math.ceil(total / pageSize) : 1;

      rodape.appendChild(h('div.row.between.gap-3.wrap', {
        style: {
          padding: 'var(--sp-3) var(--sp-5)',
          borderTop: '1px solid var(--line)',
          background: 'var(--bg-elev-0)'
        }
      },
        h('span.t-tiny.t-dimmer.t-num', {
          text: paginado
            ? 'Mostrando ' + F.num(ini + 1) + '–' + F.num(fim) + ' de ' + F.num(total)
            : F.plural(total, 'registro')
        }),
        paginado ? h('div.row.gap-2',
          h('button.btn.btn--icon.btn--sm', {
            'aria-label': 'Página anterior', disabled: page === 0,
            onClick: function () { irPara(page - 1); }
          }, icon('chevLeft')),
          h('span.t-tiny.t-dimmer.t-num', {
            style: { minWidth: '86px', textAlign: 'center' },
            text: 'página ' + (page + 1) + ' de ' + F.num(paginas)
          }),
          h('button.btn.btn--icon.btn--sm', {
            'aria-label': 'Próxima página', disabled: page >= paginas - 1,
            onClick: function () { irPara(page + 1); }
          }, icon('chevRight')),
          h('button.btn.btn--sm.btn--ghost', {
            text: 'Ver tudo',
            'data-tip': 'Carrega todos os ' + F.num(total) + ' registros — pode ficar pesado',
            onClick: function () { pageSize = 0; page = 0; buildBody(); }
          })
        ) : null
      ));
    }

    function irPara(p) {
      page = Math.max(0, p);
      buildBody();
      /* volta ao topo da tabela para o usuário não se perder */
      var alvo = opts.maxHeight ? wrap : root;
      if (opts.maxHeight) alvo.scrollTop = 0;
      else alvo.scrollIntoView({ block: 'nearest', behavior: M.reduced() ? 'auto' : 'smooth' });
    }

    buildHead();
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    root.appendChild(wrap);
    root.appendChild(rodape);
    buildBody();

    root.setRows = function (rows) {
      opts.rows = rows;
      page = 0;
      buildBody();
    };
    return root;
  }

  /* ==========================================================================
     Etiquetas de domínio
     ========================================================================== */
  function etapaBadge(etapaId) {
    var e = AGIR.an.etapaById(etapaId);
    if (!e) return h('span.badge', { text: '—' });
    return h('span.badge', {
      style: { background: hexA(e.cor, .14), color: e.cor }
    }, h('i.dot'), h('span', { text: e.nome }));
  }

  function statusBadge(status) {
    var map = {
      aberto:  ['badge--info', 'Em aberto'],
      ganho:   ['badge--ok', 'Ganho'],
      perdido: ['badge--bad', 'Perdido']
    }[status] || ['badge', status];
    return h('span.badge.' + map[0], { text: map[1] });
  }

  function produtoTag(produtoId) {
    var p = S().byId('produtos', produtoId);
    if (!p) return null;
    return h('span.badge', { style: { background: 'var(--bg-elev-2)', color: 'var(--ink-2)' } },
      h('i.dot', { style: { background: p.cor } }), h('span', { text: p.nome }));
  }

  function ownerChip(ownerId, size) {
    var u = S().byId('usuarios', ownerId);
    if (!u) return h('span.t-dimmer', { text: '—' });
    return h('span.row.gap-2', { style: { minWidth: 0 } },
      AGIR.avatar(u, size || 'xs'),
      h('span.truncate', { text: F.firstName(u.nome) })
    );
  }

  /** Idade na etapa com semáforo de SLA */
  function slaTag(op) {
    var e = AGIR.an.etapaById(op.etapaId);
    var dias = AGIR.an.diasNaEtapa(op);
    if (!e || e.tipo !== 'aberto') return null;
    var nivel = dias > e.sla ? 'bad' : dias >= e.sla * 0.7 ? 'warn' : 'ok';
    var txt = dias === 0 ? 'hoje' : dias + 'd';
    return h('span.kcard__age.kcard__age--' + nivel, {
      'data-tip': 'Na etapa há ' + F.plural(dias, 'dia') + ' · SLA ' + e.sla + 'd' +
        (dias > e.sla ? ' · ' + (dias - e.sla) + 'd de atraso' : '')
    }, icon('clock'), h('span', { text: txt }));
  }

  function hexA(hex, a) {
    if (!hex || hex[0] !== '#') return 'var(--bg-elev-2)';
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ==========================================================================
     Lista de insights
     ========================================================================== */
  function insightList(lista, max) {
    var itens = (lista || []).slice(0, max || 4);
    if (!itens.length) return null;
    return h('div.col.gap-3.stagger', itens.map(function (i, idx) {
      return h('div.insight.insight--' + i.tone, { style: { '--i': idx } },
        h('div.insight__ico', icon(i.icon)),
        h('div.grow',
          h('div.insight__title', { text: i.title }),
          h('div.insight__text', { text: i.text })
        ),
        i.action ? h('a.btn.btn--sm.btn--ghost', {
          href: i.action.href, style: { color: 'var(--brand-500)', alignSelf: 'center' }
        }, h('span', { text: i.action.label }), icon('arrowRight')) : null
      );
    }));
  }

  /* ==========================================================================
     Drawer de oportunidade
     ========================================================================== */
  function searchLeadTags(tags, term) {
    var normalized = F.norm(String(term || '').trim());
    return (tags || []).filter(function (tag) { return !normalized || F.norm(tag.nome || '').indexOf(normalized) >= 0; })
      .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  }

  function leadHistoryEntries(activities, messages, changes) {
    return (activities || []).filter(function (a) { return a.status !== 'cancelled'; }).map(function (item) {
      var pending = item.status === 'pending' || item.status === 'scheduled' ||
        (!item.status && item.resultado === 'pendente');
      return { kind: 'activity', date: pending ? (item.agendadoPara || item.data) : item.data, pending: pending, data: item };
    }).concat((messages || []).map(function (item) { return { kind: item.tipo, date: item.criadoEm, data: item }; }))
      .concat((changes || []).map(function (item) { return { kind: 'change', date: item.alteradoEm, data: item }; }))
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date) || String(a.data.id).localeCompare(String(b.data.id)); });
  }

  function snapshotOpportunity(id) {
    var row = S().byId('oportunidades', id);
    return row ? Object.assign({}, row) : null;
  }

  function oppDrawer(oppId) {
    // Store updates mutate rows in place. Never let Realtime silently advance
    // the expected version while the editor still contains an older payload.
    var op = snapshotOpportunity(oppId);
    if (!op) return UI.toast.bad('Oportunidade não encontrada');

    var prod = S().byId('produtos', op.produtoId) || {};
    var convenio = S().byId('convenios', op.convenioId) || {};
    var banco = S().byId('bancos', op.bancoId) || {};
    var origem = S().byId('origens', op.origemId) || {};
    var owner = S().byId('usuarios', op.ownerId) || {};
    var etapa = AGIR.an.etapaById(op.etapaId) || {};

    var hist = (S().get('atividades') || [])
      .filter(function (a) { return a.oportunidadeId === op.id; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var messages = (S().get('mensagensLead') || [])
      .filter(function (item) { return item.oportunidadeId === op.id; });
    var changeHistory = (S().get('historicoAlteracoes') || [])
      .filter(function (item) { return item.oportunidadeId === op.id; });
    var incomingTimer = null, renderCurrentHistory = null, renderCurrentReceipts = null, remoteNotice = null, accessRevoked = false;
    var workspaceRemote = global.AGIR_BACKEND && typeof global.AGIR_BACKEND.loadLeadWorkspace === 'function' && global.AGIR_BACKEND.mode === 'supabase';
    var workspaceState = workspaceRemote ? 'loading' : 'ready', workspaceRequest = null, workspaceRevision = 0;
    var workspaceController = new AbortController(), workspaceClosed = false;
    AGIR.openLeadCounts = AGIR.openLeadCounts || new Map();
    AGIR.openLeadCounts.set(oppId, (AGIR.openLeadCounts.get(oppId) || 0) + 1);
    var historyUI = { term: '', kind: 'all', author: '', limit: 40 };
    var editorState = {
      fields: null, revision: 0, savedRevision: 0, savedPayload: null,
      saving: false, pending: null, timer: null,
      saveButton: null, status: null
    };

    function mapChangeHistoryRow(item) {
      return {
        id: item.id, oportunidadeId: item.opportunity_id,
        alteradoPor: item.changed_by, tipo: item.event_type,
        alteracoes: item.changes || {}, alteradoEm: item.changed_at
      };
    }

    async function syncChangeHistory() {
      if (!global.AGIR_BACKEND || global.AGIR_BACKEND.mode !== 'supabase'
          || typeof global.AGIR_BACKEND.loadOpportunityHistory !== 'function') return;
      try {
        var rows = await global.AGIR_BACKEND.loadOpportunityHistory({
          organizationId: S().get('session.organizationId'), opportunityId: op.id, signal: workspaceController.signal
        });
        if (workspaceClosed || workspaceController.signal.aborted) return;
        var mapped = rows.map(mapChangeHistoryRow);
        var others = (S().get('historicoAlteracoes') || []).filter(function (item) {
          return item.oportunidadeId !== op.id;
        });
        S().set('historicoAlteracoes', others.concat(mapped));
        changeHistory = mapped;
      } catch (error) {
        console.warn('[historico] Nao foi possivel sincronizar as alteracoes do lead.', error);
      }
    }

    function recordLocalChange(type, changes) {
      var item = {
        id: S().uid('hist'), oportunidadeId: op.id,
        alteradoPor: (S().currentUser() || {}).id,
        tipo: type, alteracoes: changes || {}, alteradoEm: new Date().toISOString()
      };
      S().insert('historicoAlteracoes', item);
      changeHistory.unshift(item);
      return item;
    }
    var currentUser = S().currentUser() || {};
    var canViewAllLeads = S().get('session.role') === 'admin' || currentUser.role === 'admin';

    var leadTab = 'history';
    var documentUploadBusy = false, documentControls = null;
    var api = UI.drawer({
      eyebrow: prod.nome,
      title: op.cliente,
      sub: leadHeaderMeta(),
      wide: true,
      headExtra: h('div.row.gap-2.lead-header-status', statusBadge(op.status), etapaBadge(op.etapaId)),
      body: build(),
      footer: rodape(),
      beforeClose: async function () {
        clearTimeout(editorState.timer);
        if (accessRevoked || await saveInline(true)) return true;
        return UI.confirm({ title: 'Sair sem salvar?',
          text: 'Os campos alterados não foram salvos. Você pode voltar para corrigir ou descartar essas alterações.',
          okLabel: 'Descartar e fechar', cancelLabel: 'Continuar editando', danger: true });
      },
      onClose: function () {
        workspaceClosed = true; workspaceController.abort();
        var openCount = (AGIR.openLeadCounts.get(oppId) || 1) - 1;
        if (openCount) AGIR.openLeadCounts.set(oppId, openCount); else AGIR.openLeadCounts.delete(oppId);
        if (workspaceRemote && !openCount) S().batch(function () {
          S().set('historicoAlteracoes', (S().get('historicoAlteracoes') || []).filter(function (item) { return item.oportunidadeId !== oppId; }));
          S().set('mensagensLead', (S().get('mensagensLead') || []).map(function (item) {
            return item.oportunidadeId === oppId ? { id: item.id, oportunidadeId: oppId, criadoEm: item.criadoEm } : item;
          }));
          S().set('comprovantesPagamento', (S().get('comprovantesPagamento') || []).map(function (item) {
            return item.oportunidadeId === oppId ? { id: item.id, oportunidadeId: oppId } : item;
          }));
        });
        clearTimeout(editorState.timer);
        clearTimeout(incomingTimer);
        global.removeEventListener('ascensao:crm-refreshed', receiveLeadUpdate);
        document.removeEventListener('visibilitychange', onWorkspaceVisible);
      }
    });
    api.el.classList.add('drawer--workspace');
    global.addEventListener('ascensao:crm-refreshed', receiveLeadUpdate);
    document.addEventListener('visibilitychange', onWorkspaceVisible);
    if (workspaceRemote) loadWorkspace();
    function onWorkspaceVisible() {
      if (!document.hidden && !workspaceClosed) receiveLeadUpdate({ detail: { full: true } });
    }

    function readWorkspaceStore() {
      hist = (S().get('atividades') || []).filter(function (item) { return item.oportunidadeId === oppId; });
      messages = (S().get('mensagensLead') || []).filter(function (item) { return item.oportunidadeId === oppId && item.tipo; });
      changeHistory = (S().get('historicoAlteracoes') || []).filter(function (item) { return item.oportunidadeId === oppId; });
    }

    function workspaceStatus() {
      return h('div.t-small', { role: 'status' },
        h('span', { text: workspaceState === 'loading' ? 'Carregando histórico e comprovantes…' : 'Não foi possível atualizar os detalhes deste lead.' }),
        workspaceState === 'error' ? h('button.btn.btn--sm', { text: 'Tentar novamente', onClick: loadWorkspace }) : null);
    }

    async function loadWorkspace() {
      if (!workspaceRemote || workspaceClosed || workspaceRequest) return workspaceRequest;
      workspaceState = 'loading';
      if (renderCurrentHistory) renderCurrentHistory(false);
      if (renderCurrentReceipts) renderCurrentReceipts();
      workspaceRequest = (async function () {
        var finishMeasurement = AGIR.perf ? AGIR.perf.start('lead.load') : function () {};
        try {
          // A response racing a Realtime mutation must not resurrect a deleted
          // receipt/message. At most one follow-up read; never retry writes.
          for (var attempt = 0; attempt < 2; attempt++) {
            var revision = workspaceRevision;
            var data = await global.AGIR_BACKEND.loadLeadWorkspace({
              organizationId: S().get('session.organizationId'), opportunityId: oppId, signal: workspaceController.signal
            });
            if (workspaceClosed || workspaceController.signal.aborted) return;
            var latest = S().byId('oportunidades', oppId);
            if (!latest || (!canViewAllLeads && latest.ownerId !== currentUser.id)) return;
            if (revision !== workspaceRevision) {
              if (!attempt) continue;
              throw new Error('O lead recebeu novas alterações durante a leitura.');
            }
            function replaceLead(path, rows) {
              S().set(path, (S().get(path) || []).filter(function (item) { return item.oportunidadeId !== oppId; }).concat(rows));
            }
            S().batch(function () {
              replaceLead('historicoAlteracoes', data.changes.map(mapChangeHistoryRow));
              replaceLead('mensagensLead', data.messages.map(function (item) {
                return { id: item.id, oportunidadeId: item.opportunity_id, autorId: item.author_id, tipo: item.message_type,
                  texto: item.body, mencionados: item.mentioned_user_ids || [], criadoEm: item.created_at };
              }));
              replaceLead('comprovantesPagamento', data.receipts.map(function (item) {
                return { id: item.id, oportunidadeId: item.opportunity_id, autorId: item.uploaded_by, nome: item.original_name,
                  storagePath: item.storage_path, mimeType: item.mime_type, tamanho: Number(item.size_bytes || 0), criadoEm: item.created_at };
              }));
            });
            workspaceState = 'ready'; readWorkspaceStore();
            return;
          }
        } catch (error) {
          if (!workspaceClosed) workspaceState = 'error';
        } finally {
          finishMeasurement();
          workspaceRequest = null;
          if (!workspaceClosed) {
            if (renderCurrentHistory) renderCurrentHistory(false);
            if (renderCurrentReceipts) renderCurrentReceipts();
          }
        }
      })();
      return workspaceRequest;
    }

    function notifyLeadChange(table) {
      workspaceRevision++;
      global.dispatchEvent(new CustomEvent('ascensao:crm-refreshed', {
        detail: { table: table || 'opportunities', opportunityIds: [op.id], source: api, full: false }
      }));
    }

    function receiveLeadUpdate(event) {
      var detail = event.detail || {};
      if (detail.source === api || !api.el.isConnected) return;
      if (detail.opportunityIds && detail.opportunityIds.length && detail.opportunityIds.indexOf(oppId) < 0) return;
      workspaceRevision++;
      clearTimeout(incomingTimer);
      if (document.hidden) return;
      incomingTimer = setTimeout(function () {
        if (!api.el.isConnected || document.hidden) return;
        var latest = S().byId('oportunidades', oppId);
        if (!latest || (!canViewAllLeads && latest.ownerId !== currentUser.id)) {
          accessRevoked = true;
          clearTimeout(editorState.timer);
          api.body.replaceChildren();
          api.close();
          UI.toast.warn('Lead indisponível', 'O registro foi removido ou não está mais na sua carteira.');
          return;
        }
        hist = (S().get('atividades') || []).filter(function (a) { return a.oportunidadeId === oppId; });
        messages = (S().get('mensagensLead') || []).filter(function (a) { return a.oportunidadeId === oppId; });
        changeHistory = (S().get('historicoAlteracoes') || []).filter(function (a) { return a.oportunidadeId === oppId; });
        if (renderCurrentHistory) renderCurrentHistory(true);
        if (renderCurrentReceipts) renderCurrentReceipts();
        if (detail.full && workspaceRemote) loadWorkspace();
        if (!detail.table || detail.full || ['opportunities', 'contacts', 'opportunity_tags', 'payment_receipts'].indexOf(detail.table) >= 0) {
          if (remoteNotice) remoteNotice.hidden = false;
        }
      }, 180);
    }

    function build() {
      return buildLeadWorkspace();
    }

    function buildLeadWorkspace() {
      var stageCard = section({
          title: 'Etapa do funil',
          sub: op.status === 'aberto'
            ? 'Na etapa ha ' + F.plural(AGIR.an.diasNaEtapa(op), 'dia') + ' - SLA de ' + (etapa.sla || 0) + ' dias'
            : (op.status === 'ganho' ? 'Fechado em ' + F.date(op.fechadoEm) : 'Perdido em ' + F.date(op.fechadoEm)),
          body: stageTrack(op, function (stageId) { mover(stageId); })
        });
      stageCard.classList.add('lead-workspace__stage');
      var detailsCard = inlineEditor();
      detailsCard.classList.add('lead-workspace__details');
      var historyCard = section({
          title: 'Historico completo',
          sub: F.plural(hist.length + messages.length + changeHistory.length, 'registro'),
          body: buildLeadTabs()
        });
      historyCard.classList.add('lead-workspace__history');
      return h('div.lead-workspace', stageCard, detailsCard, historyCard);
    }

    function buildLeadTabs() {
      var content = h('div', { style: { flex: '1', minHeight: '0', display: 'flex' } });
      var historyButton, documentsButton;
      function selectTab(tab) {
        leadTab = tab;
        historyButton.setAttribute('aria-selected', String(tab === 'history'));
        documentsButton.setAttribute('aria-selected', String(tab === 'documents'));
        historyButton.classList.toggle('btn--primary', tab === 'history');
        documentsButton.classList.toggle('btn--primary', tab === 'documents');
        D.mount(content, tab === 'documents' ? buildDocuments() : buildHistoryWorkspace());
      }
      historyButton = h('button.btn.btn--sm', { role: 'tab', text: 'Histórico', onClick: function () { selectTab('history'); } });
      documentsButton = h('button.btn.btn--sm', { role: 'tab', text: 'Documentos', onClick: function () { selectTab('documents'); } });
      selectTab(leadTab);
      return h('div.col.gap-3', { style: { flex: '1', minHeight: '0', minWidth: '0' } },
        h('div.row.gap-2', { role: 'tablist', 'aria-label': 'Detalhes do lead' }, historyButton, documentsButton), content);
    }

    function buildDocuments() {
      var backend = global.AGIR_BACKEND;
      var remote = backend && backend.mode === 'supabase';
      var list = h('div.col.gap-2', { role: 'status' });
      var input = h('input', { type: 'file', multiple: true, hidden: true, 'aria-label': 'Selecionar documentos do lead' });
      var button = h('button.btn.btn--primary', { text: documentUploadBusy ? 'Enviando arquivos…' : 'Adicionar arquivos',
        disabled: documentUploadBusy, onClick: function () { input.click(); } });
      var root = h('div.col.gap-3', { style: { width: '100%', overflowY: 'auto' } },
        h('p.t-small.t-dimmer', { text: 'Adicione vídeos, PDFs, imagens e outros documentos. Selecione vários arquivos, com até 50 MB cada.' }),
        input, button, list);
      function render(rows) {
        D.mount(list, rows.length ? rows.map(function (item) {
          return h('div.card.card--pad.col.gap-2',
            h('b', { text: item.original_name, style: { overflowWrap: 'anywhere' } }),
            h('span.t-tiny.t-dimmer', { text: (Number(item.size_bytes) / 1024 / 1024).toFixed(2) + ' MB · ' + F.date(item.created_at) }),
            h('button.btn.btn--sm', { text: 'Baixar arquivo', onClick: async function () {
              this.disabled = true;
              try {
                var url = await backend.createLeadDocumentDownload({ storagePath: item.storage_path });
                var anchor = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', download: item.original_name });
                document.body.appendChild(anchor); anchor.click(); anchor.remove();
              } catch (error) { UI.toast.bad('Não foi possível baixar', error.message); }
              finally { this.disabled = false; }
            } }));
        }) : h('p.t-small.t-dimmer', { text: 'Nenhum documento anexado a este lead.' }));
      }
      async function load() {
        list.textContent = 'Carregando documentos…';
        if (!remote) { list.textContent = 'Conecte o Supabase para armazenar documentos.'; button.disabled = true; return; }
        try {
          var rows = await backend.loadLeadDocuments({ organizationId: S().get('session.organizationId'), opportunityId: oppId, signal: workspaceController.signal });
          if (!workspaceClosed) render(rows);
        } catch (error) {
          if (workspaceClosed) return;
          D.mount(list, [h('p.t-small', { text: 'Não foi possível carregar os documentos: ' + error.message }),
            h('button.btn.btn--sm', { text: 'Tentar novamente', onClick: load })]);
        }
      }
      input.addEventListener('change', async function () {
        if (documentUploadBusy || !remote) return;
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        if (files.some(function (file) { return file.size < 1 || file.size > 50 * 1024 * 1024; })) {
          UI.toast.warn('Arquivo inválido', 'Cada arquivo deve ter entre 1 byte e 50 MB.'); input.value = ''; return;
        }
        documentUploadBusy = true; button.disabled = true;
        var uploaded = 0;
        var failed = [];
        try {
          for (var i = 0; i < files.length; i++) {
            button.textContent = 'Enviando ' + (i + 1) + ' de ' + files.length + '…';
            try {
              await backend.uploadLeadDocument({ organizationId: S().get('session.organizationId'), opportunityId: oppId, file: files[i] });
              uploaded++;
            } catch (error) { failed.push(files[i].name + ': ' + error.message); }
          }
          if (uploaded) UI.toast.ok(uploaded + ' arquivo(s) anexado(s)');
          if (failed.length) UI.toast.bad('Alguns arquivos não foram enviados', failed.join('; '));
        } finally {
          documentUploadBusy = false; button.disabled = false; button.textContent = 'Adicionar arquivos'; input.value = '';
          if (!workspaceClosed && documentControls) {
            documentControls.button.disabled = false; documentControls.button.textContent = 'Adicionar arquivos';
            await documentControls.load();
          }
        }
      });
      documentControls = { button: button, load: load };
      load();
      return root;
    }

    function leadHeaderMeta() {
      return [
        op.cpf ? F.cpfMask(op.cpf) : '',
        op.telefone ? F.phone(op.telefone) : '',
        convenio.nome ? 'Segmento: ' + convenio.nome : '',
        op.matricula ? 'Referência do projeto: ' + op.matricula : ''
      ].filter(Boolean).join(' - ');
    }


    function rodape() {
      if (op.status !== 'aberto') {
        return [
          h('button.btn', { text: 'Reabrir', onClick: function () { var etapaAberta = AGIR.an.etapas().find(function (item) { return item.tipo === 'aberto'; }); if (etapaAberta) mover(etapaAberta.id); } }),
          h('button.btn.btn--primary', { text: 'Fechar painel', onClick: function () { api.close(); } })
        ];
      }
      var abertas = AGIR.an.etapas().filter(function (e) { return e.tipo === 'aberto'; });
      var idx = abertas.findIndex(function (e) { return e.id === op.etapaId; });
      var prox = abertas[idx + 1];
      return [
        h('button.btn.btn--danger', { onClick: function () { marcarPerdido(); } },
          icon('x'), h('span', { text: 'Perdi' })),
        h('div.spacer'),
        prox ? h('button.btn', { onClick: function () { mover(prox.id); } },
          h('span', { text: 'Avançar para ' + prox.nome }), icon('arrowRight')) : null,
        h('button.btn.btn--primary', { onClick: function () { var etapaGanha = AGIR.an.etapas().find(function (item) { return item.tipo === 'ganho'; }); if (etapaGanha) mover(etapaGanha.id); } },
          icon('trophy'), h('span', { text: 'Marcar como ganho' }))
      ];
    }

    function refresh() {
      op = snapshotOpportunity(oppId);
      if (!op) { accessRevoked = true; api.close(); return; }
      prod = S().byId('produtos', op.produtoId) || {};
      convenio = S().byId('convenios', op.convenioId) || {};
      banco = S().byId('bancos', op.bancoId) || {};
      origem = S().byId('origens', op.origemId) || {};
      owner = S().byId('usuarios', op.ownerId) || {};
      hist = (S().get('atividades') || [])
        .filter(function (a) { return a.oportunidadeId === op.id; })
        .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
      messages = (S().get('mensagensLead') || [])
        .filter(function (item) { return item.oportunidadeId === op.id; });
      changeHistory = (S().get('historicoAlteracoes') || [])
        .filter(function (item) { return item.oportunidadeId === op.id; });
      etapa = AGIR.an.etapaById(op.etapaId) || {};
      D.mount(api.body, build());
      updateDrawerHeader();
      var foot = D.qs('.drawer__foot', api.el);
      if (foot) D.mount(foot, h('div.row.gap-3.grow', rodape()));
    }

    var movePending = false;
    async function mover(etapaId, lossReasonId) {
      if (movePending) return false;
      movePending = true;
      try { return await executarMovimento(etapaId, lossReasonId); }
      finally { movePending = false; }
    }
    async function executarMovimento(etapaId, lossReasonId) {
      var e = AGIR.an.etapaById(etapaId);
      if (!e) return;
      if (e.tipo === 'ganho') {
        var hasPaymentReceipt = (S().get('comprovantesPagamento') || []).some(function (receipt) {
          return receipt.oportunidadeId === op.id;
        });
        if (!hasPaymentReceipt) {
          if (!canViewAllLeads) {
            UI.toast.warn('Comprovante de pagamento obrigatorio', 'Anexe ao menos um comprovante neste lead antes de marcar a venda como ganha.');
            var receiptPanel = D.qs('.payment-receipts', api.el);
            if (receiptPanel) receiptPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
          }
          var confirmedWithoutReceipt = await UI.confirm({
            title: 'Marcar como ganho sem comprovante?',
            text: 'Este lead não possui comprovante de pagamento. Como administrador, você pode concluir a venda mesmo assim. Esta ação ficará registrada no histórico.',
            okLabel: 'Confirmar sem comprovante', cancelLabel: 'Voltar'
          });
          if (!confirmedWithoutReceipt) return false;
        }
      }
      var previousStageId = op.etapaId;
      if (editorState.revision > editorState.savedRevision) {
        var savedBeforeMove = await saveInline(true);
        if (savedBeforeMove === false) return false;
      }
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        try {
          var updated = await global.AGIR_BACKEND.transitionOpportunity({
            opportunityId: op.id,
            targetStageId: etapaId,
            expectedVersion: op.version,
            lossReasonId: lossReasonId || null
          });
          if (Number((S().byId('oportunidades', op.id) || {}).version || 0) <= Number(updated.version)) S().update('oportunidades', op.id, {
            etapaId: updated.stage_id,
            entrouEtapaEm: updated.stage_entered_at,
            atualizadoEm: updated.updated_at,
            status: updated.status === 'won' ? 'ganho' : updated.status === 'lost' ? 'perdido' : 'aberto',
            fechadoEm: updated.closed_at,
            motivoPerdaId: updated.loss_reason_id,
            version: updated.version,
            comissao: Number(updated.expected_commission)
          });
          await syncChangeHistory();
        } catch (error) {
          console.error('[oportunidade] Falha ao mover no drawer.', error);
          var receiptRequired = error && /comprovante de pagamento/i.test(error.message || '');
          UI.toast.bad(
            receiptRequired ? 'Comprovante de pagamento obrigatorio' : error.code === 'PT409' ? 'Lead atualizado por outra pessoa' : 'Não foi possível mover',
            receiptRequired ? 'Anexe o comprovante neste lead e tente novamente.' : error.message || 'Confira a conexão e tente novamente.'
          );
          // Never upgrade a dirty editor's version underneath unsaved fields.
          if (editorState.revision === editorState.savedRevision) refresh();
          return false;
        }
      } else {
        var patch = {
          etapaId: etapaId,
          entrouEtapaEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
          status: e.tipo === 'aberto' ? 'aberto' : e.tipo,
          motivoPerdaId: lossReasonId || null
        };
        if (e.tipo === 'ganho' || e.tipo === 'perdido') patch.fechadoEm = new Date().toISOString();
        else patch.fechadoEm = null;
        S().update('oportunidades', op.id, patch);
        var localChanges = { stage_id: { old: previousStageId, 'new': etapaId } };
        if (op.status !== patch.status) localChanges.status = { old: op.status, 'new': patch.status };
        recordLocalChange('stage_changed', localChanges);
      }
      if (e.tipo === 'ganho') M.celebrateWin({ client: op.cliente, amount: AGIR.an.valorCRM(op) });
      UI.toast.ok('Movido para ' + e.nome, op.cliente);
      refresh();
      AGIR.router.resolve();
      return true;
    }
    function editar() {
      var fields = {};
      function parseMoney(value) {
        var digits = String(value || '').replace(/\D/g, '');
        return digits ? Number(digits) / 100 : null;
      }
      function moneyInput(key, label, value) {
        fields[key] = h('input.input', {
          value: value == null ? '' : F.money(value), inputmode: 'numeric', placeholder: 'R$ 0,00', 'aria-label': label,
          onInput: function () {
            var digits = this.value.replace(/\D/g, '').slice(0, 15);
            this.value = digits ? (Number(digits) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
          }
        });
        return h('div.field', h('label.field__label', { text: label }), fields[key]);
      }
      function input(key, label, value, attrs) {
        fields[key] = h('input.input', Object.assign({ value: value == null ? '' : value, 'aria-label': label }, attrs || {}));
        return h('div.field', h('label.field__label', { text: label }), fields[key]);
      }
      function select(key, label, items, value, optional) {
        fields[key] = h('select.select',
          optional ? h('option', { value: '', text: 'Nenhum' }) : null,
          items.map(function (item) { return h('option', { value: item.id, text: item.nome, selected: item.id === value }); })
        );
        return h('div.field', h('label.field__label', { text: label }), fields[key]);
      }
      return UI.modal({
        title: 'Editar oportunidade',
        sub: 'Dados comerciais e cadastrais salvos juntos.',
        body: h('div.col.gap-4',
          h('div.grid.g-2', input('nome', 'Nome completo', op.cliente), input('cpf', 'CPF', op.cpf)),
          h('div.grid.g-2', input('telefone', 'Telefone', op.telefone), input('email', 'E-mail', op.email, { type: 'email' })),
          h('div.grid.g-2',
            input('cidade', 'Cidade', op.cidade),
            select('convenio', 'Segmento de cliente', S().get('convenios') || [], op.convenioId, true)
          ),
          input('matricula', 'Referência do projeto', op.matricula, { maxlength: 60 }),
          h('div.grid.g-2',
            select('produto', 'Produto', (S().get('produtos') || []).filter(function (item) { return item.ativo !== false || item.id === op.produtoId; }), op.produtoId, true),
            select('banco', 'Parceiro de execução', S().get('bancos') || [], op.bancoId, true)
          ),
          select('origem', 'Origem', S().get('origens') || [], op.origemId, true),
          h('div.grid.g-2',
            select('owner', 'Responsavel', (S().get('usuarios') || []).filter(function (u) { return u.ativo !== false; }), op.ownerId),
            moneyInput('valor', 'Valor Inicial', op.valor)
          ),
          h('div.grid.g-3',
            moneyInput('valorTotal', 'Valor Total (Proposta + Estorno)', op.valorTotal),
            moneyInput('valorFinal', 'Valor Final (Tabela gerencial)', op.valorFinal),
            moneyInput('estornoSolicitado', 'Estorno solicitado', op.estornoSolicitado)
          ),
          input('previsao', 'Previsao de fechamento', op.previsaoFechamento ? String(op.previsaoFechamento).slice(0, 10) : '', { type: 'date' }),
          (function () {
            fields.obs = h('textarea.textarea', { text: op.obs || '', rows: 3, 'aria-label': 'Observacoes' });
            return h('div.field', h('label.field__label', { text: 'Observacoes' }), fields.obs);
          })()
        ),
        footer: function (modalApi) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: modalApi.close }),
            h('button.btn.btn--primary', { text: 'Salvar alteracoes', onClick: async function () {
              var name = fields.nome.value.trim();
              var amount = parseMoney(fields.valor.value) || 0;
              if (!name) return UI.toast.warn('Informe o nome completo');
              if (!Number.isFinite(amount) || amount < 0) return UI.toast.warn('Informe um valor valido');
              this.disabled = true;
              try {
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  var result = await global.AGIR_BACKEND.updateOpportunity({
                    opportunityId: op.id, expectedVersion: op.version,
                    ownerId: fields.owner.value, productId: fields.produto.value,
                    conventionId: fields.convenio.value, registrationNumber: fields.matricula.value,
                    bankId: fields.banco.value, sourceId: fields.origem.value,
                    companyId: null, fullName: name,
                    cpf: fields.cpf.value, phone: fields.telefone.value,
                    email: fields.email.value, city: fields.cidade.value,
                    state: null, amount: amount,
                    totalValue: parseMoney(fields.valorTotal.value), finalValue: parseMoney(fields.valorFinal.value),
                    requestedReversal: parseMoney(fields.estornoSolicitado.value),
                    expectedCloseDate: fields.previsao.value, notes: fields.obs.value
                  });
                  var saved = result.opportunity, contact = result.contact;
                  if (Number((S().byId('oportunidades', op.id) || {}).version || 0) > Number(saved.version)) {
                    modalApi.close(); refresh();
                    UI.toast.info('Alteração salva', 'Este lead já recebeu uma atualização mais recente. Confira os dados atuais.');
                    return;
                  }
                  S().update('contatos', contact.id, {
                    nome: contact.full_name, cpf: contact.cpf, email: contact.email,
                    telefone: contact.phone, cidade: contact.city, uf: contact.state,
                    empresaId: contact.company_id, ownerId: contact.owner_id
                  });
                  S().update('oportunidades', op.id, {
                    cliente: contact.full_name, cpf: contact.cpf, telefone: contact.phone,
                    email: contact.email, cidade: contact.city, uf: contact.state,
                    produtoId: saved.product_id, convenioId: saved.convention_id,
                    matricula: saved.registration_number || '',
                    bancoId: saved.bank_id,
                    origemId: saved.source_id, empresaId: saved.company_id,
                    ownerId: saved.owner_id, valor: Number(saved.amount),
                    valorTotal: saved.total_value == null ? null : Number(saved.total_value),
                    valorFinal: saved.final_value == null ? null : Number(saved.final_value),
                    estornoSolicitado: saved.requested_reversal == null ? null : Number(saved.requested_reversal),
                    comissao: Number(saved.expected_commission),
                    previsaoFechamento: saved.expected_close_date,
                    obs: saved.notes || '', atualizadoEm: saved.updated_at, version: saved.version
                  });
                } else {
                  S().update('oportunidades', op.id, { cliente: name, valor: amount, obs: fields.obs.value });
                }
                await syncChangeHistory();
                modalApi.close(); UI.toast.ok('Oportunidade atualizada'); refresh(); AGIR.router.resolve();
              } catch (error) {
                this.disabled = false;
                UI.toast.bad('Nao foi possivel salvar', error.message || 'Revise os dados e tente novamente.');
              }
            } })
          ];
        }
      });
    }
    function localDateTimeValue(date) {
      var value = date || new Date(Date.now() + 60 * 60 * 1000);
      var local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    }

    function completeScheduledActivity(activity) {
      var resultSelect = h('select.select', { 'aria-label': 'Resultado da atividade' });
      fillActivityResults(resultSelect, activity.tipo);
      var durationInput = h('input.input', {
        type: 'number', min: 0, value: 0, inputmode: 'numeric',
        'aria-label': 'Duracao em minutos'
      });
      var notesInput = h('textarea.textarea', {
        rows: 3, text: activity.nota || '',
        placeholder: 'O que aconteceu nesta atividade?', 'aria-label': 'Detalhes da conclusao'
      });
      var type = ATV[activity.tipo] || ATV.tarefa;
      UI.modal({
        title: 'Concluir ' + type.label.toLowerCase(),
        sub: 'Agendada para ' + F.dateTime(activity.agendadoPara || activity.data),
        body: h('div.col.gap-4',
          h('div.insight.insight--ok',
            h('div.insight__ico', icon('checkcircle')),
            h('div',
              h('div.insight__title', { text: 'Marque o resultado da atividade realizada' }),
              h('div.insight__text', { text: 'A agenda sera concluida e o resultado ficara no historico deste lead.' })
            )
          ),
          h('div.grid.g-2',
            h('div.field', h('label.field__label', { text: 'Resultado' }), resultSelect),
            h('div.field', h('label.field__label', { text: 'Duracao (min)' }), durationInput)
          ),
          h('div.field', h('label.field__label', { text: 'Detalhes' }), notesInput)
        ),
        footer: function (modalApi) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: modalApi.close }),
            h('button.btn.btn--primary', { onClick: async function () {
              var button = this;
              button.disabled = true;
              try {
                var completedAt = new Date().toISOString();
                var result = resultSelect.value;
                var durationSeconds = Math.round((Number(durationInput.value) || 0) * 60);
                var notes = notesInput.value.trim();
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  var saved = await global.AGIR_BACKEND.completeActivity({
                    activityId: activity.id, result: result, notes: notes || null,
                    durationSeconds: durationSeconds
                  });
                  completedAt = saved.completed_at;
                  result = saved.result;
                  durationSeconds = saved.duration_seconds || 0;
                  notes = saved.notes || '';
                }
                S().update('atividades', activity.id, {
                  resultado: result, status: 'completed', data: completedAt,
                  duracaoSeg: durationSeconds, nota: notes
                });
                modalApi.close();
                UI.toast.ok('Atividade concluida', type.label + ' registrada no historico.');
                refresh();
                AGIR.router.resolve();
              } catch (error) {
                button.disabled = false;
                UI.toast.bad('Nao foi possivel concluir', error.message || 'Tente novamente.');
              }
            } }, icon('check'), h('span', { text: 'Concluir atividade' }))
          ];
        }
      });
    }

    function buildHistoryWorkspace() {
      var mode = 'note';
      var messageInput = null;
      var selectedMentions = [];
      var activityFields = null;
      var noteButton, chatButton, activityButton, composerBody, publishButton, helper;
      var managementUsers = (S().get('usuarios') || []).filter(function (user) {
        var cargo = S().byId('cargos', user.cargoId) || {};
        var managementRole = user.role === 'admin' || user.role === 'manager' ||
          cargo.role === 'admin' || cargo.role === 'manager' || Number(cargo.nivel || 0) >= 80 ||
          /administrador|gestor/i.test(cargo.nome || '');
        return user.ativo !== false && managementRole;
      });
      var entries = [];
      var feed, feedList, historyCount, newEventsButton;

      var changeLabels = {
        full_name: 'Nome', cpf: 'CPF', phone: 'Telefone', email: 'E-mail', city: 'Cidade', state: 'UF',
        title: 'Titulo', owner_id: 'Responsavel', product_id: 'Produto', convention_id: 'Segmento de cliente',
        registration_number: 'Referência do projeto', bank_id: 'Parceiro de execução',
        source_id: 'Origem', stage_id: 'Etapa', status: 'Status', loss_reason_id: 'Motivo da perda',
        amount: 'Valor inicial', total_value: 'Valor total', final_value: 'Valor final',
        requested_reversal: 'Estorno solicitado', expected_close_date: 'Previsao de fechamento',
        notes: 'Observacoes', tag_id: 'Etiqueta'
      };

      function historyEntity(collection, id, fallback) {
        var item = id && S().byId(collection, id);
        return item ? (item.nome || item.titulo || fallback) : (id ? fallback : 'Nao informado');
      }

      function formatChangeValue(field, value) {
        if (value === null || value === undefined || value === '') return 'Nao informado';
        if (field === 'owner_id') return historyEntity('usuarios', value, 'Usuario indisponivel');
        if (field === 'product_id') return historyEntity('produtos', value, 'Produto indisponivel');
        if (field === 'convention_id') return historyEntity('convenios', value, 'Segmento não informado');
        if (field === 'bank_id') return historyEntity('bancos', value, 'Parceiro indisponível');
        if (field === 'source_id') return historyEntity('origens', value, 'Origem indisponivel');
        if (field === 'stage_id') {
          var stage = AGIR.an.etapaById(value);
          return stage ? stage.nome : 'Etapa indisponivel';
        }
        if (field === 'loss_reason_id') return historyEntity('motivosPerda', value, 'Motivo indisponivel');
        if (field === 'tag_id') return historyEntity('etiquetas', value, 'Etiqueta indisponivel');
        if (['amount', 'total_value', 'final_value', 'requested_reversal'].indexOf(field) >= 0) return F.money(Number(value) || 0);
        if (field === 'cpf') return F.cpfMask(String(value));
        if (field === 'phone') return F.phone(String(value));
        if (field === 'expected_close_date') return F.date(value);
        if (field === 'status') return ({
          open: 'Aberto', won: 'Ganho', lost: 'Perdido', cancelled: 'Excluido',
          aberto: 'Aberto', ganho: 'Ganho', perdido: 'Perdido', cancelado: 'Excluido'
        })[value] || value;
        return String(value);
      }

      function renderChangeEvent(event) {
        var config = {
          created: ['Lead criado', 'plus'],
          updated: ['Dados atualizados', 'edit'],
          stage_changed: ['Movimentacao de etapa', 'arrowRight'],
          cancelled: ['Lead excluido', 'trash'],
          tag_added: ['Etiqueta adicionada', 'tag'],
          tag_removed: ['Etiqueta removida', 'tag']
        }[event.tipo] || ['Alteracao', 'activity'];
        var author = S().byId('usuarios', event.alteradoPor) || {};
        var changes = Object.keys(event.alteracoes || {}).filter(function (field) {
          return changeLabels[field];
        });
        return h('article.lead-feed__item.lead-change',
          h('div.lead-feed__icon', icon(config[1])),
          h('div.grow',
            h('div.row.gap-2.wrap',
              h('b.t-small', { text: author.nome || 'Sistema' }),
              h('span.badge', { text: config[0] }),
              h('time.t-tiny.t-dimmer', { datetime: event.alteradoEm, text: F.dateTime(event.alteradoEm) + ' · ' + F.relative(event.alteradoEm), title: new Date(event.alteradoEm).toLocaleString('pt-BR') })
            ),
            changes.length ? h('div.lead-change__details', changes.map(function (field) {
              var change = event.alteracoes[field] || {};
              return h('div.lead-change__row',
                h('span.lead-change__label', { text: changeLabels[field] }),
                h('span.lead-change__before', { text: formatChangeValue(field, change.old) }),
                icon('arrowRight'),
                h('span.lead-change__after', { text: formatChangeValue(field, change['new']) })
              );
            })) : null
          )
        );
      }

      function activityPanel() {
        activityFields = {};
        var completedBox, scheduledBox, completedMode, scheduledMode;
        activityFields.action = { value: 'completed' };
        activityFields.type = h('select.select', { 'aria-label': 'Tipo', onChange: function () {
          fillActivityResults(activityFields.result, this.value);
        } }, Object.keys(ATV).filter(function (key) { return key !== 'nota'; }).map(function (key) {
          return h('option', { value: key, text: ATV[key].label });
        }));
        activityFields.result = h('select.select', { 'aria-label': 'Resultado' });
        fillActivityResults(activityFields.result, activityFields.type.value);
        activityFields.duration = h('input.input', { type: 'number', min: 0, value: 0, inputmode: 'numeric', 'aria-label': 'Duracao em minutos' });
        activityFields.scheduledAt = h('input.input', { type: 'datetime-local', value: localDateTimeValue(), min: localDateTimeValue(new Date()), 'aria-label': 'Data e hora' });
        activityFields.notes = h('textarea.textarea', { rows: 3, placeholder: 'O que aconteceu ou o que devera ser feito?', 'aria-label': 'Detalhes' });
        completedBox = h('div.grid.g-2',
          h('div.field', h('label.field__label', { text: 'Resultado' }), activityFields.result),
          h('div.field', h('label.field__label', { text: 'Duracao (min)' }), activityFields.duration)
        );
        scheduledBox = h('div.field', { hidden: true },
          h('label.field__label', 'Data e hora', h('span.field__required', { text: '*', 'aria-hidden': 'true' })),
          activityFields.scheduledAt
        );

        function setAction(next) {
          var scheduled = next === 'scheduled';
          activityFields.action.value = next;
          completedBox.hidden = scheduled;
          scheduledBox.hidden = !scheduled;
          completedMode.classList.toggle('is-active', !scheduled);
          scheduledMode.classList.toggle('is-active', scheduled);
          helper.textContent = scheduled
            ? 'Defina a proxima acao e quando ela devera acontecer.'
            : 'Registre uma acao que ja aconteceu e o seu resultado.';
          D.mount(publishButton, h('span.row.gap-2', icon(scheduled ? 'calendar' : 'check'), h('span', { text: scheduled ? 'Agendar proxima atividade' : 'Registrar como realizada' })));
        }

        return h('div.col.gap-3',
          h('div.activity-mode-picker',
            completedMode = h('button.activity-mode-card.is-active', { type: 'button', onClick: function () { setAction('completed'); } },
              icon('checkcircle'), h('span', h('b', { text: 'Atividade realizada' }), h('small', { text: 'Registrar o que acabou de acontecer' }))),
            scheduledMode = h('button.activity-mode-card', { type: 'button', onClick: function () { setAction('scheduled'); } },
              icon('calendar'), h('span', h('b', { text: 'Proxima atividade' }), h('small', { text: 'Agendar uma acao futura' })))
          ),
          h('div.field', h('label.field__label', { text: 'Tipo de atividade' }), activityFields.type),
          completedBox,
          scheduledBox,
          h('div.field', h('label.field__label', { text: 'Detalhes' }), activityFields.notes)
        );
      }

      function renderMode() {
        composer.classList.toggle('is-activity', mode === 'activity');
        noteButton.setAttribute('aria-pressed', String(mode === 'note'));
        chatButton.setAttribute('aria-pressed', String(mode === 'chat'));
        activityButton.setAttribute('aria-pressed', String(mode === 'activity'));
        noteButton.classList.toggle('is-active', mode === 'note');
        chatButton.classList.toggle('is-active', mode === 'chat');
        activityButton.classList.toggle('is-active', mode === 'activity');
        if (mode === 'activity') {
          D.mount(composerBody, activityPanel());
          helper.textContent = 'Registre o contato que acabou de acontecer.';
          D.mount(publishButton, h('span.row.gap-2', icon('check'), h('span', { text: 'Registrar como realizada' })));
        } else {
          messageInput = h('textarea.textarea', {
            rows: 4,
            placeholder: mode === 'chat'
              ? 'Escreva para os usuarios com acesso a este lead...'
              : 'Adicione uma anotacao ao historico...'
          });
          if (mode === 'chat') {
            var mentionPicker = h('div.chat-mentions',
              h('div.row.between.gap-2',
                h('span.t-tiny.t-dimmer', { text: 'Acionar uma pessoa da gestao' }),
                selectedMentions.length ? h('span.badge.badge--brand', { text: selectedMentions.length + ' selecionado(s)' }) : null
              ),
              managementUsers.length ? h('div.chat-mentions__people', managementUsers.map(function (user) {
                var selected = selectedMentions.indexOf(user.id) >= 0;
                return h('button.chat-mention' + (selected ? '.is-selected' : ''), {
                  type: 'button', 'aria-pressed': selected ? 'true' : 'false',
                  onClick: function () {
                    var index = selectedMentions.indexOf(user.id);
                    if (index >= 0) selectedMentions.splice(index, 1);
                    else selectedMentions.push(user.id);
                    renderMode();
                  }
                }, AGIR.avatar(user, 'xs'), h('span', { text: F.firstName(user.nome) }), selected ? icon('check') : null);
              })) : h('span.t-small.t-dimmer', { text: 'Nenhum gestor ativo disponivel para mencao.' })
            );
            D.mount(composerBody, h('div.col.gap-3', mentionPicker, messageInput));
          } else {
            D.mount(composerBody, messageInput);
          }
          helper.textContent = mode === 'chat'
            ? 'A pessoa selecionada sera destacada no bate-papo.'
            : 'A anotacao passa a fazer parte do historico do lead.';
          D.mount(publishButton, h('span.row.gap-2', icon('send'), h('span', { text: mode === 'chat' ? 'Enviar mensagem' : 'Publicar anotacao' })));
        }
      }

      async function submit(button) {
        button.disabled = true;
        try {
          if (mode !== 'activity') {
            var body = messageInput.value.trim();
            if (!body) { UI.toast.warn('Escreva uma mensagem antes de publicar.'); return; }
            var current = S().currentUser();
            var savedMessage;
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              savedMessage = await global.AGIR_BACKEND.sendOpportunityMessage({
                organizationId: S().get('session.organizationId'), opportunityId: op.id,
                authorId: current.id, messageType: mode, body: body,
                mentionUserIds: mode === 'chat' ? selectedMentions : []
              });
            } else {
              savedMessage = { id: S().uid('msg'), opportunity_id: op.id, author_id: current.id, message_type: mode, body: body, created_at: new Date().toISOString() };
            }
            S().insert('mensagensLead', {
              id: savedMessage.id, oportunidadeId: savedMessage.opportunity_id,
              autorId: savedMessage.author_id, tipo: savedMessage.message_type,
              texto: savedMessage.body,
              mencionados: savedMessage.mentioned_user_ids || (mode === 'chat' ? selectedMentions.slice() : []),
              criadoEm: savedMessage.created_at
            });
            UI.toast.ok(mode === 'chat' ? 'Mensagem enviada' : 'Anotacao adicionada');
          } else {
            var scheduled = activityFields.action.value === 'scheduled';
            var scheduledAt = scheduled ? activityFields.scheduledAt.value : '';
            if (scheduled && !scheduledAt) { UI.toast.warn('Escolha a data e a hora da proxima atividade.'); return; }
            if (scheduled && new Date(scheduledAt).getTime() < Date.now() - 60000) { UI.toast.warn('Escolha uma data futura para o agendamento.'); return; }
            var ownerId = (S().currentUser() || {}).id;
            var result = scheduled ? 'pendente' : activityFields.result.value;
            var localActivity = {
              id: S().uid('atv'), tipo: activityFields.type.value, resultado: result,
              ownerId: ownerId, oportunidadeId: op.id,
              data: scheduled ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
              duracaoSeg: scheduled ? 0 : Math.round((+activityFields.duration.value || 0) * 60),
              nota: activityFields.notes.value.trim(),
              agendadoPara: scheduled ? new Date(scheduledAt).toISOString() : null,
              status: scheduled ? 'pending' : 'completed'
            };
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              var savedActivity = await global.AGIR_BACKEND.createActivity({
                organizationId: S().get('session.organizationId'), opportunityId: op.id,
                ownerId: ownerId, type: localActivity.tipo, result: result,
                notes: localActivity.nota, durationSeconds: localActivity.duracaoSeg,
                scheduledAt: localActivity.agendadoPara
              });
              localActivity.id = savedActivity.id;
              localActivity.data = savedActivity.completed_at || savedActivity.scheduled_at || savedActivity.created_at;
              localActivity.agendadoPara = savedActivity.scheduled_at;
              localActivity.status = savedActivity.status;
            }
            S().insert('atividades', localActivity);
            UI.toast.ok(scheduled ? 'Proxima atividade agendada' : 'Atividade registrada');
          }
          refresh();
          AGIR.router.resolve();
        } catch (error) {
          console.error('[lead] Falha ao publicar no historico.', error);
          UI.toast.bad('Nao foi possivel salvar', error.message || 'Tente novamente.');
        } finally { button.disabled = false; }
      }

      function entryNode(entry) {
        if (entry.kind === 'activity') return h('div.lead-feed__item', timeline([entry.data], {
          onComplete: completeScheduledActivity
        }));
        if (entry.kind === 'change') return renderChangeEvent(entry.data);
        var author = S().byId('usuarios', entry.data.autorId) || {};
        return h('article.lead-feed__item',
          h('div.lead-feed__icon', icon(entry.kind === 'chat' ? 'users' : 'edit')),
          h('div.grow',
            h('div.row.gap-2.wrap',
              h('b.t-small', { text: author.nome || 'Usuario' }),
              h('span.badge', { text: entry.kind === 'chat' ? 'Bate-papo' : 'Anotacao' }),
              h('time.t-tiny.t-dimmer', { datetime: entry.date, text: F.dateTime(entry.date) + ' · ' + F.relative(entry.date), title: new Date(entry.date).toLocaleString('pt-BR') })
            ),
            h('div.t-body', { style: { marginTop: '6px', whiteSpace: 'pre-wrap' }, text: entry.data.texto }),
            entry.data.mencionados && entry.data.mencionados.length
              ? h('div.chat-mentioned-list', entry.data.mencionados.map(function (userId) {
                  var mentioned = S().byId('usuarios', userId) || {};
                  return h('span.chat-mentioned-chip', icon('user'), h('span', { text: mentioned.nome || 'Gestao' }));
                }))
              : null
          )
        );
      }
      function renderHistory(incoming) {
        if (workspaceState !== 'ready') {
          historyCount.textContent = workspaceState === 'loading' ? 'Carregando…' : 'Atualização pendente';
          D.mount(feedList, workspaceStatus()); return;
        }
        if (incoming && feedList.scrollTop > 32) { newEventsButton.hidden = false; return; }
        newEventsButton.hidden = true;
        entries = leadHistoryEntries(hist, messages, changeHistory);
        var filtered = entries.filter(function (entry) {
          if (historyUI.kind === 'pending') { if (!entry.pending) return false; }
          else if (entry.pending || (historyUI.kind !== 'all' && entry.kind !== historyUI.kind)) return false;
          var authorId = entry.data.autorId || entry.data.alteradoPor || entry.data.ownerId;
          if (historyUI.author && authorId !== historyUI.author) return false;
          var author = S().byId('usuarios', authorId) || {};
          return !historyUI.term || F.norm([entry.data.texto, entry.data.nota, entry.data.tipo, author.nome,
            JSON.stringify(entry.data.alteracoes || {})].join(' ')).indexOf(F.norm(historyUI.term)) >= 0;
        });
        var pendingCount = entries.filter(function (e) { return e.pending; }).length;
        historyCount.textContent = F.plural(filtered.length, 'registro') + ' · ' + pendingCount + ' agendada(s)';
        var visible = filtered.slice(0, historyUI.limit), nodes = [], previousDay = '';
        visible.forEach(function (entry) {
          var day = F.date(entry.date);
          if (day !== previousDay) nodes.push(h('div.lead-feed__day', { text: day }));
          previousDay = day;
          nodes.push(entryNode(entry));
        });
        if (filtered.length > visible.length) nodes.push(h('button.btn.btn--sm', {
          text: 'Carregar mais (' + visible.length + ' de ' + filtered.length + ')',
          onClick: function () { var top = feedList.scrollTop; historyUI.limit += 40; renderHistory(false); feedList.scrollTop = top; }
        }));
        D.mount(feedList, nodes.length ? nodes : UI.empty({ icon: 'activity', title: 'Nenhum registro neste filtro',
          text: pendingCount ? 'Consulte Agendadas para ver as próximas atividades.' : 'Altere a busca ou publique uma anotação.' }));
      }
      function filterHistory() { historyUI.limit = 40; renderHistory(false); feedList.scrollTop = 0; }
      var historySearchTimer;
      var search = h('input.input', { type: 'search', placeholder: 'Pesquisar histórico…', 'aria-label': 'Pesquisar histórico',
        value: historyUI.term, onInput: function () {
          historyUI.term = this.value; clearTimeout(historySearchTimer);
          historySearchTimer = setTimeout(function () { if (feed.isConnected) filterHistory(); }, 180);
        }
      });
      feedList = h('div.lead-feed__scroll', { tabindex: 0, role: 'region', 'aria-label': 'Registros do histórico' });
      newEventsButton = h('button.btn.btn--sm.btn--primary', { hidden: true, text: 'Novos registros — atualizar histórico',
        onClick: function () { feedList.scrollTop = 0; renderHistory(false); }
      });
      feed = h('div.lead-feed',
        h('div.lead-history-tools', search,
          h('select.select', { 'aria-label': 'Tipo de registro', onChange: function () { historyUI.kind = this.value; filterHistory(); } },
            [['all', 'Histórico completo'], ['change', 'Alterações'], ['activity', 'Realizadas'], ['note', 'Anotações'], ['chat', 'Bate-papo'], ['pending', 'Agendadas']].map(function (o) {
              return h('option', { value: o[0], text: o[1], selected: historyUI.kind === o[0] });
            })),
          h('select.select', { 'aria-label': 'Autor do registro', onChange: function () { historyUI.author = this.value; filterHistory(); } },
            h('option', { value: '', text: 'Todos os autores' }),
            (S().get('usuarios') || []).map(function (u) { return h('option', { value: u.id, text: u.nome, selected: historyUI.author === u.id }); }))
        ),
        h('div.lead-history-summary', historyCount = h('span', { role: 'status' }), newEventsButton), feedList
      );
      renderCurrentHistory = renderHistory;
      renderHistory(false);

      var composer = h('div.lead-composer',
        h('div.lead-composer__tabs',
          noteButton = h('button.btn.btn--sm.is-active', { onClick: function () { mode = 'note'; renderMode(); } }, icon('edit'), h('span', { text: 'Anotacao' })),
          chatButton = h('button.btn.btn--sm', { onClick: function () { mode = 'chat'; renderMode(); } }, icon('users'), h('span', { text: 'Bate-papo' })),
          activityButton = h('button.btn.btn--sm', { onClick: function () { mode = 'activity'; renderMode(); } }, icon('calendar'), h('span', { text: 'Atividade' }))
        ),
        composerBody = h('div.lead-composer__body', { role: 'region', 'aria-label': 'Campos de publicação', tabindex: 0 }),
        h('div.lead-composer__footer',
          helper = h('span.t-tiny.t-dimmer'),
          h('div.spacer'),
          publishButton = h('button.btn.btn--primary.btn--sm', { onClick: function () { submit(this); } })
        )
      );
      renderMode();
      return h('div.lead-history-layout', feed, composer);
    }

    function maskCpfInput(value) {
      var digits = String(value || '').replace(/\D/g, '').slice(0, 11);
      return digits.replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    }

    function maskPhoneInput(value) {
      var digits = String(value || '').replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 10) return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
      return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
    }

    function parseMoneyInput(value) {
      var digits = String(value || '').replace(/\D/g, '');
      return digits ? Number(digits) / 100 : null;
    }

    function formatMoneyInput(value) {
      var digits = String(value || '').replace(/\D/g, '').slice(0, 15);
      return digits ? (Number(digits) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    }

    function editorLabel(label, required) {
      return h('label.field__label', label,
        required ? h('span.field__required', { text: '*', 'aria-hidden': 'true' }) : null);
    }

    function inlineEditor() {
      var fields = {};
      editorState.fields = fields;
      if (!editorState.saving) {
        editorState.revision = 0;
        editorState.savedRevision = 0;
      }

      function bind(el, mask) {
        el.addEventListener('input', function () {
          if (mask) this.value = mask(this.value);
          markEditorDirty(900);
        });
        el.addEventListener('change', function () { markEditorDirty(250); });
        el.addEventListener('blur', function () {
          if (editorState.revision > editorState.savedRevision) scheduleInlineSave(120);
        });
        return el;
      }

      function inputField(key, label, value, attrs, required, mask) {
        fields[key] = bind(h('input.input', Object.assign({
          value: value == null ? '' : value,
          'aria-label': label
        }, attrs || {})), mask);
        return h('div.field', editorLabel(label, required), fields[key]);
      }

      function moneyField(key, label, value) {
        return inputField(key, label, value == null ? '' : F.money(value), {
          inputmode: 'numeric', placeholder: 'R$ 0,00'
        }, false, formatMoneyInput);
      }

      function selectField(key, label, items, value, optional, required, attrs) {
        fields[key] = bind(h('select.select', Object.assign({ 'aria-label': label }, attrs || {}),
          optional ? h('option', { value: '', text: 'Nenhum' }) : null,
          items.map(function (item) {
            return h('option', { value: item.id, text: item.nome, selected: item.id === value });
          })
        ));
        return h('div.field', editorLabel(label, required), fields[key]);
      }

      fields.obs = bind(h('textarea.textarea', {
        rows: 2, text: op.obs || '', placeholder: 'Informacoes importantes, condicoes e combinados...',
        'aria-label': 'Observacoes'
      }));

      editorState.status = h('span.lead-editor__status', { role: 'status', 'aria-live': 'polite', text: 'Salvamento automático ativo' });
      editorState.saveButton = h('button.btn.btn--primary.btn--sm', {
        type: 'button', hidden: true,
        onClick: function () { saveInline(true); }
      }, icon('check'), h('span', { text: 'Salvar alteracoes' }));

      var editor = section({
        title: 'Informacoes do lead',
        sub: 'Edicao direta com salvamento automatico',
        actions: [
          h('button.btn.btn--sm.btn--ghost', { onClick: manageTags, 'aria-label': 'Gerenciar etiquetas' },
            icon('tag'), h('span', { text: 'Etiquetas' }))
        ],
        body: h('div.lead-editor',
          remoteNotice = h('div.lead-remote-notice', { hidden: true },
            h('span', { text: 'Este lead recebeu alterações.' }),
            h('button.btn.btn--sm', { text: 'Revisar atualização', onClick: async function () {
              if (editorState.saving) {
                UI.toast.warn('Aguarde o salvamento em andamento.'); return;
              }
              if (editorState.revision > editorState.savedRevision) {
                var discard = await UI.confirm({ title: 'Recarregar a ficha?',
                  text: 'Isso descarta somente os campos ainda não salvos e exibe a versão disponível no sistema.',
                  okLabel: 'Descartar e recarregar', cancelLabel: 'Continuar editando', danger: true });
                if (!discard) return;
              }
              clearTimeout(editorState.timer);
              if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                try {
                  if (!await global.AGIR_BACKEND.refreshOpportunity(op.id)) {
                    UI.toast.warn('Não foi possível atualizar agora. Seus campos foram preservados.'); return;
                  }
                } catch (error) { UI.toast.warn(error.message); return; }
              }
              refresh();
            } })
          ),
          compactTags(),
          h('div.lead-editor__grid',
            inputField('nome', 'Nome completo', op.cliente, {}, true),
            inputField('cpf', 'CPF', maskCpfInput(op.cpf), { inputmode: 'numeric', maxlength: 14 }, false, maskCpfInput),
            inputField('telefone', 'Telefone (opcional)', maskPhoneInput(op.telefone), { inputmode: 'tel', maxlength: 15 }, false, maskPhoneInput),
            inputField('email', 'E-mail', op.email, { type: 'email' }),
            inputField('cidade', 'Cidade', op.cidade),
            selectField('convenio', 'Segmento de cliente', (S().get('convenios') || []).filter(function (item) {
              return item.ativo !== false || item.id === op.convenioId;
            }), op.convenioId, true),
            inputField('matricula', 'Referência do projeto', op.matricula, { maxlength: 60 }),
            selectField('produto', 'Produto', (S().get('produtos') || []).filter(function (item) { return item.ativo !== false || item.id === op.produtoId; }), op.produtoId, true, false),
            selectField('banco', 'Parceiro de execução', S().get('bancos') || [], op.bancoId, true),
            selectField('origem', 'Origem', S().get('origens') || [], op.origemId, true),
            selectField('owner', 'Responsavel', (S().get('usuarios') || []).filter(function (user) {
              return (canViewAllLeads || user.id === currentUser.id) && (user.ativo !== false || user.id === op.ownerId);
            }), op.ownerId, false, true, { disabled: !canViewAllLeads }),
            moneyField('valor', 'Valor Inicial', op.valor),
            moneyField('valorTotal', 'Valor Total', op.valorTotal),
            moneyField('valorFinal', 'Valor Final', op.valorFinal),
            moneyField('estornoSolicitado', 'Estorno solicitado', op.estornoSolicitado),
            inputField('previsao', 'Previsao de fechamento', op.previsaoFechamento ? String(op.previsaoFechamento).slice(0, 10) : '', { type: 'date' })
          ),
          h('div.field.lead-editor__wide', editorLabel('Observacoes'), fields.obs),
          h('div.lead-editor__meta',
            h('span', { text: 'Criado em ' + F.dateTime(op.criadoEm) }),
            h('span', { text: 'Ciclo: ' + F.plural(F.daysBetween(op.criadoEm, op.fechadoEm || new Date()), 'dia') }),
            op.motivoPerdaId ? h('span.t-bad', { text: 'Perda: ' + ((S().byId('motivosPerda', op.motivoPerdaId) || {}).nome || '-') }) : null
          ),
          paymentReceiptsPanel(),
          h('div.lead-editor__savebar',
            h('span.lead-editor__saveico', icon('cloud')),
            editorState.status,
            h('div.spacer'),
            editorState.saveButton
          )
        )
      });
      editorState.savedPayload = JSON.stringify(readEditorValues());
      return editor;
    }

    function compactTags() {
      var tags = assignedTags();
      return h('div.lead-editor__tags',
        tags.map(function (tag) { return tagChip(tag, false); }),
        h('button.lead-tags__add', {
          type: 'button', onClick: manageTags,
          'aria-label': tags.length ? 'Alterar etiquetas' : 'Adicionar etiqueta'
        }, icon('plus'), h('span', { text: tags.length ? 'Alterar' : 'Adicionar etiqueta' }))
      );
    }

    function paymentReceiptsPanel() {
      var listHost = h('div.payment-receipts__list');
      var countHost = h('span.badge', { hidden: true });
      var input = h('input', {
        type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp',
        hidden: true, 'aria-label': 'Selecionar comprovante de pagamento'
      });
      var uploadButton = h('button.btn.btn--sm.btn--ghost', {
        type: 'button', onClick: function () { input.click(); }
      }, icon('upload'), h('span', { text: 'Anexar' }));

      function receipts() {
        return (S().get('comprovantesPagamento') || []).filter(function (receipt) {
          return receipt.oportunidadeId === op.id;
        }).sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; });
      }

      function sizeLabel(bytes) {
        var value = Number(bytes || 0);
        return value >= 1048576 ? (value / 1048576).toFixed(1).replace('.', ',') + ' MB'
          : Math.max(1, Math.round(value / 1024)) + ' KB';
      }

      async function previewReceipt(receipt, trigger) {
        if (!(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')) {
          return UI.toast.info('Arquivo demonstrativo', 'A visualização funciona quando o Supabase está conectado.');
        }
        trigger.disabled = true;
        try {
          var url = await global.AGIR_BACKEND.createPaymentReceiptDownload({ storagePath: receipt.storagePath });
          var isPdf = receipt.mimeType === 'application/pdf';
          var viewer = isPdf
            ? h('iframe.payment-receipt-preview__frame', {
                src: url, title: 'Pré-visualização de ' + receipt.nome
              })
            : h('img.payment-receipt-preview__image', {
                src: url, alt: 'Comprovante ' + receipt.nome
              });
          UI.modal({
            title: 'Visualizar comprovante',
            sub: receipt.nome + ' · ' + sizeLabel(receipt.tamanho),
            wide: true,
            body: h('div.payment-receipt-preview', viewer),
            footer: function (modal) {
              return [
                canViewAllLeads ? h('button.btn.btn--danger', {
                  type: 'button', onClick: function () { deleteReceipt(receipt, modal); }
                }, icon('trash'), h('span', { text: 'Excluir comprovante' })) : null,
                h('div.spacer'),
                h('a.btn', { href: url, target: '_blank', rel: 'noopener' },
                  icon('external'), h('span', { text: 'Abrir em nova aba' })),
                h('button.btn.btn--primary', { type: 'button', text: 'Fechar', onClick: modal.close })
              ];
            }
          });
        } catch (error) {
          UI.toast.bad('Não foi possível visualizar o comprovante', error.message || 'Tente novamente.');
        } finally {
          trigger.disabled = false;
        }
      }

      async function deleteReceipt(receipt, previewModal) {
        if (!canViewAllLeads) {
          return UI.toast.bad('Ação não permitida', 'Somente administradores podem excluir comprovantes.');
        }
        var confirmed = await UI.confirm({
          title: 'Excluir comprovante?',
          text: 'O arquivo "' + receipt.nome + '" será excluído permanentemente. Esta ação ficará registrada na auditoria.',
          okLabel: 'Excluir permanentemente', cancelLabel: 'Cancelar', danger: true
        });
        if (!confirmed) return;

        try {
          var result;
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            result = await global.AGIR_BACKEND.deletePaymentReceipt({ receiptId: receipt.id });
          }
          S().remove('comprovantesPagamento', receipt.id);
          renderReceipts();
          if (previewModal) previewModal.close();
          if (result && result.storageCleanupPending) {
            UI.toast.warn('Comprovante removido', 'O registro foi excluído, mas a limpeza física do arquivo será revisada.');
          } else {
            UI.toast.ok('Comprovante excluído', receipt.nome);
          }
        } catch (error) {
          console.error('[comprovantes] Falha ao excluir.', error);
          UI.toast.bad('Não foi possível excluir', error.message || 'Atualize a página e tente novamente.');
        }
      }

      function renderReceipts() {
        if (workspaceState !== 'ready') { D.mount(listHost, workspaceStatus()); return; }
        var items = receipts();
        countHost.textContent = String(items.length);
        countHost.hidden = !items.length;
        D.mount(listHost, items.length ? items.map(function (receipt) {
          var author = S().byId('usuarios', receipt.autorId) || {};
          return h('div.payment-receipt-row',
            h('button.payment-receipt', {
              type: 'button', title: 'Abrir ' + receipt.nome,
              onClick: function () { previewReceipt(receipt, this); }
            },
              h('span.payment-receipt__icon', icon(receipt.mimeType === 'application/pdf' ? 'filetext' : 'image')),
              h('span.payment-receipt__copy',
                h('b.truncate', { text: receipt.nome }),
                h('small.truncate', { text: sizeLabel(receipt.tamanho) + ' · ' + (author.nome || 'Usuario') + ' · ' + F.date(receipt.criadoEm) })
              ),
              h('span.payment-receipt__quick', icon('eye'), h('small', { text: 'Visualizar' }))
            ),
            canViewAllLeads ? h('button.btn.btn--icon.btn--sm.btn--danger.payment-receipt__delete', {
              type: 'button', 'aria-label': 'Excluir ' + receipt.nome,
              'data-tip': 'Excluir comprovante', onClick: function () { deleteReceipt(receipt); }
            }, icon('trash')) : null
          );
        }) : h('span.t-tiny.t-dimmer', { text: 'Nenhum comprovante anexado.' }));
      }

      input.addEventListener('change', async function () {
        var file = input.files && input.files[0];
        if (!file) return;
        uploadButton.disabled = true;
        var label = uploadButton.querySelector('span');
        if (label) label.textContent = 'Enviando...';
        /* O envio e o desenho da lista sao tratados separados de proposito.
           Quando estavam no mesmo try, uma falha ao desenhar dizia ao vendedor
           que o anexo falhou — sendo que o arquivo ja estava salvo. Ele tentava
           de novo e duplicava o comprovante. */
        var saved = null;
        try {
          if (!(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')) {
            throw new Error('Conecte o Supabase para armazenar comprovantes com seguranca.');
          }
          saved = await global.AGIR_BACKEND.uploadPaymentReceipt({
            organizationId: S().get('session.organizationId'), opportunityId: op.id,
            userId: currentUser.id, file: file
          });
          S().insert('comprovantesPagamento', {
            id: saved.id, oportunidadeId: saved.opportunity_id,
            autorId: saved.uploaded_by, nome: saved.original_name,
            storagePath: saved.storage_path, mimeType: saved.mime_type,
            tamanho: Number(saved.size_bytes), criadoEm: saved.created_at
          });
        } catch (error) {
          console.error('[comprovantes] Falha ao anexar.', error);
          UI.toast.bad('Nao foi possivel anexar', error.message || 'Revise o arquivo e tente novamente.');
        }

        if (saved) {
          UI.toast.ok('Comprovante anexado', file.name);
          try {
            renderReceipts();
          } catch (renderError) {
            /* O dado esta salvo; so a lista nao redesenhou. Nao dizer que
               falhou, e sim pedir para atualizar a pagina. */
            console.error('[comprovantes] Anexado, mas a lista nao redesenhou.', renderError);
            UI.toast.warn('Atualize a pagina',
              'O comprovante foi salvo, mas a lista nao atualizou sozinha.');
          }
        }

        input.value = '';
        uploadButton.disabled = false;
        if (label) label.textContent = 'Anexar';
      });

      renderCurrentReceipts = renderReceipts;
      setTimeout(function () { if (!workspaceClosed) renderReceipts(); }, 0);
      return h('div.payment-receipts',
        h('div.payment-receipts__head',
          h('div',
            h('div.row.gap-2.strong', icon('receipt'), h('span', { text: 'Comprovantes de pagamento' }), countHost),
            h('div.t-tiny.t-dimmer', { text: 'PDF ou imagem, ate 10 MB por arquivo.' })
          ),
          input, uploadButton
        ),
        listHost
      );
    }

    function scheduleInlineSave(delay) {
      clearTimeout(editorState.timer);
      editorState.timer = setTimeout(function () { saveInline(false); }, delay == null ? 900 : delay);
    }

    function markEditorDirty(delay) {
      editorState.revision += 1;
      if (editorState.status) editorState.status.textContent = 'Alteracoes ainda nao salvas';
      if (editorState.saveButton) {
        editorState.saveButton.hidden = false;
        editorState.saveButton.disabled = false;
      }
      scheduleInlineSave(delay);
    }

    function readEditorValues() {
      var fields = editorState.fields || {};
      return {
        nome: fields.nome.value.trim(), cpf: fields.cpf.value,
        telefone: fields.telefone.value, email: fields.email.value.trim(),
        cidade: fields.cidade.value.trim(), convenioId: fields.convenio.value,
        matricula: fields.matricula.value.trim(),
        produtoId: fields.produto.value, bancoId: fields.banco.value,
        origemId: fields.origem.value, ownerId: fields.owner.value,
        valor: parseMoneyInput(fields.valor.value) || 0,
        valorTotal: parseMoneyInput(fields.valorTotal.value),
        valorFinal: parseMoneyInput(fields.valorFinal.value),
        estornoSolicitado: parseMoneyInput(fields.estornoSolicitado.value),
        previsao: fields.previsao.value, obs: fields.obs.value.trim()
      };
    }

    function validateEditor(values) {
      var cpf = values.cpf.replace(/\D/g, '');
      var phone = values.telefone.replace(/\D/g, '');
      if (!values.nome) return 'Informe o nome completo.';
      if (!values.ownerId) return 'Escolha o responsavel.';
      if (cpf && cpf.length !== 11) return 'O CPF precisa ter 11 digitos.';
      if (phone && phone.length !== 10 && phone.length !== 11) return 'O telefone precisa ter 10 ou 11 digitos.';
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return 'Informe um e-mail valido.';
      return null;
    }

    function applySavedLead(result, values) {
      var saved = result && result.opportunity;
      var contact = result && result.contact;
      var latest = S().byId('oportunidades', op.id);
      if (saved && latest && Number(latest.version) > Number(saved.version)) {
        // A newer remote update arrived before our successful response.
        // Do not downgrade the store or adopt that unseen version for editing.
        op = Object.assign({}, op, { version: saved.version });
        if (remoteNotice) remoteNotice.hidden = false;
        return;
      }
      if (contact) {
        S().update('contatos', contact.id, {
          nome: contact.full_name, cpf: contact.cpf, email: contact.email,
          telefone: contact.phone, cidade: contact.city, uf: contact.state,
          ownerId: contact.owner_id
        });
      }
      if (saved && contact) {
        S().update('oportunidades', op.id, {
          cliente: contact.full_name, cpf: contact.cpf, telefone: contact.phone,
          email: contact.email, cidade: contact.city, uf: contact.state,
          produtoId: saved.product_id, convenioId: saved.convention_id,
          matricula: saved.registration_number || '',
          bancoId: saved.bank_id,
          origemId: saved.source_id, ownerId: saved.owner_id,
          valor: Number(saved.amount),
          valorTotal: saved.total_value == null ? null : Number(saved.total_value),
          valorFinal: saved.final_value == null ? null : Number(saved.final_value),
          estornoSolicitado: saved.requested_reversal == null ? null : Number(saved.requested_reversal),
          comissao: Number(saved.expected_commission), previsaoFechamento: saved.expected_close_date,
          obs: saved.notes || '', atualizadoEm: saved.updated_at, version: saved.version
        });
      } else {
        S().update('oportunidades', op.id, {
          cliente: values.nome, cpf: values.cpf.replace(/\D/g, ''), telefone: values.telefone.replace(/\D/g, ''),
          email: values.email, cidade: values.cidade, uf: null,
          produtoId: values.produtoId, convenioId: values.convenioId || null,
          matricula: values.matricula,
          bancoId: values.bancoId || null,
          origemId: values.origemId || null, ownerId: values.ownerId,
          valor: values.valor, valorTotal: values.valorTotal, valorFinal: values.valorFinal,
          estornoSolicitado: values.estornoSolicitado, previsaoFechamento: values.previsao || null, obs: values.obs
        });
        if (op.contatoId) S().update('contatos', op.contatoId, {
          nome: values.nome, cpf: values.cpf.replace(/\D/g, ''), telefone: values.telefone.replace(/\D/g, ''),
          email: values.email, cidade: values.cidade, uf: null, ownerId: values.ownerId
        });
      }
      op = snapshotOpportunity(op.id);
      prod = S().byId('produtos', op.produtoId) || {};
      convenio = S().byId('convenios', op.convenioId) || {};
      banco = S().byId('bancos', op.bancoId) || {};
      origem = S().byId('origens', op.origemId) || {};
      owner = S().byId('usuarios', op.ownerId) || {};
      updateDrawerHeader();
    }

    function updateDrawerHeader() {
      if (!api || !api.el) return;
      var head = D.qs('.drawer__head', api.el);
      if (!head) return;
      var eyebrow = D.qs('.t-eyebrow', head);
      var title = D.qs('.t-h3', head);
      var sub = D.qs('.t-small.t-dimmer', head);
      if (eyebrow) eyebrow.textContent = prod.nome || 'Lead';
      if (title) title.textContent = op.cliente || 'Lead';
      if (sub) sub.textContent = leadHeaderMeta();
      var status = D.qs('.lead-header-status', head);
      if (status) D.mount(status, [statusBadge(op.status), etapaBadge(op.etapaId)]);
    }

    async function saveInline(manual) {
      if (accessRevoked) return false;
      if (!editorState.fields || editorState.revision <= editorState.savedRevision) return true;
      if (editorState.saving) {
        var previousSaved = await editorState.pending;
        if (!previousSaved) return false;
        return editorState.revision > editorState.savedRevision ? saveInline(manual) : true;
      }
      var values = readEditorValues();
      // input/change/blur can describe the same value or a reverted edit.
      // Compare the normalized payload, not only the event counter.
      if (JSON.stringify(values) === editorState.savedPayload) {
        clearTimeout(editorState.timer);
        editorState.savedRevision = editorState.revision;
        if (editorState.saveButton) editorState.saveButton.hidden = true;
        if (editorState.status) editorState.status.textContent = 'Nenhuma alteração pendente';
        return true;
      }
      var validation = validateEditor(values);
      if (validation) {
        if (editorState.status) editorState.status.textContent = validation;
        if (manual) UI.toast.warn(validation);
        return false;
      }

      clearTimeout(editorState.timer);
      var startedRevision = editorState.revision;
      editorState.saving = true;
      if (editorState.status) editorState.status.textContent = 'Salvando...';
      if (editorState.saveButton) editorState.saveButton.disabled = true;

      editorState.pending = (async function () {
        try {
          var result = null;
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            result = await global.AGIR_BACKEND.updateOpportunity({
              opportunityId: op.id, expectedVersion: op.version,
              ownerId: values.ownerId, productId: values.produtoId,
              conventionId: values.convenioId, registrationNumber: values.matricula,
              bankId: values.bancoId, sourceId: values.origemId,
              fullName: values.nome, cpf: values.cpf, phone: values.telefone,
              email: values.email, city: values.cidade, state: null,
              amount: values.valor, totalValue: values.valorTotal,
              finalValue: values.valorFinal, requestedReversal: values.estornoSolicitado,
              expectedCloseDate: values.previsao, notes: values.obs
            });
          }
          if (accessRevoked || !api.el.isConnected) return false;
          applySavedLead(result, values);
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            await syncChangeHistory();
          }
          editorState.savedRevision = startedRevision;
          editorState.savedPayload = JSON.stringify(values);
          if (editorState.revision === startedRevision) {
            if (editorState.status) editorState.status.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR');
            if (editorState.saveButton) editorState.saveButton.hidden = true;
          } else {
            if (editorState.status) editorState.status.textContent = 'Novas alteracoes aguardando salvamento';
            scheduleInlineSave(250);
          }
          if (manual) UI.toast.ok('Alteracoes salvas');
          if (renderCurrentHistory) renderCurrentHistory(true);
          notifyLeadChange('opportunities');
          return true;
        } catch (error) {
          console.error('[oportunidade] Falha no salvamento automatico.', error);
          if (editorState.status) editorState.status.textContent = 'Nao foi possivel salvar. Tente novamente.';
          if (editorState.saveButton) {
            editorState.saveButton.hidden = false;
            editorState.saveButton.disabled = false;
          }
          UI.toast.bad('Nao foi possivel salvar', error.message || 'Atualize a pagina e tente novamente.');
          return false;
        } finally {
          editorState.saving = false;
          editorState.pending = null;
          if (editorState.saveButton) editorState.saveButton.disabled = false;
        }
      })();
      return editorState.pending;
    }

    function tagTone(color, alpha) {
      return /^#[0-9a-f]{6}$/i.test(color || '') ? color + alpha : 'var(--bg-elev-2)';
    }

    function tagChip(tag, removable, onRemove) {
      return h('span.lead-tag', {
        style: {
          color: tag.cor || 'var(--brand-400)',
          borderColor: tagTone(tag.cor, '66'),
          background: tagTone(tag.cor, '18')
        }
      },
        h('span.lead-tag__dot', { style: { background: tag.cor || 'var(--brand-400)' } }),
        h('span', { text: tag.nome }),
        removable ? h('button.lead-tag__remove', {
          type: 'button', 'aria-label': 'Remover etiqueta ' + tag.nome,
          onClick: function (event) { event.stopPropagation(); onRemove(tag.id); }
        }, icon('x')) : null
      );
    }

    function assignedTags() {
      return (op.tags || []).map(function (id) { return S().byId('etiquetas', id); }).filter(Boolean);
    }

    function tagsSection() {
      var tags = assignedTags();
      return section({
        title: 'Etiquetas',
        sub: tags.length ? F.plural(tags.length, 'etiqueta') : 'Organize e encontre este lead rapidamente',
        actions: [
          h('button.btn.btn--sm', { onClick: manageTags }, icon('plus'), h('span', { text: tags.length ? 'Gerenciar' : 'Adicionar' }))
        ],
        body: tags.length
          ? h('div.lead-tags', tags.map(function (tag) { return tagChip(tag, false); }))
          : h('button.lead-tags__empty', { onClick: manageTags, text: 'Nenhuma etiqueta atribuida' })
      });
    }

    function mapSavedTag(saved) {
      return { id: saved.id, nome: saved.name, cor: saved.color || '#FF9800' };
    }

    function upsertLocalTag(saved) {
      var mapped = mapSavedTag(saved);
      if (S().byId('etiquetas', mapped.id)) S().update('etiquetas', mapped.id, mapped);
      else S().insert('etiquetas', mapped);
      return mapped;
    }

    function manageTags() {
      var selected = Object.create(null);
      (op.tags || []).forEach(function (id) { selected[id] = true; });
      var listBox, nameInput, colorInput, searchInput, selectionBox, count, createSection;
      var limit = 80, catalogMode = false;

      function selectedTags() {
        return (S().get('etiquetas') || []).filter(function (tag) { return selected[tag.id]; });
      }
      function renderSelection() {
        var tags = selectedTags();
        D.mount(selectionBox, tags.slice(0, 8).map(function (tag) {
          return h('button.lead-tag', { type: 'button', 'aria-label': 'Remover seleção ' + tag.nome,
            onClick: function () { delete selected[tag.id]; renderSelection(); renderList(); }
          }, h('span.lead-tag__dot', { style: { background: tag.cor } }), tag.nome, icon('x'));
        }).concat(tags.length > 8 ? [h('span.badge', { text: '+' + (tags.length - 8) })] : []));
        count.textContent = tags.length + ' selecionada(s)';
      }
      function editCatalogTag(tag) {
        var color = h('input.tag-manager__new-color', { type: 'color', value: tag.cor || '#FF9800', 'aria-label': 'Cor da etiqueta' });
        UI.modal({
          title: 'Cor de ' + tag.nome,
          sub: 'A cor será alterada no catálogo e em todos os leads que usam esta etiqueta.',
          body: color,
          footer: function (modal) { return [
            h('button.btn', { text: 'Cancelar', onClick: modal.close }),
            h('button.btn.btn--primary', { text: 'Salvar cor no catálogo', onClick: async function () {
              this.disabled = true;
              try {
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  upsertLocalTag(await global.AGIR_BACKEND.saveTag({
                    organizationId: S().get('session.organizationId'), tagId: tag.id, name: tag.nome, color: color.value
                  }));
                } else S().update('etiquetas', tag.id, { cor: color.value });
                modal.close(); renderList(); renderSelection();
                notifyLeadChange('tags');
                UI.toast.ok('Cor salva no catálogo');
              } catch (error) { this.disabled = false; UI.toast.bad('Não foi possível salvar a cor', error.message); }
            } })
          ]; }
        });
      }
      function renderList() {
        var all = S().get('etiquetas') || [], matches = searchLeadTags(all, searchInput.value);
        var nodes = matches.slice(0, limit).map(function (tag) {
          return h('div.tag-manager__item',
            h('label.tag-manager__choice',
              h('input', { type: 'checkbox', checked: !!selected[tag.id], 'aria-label': 'Atribuir ' + tag.nome,
                onChange: function () { selected[tag.id] = this.checked; renderSelection(); } }),
              h('span.lead-tag__dot', { style: { background: tag.cor } }), h('span', { text: tag.nome })
            ),
            catalogMode ? h('button.btn.btn--sm.btn--ghost', { type: 'button', 'aria-label': 'Editar cor de ' + tag.nome,
              onClick: function () { editCatalogTag(tag); } }, icon('edit')) : null
          );
        });
        if (!nodes.length) nodes.push(UI.empty({ icon: 'tag',
          title: all.length ? 'Nenhuma etiqueta encontrada' : 'Nenhuma etiqueta cadastrada',
          text: 'Pesquise outro nome ou crie uma etiqueta no catálogo.' }));
        if (!matches.length && searchInput.value.trim()) nodes.push(h('button.btn.btn--sm', {
          text: 'Criar “' + searchInput.value.trim().slice(0, 40) + '”',
          onClick: function () { createSection.open = true; nameInput.value = searchInput.value.trim().slice(0, 40); nameInput.focus(); }
        }));
        if (matches.length > limit) nodes.push(h('button.btn.btn--sm', { text: 'Mostrar mais (' + limit + ' de ' + matches.length + ')',
          onClick: function () { var top = listBox.scrollTop; limit += 80; renderList(); listBox.scrollTop = top; }
        }));
        D.mount(listBox, nodes);
      }
      UI.modal({
        title: 'Etiquetas do lead',
        sub: 'Pesquise e selecione. As atribuições só mudam ao clicar em Aplicar etiquetas.',
        body: h('div.tag-picker',
          searchInput = h('input.input', { type: 'search', autofocus: true, placeholder: 'Pesquisar etiqueta…', 'aria-label': 'Pesquisar etiqueta',
            onInput: function () { limit = 80; renderList(); } }),
          h('div.row.between.gap-2', count = h('span.t-small', { role: 'status' }),
            h('button.btn.btn--sm.btn--ghost', { text: 'Gerenciar catálogo', 'aria-pressed': 'false',
              onClick: function () { catalogMode = !catalogMode; this.setAttribute('aria-pressed', String(catalogMode)); renderList(); } })),
          selectionBox = h('div.tag-picker__selected', { 'aria-label': 'Etiquetas selecionadas' }),
          listBox = h('div.tag-manager__list', { tabindex: 0, role: 'region', 'aria-label': 'Resultados de etiquetas' }),
          createSection = h('details.tag-picker__create',
            h('summary', { text: 'Criar etiqueta no catálogo' }),
            h('p.t-small.t-dimmer', { text: 'A criação é salva no catálogo. Cancelar este painel descarta apenas as atribuições ao lead.' }),
            h('div.tag-manager__create',
              h('div.field.grow', h('label.field__label', { text: 'Nome da etiqueta' }),
                nameInput = h('input.input', { maxlength: 40, 'aria-label': 'Nome da nova etiqueta', placeholder: 'Ex.: Aguardando orçamento' })),
              colorInput = h('input.tag-manager__new-color', { type: 'color', value: '#FF9800', 'aria-label': 'Cor da nova etiqueta' }),
              h('button.btn.btn--primary', { text: 'Criar', onClick: async function () {
                var name = nameInput.value.trim().replace(/\s+/g, ' ');
                if (!name) return UI.toast.warn('Digite o nome da etiqueta');
                var existing = (S().get('etiquetas') || []).find(function (tag) { return F.norm(tag.nome).trim() === F.norm(name); });
                this.disabled = true;
                try {
                  var mapped = existing;
                  if (!mapped && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                    mapped = upsertLocalTag(await global.AGIR_BACKEND.saveTag({
                      organizationId: S().get('session.organizationId'), name: name, color: colorInput.value
                    }));
                  } else if (!mapped) mapped = S().insert('etiquetas', { nome: name, cor: colorInput.value.toUpperCase() });
                  selected[mapped.id] = true;
                  nameInput.value = ''; searchInput.value = ''; createSection.open = false;
                  renderList(); renderSelection();
                  UI.toast.ok(existing ? 'Etiqueta existente selecionada' : 'Etiqueta criada no catálogo', 'Clique em Aplicar etiquetas para atribuí-la ao lead.');
                } catch (error) { UI.toast.bad('Não foi possível criar a etiqueta', error.message || 'Revise os dados.'); }
                finally { this.disabled = false; }
              } })
            )
          )
        ),
        footer: function (modalApi) {
          setTimeout(function () { renderList(); renderSelection(); }, 0);
          return [
            h('button.btn', { text: 'Cancelar', onClick: modalApi.close }),
            h('button.btn.btn--primary', { text: 'Aplicar etiquetas', onClick: async function () {
              var ids = selectedTags().map(function (tag) { return tag.id; });
              this.disabled = true;
              try {
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  await global.AGIR_BACKEND.setOpportunityTags({ opportunityId: op.id, tagIds: ids });
                  await syncChangeHistory();
                }
                S().update('oportunidades', op.id, { tags: ids });
                op = S().byId('oportunidades', op.id);
                modalApi.close();
                var tagsNode = D.qs('.lead-editor__tags', api.el);
                if (tagsNode) tagsNode.replaceWith(compactTags());
                if (renderCurrentHistory) renderCurrentHistory(true);
                notifyLeadChange('opportunity_tags');
                UI.toast.ok('Etiquetas atualizadas');
              } catch (error) { this.disabled = false; UI.toast.bad('Não foi possível aplicar as etiquetas', error.message || 'Tente novamente.'); }
            } })
          ];
        }
      });
    }
    function marcarPerdido() {
      var sel;
      var m = UI.modal({
        title: 'Marcar como perdido',
        sub: op.cliente + ' · Estorno solicitado ' + F.money(AGIR.an.valorCRM(op)),
        body: h('div.col.gap-4',
          h('div.field',
            h('label.field__label', { text: 'Motivo da perda' }),
            sel = h('select.select', (S().get('motivosPerda') || []).map(function (mp) {
              return h('option', { value: mp.id, text: mp.nome });
            })),
            h('div.field__hint', { text: 'O motivo alimenta o relatório de perdas — é o que mostra onde o time perde dinheiro.' })
          )
        ),
        footer: function (a2) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { a2.close(); } }),
            h('button.btn.btn--danger', { text: 'Confirmar perda', onClick: async function () {
              var motivoId = sel.value;
              if (!motivoId) return UI.toast.warn('Escolha um motivo');
              this.disabled = true;
              var moved = await mover((AGIR.an.etapas().find(function (item) { return item.tipo === 'perdido'; }) || {}).id, motivoId);
              if (moved === false) { this.disabled = false; return; }
              a2.close();
            } })
          ];
        }
      });
      return m;
    }
  }

  function miniStat(label, value, ico, sub) {
    return h('div.card.card--pad.col.gap-1',
      h('div.row.gap-2', icon(ico, 'ico'), h('span.t-eyebrow', { text: label })),
      h('div.t-h3.t-num', { text: value }),
      sub ? h('div.t-tiny.t-dimmer', { text: sub }) : null
    );
  }

  function campo(label, value, tone) {
    return h('div.col', { style: { gap: '2px' } },
      h('span.t-eyebrow', { text: label }),
      h('span.t-body' + (tone ? '.t-' + tone : ''), { style: { fontWeight: 550 }, text: value || '—' })
    );
  }

  /** Trilho horizontal das etapas com a atual destacada */
  function stageTrack(op, onMove) {
    var abertas = AGIR.an.etapas().filter(function (e) { return e.tipo === 'aberto'; });
    var idxAtual = abertas.findIndex(function (e) { return e.id === op.etapaId; });
    if (op.status === 'ganho') idxAtual = abertas.length;
    if (op.status === 'perdido') idxAtual = -1;

    return h('div.row.gap-1', { style: { alignItems: 'stretch' } },
      abertas.map(function (e, i) {
        var passou = idxAtual > i, atual = idxAtual === i;
        return h('button.col.gap-2.grow.stage-track__step', {
          style: { minWidth: 0 },
          disabled: !onMove || atual,
          onClick: function () { if (onMove && !atual) onMove(e.id); },
          'data-tip': e.nome + ' · SLA ' + e.sla + 'd · ' + e.prob + '% de chance'
        },
          h('div', {
            style: {
              height: '5px', borderRadius: '3px',
              background: op.status === 'perdido' ? 'var(--bad-soft)'
                : (passou || atual) ? e.cor : 'var(--bg-elev-2)',
              opacity: passou ? .5 : 1,
              boxShadow: atual ? '0 0 10px ' + hexA(e.cor, .6) : 'none',
              transition: 'all var(--dur-3) var(--ease-out)'
            }
          }),
          h('span.t-tiny.truncate', {
            style: {
              color: atual ? 'var(--ink)' : 'var(--ink-4)',
              fontWeight: atual ? 700 : 500, fontSize: '10px'
            },
            text: e.nome
          })
        );
      })
    );
  }

  /* ==========================================================================
     Timeline de atividades
     ========================================================================== */
  var ATV = {
    ligacao:  { icon: 'phone',    label: 'Ligação',  cor: 'var(--series-2)' },
    whatsapp: { icon: 'whatsapp', label: 'WhatsApp', cor: 'var(--ok-500)' },
    reuniao:  { icon: 'calendar', label: 'Reunião',  cor: 'var(--series-4)' },
    proposta: { icon: 'filetext', label: 'Proposta', cor: 'var(--warn-500)' },
    email:    { icon: 'mail',     label: 'E-mail',   cor: 'var(--series-7)' },
    visita:   { icon: 'pin',      label: 'Visita',   cor: 'var(--series-5)' },
    followup: { icon: 'refresh',  label: 'Follow Up', cor: 'var(--series-3)' },
    virada_folha: { icon: 'calendar', label: 'Virada da Folha', cor: 'var(--brand-500)' },
    tarefa:   { icon: 'check',    label: 'Tarefa',   cor: 'var(--info-500)' },
    nota:     { icon: 'edit',     label: 'Nota',     cor: 'var(--ink-3)' }
  };
  var RESULTADO = {
    atendeu: 'Atendeu', nao_atendeu: 'Não atendeu', sem_interesse: 'Sem interesse',
    agendou: 'Agendou', numero_invalido: 'Número inválido', realizada: 'Realizada',
    enviada: 'Enviada', respondeu: 'Respondeu', pendente: 'Pendente'
  };

  function activityResultKeys(type) {
    if (type === 'reuniao' || type === 'visita' || type === 'tarefa' || type === 'virada_folha') return ['realizada'];
    if (type === 'proposta') return ['enviada', 'respondeu', 'sem_interesse'];
    if (type === 'email' || type === 'whatsapp') return ['respondeu', 'nao_atendeu', 'agendou', 'sem_interesse'];
    return ['atendeu', 'nao_atendeu', 'agendou', 'sem_interesse', 'numero_invalido'];
  }

  function fillActivityResults(select, type, selected) {
    var keys = activityResultKeys(type);
    D.clear(select);
    D.append(select, keys.map(function (key) {
      return h('option', { value: key, text: RESULTADO[key], selected: key === selected });
    }));
  }

  function timeline(itens, opts) {
    opts = opts || {};
    return h('div.tl', itens.slice(0, opts.max || 40).map(function (a) {
      var t = ATV[a.tipo] || ATV.nota;
      var u = S().byId('usuarios', a.ownerId);
      var pending = a.status === 'pending' || a.status === 'scheduled' || a.resultado === 'pendente';
      var eventDate = pending ? (a.agendadoPara || a.data) : a.data;
      return h('div.tl__item',
        h('span.tl__dot', { style: { color: t.cor, borderColor: hexA2(t.cor) } }, icon(t.icon)),
        h('div.tl__head',
          h('span.tl__title', { text: t.label + (pending ? ' · Agendada' : (a.resultado && RESULTADO[a.resultado] ? ' · ' + RESULTADO[a.resultado] : '')) }),
          h('span.tl__time', { text: F.dateTime(eventDate) + ' · ' + F.relative(eventDate) }),
          a.duracaoSeg ? h('span.badge', { text: duracao(a.duracaoSeg) }) : null,
          pending && opts.onComplete ? h('button.btn.btn--sm.btn--primary', {
            type: 'button', onClick: function () { opts.onComplete(a); }
          }, icon('check'), h('span', { text: 'Concluir' })) : null
        ),
        a.nota ? h('div.tl__text', { text: a.nota }) : null,
        opts.showOwner !== false && u
          ? h('div.row.gap-2', { style: { marginTop: '6px' } }, AGIR.avatar(u, 'xs'),
              h('span.t-tiny.t-dimmer', { text: u.nome }))
          : null
      );
    }));
  }

  function hexA2(c) { return c.indexOf('#') === 0 ? hexA(c, .5) : 'var(--line-strong)'; }

  function duracao(seg) {
    if (!seg) return '—';
    if (seg < 60) return seg + 's';
    var m = Math.floor(seg / 60), s2 = seg % 60;
    return m + 'min' + (s2 ? ' ' + s2 + 's' : '');
  }

  /* ==========================================================================
     Registrar atividade
     ========================================================================== */
  function activityLocalDateTimeValue(date) {
    var value = date || new Date(Date.now() + 60 * 60 * 1000);
    var local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function registrarAtividade(oppId, onDone) {
    var tipo, resultado, nota, dur, oppSelect, acao = { value: 'completed' }, quando;
    var completedWrap, scheduledWrap, completedMode, scheduledMode;
    var op = oppId ? S().byId('oportunidades', oppId) : null;
    var opportunities = (S().get('oportunidades') || []).filter(function (item) { return item.status === 'aberto'; });

    if (!op && !opportunities.length) {
      UI.toast.bad('Nenhum lead disponivel', 'Crie uma oportunidade antes de registrar uma atividade.');
      return;
    }

    function setActivityAction(next) {
      var scheduled = next === 'scheduled';
      acao.value = next;
      if (completedWrap) completedWrap.hidden = scheduled;
      if (scheduledWrap) scheduledWrap.hidden = !scheduled;
      if (completedMode) completedMode.classList.toggle('is-active', !scheduled);
      if (scheduledMode) scheduledMode.classList.toggle('is-active', scheduled);
    }

    UI.modal({
      title: 'Registrar atividade',
      sub: op ? op.cliente : 'Escolha obrigatoriamente o lead relacionado.',
      body: h('div.col.gap-4',
        op ? null : h('div.field',
          h('label.field__label', 'Lead', h('span.field__required', { text: '*', 'aria-hidden': 'true' })),
          oppSelect = h('select.select', { required: true },
            h('option', { value: '', text: 'Selecione uma oportunidade' }),
            opportunities.map(function (item) {
              return h('option', { value: item.id, text: item.cliente + ' - Estorno ' + F.moneyShort(AGIR.an.valorCRM(item)) });
            })
          )
        ),
        h('div.activity-mode-picker',
          completedMode = h('button.activity-mode-card.is-active', { type: 'button', onClick: function () { setActivityAction('completed'); } },
            icon('checkcircle'), h('span', h('b', { text: 'Atividade realizada' }), h('small', { text: 'Registrar resultado agora' }))),
          scheduledMode = h('button.activity-mode-card', { type: 'button', onClick: function () { setActivityAction('scheduled'); } },
            icon('calendar'), h('span', h('b', { text: 'Proxima atividade' }), h('small', { text: 'Agendar para depois' })))
        ),
        h('div.field',
          h('label.field__label', { text: 'Tipo de atividade' }),
          tipo = h('select.select', { 'aria-label': 'Tipo', onChange: function () {
            fillActivityResults(resultado, this.value);
          } }, Object.keys(ATV).filter(function (key) { return key !== 'nota'; }).map(function (k) {
            return h('option', { value: k, text: ATV[k].label });
          }))
        ),
        completedWrap = h('div.grid.g-2',
          h('div.field',
            h('label.field__label', { text: 'Resultado' }),
            resultado = h('select.select', { 'aria-label': 'Resultado' }, activityResultKeys('ligacao').map(function (k) {
              return h('option', { value: k, text: RESULTADO[k] });
            }))
          ),
          h('div.field',
            h('label.field__label', { text: 'Duração (min)' }),
            dur = h('input.input', { type: 'number', min: 0, value: 0, 'aria-label': 'Duracao em minutos' })
          )
        ),
        scheduledWrap = h('div.field', { hidden: true },
          h('label.field__label', 'Data e hora', h('span.field__required', { text: '*', 'aria-hidden': 'true' })),
          quando = h('input.input', { type: 'datetime-local', value: activityLocalDateTimeValue(), min: activityLocalDateTimeValue(new Date()), 'aria-label': 'Data e hora' })
        ),
        h('div.field',
          h('label.field__label', { text: 'Observação' }),
          nota = h('textarea.textarea', { placeholder: 'O que aconteceu? O que ficou combinado?', 'aria-label': 'Observacao' })
        )
      ),
      footer: function (api) {
        return [
          h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
          h('button.btn.btn--primary', { text: 'Salvar', onClick: async function () {
            var selectedOppId = op ? op.id : oppSelect.value;
            if (!selectedOppId) return UI.toast.bad('Selecione o lead', 'Toda atividade precisa estar vinculada a uma oportunidade.');
            var scheduled = acao.value === 'scheduled';
            if (scheduled && !quando.value) return UI.toast.warn('Escolha a data e a hora da proxima atividade.');
            if (scheduled && new Date(quando.value).getTime() < Date.now() - 60000) return UI.toast.warn('Escolha uma data futura para o agendamento.');
            var ownerId = (S().currentUser() || {}).id;
            var localActivity = {
              tipo: tipo.value, resultado: scheduled ? 'pendente' : resultado.value,
              ownerId: ownerId, oportunidadeId: selectedOppId,
              data: scheduled ? new Date(quando.value).toISOString() : new Date().toISOString(),
              duracaoSeg: scheduled ? 0 : Math.round((+dur.value || 0) * 60),
              nota: nota.value.trim(), agendadoPara: scheduled ? new Date(quando.value).toISOString() : null,
              status: scheduled ? 'pending' : 'completed'
            };
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              this.disabled = true;
              try {
                var saved = await global.AGIR_BACKEND.createActivity({
                  organizationId: S().get('session.organizationId'),
                  opportunityId: selectedOppId,
                  ownerId: ownerId,
                  type: tipo.value,
                  result: localActivity.resultado,
                  notes: nota.value.trim(),
                  durationSeconds: localActivity.duracaoSeg,
                  scheduledAt: localActivity.agendadoPara
                });
                localActivity.id = saved.id;
                localActivity.data = saved.completed_at || saved.scheduled_at || saved.created_at;
                localActivity.agendadoPara = saved.scheduled_at;
                localActivity.status = saved.status;
                S().insert('atividades', localActivity);
              } catch (error) {
                console.error('[atividade] Falha ao registrar.', error);
                UI.toast.bad('Atividade nao salva', 'Confira os dados e tente novamente.');
                this.disabled = false;
                return;
              }
            } else {
              S().insert('atividades', localActivity);
            }
            api.close();
            UI.toast.ok(scheduled ? 'Proxima atividade agendada' : 'Atividade registrada');
            if (onDone) onDone();
          } })        ];
      }
    });
  }

  /* ==========================================================================
     Nova oportunidade
     ========================================================================== */
  function novaOportunidade(preset) {
    preset = preset || {};
    var f = {};
    var produtos = (S().get('produtos') || []).filter(function (item) { return item.ativo !== false; });
    var origens = (S().get('origens') || []).filter(function (item) { return item.ativo !== false; });
    var origemProspeccao = origens.find(function (item) {
      return item.codigo === 'active_prospecting' || AGIR.leadIO.normalize(item.nome) === 'prospeccao ativa';
    });
    var etapasAbertas = AGIR.an.etapas().filter(function (e) { return e.tipo === 'aberto'; });
    var pipelines = S().get('pipelines') || [];
    var creator = S().currentUser() || {};
    var creatorIsAdmin = S().get('session.role') === 'admin' || creator.role === 'admin';
    var availableOwners = (S().get('usuarios') || []).filter(function (user) {
      return (creatorIsAdmin || user.id === creator.id) && user.ativo !== false;
    });
    var defaultOwnerId = creatorIsAdmin && preset.ownerId ? preset.ownerId : creator.id;
    if (!produtos.length || !etapasAbertas.length || !pipelines.length) {
      UI.toast.bad('CRM ainda nao configurado', 'Cadastre ao menos um pipeline, uma etapa aberta e um produto.');
      return;
    }

    function requiredLabel(label, required) {
      return h('label.field__label', label,
        required ? h('span.field__required', { text: '*', 'aria-hidden': 'true' }) : null);
    }

    function maskCpf(value) {
      var d = String(value || '').replace(/\D/g, '').slice(0, 11);
      return d.replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    }

    function maskPhone(value) {
      var d = String(value || '').replace(/\D/g, '').slice(0, 11);
      if (d.length <= 10) {
        return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
      }
      return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
    }

    function moneyMask(value) {
      var digits = String(value || '').replace(/\D/g, '').slice(0, 15);
      if (!digits) return '';
      return (Number(digits) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function moneyValue(value) {
      var digits = String(value || '').replace(/\D/g, '');
      return digits ? Number(digits) / 100 : null;
    }

    function campoMoney(key, label) {
      var inp = h('input.input', {
        'aria-label': label, inputmode: 'numeric', placeholder: 'R$ 0,00',
        onInput: function () { this.value = moneyMask(this.value); }
      });
      f[key] = inp;
      return h('div.field', requiredLabel(label, false), inp);
    }

    function campoInput(key, label, attrs) {
      var inp = h('input.input', Object.assign({ 'aria-label': label }, attrs || {}));
      f[key] = inp;
      return h('div.field', requiredLabel(label, attrs && attrs.required), inp);
    }

    function campoSelect(key, label, lista, valorPadrao, required) {
      var sel = h('select.select', { required: Boolean(required), 'aria-label': label },
      required ? null : h('option', { value: '', text: 'Não informado' }), lista.map(function (o) {
        return h('option', { value: o.id, text: o.nome, selected: o.id === valorPadrao });
      }));
      f[key] = sel;
      return h('div.field', requiredLabel(label, required), sel);
    }

    var api = UI.modal({
      title: 'Nova oportunidade',
      sub: 'O mínimo para não travar o vendedor — o resto se completa depois.',
      wide: true,
      body: h('div.col.gap-4',
        h('div.grid.g-2',
          campoInput('cliente', 'Nome do cliente', { placeholder: 'Ex.: Maria Aparecida Souza', autofocus: true, required: true }),
          campoInput('telefone', 'Telefone (opcional)', {
            placeholder: '(11) 99999-9999', inputmode: 'numeric', maxlength: 15,
            onInput: function () { this.value = maskPhone(this.value); }
          })
        ),
        h('div.grid.g-2',
          campoInput('cpf', 'CPF', {
            placeholder: '000.000.000-00', inputmode: 'numeric', maxlength: 14, required: true,
            onInput: function () { this.value = maskCpf(this.value); }
          }),
          campoSelect('produtoId', 'Produto', produtos, preset.produtoId || produtos[0].id, true)
        ),
        h('div.grid.g-3',
          campoMoney('valor', 'Valor Inicial'),
          campoSelect('bancoId', 'Parceiro de execução', S().get('bancos') || []),
          campoSelect('origemId', 'Origem do lead', origens,
            preset.origemId || (origemProspeccao && origemProspeccao.id) || '')
        ),
        h('div.grid.g-2',
          campoSelect('convenioId', 'Segmento de cliente', (S().get('convenios') || []).filter(function (item) {
            return item.ativo !== false;
          }), preset.convenioId || '', false),
          campoInput('matricula', 'Referência do projeto', { maxlength: 60, placeholder: 'Opcional' })
        ),
        h('div.grid.g-3',
          campoMoney('valorTotal', 'Valor Total (Proposta + Estorno)'),
          campoMoney('valorFinal', 'Valor Final (Tabela gerencial)'),
          campoMoney('estornoSolicitado', 'Estorno solicitado')
        ),
        h('div.grid.g-2',
          campoSelect('ownerId', 'Responsável',
            availableOwners, defaultOwnerId, true),
          campoSelect('etapaId', 'Etapa inicial', etapasAbertas, preset.etapaId || (etapasAbertas[0] || {}).id, true)
        ),
        h('div.field',
          h('label.field__label', { text: 'Observações' }),
          f.obs = h('textarea.textarea', { placeholder: 'Briefing, orçamento e objetivos do cliente…' })
        )
      ),
      footer: function (a2) {
        return [
          h('button.btn', { text: 'Cancelar', onClick: function () { a2.close(); } }),
          h('button.btn.btn--primary', { onClick: salvar }, icon('check'), h('span', { text: 'Criar oportunidade' }))
        ];
      }
    });
    if (!creatorIsAdmin) f.ownerId.disabled = true;

    var salvando = false;
    async function salvar() {
      var nome = f.cliente.value.trim();
      if (!nome) {
        f.cliente.setAttribute('aria-invalid', 'true');
        f.cliente.focus();
        return UI.toast.bad('Falta o nome do cliente');
      }
      var phoneDigits = f.telefone.value.replace(/\D/g, '');
      var cpfDigits = f.cpf.value.replace(/\D/g, '');
      if (phoneDigits && phoneDigits.length !== 10 && phoneDigits.length !== 11) {
        f.telefone.setAttribute('aria-invalid', 'true'); f.telefone.focus();
        return UI.toast.bad('Telefone incompleto', 'Informe DDD e numero do telefone.');
      }
      if (cpfDigits.length !== 11) {
        f.cpf.setAttribute('aria-invalid', 'true'); f.cpf.focus();
        return UI.toast.bad('CPF incompleto', 'Informe os 11 digitos do CPF.');
      }
      if (salvando) return;
      salvando = true;
      var prod = S().byId('produtos', f.produtoId.value);
      var valor = moneyValue(f.valor.value) || 0;
      var agora = new Date().toISOString();
      var pipeline = (S().get('pipelines') || [])[0];
      var base = {
        pipelineId: pipeline && pipeline.id,
        titulo: prod.nome + ' - ' + nome.split(' ')[0],
        cliente: nome,
        cpf: f.cpf.value.replace(/\D/g, ''),
        telefone: f.telefone.value.replace(/\D/g, ''),
        email: '', uf: '', cidade: '',
        produtoId: f.produtoId.value, convenioId: f.convenioId.value || null,
        matricula: f.matricula.value.trim(),
        bancoId: f.bancoId.value || null,
        origemId: f.origemId.value || null, empresaId: null,
        valor: valor, valorTotal: moneyValue(f.valorTotal.value),
        valorFinal: moneyValue(f.valorFinal.value),
        estornoSolicitado: moneyValue(f.estornoSolicitado.value),
        comissao: Math.round(valor * (prod.comissaoPct / 100)),
        ownerId: f.ownerId.value, etapaId: f.etapaId.value,
        status: 'aberto', motivoPerdaId: null,
        criadoEm: agora, entrouEtapaEm: agora, atualizadoEm: agora, fechadoEm: null,
        previsaoFechamento: null, tags: [], obs: f.obs.value.trim(), version: 1
      };
      var op;
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        try {
          var saved = await global.AGIR_BACKEND.createOpportunity({
            organizationId: S().get('session.organizationId'),
            ownerId: base.ownerId, pipelineId: base.pipelineId, stageId: base.etapaId,
            productId: base.produtoId, conventionId: base.convenioId,
            registrationNumber: base.matricula,
            bankId: base.bancoId, sourceId: base.origemId,
            fullName: nome, phone: base.telefone, cpf: base.cpf,
            amount: valor, expectedCloseDate: null,
            totalValue: base.valorTotal, finalValue: base.valorFinal,
            requestedReversal: base.estornoSolicitado,
            notes: base.obs, companyId: null
          });
          op = Object.assign(base, {
            id: saved.id, contatoId: saved.contact_id,
            titulo: saved.title, comissao: Number(saved.expected_commission),
            criadoEm: saved.created_at, entrouEtapaEm: saved.stage_entered_at,
            atualizadoEm: saved.updated_at, version: saved.version
          });
          S().insert('oportunidades', op);
        } catch (error) {
          console.error('[oportunidade] Falha ao criar.', error);
          var duplicate = error && error.code === '23505';
          UI.toast.bad(duplicate ? 'Cliente ja cadastrado' : 'Oportunidade nao criada',
            duplicate ? 'Confira o CPF informado.' : 'Revise os campos e tente novamente.');
          salvando = false;
          return;
        }
      } else {
        op = S().insert('oportunidades', base);
      }
      api.close();
      UI.toast({
        title: 'Oportunidade criada', text: nome + ' - Estorno solicitado ' + F.money(base.estornoSolicitado || 0), tone: 'ok',
        action: { label: 'Abrir', onClick: function () { oppDrawer(op.id); } }
      });
      AGIR.router.resolve();
    }
  }
  /* ==========================================================================
     Drawer de vendedor
     ========================================================================== */
  function vendedorDrawer(userId) {
    var u = S().byId('usuarios', userId);
    if (!u) return UI.toast.bad('Vendedor não encontrado');
    var cargo = S().byId('cargos', u.cargoId) || {};
    var equipe = S().byId('equipes', u.equipeId) || {};
    var f = { ownerId: u.id, periodo: 'mes' };
    var K = AGIR.an.kpis(f).atual;
    var Kd = AGIR.an.kpis(f).d;
    var p = AGIR.an.paceMes(f);
    var pts = AGIR.an.pontosDe(u.id);
    var st = AGIR.an.streak(u.id);
    var sr = AGIR.an.serie(f, ['vendasValor', 'ligacoes', 'propostas']);

    UI.drawer({
      eyebrow: cargo.nome + ' · ' + (equipe.nome || 'Sem equipe'),
      title: u.nome,
      sub: u.email + ' · ramal ' + u.ramal,
      wide: true,
      headExtra: AGIR.avatar(u, 'lg'),
      body: h('div.col.gap-6',
        h('div.grid.g-2',
          kpi({ label: 'Estorno solicitado no mês', raw: K.vendasValor, format: F.moneyShort,
            icon: 'coins', tone: 'brand', delta: Kd.vendasValor,
            progress: p.vendasValor.pct, pace: p.vendasValor.pace,
            sub: p.vendasValor.meta ? 'meta ' + F.moneyShort(p.vendasValor.meta) : 'sem meta definida' }),
          kpi({ label: 'Vendas fechadas', raw: K.vendasQtd, icon: 'trophy', tone: 'ok',
            delta: Kd.vendasQtd, sub: 'ticket ' + F.moneyShort(K.ticket) })
        ),
        h('div.grid.g-3',
          miniStat('Ligações', F.num(K.ligacoes), 'phone', F.pct(K.taxaAtendimento, 0) + ' atendidas'),
          miniStat('Propostas', F.num(K.propostas), 'filetext',
            F.pct(K.convPropVenda, 0) + ' viram venda'),
          miniStat('Ciclo médio', K.ciclo ? F.num(K.ciclo, 0) + 'd' : '—', 'clock',
            'da criação ao fechamento')
        ),
        section({
          title: 'Evolução no período',
          body: (function () {
            var box = h('div', { style: { minHeight: '200px' } });
            M.defer(function () {
              C.area(box, {
                height: 190, uid: 'vend' + u.id,
                labels: sr.labels,
                series: [
                  { name: 'Estorno solicitado', values: sr.s.vendasValor, kind: 'area', color: 'var(--series-1)' },
                  { name: 'Ligações', values: sr.s.ligacoes, kind: 'line', color: 'var(--series-2)', axis: 'y2' }
                ],
                yFormat: F.moneyShort, y2Format: F.numShort
              });
            });
            return box;
          })()
        }),
        (function () {
          /* Bloco de humor: só aparece se a pessoa respondeu alguma vez —
             card vazio de "sem dado" só ocupa espaço. */
          var hv = AGIR.an.humorVsResultado({ periodo: 'mes', ownerId: u.id })[0];
          if (!hv || !hv.respostas) return null;
          var arred = Math.max(1, Math.min(5, Math.round(hv.media)));

          return section({
            title: 'Como ' + F.firstName(u.nome) + ' tem se sentido',
            sub: F.plural(hv.respostas, 'resposta') + ' no mês · adesão de ' + F.pct(hv.adesao, 0),
            actions: [h('a.btn.btn--sm.btn--ghost', { href: '#/performance/clima?owner=' + u.id },
              h('span', { text: 'Ver clima' }), icon('arrowRight'))],
            body: h('div.col.gap-4',
              h('div.row.gap-4.wrap',
                h('div.row.gap-3',
                  AGIR.humor ? AGIR.humor.carinha(arred, 42) : null,
                  h('div',
                    h('div.t-h3.t-num', { text: F.num(hv.media, 2) + ' / 5' }),
                    h('div.t-tiny.t-dimmer', { text: AGIR.an.escalaDe(arred).label + ' na média' })
                  )
                ),
                h('div.spacer'),
                hv.serie.length > 1
                  ? C.sparkline(hv.serie.slice(-20), { width: 130, height: 36,
                      color: hv.media >= 3.5 ? 'var(--ok-500)' : 'var(--bad-500)' })
                  : null
              ),
              hv.impactoPct !== null
                ? (function () {
                    var fmt = hv.principalFormato === 'moeda'
                      ? F.moneyShort : function (v) { return F.num(v, 1); };
                    return h('div', { style: { padding: 'var(--sp-3)', background: 'var(--bg-elev-2)', borderRadius: 'var(--r-md)' } },
                      h('div.t-eyebrow', { text: hv.principalRotulo + ' por dia' }),
                      h('div.row.between', { style: { marginTop: '6px' } },
                        h('span.t-tiny.t-dimmer', { text: 'Em dia de humor alto' }),
                        h('b.t-small.t-num', { style: { color: 'var(--ok-500)' }, text: fmt(hv.principalAlto) })
                      ),
                      h('div.row.between', { style: { marginTop: '4px' } },
                        h('span.t-tiny.t-dimmer', { text: 'Em dia de humor baixo' }),
                        h('b.t-small.t-num', { style: { color: 'var(--bad-500)' }, text: fmt(hv.principalBaixo) })
                      ),
                      !hv.impactoConfiavel
                        ? h('div.t-tiny.t-dimmer', { style: { marginTop: '6px', opacity: .8 },
                            text: 'Poucos dias comparáveis — trate como indício.' })
                        : null
                    );
                  })()
                : null,
              hv.topFatores.length
                ? h('div',
                    h('div.t-eyebrow', { text: 'Mais citado nos dias ruins' }),
                    h('div.row.gap-2.wrap', { style: { marginTop: '6px' } },
                      hv.topFatores.map(function (x) {
                        return h('span.badge.badge--bad', { text: x.nome + ' · ' + x.n });
                      })
                    )
                  )
                : null
            )
          });
        })(),

        section({
          title: 'Desenvolvimento',
          body: h('div.col.gap-4',
            h('div.grid.g-3',
              miniStat('Pontos', F.num(pts.total), 'star'),
              miniStat('Aulas concluídas', F.num(pts.aulas), 'book',
                pts.trilhasConcluidas + ' trilha(s) completa(s)'),
              miniStat('Sequência', st + ' dia(s)', 'flame', 'dias úteis com atividade')
            )
          )
        }),
        section({
          title: 'Últimos toques',
          body: (function () {
            var acts = (S().get('atividades') || [])
              .filter(function (a) { return a.ownerId === u.id && a.resultado !== 'pendente'; })
              .sort(function (a, b) { return a.data < b.data ? 1 : -1; })
              .slice(0, 12);
            return acts.length ? timeline(acts, { showOwner: false })
              : UI.empty({ icon: 'activity', title: 'Sem atividade registrada' });
          })()
        })
      ),
      footer: [
        h('a.btn', { href: '#/crm/leads?v=todas&periodo=todos&owner=' + u.id }, icon('users'), h('span', { text: 'Ver carteira' })),
        h('a.btn.btn--primary', { href: '#/config?sec=geral&tab=metas&owner=' + u.id },
          icon('target'), h('span', { text: 'Ajustar metas' }))
      ]
    });
  }

  /* ==========================================================================
     Exports
     ========================================================================== */
  AGIR.w = {
    pageHead: pageHead, section: section, kpi: kpi, filterBar: filterBar,
    readFilters: readFilters, rotuloPeriodo: rotuloPeriodo,
    dataTable: dataTable, etapaBadge: etapaBadge, statusBadge: statusBadge,
    produtoTag: produtoTag, ownerChip: ownerChip, slaTag: slaTag,
    insightList: insightList, miniStat: miniStat, campo: campo,
    stageTrack: stageTrack, timeline: timeline, duracao: duracao,
    ATV: ATV, RESULTADO: RESULTADO, hexA: hexA,
    searchLeadTags: searchLeadTags, leadHistoryEntries: leadHistoryEntries
  };

  AGIR.pages.oppDrawer = oppDrawer;
  AGIR.pages.vendedorDrawer = vendedorDrawer;
  AGIR.pages.novaOportunidade = novaOportunidade;
  AGIR.pages.registrarAtividade = registrarAtividade;
})(window);
