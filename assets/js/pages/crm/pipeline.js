/* ==========================================================================
   AGIR — CRM / Pipeline
   Kanban com arrastar-e-soltar, SLA visível por card, totais por coluna e
   valor ponderado. Substitui o "Carregando pipeline…" por skeleton real.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an;
  var S = function () { return AGIR.store; };

  AGIR.pages.crmPipeline = function (node, ctx) {
    var q = ctx.query || {};
    var f = W.readFilters(q);
    var busca = q.q || '';
    f.busca = busca;
    var soSLA = q.sla === '1';
    f.soSLA = soSLA;
    var ordem = q.ord || 'criacao';
    var multiSelect = false;
    var selected = Object.create(null);
    var renderCache = null;
    var disposed = false, ready = false, dragging = false, panning = false;
    var refreshTimer = null, pendingFull = false, pendingIds = new Set();
    var cardNodes = new Map(), columnNodes = new Map();
    var columnPages = new Map(), columnPageSize = 30, activityCacheRevision = -1, cachedNextActivities = null;
    var liveBadge = h('span.badge.pipeline-live-badge', { role: 'status', 'aria-live': 'polite' });
    if (!document.getElementById('pipeline-workspace-css')) {
      document.head.appendChild(h('link', { id: 'pipeline-workspace-css', rel: 'stylesheet', href: 'assets/css/pipeline-workspace.css' }));
    }
    node.classList.add('pipeline-workspace');
    updateSyncBadge();
    if (!isAdministrator()) {
      f.ownerId = (S().currentUser() || {}).id || '__no_user__';
      f.equipeId = '';
    }

    function isAdministrator() {
      var user = S().currentUser() || {};
      return S().get('session.role') === 'admin' || user.role === 'admin';
    }

    node.appendChild(W.pageHead({
      icon: 'kanban',
      title: 'Pipeline comercial',
      sub: 'Arraste o card para mover de etapa. A cor do relógio mostra o SLA.',
      badge: liveBadge,
      actions: [
        false && h('div.search', { style: { width: 'min(320px, 42vw)' } },
          icon('search'),
          h('input.input', {
            placeholder: 'Cliente, telefone ou CPF…', value: busca,
            onInput: debounce(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260)
          })
        ),
        false && h('button.btn.btn--sm' + (soSLA ? '.btn--primary' : ''), {
          onClick: function () { AGIR.router.setQuery({ sla: soSLA ? null : '1' }); },
          'data-tip': 'Mostrar só o que passou do prazo da etapa'
        }, icon('clock'), h('span', { text: 'Fora do prazo' })),
        false && h('button.btn.btn--icon.btn--sm', {
          'aria-label': 'Mais opções',
          onClick: function (e) { menu(e.currentTarget); }
        }, icon('more')),
        h('button.btn.pipeline-filter-trigger', { onClick: openFilterPanel },
          icon('search'), h('span', { text: 'Pesquisar e filtrar' }),
          activeFilterCount() ? h('span.badge.badge--brand', { text: activeFilterCount() }) : null),
        h('div.pipeline-head-actions',
          h('button.btn.btn--primary', { onClick: function () { AGIR.pages.novaOportunidade(); } },
            icon('plus'), h('span', { text: 'Nova oportunidade' })),
          h('button.btn.btn--icon', {
            'aria-label': 'Mais acoes do pipeline', 'data-tip': 'Importar, exportar e organizar',
            onClick: function (event) { menu(event.currentTarget); }
          }, icon('more'))
        )
      ]
    }));

    node.appendChild(filterSummary());

    /* ---------- Skeleton enquanto calcula ------------------------------ */
    var host = h('div');
    node.appendChild(host);
    D.mount(host, skeleton());

    M.defer(function () {
      if (disposed) return;
      D.mount(host, montar(false));
      ready = true;
      scheduleRefresh();
      if (q.lead && S().byId('oportunidades', q.lead)) {
        setTimeout(function () { if (!disposed) AGIR.pages.oppDrawer(q.lead); }, 60);
      }
    });

    function updateSyncBadge() {
      if (!global.AGIR_BACKEND || global.AGIR_BACKEND.mode !== 'supabase') {
        liveBadge.textContent = 'Demonstração local';
        liveBadge.dataset.status = 'demo';
        return;
      }
      var state = AGIR.syncState || {};
      var labels = { connected: 'Conectado', subscribed: 'Conectado', live: 'Conectado',
        reconnecting: 'Reconectando', connecting: 'Conectando', syncing: 'Sincronizando',
        offline: 'Sem conexão', disconnected: 'Sem conexão', error: 'Falha na sincronização' };
      var status = String(state.status || '').toLowerCase();
      var text = labels[status] || 'Sincronização não confirmada';
      var updated = state.lastUpdatedAt && new Date(state.lastUpdatedAt);
      if (updated && isFinite(updated.getTime())) text += ' · Atualizado em ' + F.dateTime(updated);
      if (liveBadge.textContent !== text) liveBadge.textContent = text;
      liveBadge.dataset.status = status;
    }

    function scheduleRefresh() {
      if (disposed || document.hidden || !ready || refreshTimer || (!pendingFull && !pendingIds.size)) return;
      refreshTimer = global.setTimeout(flushRefresh, 60);
    }

    function refreshBoardFromRealtime(event) {
      var detail = event && event.detail;
      // Catálogos e eventos antigos sem IDs exigem comparação completa, nunca remount.
      if (!detail || detail.full || !Array.isArray(detail.opportunityIds)) pendingFull = true;
      else {
        detail.opportunityIds.forEach(function (id) { if (id != null) pendingIds.add(String(id)); });
        if (/^(pipelines|pipeline_stages|products|banks|conventions|tags|users|organization_members|teams|team_members)$/.test(detail.table || '')) pendingFull = true;
      }
      scheduleRefresh();
    }

    function flushRefresh() {
      refreshTimer = null;
      if (disposed || document.hidden || !ready) return;
      // O popover usa um anchor vivo. Esperar seu fechamento conserva menu e posição.
      if (dragging || panning || document.querySelector('.pop')) return;
      var ids = pendingFull ? null : new Set(pendingIds);
      pendingFull = false; pendingIds.clear();
      reconcileBoard(ids);
    }
    global.addEventListener('ascensao:crm-refreshed', refreshBoardFromRealtime);
    global.addEventListener('ascensao:sync-status', updateSyncBadge);
    function onVisible() { if (!document.hidden) scheduleRefresh(); }
    document.addEventListener('visibilitychange', onVisible);
    var menuObserver = new MutationObserver(function () {
      if (!document.querySelector('.pop')) scheduleRefresh();
    });
    menuObserver.observe(document.body, { childList: true });
    if (typeof AGIR.onPageDispose === 'function') {
      AGIR.onPageDispose(function () {
        disposed = true; global.clearTimeout(refreshTimer); menuObserver.disconnect();
        pendingIds.clear(); cardNodes.clear(); columnNodes.clear(); hideOutcomeDock();
        global.removeEventListener('ascensao:crm-refreshed', refreshBoardFromRealtime);
        global.removeEventListener('ascensao:sync-status', updateSyncBadge);
        document.removeEventListener('visibilitychange', onVisible);
        node.classList.remove('pipeline-workspace');
      });
    }

    function activeFilterCount() {
      return filterChips().length;
    }

    function temporalContext() {
      var dates = An.pipelineDates(f);
      function label(bounds) {
        if (!bounds.from && !bounds.to) return 'Todo o período';
        return (bounds.from ? F.date(bounds.from) : 'Sem início') + ' até ' + (bounds.to ? F.date(bounds.to) : 'sem fim');
      }
      return 'Criação: ' + label(dates.creation) + ' · Modificação: ' + label(dates.modification) +
        (dates.modification.from || dates.modification.to ? ' · Os dois critérios devem ser atendidos.' : '') +
        ' · Datas no fuso local (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ').';
    }

    function filterChips() {
      var chips = [];
      function add(key, label, patch) { if (q[key]) chips.push({ label: label, patch: patch || { [key]: null } }); }
      add('q', 'Busca: ' + busca);
      [['owner', 'usuarios', 'Responsável'], ['equipe', 'equipes', 'Equipe'], ['produto', 'produtos', 'Produto'],
        ['convenio', 'convenios', 'Segmento de cliente'], ['origem', 'origens', 'Fonte'], ['banco', 'bancos', 'Parceiro de execução'],
        ['etiqueta', 'etiquetas', 'Etiqueta']].forEach(function (entry) {
        if (!isAdministrator() && (entry[0] === 'owner' || entry[0] === 'equipe')) return;
        add(entry[0], entry[2] + ': ' + ((S().byId(entry[1], q[entry[0]]) || {}).nome || 'Não encontrado'));
      });
      add('etapa', 'Etapa: ' + ((An.etapaById(f.etapaId) || {}).nome || 'Não encontrada'));
      add('status', 'Status: ' + ({ ganho: 'Ganhos', perdido: 'Perdidos', todos: 'Todos', aberto: 'Em aberto' }[f.status] || f.status));
      add('sla', 'Fora do prazo');
      [['inicio', 'Criado a partir de'], ['fim', 'Criado até'], ['modinicio', 'Modificado a partir de'], ['modfim', 'Modificado até']]
        .forEach(function (entry) { add(entry[0], entry[1] + ': ' + q[entry[0]],
          entry[0] === 'inicio' || entry[0] === 'fim' ? { [entry[0]]: null, periodo: 'todos' } : null); });
      if (!f.dataInicio && !f.dataFim && f.periodo !== 'todos') chips.push({
        label: 'Criação: ' + An.range(f.periodo).label, patch: { periodo: 'todos' }
      });
      return chips;
    }

    function filterSummary() {
      var chips = filterChips();
      return h('div.pipeline-filter-summary',
        h('div.col.gap-2',
          h('div.pipeline-temporal-context', { text: temporalContext() }),
          h('span.t-small.t-dimmer', { text: 'Status: ' + ({ ganho: 'Ganhos', perdido: 'Perdidos', todos: 'Todos', aberto: 'Em aberto' }[f.status || 'aberto']) }),
          !isAdministrator() ? h('span.t-small.t-dimmer', { text: 'Carteira: somente meus leads (restrição de acesso)' }) : null,
          h('div.row.gap-2.wrap', chips.map(function (chip) {
            return h('button.chip.is-active', { type: 'button', 'aria-label': 'Remover filtro ' + chip.label,
              onClick: function () { AGIR.router.setQuery(chip.patch); } }, h('span', { text: chip.label }), icon('x'));
          }))
        ),
        h('div.spacer'), chips.length ? h('button.btn.btn--sm.btn--ghost', { text: 'Limpar filtros', onClick: clearFilters }) : null
      );
    }

    function clearFilters() {
      AGIR.router.setQuery({ q: null, owner: null, equipe: null, produto: null, convenio: null, origem: null, etiqueta: null,
        banco: null, etapa: null, status: null, inicio: null, fim: null, modinicio: null, modfim: null, sla: null, periodo: 'todos' });
    }

    function openFilterPanel() {
      var fields = {};
      function selectField(key, label, options, value, placeholder) {
        fields[key] = h('select.select',
          h('option', { value: '', text: placeholder || 'Todos' }),
          options.map(function (item) {
            return h('option', { value: item.id || item.value, text: item.nome || item.label, selected: (item.id || item.value) === value });
          })
        );
        fields[key].classList.toggle('is-on', !!value);
        fields[key].addEventListener('change', function () { this.classList.toggle('is-on', !!this.value); });
        return h('div.field', h('label.field__label', { text: label }), fields[key]);
      }
      function markInput(input, value) {
        input.classList.toggle('is-on', !!value);
        input.addEventListener('input', function () { this.classList.toggle('is-on', !!this.value); });
        return input;
      }
      fields.busca = markInput(h('input.input', { value: busca, placeholder: 'Nome, CPF ou telefone', autofocus: true }), busca);
      fields.inicio = markInput(h('input.input', { type: 'date', value: f.dataInicio }), f.dataInicio);
      fields.fim = markInput(h('input.input', { type: 'date', value: f.dataFim }), f.dataFim);
      fields.modinicio = markInput(h('input.input', { type: 'date', value: f.modificacaoInicio }), f.modificacaoInicio);
      fields.modfim = markInput(h('input.input', { type: 'date', value: f.modificacaoFim }), f.modificacaoFim);
      var current = S().currentUser();
      var canViewAllLeads = S().get('session.role') === 'admin' || (current && current.role === 'admin');
      fields.meus = h('input', { type: 'checkbox', checked: !canViewAllLeads || !!(current && f.ownerId === current.id) });
      var modal = UI.modal({
        title: 'Pesquisar e filtrar leads',
        sub: 'Criação e modificação são combinadas: o lead precisa atender aos dois recortes. Datas manuais substituem o período de criação.',
        wide: true,
        body: h('div.pipeline-filter-panel',
          h('div.pipeline-filter-panel__quick',
            h('b.t-small', { text: 'Acessos rapidos' }),
            h('label.loss-reason-option' + (current && f.ownerId === current.id ? '.is-on' : ''), fields.meus, h('span.loss-reason-option__mark'), h('span', { text: 'Meus leads' })),
            h('button.btn' + ((!f.status || f.status === 'aberto') ? '.is-on' : ''), { onClick: function () { setQuickStatus('aberto', this); } }, icon('layers'), h('span', { text: 'Leads ativos' })),
            h('button.btn' + (f.status === 'ganho' ? '.is-on' : ''), { onClick: function () { setQuickStatus('ganho', this); } }, icon('trophy'), h('span', { text: 'Leads ganhos' })),
            h('button.btn' + (f.status === 'perdido' ? '.is-on' : ''), { onClick: function () { setQuickStatus('perdido', this); } }, icon('x'), h('span', { text: 'Leads perdidos' }))
          ),
          h('div.pipeline-filter-panel__fields',
            h('div.field', h('label.field__label', { text: 'Pesquisar' }), fields.busca),
            h('div.grid.g-2',
              selectField('periodo', 'Período de criação', [{ value: 'todos', label: 'Todo o período' }].concat(AGIR.an.PRESETS), f.dataInicio || f.dataFim ? 'todos' : f.periodo, 'Este mês'),
              selectField('status', 'Status', [
                { id: 'aberto', nome: 'Em aberto' }, { id: 'ganho', nome: 'Ganhos' },
                { id: 'perdido', nome: 'Perdidos' }, { id: 'todos', nome: 'Todos' }
              ], f.status, 'Em aberto')
            ),
            h('div.grid.g-2', h('div.field', h('label.field__label', { text: 'Criado a partir de' }), fields.inicio), h('div.field', h('label.field__label', { text: 'Criado ate' }), fields.fim)),
            h('div.grid.g-2', h('div.field', h('label.field__label', { text: 'Modificado a partir de' }), fields.modinicio), h('div.field', h('label.field__label', { text: 'Modificado ate' }), fields.modfim)),
            h('div.grid.g-2',
              selectField('owner', 'Usuario responsavel', (S().get('usuarios') || []).filter(function (item) {
                return canViewAllLeads || item.id === (current || {}).id;
              }), canViewAllLeads ? f.ownerId : (current || {}).id, canViewAllLeads ? 'Todos os usuarios' : 'Minha carteira'),
              selectField('equipe', 'Equipe', S().get('equipes') || [], f.equipeId, 'Todas as equipes')
            ),
            h('div.grid.g-2',
              selectField('etiqueta', 'Etiqueta', S().get('etiquetas') || [], f.etiquetaId, 'Todas as etiquetas'),
              selectField('etapa', 'Etapa', An.etapas() || [], f.etapaId, 'Todas as etapas')
            ),
            h('div.grid.g-2',
              selectField('produto', 'Produto', S().get('produtos') || [], f.produtoId, 'Todos os produtos'),
              selectField('convenio', 'Segmento de cliente', S().get('convenios') || [], f.convenioId, 'Todos os segmentos')
            ),
            selectField('origem', 'Fonte do lead', S().get('origens') || [], f.origemId, 'Todas as fontes'),
            h('p.pipeline-filter-help', { text: 'Para encontrar leads antigos modificados hoje, escolha Todo o período em criação e informe hoje nas duas datas de modificação. Um limite de data vazio significa sem limite.' }),
            h('div.pipeline-filter-error', { role: 'alert', 'aria-live': 'assertive' })
          )
        ),
        footer: function (api) {
          return [
            h('button.btn.btn--ghost', { text: 'Limpar tudo', onClick: function () { api.close(); clearFilters(); } }),
            h('div.spacer'), h('button.btn', { text: 'Cancelar', onClick: api.close }),
            h('button.btn.btn--primary', { text: 'Aplicar filtros', onClick: function () {
              var invalid = null;
              ['inicio', 'fim', 'modinicio', 'modfim'].forEach(function (key) {
                fields[key].removeAttribute('aria-invalid');
                if (!fields[key].checkValidity()) invalid = invalid || fields[key];
              });
              if (fields.inicio.value && fields.fim.value && fields.inicio.value > fields.fim.value) invalid = fields.fim;
              if (fields.modinicio.value && fields.modfim.value && fields.modinicio.value > fields.modfim.value) invalid = fields.modfim;
              if (invalid) {
                invalid.setAttribute('aria-invalid', 'true'); invalid.focus();
                D.qs('.pipeline-filter-error', modal.el).textContent = 'Informe datas válidas; a data final deve ser igual ou posterior à inicial.';
                return;
              }
              var owner = !canViewAllLeads && current ? current.id : (fields.meus.checked && current ? current.id : fields.owner.value);
              api.close();
              AGIR.router.setQuery({ q: fields.busca.value.trim() || null, periodo: fields.inicio.value || fields.fim.value ? 'todos' : fields.periodo.value || 'mes',
                status: fields.status.value || null, inicio: fields.inicio.value || null, fim: fields.fim.value || null,
                modinicio: fields.modinicio.value || null, modfim: fields.modfim.value || null,
                owner: owner || null, equipe: fields.equipe.value || null, etiqueta: fields.etiqueta.value || null,
                etapa: fields.etapa.value || null, produto: fields.produto.value || null,
                convenio: fields.convenio.value || null, origem: fields.origem.value || null });
            } })
          ];
        }
      });
      Object.keys(fields).forEach(function (key) {
        var input = fields[key];
        input.id = 'pipeline-filter-' + key;
        var field = input.closest('.field');
        var label = field && field.querySelector('label');
        if (label) label.setAttribute('for', input.id);
      });
      fields.periodo.addEventListener('change', function () {
        fields.inicio.value = ''; fields.fim.value = '';
        fields.inicio.classList.remove('is-on'); fields.fim.classList.remove('is-on');
      });
      [fields.inicio, fields.fim].forEach(function (input) {
        input.addEventListener('input', function () { fields.periodo.value = 'todos'; });
      });
      fields.owner.addEventListener('change', function () {
        fields.meus.checked = !!current && fields.owner.value === current.id;
        fields.meus.closest('label').classList.toggle('is-on', fields.meus.checked);
      });
      if (!canViewAllLeads) {
        fields.meus.disabled = true;
        fields.owner.disabled = true;
        fields.equipe.disabled = true;
      }
      fields.meus.addEventListener('change', function () { this.closest('label').classList.toggle('is-on', this.checked); });
      function setQuickStatus(value, button) {
        fields.status.value = value; fields.status.classList.add('is-on');
        D.qsa('.pipeline-filter-panel__quick .btn', modal.el).forEach(function (item) { item.classList.toggle('is-on', item === button); });
      }
      return modal;
    }

    function buildRenderCache() {
      var nextActivities = Object.create(null);
      var revision = S().revision('atividades');
      if (cachedNextActivities && revision === activityCacheRevision) nextActivities = cachedNextActivities;
      else (S().get('atividades') || []).forEach(function (activity) {
        var pending = activity.resultado === 'pendente' || activity.status === 'pending' || activity.status === 'scheduled';
        if (!pending || !activity.oportunidadeId) return;
        var rawDate = activity.agendadoPara || activity.data;
        if (!rawDate) return;
        var time = F.toDate(rawDate).getTime();
        if (!isFinite(time)) return;
        var key = String(activity.oportunidadeId);
        var current = nextActivities[key];
        if (!current || time < current.time) nextActivities[key] = { activity: activity, time: time };
      });
      activityCacheRevision = revision; cachedNextActivities = nextActivities;
      return {
        produtos: S().indexBy('produtos'),
        convenios: S().indexBy('convenios'),
        bancos: S().indexBy('bancos'),
        usuarios: S().indexBy('usuarios'),
        etiquetas: S().indexBy('etiquetas'),
        nextActivities: nextActivities
      };
    }

    /* ==================================================================== */
    function montar(summaryOnly, columns) {
      var finishMeasurement = AGIR.perf ? AGIR.perf.start('pipeline.mount') : function () {};
      renderCache = buildRenderCache();
      var cols = columns || An.pipeline(f);
      var totalAberto = cols.reduce(function (a, c) { return a + c.valor; }, 0);
      var totalPond = cols.reduce(function (a, c) { return a + c.ponderado; }, 0);
      var totalQtd = cols.reduce(function (a, c) { return a + c.qtd; }, 0);
      var estourados = cols.reduce(function (a, c) { return a + c.estourados; }, 0);
      var cob = An.cobertura(f);
      var statusLabel = f.status === 'ganho' ? 'Oportunidades ganhas' :
        f.status === 'perdido' ? 'Oportunidades perdidas' :
        f.status === 'todos' ? 'Oportunidades encontradas' : 'Oportunidades abertas';

      var wrap = h('div.col.gap-5');
      var summary = h('div.pipeline-board-summary.col.gap-5');
      wrap.appendChild(summary);

      if (multiSelect) summary.appendChild(selectionBar());

      /* resumo do funil */
      summary.appendChild(h('div.grid.g-3',
        W.kpi({ label: statusLabel, value: F.num(totalQtd), icon: 'layers', tone: 'info',
          sub: F.plural(estourados, 'fora do prazo', 'fora do prazo') }),
        W.kpi({ label: 'Estorno solicitado no funil', value: F.moneyShort(totalAberto), icon: 'coins', tone: 'brand',
          sub: 'soma dos estornos solicitados em aberto' }),
        false && W.kpi({ label: 'Ponderado pela etapa', raw: totalPond, format: F.moneyShort, icon: 'percent', tone: 'plum',
          sub: 'valor × probabilidade de cada etapa' }),
        W.kpi({ label: 'Cobertura da meta', value: cob.gap ? F.num(cob.x, 1) + 'x' : '—',
          icon: 'target', tone: cob.saudavel ? 'ok' : 'bad',
          sub: cob.gap ? 'faltam ' + F.moneyShort(cob.gap) + ' · saudável é 3x' : 'meta do mês já batida' })
      ));

      if (estourados && !soSLA) {
        summary.appendChild(h('div.insight.insight--warn',
          h('div.insight__ico', icon('clock')),
          h('div.grow',
            h('div.insight__title', { text: F.plural(estourados, 'oportunidade', 'oportunidades') + ' passaram do SLA da etapa' }),
            h('div.insight__text', { text: 'Esses são os cards com relógio vermelho. Tratar primeiro costuma render mais que abrir lead novo.' })
          ),
          h('button.btn.btn--sm.btn--outline', {
            style: { alignSelf: 'center' }, text: 'Filtrar só esses',
            onClick: function () { AGIR.router.setQuery({ sla: '1' }); }
          })
        ));
      }
      if (summaryOnly) { finishMeasurement(); return summary; }

      /* kanban */
      var board = h('div.kanban');
      enableBoardPan(board);
      cols.forEach(function (col) {
        var element = coluna(col); columnNodes.set(String(col.etapa.id), element); board.appendChild(element);
      });
      wrap.appendChild(board);
      wrap.appendChild(emptyState(totalQtd));

      finishMeasurement(); return wrap;
    }

    function emptyState(count) {
      return h('div.pipeline-empty', { hidden: count > 0, role: 'status' },
        h('b', { text: 'Nenhuma oportunidade corresponde aos filtros' }),
        h('p', { text: temporalContext() + ' Confira também os critérios acima.' }),
        h('button.btn', { text: 'Limpar filtros', onClick: clearFilters }));
    }

    // Atualiza texto/atributos sem trocar nós estáveis, listeners ou controles focados.
    function patchNode(target, source) {
      if (target.nodeType !== source.nodeType || target.nodeName !== source.nodeName) {
        target.replaceWith(source); return source;
      }
      if (target.nodeType === 3) {
        if (target.nodeValue !== source.nodeValue) target.nodeValue = source.nodeValue;
        return target;
      }
      Array.from(target.attributes).forEach(function (attr) {
        if (!source.hasAttribute(attr.name)) target.removeAttribute(attr.name);
      });
      Array.from(source.attributes).forEach(function (attr) {
        if (target.getAttribute(attr.name) !== attr.value) target.setAttribute(attr.name, attr.value);
      });
      var old = Array.from(target.childNodes), next = Array.from(source.childNodes);
      next.forEach(function (child, index) {
        if (old[index]) patchNode(old[index], child); else target.appendChild(child);
      });
      old.slice(next.length).forEach(function (child) { child.remove(); });
      return target;
    }

    function cardSignature(op) {
      return JSON.stringify([op, renderCache.produtos[op.produtoId], renderCache.convenios[op.convenioId],
        renderCache.bancos[op.bancoId], renderCache.usuarios[op.ownerId], renderCache.nextActivities[String(op.id)],
        (op.tags || []).map(function (id) { return renderCache.etiquetas[id]; }),
        An.etapaById(op.etapaId), An.diasNaEtapa(op), multiSelect, !!selected[op.id]]);
    }

    function reconcileBoard(ids) {
      if (disposed) return;
      if (document.hidden) { pendingFull = true; return; }
      var previousBoard = D.qs('.kanban', host);
      if (!previousBoard) return;
      var finishMeasurement = AGIR.perf ? AGIR.perf.start('pipeline.update') : function () {};
      var scroll = [{ element: previousBoard, left: previousBoard.scrollLeft, top: previousBoard.scrollTop }];
      for (var parent = host; parent; parent = parent.parentElement) {
        scroll.push({ element: parent, left: parent.scrollLeft, top: parent.scrollTop });
      }
      columnNodes.forEach(function (column) {
        var list = column.querySelector('.kcol__list');
        scroll.push({ element: list, left: list.scrollLeft, top: list.scrollTop });
      });
      var focused = document.activeElement;
      var selection = global.getSelection && global.getSelection();
      var range = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      var cols = An.pipeline(f), validIds = new Set(), renderedIds = new Set();
      cols.forEach(function (col) { col.itens.forEach(function (op) { validIds.add(String(op.id)); }); });
      Object.keys(selected).forEach(function (id) { if (!validIds.has(id)) delete selected[id]; });
      refreshSortIndexes();
      patchNode(D.qs('.pipeline-board-summary', host), montar(true, cols));
      var visibleStages = new Set();
      cols.forEach(function (col, columnIndex) {
        var key = String(col.etapa.id), column = columnNodes.get(key);
        visibleStages.add(key);
        if (!column) {
          column = coluna(col, true); columnNodes.set(key, column);
        }
        if (previousBoard.children[columnIndex] !== column) previousBoard.insertBefore(column, previousBoard.children[columnIndex] || null);
        patchNode(column.querySelector('.kcol__head'), columnHead(col));
        var list = column.querySelector('.kcol__list'), allItems = filtrar(col.itens);
        var items = columnWindow(col.etapa.id, allItems);
        updateColumnPager(column, col.etapa.id, allItems.length);
        var empty = list.querySelector('.pipeline-column-empty');
        if (empty && items.length) empty.remove();
        items.forEach(function (op, index) {
          var id = String(op.id), element = cardNodes.get(id);
          renderedIds.add(id);
          if (!element) {
            element = card(op, index); cardNodes.set(id, element);
          } else if (!ids || ids.has(id) || element.classList.contains('is-selecting') !== multiSelect ||
            element.classList.contains('is-selected') !== !!selected[id]) {
            var signature = cardSignature(op);
            if (element._signature !== signature) {
              var fresh = card(op, index);
              patchNode(element, fresh); element._signature = signature;
              element.updateOpportunity(op);
            }
          }
          if (list.children[index] !== element) list.insertBefore(element, list.children[index] || null);
        });
        if (!items.length && !empty) list.appendChild(columnEmpty());
      });
      cardNodes.forEach(function (element, id) {
        if (!renderedIds.has(id)) { element.remove(); cardNodes.delete(id); }
      });
      columnNodes.forEach(function (column, id) {
        if (!visibleStages.has(id)) { column.remove(); columnNodes.delete(id); }
      });
      patchNode(D.qs('.pipeline-empty', host), emptyState(validIds.size));
      if (focused && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
      else if (focused && !focused.isConnected && host.contains(previousBoard)) {
        previousBoard.setAttribute('tabindex', '-1'); previousBoard.focus({ preventScroll: true });
      }
      if (range && range.startContainer.isConnected && range.endContainer.isConnected) {
        selection.removeAllRanges(); selection.addRange(range);
      }
      scroll.forEach(function (position) {
        position.element.scrollLeft = position.left; position.element.scrollTop = position.top;
      });
      finishMeasurement();
    }

    function enableBoardPan(board) {
      var active = false, moved = false, startX = 0, startScroll = 0;
      board.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || event.target.closest('.kcard, button, a, input, select, textarea')) return;
        active = true; panning = true; moved = false; startX = event.clientX; startScroll = board.scrollLeft;
        board.setPointerCapture(event.pointerId);
        board.classList.add('is-panning');
      });
      board.addEventListener('pointermove', function (event) {
        if (!active) return;
        var delta = event.clientX - startX;
        if (Math.abs(delta) > 4) moved = true;
        board.scrollLeft = startScroll - delta;
        if (moved) event.preventDefault();
      });
      function stop(event) {
        if (!active) return;
        active = false; panning = false; board.classList.remove('is-panning'); scheduleRefresh();
        if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
      }
      board.addEventListener('pointerup', stop);
      board.addEventListener('pointercancel', stop);
      board.addEventListener('click', function (event) {
        if (!moved) return;
        event.preventDefault(); event.stopPropagation(); moved = false;
      }, true);
    }

    function selectedIds() {
      return Object.keys(selected).filter(function (id) { return selected[id]; });
    }

    function toggleSelected(id) {
      selected[id] = !selected[id];
      if (!selected[id]) delete selected[id];
      refreshBoardFromRealtime();
    }

    function leaveSelection() {
      multiSelect = false;
      selected = Object.create(null);
      refreshBoardFromRealtime();
    }

    /* ======================================================================
       Acoes em massa

       Toda acao em lote roda em serie e tolera falha parcial: um lead que
       falha nao interrompe os demais, e o resumo final diz exatamente quantos
       passaram e por que os outros nao passaram. Interromper no primeiro erro
       deixaria o usuario sem saber o que foi aplicado e o que nao foi.
       ====================================================================== */
    function selecionados() {
      return (S().get('oportunidades') || []).filter(function (item) { return selected[item.id]; })
        .map(function (item) { return Object.assign({}, item); });
    }

    function resumoSelecao(itens) {
      var valor = itens.reduce(function (soma, item) { return soma + An.valorCRM(item); }, 0);
      return F.plural(itens.length, 'lead') + ' · ' + F.moneyShort(valor);
    }

    /**
     * Executa `tarefa` para cada lead, mostrando progresso e devolvendo o
     * resumo. `tarefa` deve lancar em caso de falha.
     */
    async function executarEmLote(itens, rotulo, tarefa) {
      var progresso = UI.toast({
        title: rotulo, text: 'Processando 1 de ' + itens.length + '...',
        tone: 'info', ms: 0
      });
      var ok = [];
      var falhas = [];

      for (var i = 0; i < itens.length; i++) {
        var item = itens[i];
        var texto = progresso.el && progresso.el.querySelector('.toast__text');
        if (texto) texto.textContent = 'Processando ' + (i + 1) + ' de ' + itens.length + '...';
        try {
          await tarefa(item);
          ok.push(item);
          delete selected[item.id];
        } catch (erro) {
          console.error('[lote] Falha em ' + item.cliente + '.', erro);
          falhas.push({ item: item, motivo: erro && erro.message ? erro.message : 'erro desconhecido' });
        }
      }

      progresso.close();
      refreshBoardFromRealtime();

      if (!falhas.length) {
        UI.toast.ok(rotulo + ' concluido', F.plural(ok.length, 'lead') + ' atualizado(s).');
      } else if (!ok.length) {
        UI.toast.bad('Nenhum lead foi atualizado', falhas[0].motivo);
      } else {
        UI.toast({
          title: 'Concluido parcialmente', tone: 'warn', ms: 9000,
          text: ok.length + ' de ' + itens.length + ' deram certo. ' +
            falhas.length + ' falhou(aram) — o primeiro: ' + falhas[0].item.cliente +
            ' (' + falhas[0].motivo + ').'
        });
      }
      return { ok: ok, falhas: falhas };
    }

    async function executarAlteracaoUnica(itens, rotulo, payload, localPatch) {
      var progresso = UI.toast({ title: rotulo, text: 'Atualizando ' + F.plural(itens.length, 'lead') + '...', tone: 'info', ms: 0 });
      try {
        if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
          var rows = await global.AGIR_BACKEND.bulkUpdateOpportunities(Object.assign({
            organizationId: S().get('session.organizationId'),
            opportunityIds: itens.map(function (item) { return item.id; })
          }, payload));
          rows.forEach(function (row) {
            S().update('oportunidades', row.id, Object.assign({}, localPatch, {
              ownerId: row.owner_id, pipelineId: row.pipeline_id, etapaId: row.stage_id,
              status: row.status === 'won' ? 'ganho' : row.status === 'lost' ? 'perdido' : 'aberto',
              atualizadoEm: row.updated_at, entrouEtapaEm: row.stage_entered_at,
              fechadoEm: row.closed_at, motivoPerdaId: row.loss_reason_id, version: row.version
            }));
          });
        } else {
          itens.forEach(function (item) {
            S().update('oportunidades', item.id, Object.assign({ atualizadoEm: new Date().toISOString() }, localPatch));
          });
        }
        itens.forEach(function (item) { delete selected[item.id]; });
        progresso.close();
        refreshBoardFromRealtime();
        UI.toast.ok(rotulo + ' concluida', F.plural(itens.length, 'lead') + ' atualizado(s) em uma unica operacao.');
      } catch (error) {
        progresso.close();
        UI.toast.bad('Nao foi possivel concluir a alteracao', error.message || 'Tente novamente.');
      }
    }

    function loteAtribuirResponsavel() {
      var itens = selecionados();
      var vendedores = (S().get('usuarios') || []).filter(function (user) {
        return user.ativo !== false && user.role !== 'admin';
      });
      if (!vendedores.length) return UI.toast.warn('Nenhum vendedor ativo');
      var select = h('select.select',
        h('option', { value: '', text: 'Selecione o vendedor' }),
        vendedores.map(function (user) { return h('option', { value: user.id, text: user.nome }); })
      );
      UI.modal({
        title: 'Atribuir responsavel em massa', sub: resumoSelecao(itens),
        body: h('div.field', h('label.field__label', { text: 'Novo vendedor responsavel' }), select),
        footer: function (api) { return [
          h('button.btn', { text: 'Cancelar', onClick: api.close }),
          h('button.btn.btn--primary', { onClick: function () {
            var ownerId = select.value;
            if (!ownerId) return UI.toast.warn('Selecione o vendedor');
            api.close();
            executarAlteracaoUnica(itens, 'Transferencia em massa', { ownerId: ownerId }, { ownerId: ownerId });
          } }, icon('users'), h('span', { text: 'Atribuir todos' }))
        ]; }
      });
    }

    function loteMudarFunil() {
      var itens = selecionados();
      var funis = (S().get('pipelines') || []).filter(function (pipeline) { return pipeline.ativo !== false; });
      if (!funis.length) return UI.toast.warn('Nenhum funil ativo');
      var select = h('select.select',
        h('option', { value: '', text: 'Selecione o funil' }),
        funis.map(function (pipeline) { return h('option', { value: pipeline.id, text: pipeline.nome }); })
      );
      UI.modal({
        title: 'Mudar funil em massa', sub: resumoSelecao(itens),
        body: h('div.col.gap-3',
          h('div.field', h('label.field__label', { text: 'Funil de destino' }), select),
          h('div.insight.insight--info', h('div.insight__ico', icon('info')),
            h('div.insight__text', { text: 'Os leads entrarao na primeira etapa aberta do funil escolhido.' }))
        ),
        footer: function (api) { return [
          h('button.btn', { text: 'Cancelar', onClick: api.close }),
          h('button.btn.btn--primary', { onClick: function () {
            var pipelineId = select.value;
            if (!pipelineId) return UI.toast.warn('Selecione o funil');
            var pipeline = (S().get('pipelines') || []).find(function (item) { return item.id === pipelineId; }) || {};
            var firstStage = (pipeline.etapas || []).filter(function (stage) { return stage.tipo === 'aberto' && stage.ativo !== false; })
              .sort(function (a, b) { return a.ordem - b.ordem; })[0];
            api.close();
            executarAlteracaoUnica(itens, 'Mudanca de funil', { pipelineId: pipelineId }, {
              pipelineId: pipelineId, etapaId: firstStage && firstStage.id, status: 'aberto',
              motivoPerdaId: null, fechadoEm: null, entrouEtapaEm: new Date().toISOString()
            });
          } }, icon('kanban'), h('span', { text: 'Mover todos' }))
        ]; }
      });
    }

    function loteMover(etapa) {
      var itens = selecionados().filter(function (item) { return item.etapaId !== etapa.id; });
      if (!itens.length) return UI.toast.info('Nada a mover', 'Os leads escolhidos ja estao nesta etapa.');

      UI.confirm({
        title: 'Mover para "' + etapa.nome + '"?',
        text: resumoSelecao(itens) + ' serao movidos.',
        okLabel: 'Mover'
      }).then(function (confirmado) {
        if (!confirmado) return;
        executarEmLote(itens, 'Movendo leads', async function (item) {
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            var atualizado = await global.AGIR_BACKEND.transitionOpportunity({
              opportunityId: item.id, targetStageId: etapa.id,
              expectedVersion: item.version, lossReasonId: null
            });
            if (Number((S().byId('oportunidades', item.id) || {}).version || 0) <= Number(atualizado.version)) S().update('oportunidades', item.id, {
              etapaId: atualizado.stage_id,
              status: atualizado.status === 'won' ? 'ganho' : atualizado.status === 'lost' ? 'perdido' : 'aberto',
              entrouEtapaEm: atualizado.stage_entered_at, atualizadoEm: atualizado.updated_at,
              fechadoEm: atualizado.closed_at, version: atualizado.version
            });
          } else {
            S().update('oportunidades', item.id, {
              etapaId: etapa.id, entrouEtapaEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(), status: 'aberto'
            });
          }
        });
      });
    }

    function lotePerder() {
      var itens = selecionados().filter(function (item) { return item.status === 'aberto'; });
      if (!itens.length) return UI.toast.info('Nada a marcar', 'Nenhum lead aberto na selecao.');
      var etapa = An.etapas().find(function (item) { return item.tipo === 'perdido'; });
      if (!etapa) return UI.toast.bad('Etapa de perda nao configurada');

      /* Um motivo unico para todo o lote: perguntar lead a lead anularia o
         ganho de tempo da acao em massa. */
      escolherMotivoPerda().then(function (motivoId) {
        if (!motivoId) return;
        UI.confirm({
          title: 'Marcar como perdido?',
          text: resumoSelecao(itens) + ' receberao o mesmo motivo de perda.',
          okLabel: 'Marcar como perdido', danger: true
        }).then(function (confirmado) {
          if (!confirmado) return;
          executarEmLote(itens, 'Marcando perdas', async function (item) {
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              var atualizado = await global.AGIR_BACKEND.transitionOpportunity({
                opportunityId: item.id, targetStageId: etapa.id,
                expectedVersion: item.version, lossReasonId: motivoId
              });
              if (Number((S().byId('oportunidades', item.id) || {}).version || 0) <= Number(atualizado.version)) S().update('oportunidades', item.id, {
                etapaId: atualizado.stage_id, status: 'perdido',
                entrouEtapaEm: atualizado.stage_entered_at, atualizadoEm: atualizado.updated_at,
                fechadoEm: atualizado.closed_at, motivoPerdaId: atualizado.loss_reason_id,
                version: atualizado.version
              });
            } else {
              S().update('oportunidades', item.id, {
                etapaId: etapa.id, status: 'perdido', motivoPerdaId: motivoId,
                fechadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString()
              });
            }
          });
        });
      });
    }

    function loteEtiquetar() {
      var etiquetas = (S().get('etiquetas') || []).filter(function (item) { return item.ativo !== false; });
      if (!etiquetas.length) {
        return UI.toast.info('Nenhuma etiqueta cadastrada', 'Crie etiquetas no painel do lead antes de aplicar em massa.');
      }
      var itens = selecionados();
      var escolhidas = Object.create(null);

      UI.modal({
        title: 'Aplicar etiquetas',
        sub: resumoSelecao(itens),
        body: h('div.col.gap-4',
          h('div.t-small.t-dimmer', { text: 'As etiquetas marcadas serao adicionadas. As que o lead ja tem sao preservadas.' }),
          h('div.row.gap-2.wrap', etiquetas.map(function (tag) {
            return h('button.chip', {
              type: 'button', text: tag.nome,
              onClick: function () {
                if (escolhidas[tag.id]) delete escolhidas[tag.id];
                else escolhidas[tag.id] = true;
                this.classList.toggle('is-active');
              }
            });
          }))
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { onClick: function () {
              var ids = Object.keys(escolhidas);
              if (!ids.length) return UI.toast.warn('Escolha ao menos uma etiqueta');
              api.close();
              executarEmLote(itens, 'Aplicando etiquetas', async function (item) {
                var atuais = (item.tags || []).slice();
                var finais = atuais.slice();
                ids.forEach(function (id) { if (finais.indexOf(id) < 0) finais.push(id); });
                if (finais.length === atuais.length) return;   // nada a fazer
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  await global.AGIR_BACKEND.setOpportunityTags({ opportunityId: item.id, tagIds: finais });
                }
                S().update('oportunidades', item.id, { tags: finais });
              });
            } }, icon('check'), h('span', { text: 'Aplicar' }))
          ];
        }
      });
    }

    function loteExcluir() {
      var itens = selecionados();
      if (!itens.length) return;
      UI.confirm({
        title: 'Excluir ' + F.plural(itens.length, 'lead') + '?',
        text: resumoSelecao(itens) + ' sairao do funil. O historico de auditoria e preservado.',
        okLabel: 'Excluir', danger: true
      }).then(function (confirmado) {
        if (!confirmado) return;
        executarEmLote(itens, 'Excluindo leads', async function (item) {
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            await global.AGIR_BACKEND.cancelOpportunity({
              opportunityId: item.id, expectedVersion: item.version || 1
            });
          }
          S().remove('oportunidades', item.id);
        });
      });
    }

    function menuLote(anchor) {
      var itens = selecionados();
      var abertos = itens.filter(function (item) { return item.status === 'aberto'; });
      UI.popover(anchor, [
        { group: 'Aplicar a ' + F.plural(itens.length, 'lead') },
        isAdministrator() ? { label: 'Atribuir a um vendedor', icon: 'users', onClick: loteAtribuirResponsavel } : null,
        isAdministrator() ? { label: 'Mudar de funil', icon: 'kanban', onClick: loteMudarFunil } : null,
        isAdministrator() ? { sep: true } : null,
        { label: 'Aplicar etiquetas', icon: 'tag', onClick: loteEtiquetar },
        { label: 'Marcar como perdido', icon: 'trendDown',
          hint: abertos.length < itens.length ? abertos.length + ' abertos' : null,
          onClick: lotePerder },
        { sep: true },
        { label: 'Exportar selecao', icon: 'download',
          onClick: function () { exportOpportunities(itens, 'selecionados'); } },
        { sep: true },
        { label: 'Excluir do funil', icon: 'trash', danger: true, onClick: loteExcluir }
      ].filter(Boolean), { align: 'right' });
    }

    function menuMover(anchor) {
      var abertas = An.etapas().filter(function (e) { return e.tipo === 'aberto'; });
      /* "Ganho" fica de fora: cada venda exige comprovante proprio, entao
         marcar em massa seria bloqueado lead a lead pelo banco. */
      UI.popover(anchor, [{ group: 'Mover para' }].concat(
        abertas.map(function (e) {
          return { label: e.nome, icon: 'arrowRight', onClick: function () { loteMover(e); } };
        })
      ), { align: 'right' });
    }

    function selectionBar() {
      var ids = selectedIds();
      var itens = selecionados();
      var visible = visibleOpportunities();
      var allVisible = visible.length && visible.every(function (item) { return selected[item.id]; });
      var vazio = !ids.length;

      return h('div.pipeline-selection-bar',
        h('div.pipeline-selection-bar__count', icon('checkcircle'),
          h('b', { text: ids.length + (ids.length === 1 ? ' lead selecionado' : ' leads selecionados') }),
          ids.length ? h('span.t-tiny.t-dimmer', { text: '· ' + F.moneyShort(
            itens.reduce(function (soma, item) { return soma + An.valorCRM(item); }, 0)) }) : null
        ),
        h('div.spacer'),
        h('button.btn.btn--sm', { onClick: function () {
          var currentVisible = visibleOpportunities();
          var allSelected = currentVisible.length && currentVisible.every(function (item) { return selected[item.id]; });
          currentVisible.forEach(function (item) { if (allSelected) delete selected[item.id]; else selected[item.id] = true; });
          refreshBoardFromRealtime();
        } }, icon(allVisible ? 'x' : 'check'), h('span', { text: allVisible ? 'Desmarcar visiveis' : 'Selecionar visiveis' })),
        h('button.btn.btn--sm', { disabled: vazio, onClick: function (e) { menuMover(e.currentTarget); } },
          icon('arrowRight'), h('span', { text: 'Mover para' }), icon('chevDown')),
        h('button.btn.btn--sm', { disabled: vazio, onClick: function (e) { menuLote(e.currentTarget); } },
          icon('more'), h('span', { text: 'Acoes' })),
        h('button.btn.btn--sm.btn--ghost', { onClick: leaveSelection }, icon('x'), h('span', { text: 'Sair da selecao' }))
      );
    }

    /* ---------- Coluna --------------------------------------------------- */
    function columnEmpty() {
      return h('div.pipeline-column-empty.t-tiny.t-dimmer', { text: 'Vazio' });
    }

    function columnHead(col) {
      return h('div.kcol__head',
        h('div.kcol__row',
          h('span.kcol__dot', { style: { background: col.etapa.cor } }),
          h('span.kcol__name.grow', { text: col.etapa.nome }),
          h('span.kcol__n', { text: col.qtd })
        ),
        h('div.kcol__row',
          h('span.kcol__sum.grow', { text: F.moneyShort(col.valor) }),
          col.estourados ? h('span.badge.badge--bad', { 'data-tip': col.estourados + ' fora do SLA de ' + col.etapa.sla + ' dias' },
            icon('clock'), h('span', { text: col.estourados })) : null
        ));
    }

    function coluna(col, emptyOnly) {
      var allItems = filtrar(col.itens), itens = columnWindow(col.etapa.id, allItems);
      var lista = h('div.kcol__list', { 'data-etapa': col.etapa.id });

      if (!emptyOnly) itens.forEach(function (op, i) {
        var element = card(op, i); cardNodes.set(String(op.id), element); lista.appendChild(element);
      });

      if (!itens.length) {
        lista.appendChild(columnEmpty());
      }

      var el = h('div.kcol', { 'data-etapa': col.etapa.id },
        columnHead(col),
        h('div.kcol__pager', { role: 'group', 'aria-label': 'Navegar nos leads de ' + col.etapa.nome },
          h('button.btn.btn--sm', { text: '‹', 'aria-label': 'Leads anteriores', onClick: function () { changeColumnPage(-1); } }),
          h('span', { role: 'status', 'aria-live': 'polite' }),
          h('button.btn.btn--sm', { text: '›', 'aria-label': 'Próximos leads', onClick: function () { changeColumnPage(1); } })),
        lista,
        h('button.kcol__add', {
          onClick: function () { AGIR.pages.novaOportunidade({ etapaId: col.etapa.id }); }
        }, icon('plus'), h('span', { text: 'Adicionar aqui' }))
      );
      function changeColumnPage(delta) {
        columnPages.set(String(col.etapa.id), Math.max(0, (columnPages.get(String(col.etapa.id)) || 0) + delta));
        reconcileBoard(null); lista.scrollTop = 0;
      }
      updateColumnPager(el, col.etapa.id, allItems.length);

      /* alvo de drop */
      lista.addEventListener('dragover', function (e) {
        e.preventDefault();
        el.classList.add('is-over');
      });
      lista.addEventListener('dragleave', function (e) {
        if (!lista.contains(e.relatedTarget)) el.classList.remove('is-over');
      });
      lista.addEventListener('drop', function (e) {
        e.preventDefault();
        el.classList.remove('is-over');
        var oppId = e.dataTransfer.getData('text/plain');
        if (oppId) mover(oppId, col.etapa.id);
      });

      return el;
    }

    function columnWindow(id, items) {
      var key = String(id), page = Math.min(columnPages.get(key) || 0, Math.max(0, Math.ceil(items.length / columnPageSize) - 1));
      columnPages.set(key, page);
      return items.slice(page * columnPageSize, (page + 1) * columnPageSize);
    }

    function updateColumnPager(column, id, total) {
      var pager = column.querySelector('.kcol__pager'), page = columnPages.get(String(id)) || 0;
      pager.hidden = total <= columnPageSize;
      pager.querySelector('[role="status"]').textContent = (total ? page * columnPageSize + 1 : 0) + '–' + Math.min(total, (page + 1) * columnPageSize) + ' de ' + total;
      var buttons = pager.querySelectorAll('button');
      buttons[0].disabled = page === 0; buttons[1].disabled = (page + 1) * columnPageSize >= total;
    }

    function soma(itens) {
      return itens.reduce(function (a, o) { return a + An.valorCRM(o); }, 0);
    }

    /* ---------- Card ----------------------------------------------------- */
    function card(op, i) {
      var cache = renderCache || buildRenderCache();
      var prod = cache.produtos[op.produtoId] || {};
      var convenio = cache.convenios[op.convenioId] || {};
      var banco = cache.bancos[op.bancoId] || {};
      var owner = cache.usuarios[op.ownerId];
      var nextActivity = cache.nextActivities[String(op.id)];
      var proxima = nextActivity ? nextActivity.activity : null;
      var activityTone = 'none';
      var activityLabel = 'Sem atividade agendada';
      if (proxima) {
        var activityDate = F.toDate(proxima.agendadoPara || proxima.data);
        var now = new Date();
        var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        if (activityDate < now) {
          activityTone = 'overdue'; activityLabel = 'Atividade atrasada: ' + F.dateTime(activityDate);
        } else if (activityDate < tomorrow) {
          activityTone = 'today'; activityLabel = 'Atividade para hoje: ' + F.time(activityDate);
        } else {
          activityTone = 'future'; activityLabel = 'Proxima atividade: ' + F.dateTime(activityDate);
        }
      }
      var cardTags = (op.tags || []).map(function (id) { return cache.etiquetas[id]; }).filter(Boolean);

      var isSelected = !!selected[op.id];
      var el = h('div.kcard' + (multiSelect ? '.is-selecting' : '') + (isSelected ? '.is-selected' : ''), {
        'data-opportunity-id': op.id,
        draggable: !multiSelect && op.status === 'aberto' ? 'true' : 'false', tabindex: '0', style: { '--i': i },
        'aria-label': op.cliente + ', Estorno solicitado ' + F.money(An.valorCRM(op)),
        onClick: function (e) { if (!e.defaultPrevented) multiSelect ? toggleSelected(op.id) : AGIR.pages.oppDrawer(op.id); },
        onKeydown: function (e) {
          if (e.key === 'Enter' || (multiSelect && e.key === ' ')) {
            e.preventDefault();
            multiSelect ? toggleSelected(op.id) : AGIR.pages.oppDrawer(op.id);
          }
        }
      },
        h('div.kcard__top',
          multiSelect ? h('span.kcard__select', {
            role: 'checkbox', 'aria-checked': isSelected ? 'true' : 'false',
            onClick: function (event) { event.preventDefault(); event.stopPropagation(); toggleSelected(op.id); }
          }, isSelected ? icon('check') : null) : null,
          h('div.grow', { style: { minWidth: 0 } },
            h('div.kcard__name.truncate', { text: op.cliente }),
            h('div.kcard__co.truncate', { text: prod.nome + (banco.nome ? ' · ' + banco.nome : '') }),
            h('div.kcard__convention.truncate', {
              text: convenio.nome || 'Segmento não informado',
              'data-tip': convenio.nome ? 'Segmento: ' + convenio.nome : 'Segmento ainda não informado'
            })
          ),
          !multiSelect ? h('button.btn.btn--icon.btn--sm.btn--ghost.no-ripple', {
            'aria-label': 'Ações',
            onClick: function (e) { e.preventDefault(); e.stopPropagation(); cardMenu(e.currentTarget, op); }
          }, icon('more')) : null
        ),
        cardTags.length ? h('div.kcard__tags',
          cardTags.slice(0, 3).map(function (tag) {
            var color = /^#[0-9a-f]{6}$/i.test(tag.cor || '') ? tag.cor : '#FF9800';
            return h('span.kcard__tag', {
              style: { color: color, borderColor: color + '55', background: color + '16' },
              text: tag.nome
            });
          }),
          cardTags.length > 3 ? h('span.kcard__tag.kcard__tag--more', { text: '+' + (cardTags.length - 3) }) : null
        ) : null,
        h('div.t-tiny.t-dimmer', {
          text: 'Criado ' + F.date(op.criadoEm) + ' · alterado ' + F.dateTime(op.atualizadoEm || op.criadoEm),
          'data-tip': 'Ultima acao registrada em ' + F.dateTime(op.atualizadoEm || op.criadoEm)
        }),
        h('div.row.between.gap-2',
          h('span.kcard__val', { 'data-tip': 'Estorno solicitado', text: F.money(An.valorCRM(op)) }),
          false && h('span.badge', { style: { background: 'var(--bg-elev-2)' },
            'data-tip': 'Receita prevista', text: F.moneyShort(op.comissao) })
        ),
        h('div.kcard__foot',
          owner ? h('span.row.gap-2', { 'data-tip': owner.nome },
            AGIR.avatar(owner, 'xs')) : h('span'),
          h('span.row.gap-2',
            W.slaTag(op),
            h('span.kcard__activity-dot.kcard__activity-dot--' + activityTone, {
              role: 'img', 'aria-label': activityLabel, 'data-tip': activityLabel
            })
          )
        )
      );

      el.addEventListener('dragstart', function (e) {
        if (multiSelect) { e.preventDefault(); return; }
        dragging = true;
        e.dataTransfer.setData('text/plain', op.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-dragging');
        showOutcomeDock(op);
      });
      el.addEventListener('dragend', function () {
        dragging = false; scheduleRefresh();
        el.classList.remove('is-dragging');
        setTimeout(hideOutcomeDock, 0);
      });

      el._signature = cardSignature(op);
      el.updateOpportunity = function (next) { op = next; };
      return el;
    }

    function hideOutcomeDock() {
      var current = D.qs('.pipeline-outcome-dock');
      if (current) current.remove();
    }

    function showOutcomeDock(op) {
      hideOutcomeDock();
      function zone(kind, label, ico, action) {
        var item = h('div.pipeline-outcome-dock__zone.pipeline-outcome-dock__zone--' + kind,
          icon(ico), h('b', { text: label })
        );
        item.addEventListener('dragover', function (event) { event.preventDefault(); item.classList.add('is-over'); });
        item.addEventListener('dragleave', function () { item.classList.remove('is-over'); });
        item.addEventListener('drop', function (event) {
          event.preventDefault(); event.stopPropagation(); hideOutcomeDock(); action();
        });
        return item;
      }
      var won = An.etapas().find(function (item) { return item.tipo === 'ganho'; });
      var lost = An.etapas().find(function (item) { return item.tipo === 'perdido'; });
      document.body.appendChild(h('div.pipeline-outcome-dock',
        zone('won', 'Ganho', 'trophy', function () { if (won) mover(op.id, won.id); }),
        zone('lost', 'Perdido', 'x', function () { if (lost) mover(op.id, lost.id); }),
        zone('delete', 'Excluir', 'trash', function () { excluirOportunidade(op); })
      ));
    }

    function excluirOportunidade(op) {
      UI.confirm({
        title: 'Excluir esta oportunidade?', danger: true, okLabel: 'Excluir',
        text: op.cliente + ' sera removido do funil e preservado no historico de auditoria.'
      }).then(async function (confirmed) {
        if (!confirmed) return;
        try {
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            await global.AGIR_BACKEND.cancelOpportunity({ opportunityId: op.id, expectedVersion: op.version || 1 });
          }
          S().remove('oportunidades', op.id);
          UI.toast.warn('Oportunidade excluida', op.cliente);
          refreshBoardFromRealtime();
        } catch (error) {
          UI.toast.bad('Nao foi possivel excluir', error.message || 'Atualize a tela e tente novamente.');
        }
      });
    }

    function cardMenu(anchor, op) {
      var abertas = An.etapas().filter(function (e) { return e.tipo === 'aberto' && e.id !== op.etapaId; });
      UI.popover(anchor, [
        { label: 'Abrir detalhes', icon: 'eye', onClick: function () { AGIR.pages.oppDrawer(op.id); } },
        { label: 'Registrar toque', icon: 'activity',
          onClick: function () { AGIR.pages.registrarAtividade(op.id, function () { AGIR.router.resolve(); }); } },
        { sep: true },
        { group: 'Mover para' }
      ].concat(abertas.map(function (e) {
        return { label: e.nome, icon: 'arrowRight', onClick: function () { mover(op.id, e.id); } };
      })).concat([
        { sep: true },
        { label: 'Marcar como ganho', icon: 'trophy', onClick: function () { var etapa = An.etapas().find(function (item) { return item.tipo === 'ganho'; }); if (etapa) mover(op.id, etapa.id); } },
        { label: 'Marcar como perdido', icon: 'x', danger: true, onClick: function () { var etapa = An.etapas().find(function (item) { return item.tipo === 'perdido'; }); if (etapa) mover(op.id, etapa.id); } }
      ]), { align: 'right' });
    }

    /* ---------- Mover com desfazer --------------------------------------- */
    function escolherMotivoPerda() {
      return new Promise(function (resolve) {
        var reasons = (S().get('motivosPerda') || []).filter(function (item) { return item.ativo !== false; });
        var radios = reasons.map(function (item, index) {
          return h('label.loss-reason-option',
            h('input', { type: 'radio', name: 'pipeline-loss-reason', value: item.id, autofocus: index === 0 }),
            h('span.loss-reason-option__mark'), h('span', { text: item.nome })
          );
        });
        var settled = false;
        var modal = UI.modal({
          title: 'Por que esta oportunidade foi perdida?',
          body: h('div.field',
            h('label.field__label', { text: 'Motivo da perda' }),
            h('div.loss-reason-list', radios),
            h('div.field__hint', { text: 'Essa informacao melhora os relatorios e as decisoes comerciais.' })
          ),
          footer: function (api) {
            return [
              h('button.btn', { text: 'Cancelar', onClick: function () { settled = true; api.close(); resolve(null); } }),
              h('button.btn.btn--danger', { text: 'Confirmar perda', onClick: function () {
                var selected = D.qs('input[name="pipeline-loss-reason"]:checked', modal.el);
                if (!selected) return UI.toast.warn('Escolha um motivo');
                settled = true; api.close(); resolve(selected.value);
              } })
            ];
          },
          onClose: function () { if (!settled) resolve(null); }
        });
        setTimeout(function () { var first = D.qs('input[name="pipeline-loss-reason"]', modal.el); if (first) first.focus(); }, 80);
      });
    }

    var pendingMoves = new Set();
    async function mover(oppId, etapaId) {
      if (pendingMoves.has(oppId)) return;
      pendingMoves.add(oppId);
      try { await executarMovimento(oppId, etapaId); }
      finally { pendingMoves.delete(oppId); }
    }
    async function executarMovimento(oppId, etapaId) {
      var op = S().byId('oportunidades', oppId);
      if (!op || op.etapaId === etapaId) return;
      op = Object.assign({}, op);
      var e = An.etapaById(etapaId);
      if (!e) return;

      if (e.tipo === 'ganho') {
        var hasPaymentReceipt = (S().get('comprovantesPagamento') || []).some(function (receipt) {
          return receipt.oportunidadeId === oppId;
        });
        if (!hasPaymentReceipt) {
          if (!isAdministrator()) {
            UI.toast.warn('Comprovante de pagamento obrigatorio', 'Abra o lead e anexe o comprovante antes de marcar a venda como ganha.');
            return;
          }
          var confirmedWithoutReceipt = await UI.confirm({
            title: 'Marcar como ganho sem comprovante?',
            text: 'Este lead não possui comprovante de pagamento. Como administrador, você pode concluir a venda mesmo assim. Esta ação ficará registrada no histórico.',
            okLabel: 'Confirmar sem comprovante', cancelLabel: 'Voltar'
          });
          if (!confirmedWithoutReceipt) return;
        }
      }

      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        var lossReasonId = null;
        if (e.tipo === 'perdido') {
          lossReasonId = await escolherMotivoPerda();
          if (!lossReasonId) return;
        }
        try {
          var updated = await global.AGIR_BACKEND.transitionOpportunity({
            opportunityId: oppId,
            targetStageId: etapaId,
            expectedVersion: op.version,
            lossReasonId: lossReasonId
          });
          if (Number((S().byId('oportunidades', oppId) || {}).version || 0) <= Number(updated.version)) S().update('oportunidades', oppId, {
            etapaId: updated.stage_id,
            status: updated.status === 'won' ? 'ganho' : updated.status === 'lost' ? 'perdido' : 'aberto',
            entrouEtapaEm: updated.stage_entered_at,
            atualizadoEm: updated.updated_at,
            fechadoEm: updated.closed_at,
            motivoPerdaId: updated.loss_reason_id,
            version: updated.version,
            comissao: Number(updated.expected_commission)
          });
          var realHistoryChanges = { stage_id: { old: op.etapaId, 'new': updated.stage_id } };
          var previousDbStatus = ({ aberto: 'open', ganho: 'won', perdido: 'lost', cancelado: 'cancelled' })[op.status] || op.status;
          if (previousDbStatus !== updated.status) {
            realHistoryChanges.status = { old: previousDbStatus, 'new': updated.status };
          }
          S().insert('historicoAlteracoes', {
            id: S().uid('hist'), oportunidadeId: oppId,
            alteradoPor: (S().currentUser() || {}).id,
            tipo: 'stage_changed', alteradoEm: updated.updated_at || new Date().toISOString(),
            alteracoes: realHistoryChanges
          });
          if (e.tipo === 'ganho') M.celebrateWin({ client: op.cliente, amount: An.valorCRM(op) });
          UI.toast({
            title: op.cliente + ' - ' + e.nome,
            text: e.tipo === 'ganho' ? 'Estorno solicitado de ' + F.money(An.valorCRM(op)) + ' registrado com seguranca.' : 'Etapa atualizada no funil.',
            tone: e.tipo === 'ganho' ? 'ok' : e.tipo === 'perdido' ? 'warn' : 'info'
          });
          refreshBoardFromRealtime();
        } catch (error) {
          console.error('[pipeline] Falha na transicao.', error);
          var conflict = error && error.code === 'PT409';
          var receiptRequired = error && /comprovante de pagamento/i.test(error.message || '');
          UI.toast.bad(
            conflict ? 'Oportunidade atualizada por outra pessoa' : receiptRequired ? 'Comprovante de pagamento obrigatorio' : 'Nao foi possivel mover',
            conflict ? error.message : receiptRequired ? 'Anexe o comprovante no lead e tente novamente.' : error.message || 'Confira sua conexão e tente novamente.'
          );
          refreshBoardFromRealtime();
        }
        return;
      }

      var antes = {
        etapaId: op.etapaId, status: op.status,
        entrouEtapaEm: op.entrouEtapaEm, fechadoEm: op.fechadoEm,
        motivoPerdaId: op.motivoPerdaId
      };
      var agora = new Date().toISOString();
      S().update('oportunidades', oppId, {
        etapaId: etapaId,
        status: e.tipo === 'aberto' ? 'aberto' : e.tipo,
        entrouEtapaEm: agora,
        atualizadoEm: agora,
        fechadoEm: e.tipo === 'aberto' ? null : agora
      });
      var nextLocalStatus = e.tipo === 'aberto' ? 'aberto' : e.tipo;
      var localHistoryChanges = { stage_id: { old: op.etapaId, 'new': etapaId } };
      if (op.status !== nextLocalStatus) localHistoryChanges.status = { old: op.status, 'new': nextLocalStatus };
      S().insert('historicoAlteracoes', {
        id: S().uid('hist'), oportunidadeId: oppId,
        alteradoPor: (S().currentUser() || {}).id,
        tipo: 'stage_changed', alteradoEm: agora,
        alteracoes: localHistoryChanges
      });
      if (e.tipo === 'ganho') M.celebrateWin({ client: op.cliente, amount: An.valorCRM(op) });
      UI.toast({
        title: op.cliente + ' - ' + e.nome,
        text: e.tipo === 'ganho' ? 'Estorno solicitado de ' + F.money(An.valorCRM(op)) + ' registrado.' :
              e.tipo === 'perdido' ? 'Lembre de informar o motivo da perda.' :
              F.moneyShort(An.valorCRM(op)) + ' em Estorno Solicitado movidos no funil.',
        tone: e.tipo === 'ganho' ? 'ok' : e.tipo === 'perdido' ? 'warn' : 'info',
        action: { label: 'Desfazer', onClick: function () {
          S().update('oportunidades', oppId, antes);
          UI.toast.info('Movimento desfeito');
          refreshBoardFromRealtime();
        } }
      });
      refreshBoardFromRealtime();
    }
    /* ---------- Filtros locais -------------------------------------------- */
    function latestByOpportunity(items, idKey, dateKeys) {
      var map = Object.create(null);
      (items || []).forEach(function (item) {
        var id = item[idKey];
        if (!id) return;
        var value = '';
        dateKeys.some(function (key) { if (item[key]) { value = item[key]; return true; } return false; });
        var time = value ? new Date(value).getTime() : 0;
        if (time > (map[id] || 0)) map[id] = time;
      });
      return map;
    }

    var latestMessages = latestByOpportunity(S().get('mensagensLead'), 'oportunidadeId', ['criadoEm']);
    var latestEvents = latestByOpportunity(S().get('atividades'), 'oportunidadeId', ['data', 'agendadoPara']);
    var sortMessageRevision = S().revision('mensagensLead'), sortActivityRevision = S().revision('atividades');
    function refreshSortIndexes() {
      if (sortMessageRevision !== S().revision('mensagensLead')) {
        latestMessages = latestByOpportunity(S().get('mensagensLead'), 'oportunidadeId', ['criadoEm']);
        sortMessageRevision = S().revision('mensagensLead');
      }
      if (sortActivityRevision !== S().revision('atividades')) {
        latestEvents = latestByOpportunity(S().get('atividades'), 'oportunidadeId', ['data', 'agendadoPara']);
        sortActivityRevision = S().revision('atividades');
      }
    }

    function sortOpportunities(out) {
      return out.sort(function (a, b) {
        if (ordem === 'mensagem') return (latestMessages[b.id] || 0) - (latestMessages[a.id] || 0) || new Date(b.criadoEm) - new Date(a.criadoEm);
        if (ordem === 'evento') return (latestEvents[b.id] || 0) - (latestEvents[a.id] || 0) || new Date(b.atualizadoEm || b.criadoEm) - new Date(a.atualizadoEm || a.criadoEm);
        if (ordem === 'nome') return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR', { sensitivity: 'base' });
        if (ordem === 'venda') return An.valorCRM(b) - An.valorCRM(a) || new Date(b.criadoEm) - new Date(a.criadoEm);
        return new Date(b.criadoEm) - new Date(a.criadoEm);
      });
    }

    function filtrar(itens) {
      return sortOpportunities(itens.slice());
    }

    function visibleOpportunities() {
      var seen = Object.create(null), out = [];
      An.pipeline(f).forEach(function (column) {
        filtrar(column.itens).forEach(function (item) {
          if (!seen[item.id]) { seen[item.id] = true; out.push(item); }
        });
      });
      return out;
    }

    function menu(anchor) {
      UI.popover(anchor, [
        { label: 'Importar', icon: 'upload', onClick: openImportModal },
        { label: 'Exportar', icon: 'download', onClick: function () { exportOpportunities(visibleOpportunities(), 'pipeline'); } },
        { label: 'Localizar duplicatas', icon: 'copy', onClick: openDuplicates },
        { label: 'Selecionar vários', icon: 'checkcircle', checked: multiSelect,
          onClick: function () { multiSelect = true; refreshBoardFromRealtime(); } },
        { sep: true },
        { group: 'Ordenar' },
        { label: 'Pela última mensagem', icon: 'mail', checked: ordem === 'mensagem',
          onClick: function () { AGIR.router.setQuery({ ord: 'mensagem' }); } },
        { label: 'Por último evento', icon: 'activity', checked: ordem === 'evento',
          onClick: function () { AGIR.router.setQuery({ ord: 'evento' }); } },
        { label: 'Por data de criação', icon: 'calendar', checked: ordem === 'criacao',
          onClick: function () { AGIR.router.setQuery({ ord: null }); } },
        { label: 'Por nome', icon: 'users', checked: ordem === 'nome',
          onClick: function () { AGIR.router.setQuery({ ord: 'nome' }); } },
        { label: 'Por venda', icon: 'coins', checked: ordem === 'venda',
          onClick: function () { AGIR.router.setQuery({ ord: 'venda' }); } },
        { sep: true },
        { label: 'Ver como lista', icon: 'rows', onClick: function () { AGIR.router.go('/crm/leads'); } },
        { label: 'Ir para relatórios', icon: 'chart', onClick: function () { AGIR.router.go('/crm/relatorios'); } },
        { label: 'Configurar etapas', icon: 'settings',
          onClick: function () { AGIR.router.go('/config?sec=crm&tab=pipelines'); } }
      ], { align: 'right', minWidth: 260 });
    }

    function downloadCsv(rows, filename) {
      var blob = new Blob([AGIR.leadIO.toCsv(rows)], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var anchor = h('a', { href: url, download: filename });
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function csvMoney(value) {
      return value === null || value === undefined || value === '' ? '' : Number(value).toFixed(2).replace('.', ',');
    }

    function exportOpportunities(items, suffix) {
      items = items || [];
      if (!items.length) return UI.toast.warn('Nenhum lead para exportar', 'Ajuste os filtros ou selecione ao menos um lead.');
      var rows = [[
        'Nome do cliente', 'CPF', 'Telefone', 'E-mail', 'Produto', 'Segmento de cliente', 'Referência do projeto', 'Etiqueta', 'Parceiro de execução', 'Origem',
        'Responsável', 'Etapa', 'Status', 'Valor Inicial', 'Valor Total', 'Valor Final',
        'Estorno solicitado', 'Observações', 'Criado em', 'Última atualização', 'Fechado em'
      ]];
      items.forEach(function (item) {
        rows.push([
          item.cliente, F.cpf(item.cpf), F.phone(item.telefone), item.email || '',
          (S().byId('produtos', item.produtoId) || {}).nome || '',
          (S().byId('convenios', item.convenioId) || {}).nome || '',
          item.matricula || '',
          (item.tags || []).map(function (tagId) { return (S().byId('etiquetas', tagId) || {}).nome; }).filter(Boolean).join(' | '),
          (S().byId('bancos', item.bancoId) || {}).nome || '',
          (S().byId('origens', item.origemId) || {}).nome || '',
          (S().byId('usuarios', item.ownerId) || {}).nome || '',
          (An.etapaById(item.etapaId) || {}).nome || '',
          item.status === 'ganho' ? 'Ganho' : item.status === 'perdido' ? 'Perdido' : 'Em aberto',
          csvMoney(item.valor), csvMoney(item.valorTotal), csvMoney(item.valorFinal),
          csvMoney(item.estornoSolicitado), item.obs || '',
          item.criadoEm ? String(item.criadoEm).slice(0, 10) : '',
          item.atualizadoEm ? String(item.atualizadoEm).slice(0, 10) : '',
          item.fechadoEm ? String(item.fechadoEm).slice(0, 10) : ''
        ]);
      });
      downloadCsv(rows, 'ascensao-leads-' + (suffix || 'pipeline') + '-' + F.iso(new Date()) + '.csv');
      UI.toast.ok('Planilha exportada', items.length + (items.length === 1 ? ' lead exportado.' : ' leads exportados.'));
    }

    function openDuplicates() {
      var groups = AGIR.leadIO.findDuplicates(S().get('oportunidades') || []);
      var modal;
      var body = groups.length ? h('div.col.gap-4',
        h('div.import-summary',
          h('span.badge.badge--warn', { text: groups.length + (groups.length === 1 ? ' grupo' : ' grupos') }),
          h('span.t-small.t-dimmer', { text: 'A comparação usa CPF e telefone. Revise antes de excluir qualquer registro.' })
        ),
        groups.map(function (group, groupIndex) {
          return h('section.duplicate-group',
            h('div.row.between.gap-3',
              h('div', h('b', { text: 'Grupo ' + (groupIndex + 1) }),
                h('div.t-tiny.t-dimmer', { text: group.reasons.join(' e ') })),
              h('span.badge', { text: group.items.length + ' leads' })
            ),
            h('div.col.gap-2', group.items.map(function (item) {
              return h('button.duplicate-lead', { onClick: function () { modal.close(); AGIR.pages.oppDrawer(item.id); } },
                h('span.grow',
                  h('b', { text: item.cliente }),
                  h('span.t-tiny.t-dimmer', { text: F.cpfMask(item.cpf) + '  -  ' + F.phone(item.telefone) })),
                h('span.t-small', { 'data-tip': 'Estorno solicitado', text: F.money0(An.valorCRM(item)) }), icon('chevRight')
              );
            }))
          );
        })
      ) : UI.empty({
        icon: 'checkcircle', title: 'Nenhuma duplicata encontrada',
        text: 'Nao encontramos CPF ou telefone repetido entre os leads ativos.'
      });
      modal = UI.modal({
        title: 'Localizar duplicatas',
        sub: 'Encontre cadastros que podem representar a mesma pessoa.', wide: true,
        body: body,
        footer: function (api) {
          return [
            groups.length ? h('button.btn', { onClick: function () {
              selected = Object.create(null);
              groups.forEach(function (group) { group.items.forEach(function (item) { selected[item.id] = true; }); });
              multiSelect = true; api.close(); refreshBoardFromRealtime();
            } }, icon('checkcircle'), h('span', { text: 'Selecionar duplicatas' })) : null,
            h('div.spacer'), h('button.btn.btn--primary', { text: 'Concluir', onClick: api.close })
          ];
        }
      });
    }

    function openImportModal() {
      var IO = AGIR.leadIO;
      var state = {
        step: 'file', file: null, parsed: null, mapped: null,
        columnMapping: [], catalogMappings: {}, catalogIssues: [], validated: [],
        skipDuplicates: true, importing: false, finished: false,
        done: 0, total: 0, imported: [], failures: [], tagFailures: []
      };
      var fileInput = h('input', { type: 'file', accept: '.csv,text/csv', style: { display: 'none' } });
      var importButton, importButtonLabel, cancelButton, modal, modalApi;
      var progressValue, progressBar, progressTimer = null;
      var preparation = AGIR.createImportTask && AGIR.createImportTask(), preparing = false, closed = false;
      async function prepare(method, args) {
        return preparation ? preparation.run(method, args) : IO[method].apply(IO, args);
      }
      async function preparationAction(action) {
        if (closed || preparing || state.importing) return;
        preparing = true;
        if (modal) { modal.body.inert = true; importButton.disabled = true; cancelButton.disabled = true; importButtonLabel.textContent = 'Preparando...'; }
        try { await action(); }
        catch (error) { if (!closed && error.name !== 'AbortError') UI.toast.bad('Não foi possível preparar a planilha', error.message); }
        finally { preparing = false; if (!closed && modal) { modal.body.inert = false; renderBody(); } }
      }

      function defaultSource(list) {
        return (list || []).find(function (item) {
          return item.ativo !== false && (item.codigo === 'active_prospecting' || IO.normalize(item.nome) === 'prospeccao ativa');
        }) || null;
      }

      function context() {
        var sources = S().get('origens') || [];
        return {
          products: S().get('produtos') || [], conventions: S().get('convenios') || [], banks: S().get('bancos') || [],
          sources: sources, users: S().get('usuarios') || [], stages: An.etapas(), tags: S().get('etiquetas') || [],
          existing: (S().get('oportunidades') || []).map(function (row) {
            return { cpf: row.cpf, telefone: row.telefone, matricula: row.matricula, ownerId: row.ownerId };
          }), catalogMappings: state.catalogMappings,
          defaultSource: defaultSource(sources), defaultOwner: S().currentUser(),
          defaultStage: An.etapas().find(function (item) { return item.tipo === 'aberto'; })
        };
      }

      function eligibleRows() {
        return state.validated.filter(function (row) {
          return !row.errors.length && !(state.skipDuplicates && row.duplicate);
        });
      }

      function downloadTemplate() {
        var ctx = context();
        var product = (ctx.products || []).find(function (item) { return item.ativo !== false; });
        var bank = (ctx.banks || []).find(function (item) { return item.ativo !== false; });
        var convention = (ctx.conventions || []).find(function (item) { return item.ativo !== false; });
        var tag = (ctx.tags || []).find(function (item) { return item.ativo !== false; });
        downloadCsv(IO.templateRows({
          product: product && product.nome, convention: convention && convention.nome, bank: bank && bank.nome,
          tag: tag && tag.nome,
          source: ctx.defaultSource && ctx.defaultSource.nome,
          owner: ctx.defaultOwner && (ctx.defaultOwner.email || ctx.defaultOwner.nome),
          stage: ctx.defaultStage && ctx.defaultStage.nome
        }), 'modelo-importacao-leads-ascensao.csv');
        UI.toast.ok('Modelo baixado', 'Abra no Excel ou Google Planilhas e salve como CSV UTF-8.');
      }

      async function readFile(file) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return UI.toast.bad('Arquivo muito grande', 'Use um CSV de ate 2 MB e 500 linhas por vez.');
        if (!/\.csv$/i.test(file.name || '') && !/csv/i.test(file.type || '')) {
          return UI.toast.bad('Formato não suportado', 'Salve a planilha como CSV UTF-8 antes de importar.');
        }
        try {
          var contents = await file.text();
          if (closed) return;
          var parsed = await prepare('parseCsv', [contents]);
          if (closed) return;
          state.file = file; state.parsed = parsed; state.mapped = null;
          state.columnMapping = parsed.mapping.slice(); state.catalogMappings = {};
          state.catalogIssues = []; state.validated = []; state.step = 'columns';
          state.finished = false; state.imported = []; state.failures = []; state.tagFailures = [];
          if (parsed.dataRows.length > 500) UI.toast.bad('Limite excedido', 'Divida a planilha em arquivos de no maximo 500 linhas.');
          renderBody();
        } catch (error) {
          if (closed || error.name === 'AbortError') return;
          console.error('[pipeline] Falha ao ler CSV.', error);
          UI.toast.bad('Não foi possível ler a planilha', 'Confira se o arquivo foi salvo como CSV UTF-8.');
        }
      }

      function fileHeader() {
        var delimiter = state.parsed && state.parsed.delimiter === '\t' ? 'tabulação' : state.parsed && state.parsed.delimiter === ';' ? 'ponto e vírgula' : 'vírgula';
        return h('div.import-file', icon('filetext'), h('div.grow',
          h('b', { text: state.file.name }),
          h('div.t-tiny.t-dimmer', { text: (state.parsed.dataRows || []).length + ' linhas · separador: ' + delimiter })),
          !state.importing ? h('button.btn.btn--sm.btn--ghost', { onClick: function () { fileInput.value = ''; fileInput.click(); } }, icon('refresh'), h('span', { text: 'Trocar arquivo' })) : null,
          fileInput
        );
      }

      function stepper() {
        var steps = [
          { key: 'columns', label: '1. Colunas' }, { key: 'catalogs', label: '2. Valores' },
          { key: 'review', label: '3. Revisão' }
        ];
        var order = { columns: 1, catalogs: 2, review: 3, finished: 3 };
        var current = order[state.step] || 0;
        return h('div.import-stepper', steps.map(function (item, index) {
          return h('span' + (index + 1 === current ? '.is-active' : index + 1 < current ? '.is-done' : ''),
            index + 1 < current ? icon('check') : null, h('b', { text: item.label }));
        }));
      }

      function initialBody() {
        var drop = h('button.import-dropzone', { type: 'button', onClick: function () { fileInput.click(); } },
          h('span.import-dropzone__icon', icon('upload')),
          h('b', { text: 'Arraste o arquivo CSV aqui' }),
          h('span.t-small.t-dimmer', { text: 'Você poderá relacionar as colunas antes de importar · limite de 500 linhas e 2 MB' }),
          h('span.btn.btn--sm', { text: 'Escolher planilha' }), fileInput
        );
        ['dragenter', 'dragover'].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add('is-over'); }); });
        ['dragleave', 'drop'].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.remove('is-over'); }); });
        drop.addEventListener('drop', function (event) {
          var file = event.dataTransfer.files && event.dataTransfer.files[0];
          preparationAction(function () { return readFile(file); });
        });
        return h('div.col.gap-5', drop,
          h('div.import-instructions', h('div.import-instructions__icon', icon('shuffle')),
            h('div.grow', h('b', { text: 'Não precisa usar nomes idênticos aos do CRM' }),
              h('p.t-small.t-dimmer', { text: 'Na próxima etapa você escolhe o destino de cada coluna. Somente nome e CPF são obrigatórios.' })),
            h('button.btn.btn--sm', { onClick: downloadTemplate }, icon('download'), h('span', { text: 'Baixar modelo' }))
          ));
      }

      function setColumnMapping(index, value) {
        if (value) state.columnMapping = state.columnMapping.map(function (current, currentIndex) {
          return currentIndex !== index && current === value ? null : current;
        });
        state.columnMapping[index] = value || null;
        renderBody();
      }

      function columnMappingBody() {
        var samples = (state.parsed.dataRows || []).slice(0, 2);
        return h('div.col.gap-4', fileHeader(), stepper(),
          h('div.import-guide', icon('info'), h('div',
            h('b', { text: 'Relacione as colunas da planilha' }),
            h('p.t-small.t-dimmer', { text: 'O sistema fez uma sugestão automática. Revise e altere o que for necessário.' }))),
          h('div.import-column-grid', state.parsed.headers.map(function (header, index) {
            var selected = state.columnMapping[index] || '';
            return h('section.import-column-map' + (selected ? '.is-mapped' : ''),
              h('div.import-column-map__head', h('b', { text: header || 'Coluna ' + (index + 1) }),
                selected ? h('span.badge.badge--ok', { text: 'Mapeada' }) : h('span.badge', { text: 'Ignorada' })),
              h('div.import-column-map__samples', samples.map(function (row) {
                return h('span.t-tiny.t-dimmer', { text: String(row[index] || '—') });
              })),
              h('select.select', { 'aria-label': 'Destino da coluna ' + header, onChange: function () { setColumnMapping(index, this.value); } },
                h('option', { value: '', text: 'Não importar', selected: !selected }),
                IO.COLUMNS.map(function (column) {
                  return h('option', { value: column.key, selected: column.key === selected,
                    text: column.label + (column.required ? ' *' : '') });
                })
              )
            );
          }))
        );
      }

      function catalogDecision(issue) {
        return ((state.catalogMappings[issue.key] || {})[issue.normalized]) || '';
      }

      function setCatalogDecision(issue, value) {
        state.catalogMappings[issue.key] = state.catalogMappings[issue.key] || {};
        state.catalogMappings[issue.key][issue.normalized] = value;
        renderBody();
      }

      function tagColor(value) {
        var palette = ['#FF9800', '#22C55E', '#3B82F6', '#A855F7', '#EC4899', '#14B8A6', '#EAB308', '#EF4444'];
        var hash = 0;
        String(value || '').split('').forEach(function (char) { hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0; });
        return palette[Math.abs(hash) % palette.length];
      }

      function createTagForIssue(issue) {
        var nameInput = h('input.input', { value: issue.raw, maxlength: 40, autofocus: true, 'aria-label': 'Nome da nova etiqueta' });
        var colorInput = h('input.tag-manager__new-color', { type: 'color', value: tagColor(issue.raw), 'aria-label': 'Cor da nova etiqueta' });
        var saving = false;
        UI.modal({
          title: 'Criar etiqueta',
          sub: 'A nova etiqueta será criada e aplicada às linhas com este mesmo valor.',
          body: h('div.col.gap-4',
            h('div.import-tag-source', icon('filetext'), h('div',
              h('span.t-tiny.t-dimmer', { text: 'Valor encontrado na planilha' }),
              h('b', { text: issue.raw })
            )),
            h('div.field', h('label.field__label', h('span', { text: 'Nome da etiqueta' }), h('span.field__required', { text: '*' })), nameInput),
            h('div.field', h('label.field__label', { text: 'Cor' }), colorInput,
              h('div.field__hint', { text: 'A cor aparecerá no card do pipeline e dentro do lead.' }))
          ),
          footer: function (api) {
            var saveButton = h('button.btn.btn--primary', { onClick: async function () {
              if (saving) return;
              var name = nameInput.value.trim();
              if (!name) return UI.toast.warn('Informe o nome da etiqueta');
              saving = true; saveButton.disabled = true;
              try {
                var mapped;
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  var saved = await global.AGIR_BACKEND.saveTag({
                    organizationId: S().get('session.organizationId'), name: name, color: colorInput.value.toUpperCase()
                  });
                  mapped = { id: saved.id, nome: saved.name, cor: saved.color, ativo: saved.active !== false };
                  if (S().byId('etiquetas', mapped.id)) S().update('etiquetas', mapped.id, mapped);
                  else S().insert('etiquetas', mapped);
                } else {
                  mapped = (S().get('etiquetas') || []).find(function (tag) { return IO.normalize(tag.nome) === IO.normalize(name); });
                  if (!mapped) mapped = S().insert('etiquetas', { nome: name, cor: colorInput.value.toUpperCase(), ativo: true });
                }
                state.catalogIssues.filter(function (item) { return item.key === 'tag'; }).forEach(function (item) {
                  if (!item.options.some(function (option) { return option.id === mapped.id; })) item.options.push(mapped);
                });
                api.close();
                setCatalogDecision(issue, mapped.id);
                UI.toast.ok('Etiqueta criada', mapped.nome + ' será aplicada durante a importação.');
              } catch (error) {
                UI.toast.bad('Não foi possível criar a etiqueta', error.message || 'Revise os dados e tente novamente.');
                saving = false; saveButton.disabled = false;
              }
            } }, icon('plus'), h('span', { text: 'Criar e vincular' }));
            return [h('button.btn', { text: 'Cancelar', onClick: api.close }), saveButton];
          }
        });
      }

      function catalogMappingBody() {
        return h('div.col.gap-4', fileHeader(), stepper(),
          h('div.import-guide', icon('link'), h('div',
            h('b', { text: 'Associe os valores aos cadastros do CRM' }),
            h('p.t-small.t-dimmer', { text: 'Confirme as sugestões. Esta associação será aplicada a todas as linhas com o mesmo valor.' }))),
          h('div.import-catalog-list', state.catalogIssues.map(function (issue) {
            var selected = catalogDecision(issue);
            var defaultText = issue.key === 'owner' || issue.key === 'stage' || issue.key === 'source'
              ? 'Usar padrão automático' : issue.key === 'tag' ? 'Não aplicar esta etiqueta' : 'Deixar este valor em branco';
            return h('div.import-catalog-map' + (selected ? '.is-mapped' : ''),
              h('div.import-catalog-map__source', h('span.t-tiny.t-dimmer', { text: issue.label + ' na planilha' }),
                h('b', { text: issue.raw })), icon('arrowRight'),
              h('div.import-catalog-map__target', h('span.t-tiny.t-dimmer', { text: 'Usar no CRM' }),
                h('div.import-catalog-map__controls',
                  h('select.select', { 'aria-label': 'Associar ' + issue.raw, onChange: function () { setCatalogDecision(issue, this.value); } },
                    h('option', { value: '', text: 'Selecione uma opção', selected: !selected }),
                    h('option', { value: '__ignore__', text: defaultText, selected: selected === '__ignore__' }),
                    issue.options.map(function (item) {
                      return h('option', { value: item.id, selected: selected === item.id,
                        text: item.nome + (item.email ? ' · ' + item.email : '') });
                    })
                  ),
                  issue.creatable ? h('button.btn.btn--sm.import-catalog-map__create', {
                    type: 'button', onClick: function () { createTagForIssue(issue); }
                  }, icon('plus'), h('span', { text: 'Criar nova' })) : null
                )
              ),
              issue.suggestedId && selected === issue.suggestedId ? h('span.badge.badge--brand', { text: 'Sugestão' }) : null
            );
          }))
        );
      }

      function summaryCard(value, label, tone) {
        return h('div.import-stat' + (tone ? '.import-stat--' + tone : ''),
          h('b', { text: value }), h('span', { text: label }));
      }

      function previewTable() {
        var rows = state.validated.slice(0, 40);
        return h('div.import-preview.table-wrap', h('table.table',
          h('thead', h('tr', h('th', { text: 'Linha' }), h('th', { text: 'Cliente' }), h('th', { text: 'CPF' }),
            h('th', { text: 'Produto' }), h('th', { text: 'Segmento de cliente' }), h('th', { text: 'Etiqueta' }), h('th', { text: 'Origem' }), h('th', { text: 'Situação' }))),
          h('tbody', rows.map(function (row) {
            var status = row.errors.length ? row.errors.join(' · ') : row.duplicate ? row.warnings.join(' · ') : 'Pronto para importar';
            var tone = row.errors.length ? 'bad' : row.duplicate ? 'warn' : 'ok';
            return h('tr.import-row--' + tone,
              h('td', { text: row.line }), h('td', h('b', { text: row.value.name || '—' })),
              h('td', { text: row.value.cpf ? F.cpfMask(row.value.cpf) : '—' }),
              h('td', { text: (row.value.product || {}).nome || '—' }),
              h('td', { text: (row.value.convention || {}).nome || '—' }),
              h('td', { text: (row.value.tags || []).map(function (tag) { return tag.nome; }).join(' | ') || '—' }),
              h('td', { text: (row.value.source || {}).nome || '—' }),
              h('td', h('span.badge.badge--' + tone, { text: status }))
            );
          }))), state.validated.length > 40 ? h('div.import-preview__more', { text: 'Mostrando 40 de ' + state.validated.length + ' linhas.' }) : null);
      }

      function resultBody() {
        var invalid = state.validated.filter(function (row) { return row.errors.length; }).length;
        var duplicates = state.validated.filter(function (row) { return row.duplicate && !row.errors.length; }).length;
        var ready = eligibleRows().length;
        return h('div.col.gap-4', fileHeader(), stepper(),
          h('div.import-stats', summaryCard(state.validated.length, 'linhas', ''), summaryCard(ready, 'prontas', 'ok'),
            summaryCard(duplicates, 'duplicadas', 'warn'), summaryCard(invalid, 'com erro', 'bad')),
          duplicates ? h('label.import-duplicate-toggle',
            h('input', { type: 'checkbox', checked: state.skipDuplicates, disabled: state.importing,
              onChange: function () { state.skipDuplicates = this.checked; renderBody(); } }),
            h('span', h('b', { text: 'Ignorar linhas duplicadas' }),
              h('span.t-tiny.t-dimmer', { text: 'Recomendado: ignora apenas CPF + referência do projeto repetidos para o mesmo responsável. Projetos ou carteiras diferentes são permitidos.' }))) : null,
          state.importing || state.finished ? h('div.import-progress',
            h('div.row.between', h('b', { text: state.finished ? 'Importação concluída' : 'Importando com segurança...' }),
              progressValue = h('span.t-small.t-dimmer', { text: state.done + ' de ' + state.total })),
            h('div.progress', progressBar = h('span', { style: { width: (state.total ? Math.round(state.done / state.total * 100) : 0) + '%' } })),
            state.finished ? h('div.t-small', { text: state.imported.length + ' importados, ' + state.failures.length + ' falharam e ' + (invalid + (state.skipDuplicates ? duplicates : 0)) + ' ignorados.' }) : null) : null,
          state.finished && state.failures.length ? h('div.insight.insight--bad', icon('alert'), h('div.grow',
            h('b', { text: 'Falhas durante a gravação' }),
            h('div.t-small', { text: state.failures.slice(0, 12).map(function (item) { return 'Linha ' + item.line + ': ' + item.message; }).join(' | ') }),
            state.failures.length > 12 ? h('div.t-tiny', { text: 'Mais ' + (state.failures.length - 12) + ' falhas não exibidas.' }) : null)) : null,
          state.finished && state.tagFailures.length ? h('div.insight.insight--warn', icon('tag'), h('div.grow',
            h('b', { text: 'Algumas etiquetas não puderam ser aplicadas' }),
            h('div.t-small', { text: state.tagFailures.slice(0, 8).map(function (item) { return 'Linha ' + item.line + ': ' + item.message; }).join(' | ') })
          )) : null,
          previewTable()
        );
      }

      async function prepareCatalogs() {
        state.catalogMappings = {};
        state.mapped = IO.mapColumns(state.parsed, state.columnMapping);
        if (state.mapped.missingHeaders.length) {
          UI.toast.warn('Mapeie os campos obrigatórios', state.mapped.missingHeaders.join(', ') + '.'); return;
        }
        if (state.mapped.rows.length > 500) return UI.toast.bad('Limite excedido', 'Divida a planilha em arquivos de no máximo 500 linhas.');
        var issues = await prepare('unmatchedCatalogValues', [state.mapped.rows, context()]);
        if (closed) return;
        state.catalogIssues = issues;
        state.catalogIssues.forEach(function (issue) {
          if (!issue.suggestedId) return;
          state.catalogMappings[issue.key] = state.catalogMappings[issue.key] || {};
          state.catalogMappings[issue.key][issue.normalized] = issue.suggestedId;
        });
        if (state.catalogIssues.length) state.step = 'catalogs';
        else await prepareReview();
        renderBody();
      }

      async function prepareReview() {
        if (state.catalogIssues.some(function (issue) { return !catalogDecision(issue); })) {
          UI.toast.warn('Conclua as associações', 'Escolha um destino para cada valor diferente.'); return;
        }
        var validated = await prepare('validateRows', [state.mapped.rows, context()]);
        if (closed) return;
        state.validated = validated;
        state.step = 'review'; renderBody();
      }

      function renderBody() {
        if (!modal || closed || preparing) return;
        var body = state.step === 'file' ? initialBody()
          : state.step === 'columns' ? columnMappingBody()
          : state.step === 'catalogs' ? catalogMappingBody() : resultBody();
        D.mount(modal.body, body);
        var count = eligibleRows().length;
        var missingColumn = state.step === 'columns' &&
          (state.columnMapping.indexOf('name') < 0 || state.columnMapping.indexOf('cpf') < 0);
        var unresolved = state.step === 'catalogs' && state.catalogIssues.some(function (issue) { return !catalogDecision(issue); });
        if (importButton) {
          importButton.disabled = Boolean(state.importing || state.step === 'file' || missingColumn || unresolved ||
            (state.step === 'review' && !count));
          importButtonLabel.textContent = state.importing ? 'Importando...'
            : state.step === 'columns' ? 'Continuar'
            : state.step === 'catalogs' ? 'Revisar importação'
            : state.finished ? 'Concluir'
            : state.step === 'review' ? 'Importar ' + count + (count === 1 ? ' lead' : ' leads') : 'Escolha uma planilha';
        }
        if (cancelButton) {
          cancelButton.disabled = state.importing;
          cancelButton.textContent = state.finished ? 'Fechar' : state.step === 'file' ? 'Cancelar' : 'Voltar';
        }
      }

      function friendlyImportError(error) {
        var message = String(error && error.message || 'Erro desconhecido');
        if (/create_opportunity_v3|schema cache|PGRST202/i.test(message)) {
          return 'Integração do banco desatualizada. Atualize a página e tente novamente.';
        }
        return message.length > 220 ? message.slice(0, 217) + '...' : message;
      }

      async function importOne(row) {
        var value = row.value;
        var now = new Date().toISOString();
        var pipeline = (S().get('pipelines') || [])[0];
        var base = {
          pipelineId: pipeline && pipeline.id,
          titulo: (value.product ? value.product.nome : 'Lead') + ' - ' + value.name.split(' ')[0], cliente: value.name,
          cpf: value.cpf, telefone: value.phone, email: '', uf: '', cidade: '',
          produtoId: value.product && value.product.id, convenioId: value.convention && value.convention.id,
          matricula: value.registration || '',
          bancoId: value.bank && value.bank.id,
          origemId: value.source && value.source.id, empresaId: null,
          valor: value.initialValue, valorTotal: value.totalValue, valorFinal: value.finalValue,
          estornoSolicitado: value.requestedReversal,
          comissao: value.product ? Math.round(value.initialValue * (Number(value.product.comissaoPct) || 0) / 100) : 0,
          ownerId: value.owner.id, etapaId: value.stage.id, status: 'aberto', motivoPerdaId: null,
          criadoEm: now, entrouEtapaEm: now, atualizadoEm: now, fechadoEm: null,
          previsaoFechamento: null, tags: (value.tags || []).map(function (tag) { return tag.id; }), obs: value.notes, version: 1
        };
        if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
          var saved = await global.AGIR_BACKEND.createOpportunity({
            organizationId: S().get('session.organizationId'), ownerId: base.ownerId,
            pipelineId: base.pipelineId, stageId: base.etapaId, productId: base.produtoId,
            conventionId: base.convenioId,
            registrationNumber: base.matricula,
            bankId: base.bancoId, sourceId: base.origemId, fullName: base.cliente,
            phone: base.telefone, cpf: base.cpf, amount: base.valor, expectedCloseDate: null,
            totalValue: base.valorTotal, finalValue: base.valorFinal,
            requestedReversal: base.estornoSolicitado, notes: base.obs, companyId: null
          });
          if (base.tags.length) {
            try {
              await global.AGIR_BACKEND.setOpportunityTags({ opportunityId: saved.id, tagIds: base.tags });
            } catch (tagError) {
              state.tagFailures.push({ line: row.line, message: tagError.message || 'Etiqueta não aplicada.' });
              base.tags = [];
            }
          }
          return Object.assign(base, {
            id: saved.id, contatoId: saved.contact_id, titulo: saved.title,
            comissao: Number(saved.expected_commission), criadoEm: saved.created_at,
            entrouEtapaEm: saved.stage_entered_at, atualizadoEm: saved.updated_at,
            version: saved.version
          });
        }
        return base;
      }

      async function runImport() {
        if (state.finished) { modal.close(); AGIR.router.resolve(); return; }
        if (state.importing) return;
        var rows = eligibleRows();
        if (!rows.length) return UI.toast.warn('Nenhuma linha pronta para importar');
        state.importing = true; state.done = 0; state.total = rows.length; state.imported = []; state.failures = []; state.tagFailures = [];
        renderBody();
        var cursor = 0;
        async function worker() {
          while (cursor < rows.length) {
            var row = rows[cursor++];
            try { state.imported.push(await importOne(row)); }
            catch (error) { state.failures.push({ line: row.line, message: friendlyImportError(error) }); }
            state.done++;
            if (!progressTimer && !document.hidden) progressTimer = setTimeout(function () {
              progressTimer = null;
              if (!modal.body.isConnected || document.hidden) return;
              if (progressValue) progressValue.textContent = state.done + ' de ' + state.total;
              if (progressBar) progressBar.style.width = (state.total ? state.done / state.total * 100 : 0) + '%';
            }, 250);
          }
        }
        await Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker));
        clearTimeout(progressTimer); progressTimer = null;
        if (state.imported.length) S().batch(function () { state.imported.forEach(function (item) {
          var current = item.id && S().byId('oportunidades', item.id);
          if (!current) S().insert('oportunidades', item);
          else if (Number(current.version) <= Number(item.version)) S().update('oportunidades', item.id, item);
        }); });
        state.importing = false; state.finished = true; state.step = 'finished'; renderBody();
        if (state.failures.length || state.tagFailures.length) UI.toast.warn('Importação concluída com alertas', state.imported.length + ' leads criados, ' + state.failures.length + ' falharam e ' + state.tagFailures.length + ' tiveram alerta de etiqueta.');
        else UI.toast.ok('Importação concluída', state.imported.length + (state.imported.length === 1 ? ' lead criado.' : ' leads criados.'));
        refreshBoardFromRealtime();
      }

      function handlePrimary() {
        if (preparing || closed) return;
        if (state.step === 'columns') return preparationAction(prepareCatalogs);
        if (state.step === 'catalogs') return preparationAction(prepareReview);
        if (state.step === 'review') return runImport();
        if (state.finished && modalApi) { modalApi.close(); AGIR.router.resolve(); }
      }

      function handleSecondary() {
        if (state.importing || preparing) return;
        if (state.step === 'file' || state.finished) return modalApi.close();
        if (state.step === 'columns') state.step = 'file';
        else if (state.step === 'catalogs') state.step = 'columns';
        else if (state.step === 'review') state.step = state.catalogIssues.length ? 'catalogs' : 'columns';
        renderBody();
      }

      modal = UI.modal({
        title: 'Importar leads por planilha',
        sub: 'Mapeie colunas, associe valores e revise antes de gravar.', wide: true,
        onClose: function () { closed = true; if (preparation) preparation.cancel(); clearTimeout(progressTimer); },
        body: h('div'),
        footer: function (api) {
          modalApi = api;
          importButtonLabel = h('span', { text: 'Escolha uma planilha' });
          importButton = h('button.btn.btn--primary', { disabled: true, onClick: handlePrimary }, icon('arrowRight'), importButtonLabel);
          return [
            h('button.btn.btn--ghost', { onClick: downloadTemplate }, icon('download'), h('span', { text: 'Baixar modelo' })),
            h('div.spacer'), cancelButton = h('button.btn', { text: 'Cancelar', onClick: handleSecondary }), importButton
          ];
        }
      });
      fileInput.addEventListener('change', function () {
        var file = this.files && this.files[0];
        preparationAction(function () { return readFile(file); });
      });
      renderBody();
    }

    function skeleton() {
      return h('div.col.gap-5',
        UI.skeletonCards(4),
        h('div.kanban', Array.from({ length: 6 }, function () {
          return h('div.kcol', { style: { padding: 'var(--sp-3)' } },
            h('div.sk.sk--title', { style: { width: '60%', marginBottom: 'var(--sp-4)' } }),
            h('div.col.gap-3', Array.from({ length: 4 }, function () {
              return h('div.sk', { style: { height: '78px', borderRadius: 'var(--r-md)' } });
            }))
          );
        }))
      );
    }
  };

  function debounce(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
})(window);
