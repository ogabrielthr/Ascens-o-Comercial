/* ==========================================================================
   AGIR — CRM / Atividades, Automações e E-mails
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  /* ==========================================================================
     ATIVIDADES — agenda de hoje + histórico
     ========================================================================== */
  AGIR.pages.crmAtividades = function (node, ctx) {
    var q = ctx.query || {};
    var f = W.readFilters(q);
    var vista = q.v === 'historico' ? 'historico' : 'agenda';
    var inicioHoje, fimHoje, inicioAmanha, fimAmanha, fimProximaSemana;
    var oportunidadesById, usuariosById, grupos, agenda, atrasadas, totalDoDia, progressoHoje;
    var renderLimits = { urgent: 8, today: 12, tomorrow: 6, week: 6, future: 12 };
    var activeSearch = '';
    var selectedGroup = 'all';
    var concluidasHoje = 0;
    var disposed = false, refreshTimer, dayTimer, needsRefresh = false;
    var cardCache = new Map(), columns = {}, summaryNodes = {};
    node.classList.add('activity-workspace');
    node.dataset.density = 'compact';
    collectActivities();

    function collectActivities() {
    inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
    fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
    inicioAmanha = F.addDays(inicioHoje, 1); inicioAmanha.setHours(0, 0, 0, 0);
    fimAmanha = F.addDays(inicioAmanha, 1); fimAmanha.setMilliseconds(-1);
    fimProximaSemana = F.addDays(fimHoje, 7);
    oportunidadesById = S().indexBy('oportunidades');
    usuariosById = S().indexBy('usuarios');
    grupos = { urgent: [], today: [], tomorrow: [], week: [], future: [] };
    concluidasHoje = 0;

    An.acts(f).forEach(function (a) {
      var d = F.toDate(a.agendadoPara || a.data);
      if (!estaPendente(a)) {
        var realizadaEm = F.toDate(a.data);
        if (realizadaEm >= inicioHoje && realizadaEm <= fimHoje) concluidasHoje++;
        return;
      }
      if (d < inicioHoje) grupos.urgent.push(a);
      else if (d <= fimHoje) grupos.today.push(a);
      else if (d <= fimAmanha) grupos.tomorrow.push(a);
      else if (d <= fimProximaSemana) grupos.week.push(a);
      else grupos.future.push(a);
    });
    Object.keys(grupos).forEach(function (key) {
      grupos[key].sort(function (a, b) {
        return new Date(a.agendadoPara || a.data) - new Date(b.agendadoPara || b.data);
      });
    });
    agenda = grupos.today;
    atrasadas = grupos.urgent;
    totalDoDia = agenda.length + concluidasHoje;
    progressoHoje = totalDoDia ? Math.round((concluidasHoje / totalDoDia) * 100) : 100;
    }

    node.appendChild(W.pageHead({
      icon: 'activity',
      title: 'Atividades',
      actions: [
        h('button.btn.btn--primary', {
          onClick: function () { AGIR.pages.registrarAtividade(null, refreshActivities); }
        }, icon('plus'), h('span', { text: 'Nova atividade' }))
      ]
    }));

    node.appendChild(activityToolbar());

    if (vista === 'historico') {
      node.appendChild(historico());
      return;
    }

    node.appendChild(resumoOperacional());
    var kanbanHost = h('div.activity-board-host');
    node.appendChild(kanbanHost);
    renderKanban('');
    global.addEventListener('ascensao:crm-refreshed', onCrmRefresh);
    global.document.addEventListener('visibilitychange', onVisible);
    scheduleDay();
    if (typeof AGIR.onPageDispose === 'function') AGIR.onPageDispose(function () {
      disposed = true;
      global.clearTimeout(refreshTimer);
      global.clearTimeout(dayTimer);
      global.removeEventListener('ascensao:crm-refreshed', onCrmRefresh);
      global.document.removeEventListener('visibilitychange', onVisible);
      cardCache.clear();
    });

    function onCrmRefresh(event) {
      var detail = event.detail || {};
      if (!detail.full && detail.table && ['activities', 'opportunities', 'profiles', 'teams', 'atividades', 'oportunidades', 'usuarios', 'equipes'].indexOf(detail.table) < 0) return;
      scheduleRefresh();
    }
    function scheduleRefresh() {
      needsRefresh = true;
      if (disposed || refreshTimer || global.document.hidden) return;
      refreshTimer = global.setTimeout(function () { refreshTimer = null; refreshActivities(); }, 100);
    }
    function onVisible() { if (!global.document.hidden) { refreshActivities(); scheduleDay(); } }
    function scheduleDay() {
      global.clearTimeout(dayTimer);
      var tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 25);
      dayTimer = global.setTimeout(function () { refreshActivities(); scheduleDay(); }, tomorrow - new Date());
    }
    function refreshActivities() {
      if (disposed || !node.isConnected) return;
      if (global.document.hidden) { needsRefresh = true; return; }
      needsRefresh = false;
      var finishMeasurement = AGIR.perf ? AGIR.perf.start('activity.update') : function () {};
      collectActivities();
      updateSummary();
      renderKanban(activeSearch);
      finishMeasurement();
    }

    function commandHero() {
      var proxima = atrasadas[0] || agenda[0] || grupos.tomorrow[0] || grupos.week[0] || grupos.future[0];
      var proximaOp = proxima && oportunidadesById[proxima.oportunidadeId];
      var proximaTone = atrasadas[0] === proxima ? 'urgent'
        : agenda[0] === proxima ? 'today'
          : grupos.tomorrow[0] === proxima ? 'tomorrow'
            : grupos.week[0] === proxima ? 'week' : 'future';
      var dia = F.weekdayLong(new Date());
      return h('section.activity-command',
        h('div.activity-command__copy',
          h('span.activity-command__eyebrow', icon('sparkles'), h('span', { text: dia })),
          h('h2', { text: atrasadas.length ? 'Comece pelo que exige atenção' : 'Seu dia está organizado' }),
          h('p', { text: atrasadas.length
            ? F.num(atrasadas.length) + (atrasadas.length === 1 ? ' atividade atrasada precisa' : ' atividades atrasadas precisam') + ' ser resolvida' + (atrasadas.length === 1 ? '' : 's') + ' antes de avançar na agenda.'
            : agenda.length ? 'Você tem ' + F.plural(agenda.length, 'atividade') + ' planejada para hoje.'
              : 'Nenhuma pendência crítica. Use o tempo livre para criar o próximo movimento.' })
        ),
        h('div.activity-command__next',
          h('span.activity-command__next-label', { text: proxima ? 'Próxima ação' : 'Operação em dia' }),
          proxima ? h('button.activity-command__next-action', {
            onClick: function () { if (proximaOp) AGIR.pages.oppDrawer(proximaOp.id); }
          },
            h('span.activity-command__next-icon', icon((W.ATV[proxima.tipo] || W.ATV.nota).icon)),
            h('span.activity-command__next-copy',
              h('b', { text: proximaOp ? proximaOp.cliente : (W.ATV[proxima.tipo] || W.ATV.nota).label }),
              h('small', { text: prazoLabel(proxima, proximaTone) })
            ),
            icon('chevRight')
          ) : h('div.activity-command__clear', icon('checkcircle'), h('span', { text: 'Sem ações pendentes' }))
        )
      );
    }

    function activityToolbar() {
      var searchInput;
      var filters = W.filterBar(ctx, vista === 'historico' ? ['periodo', 'owner', 'equipe'] : ['owner', 'equipe']);
      filters.classList.add('activity-toolbar__filters');
      if (vista !== 'historico' && filters.lastElementChild) filters.lastElementChild.remove();
      return h('section.activity-toolbar',
        h('div.activity-toolbar__top',
          UI.segmented([
            { value: 'agenda', label: 'Agenda', icon: 'kanban' },
            { value: 'historico', label: 'Histórico', icon: 'rows' }
          ], vista, function (value) { AGIR.router.setQuery({ v: value === 'agenda' ? null : value }); }),
          vista === 'agenda' ? h('button.btn.btn--sm', { text: 'Todos os períodos', onClick: function () { selectGroup('all'); } }) : null,
          vista === 'agenda' ? h('label.row.gap-2', h('span.t-small', { text: 'Densidade' }),
            h('select.select', { 'aria-label': 'Densidade das atividades', onChange: function () { node.dataset.density = this.value; } },
              h('option', { value: 'compact', text: 'Compacta' }), h('option', { value: 'comfortable', text: 'Confortável' }))) : null,
          h('div.spacer'),
          vista === 'agenda' ? h('label.activity-search',
            icon('search'),
            searchInput = h('input', {
              type: 'search', placeholder: 'Buscar atividade ou lead...', 'aria-label': 'Buscar atividade ou lead',
              onInput: function () { renderKanban(this.value); }
            })
          ) : null
        ),
        filters
      );
    }

    function resumoOperacional() {
      return h('div.activity-summary-grid',
        summaryCard('Atrasadas', atrasadas.length, 'alert', 'overdue', atrasadas.length ? 'Exigem ação imediata' : 'Nenhuma pendência vencida'),
        summaryCard('Para hoje', agenda.length, 'target', 'today', concluidasHoje + ' concluídas de ' + totalDoDia, progressoHoje),
        summaryCard('Atividades amanhã', grupos.tomorrow.length, 'arrowRight', 'tomorrow', 'Dia seguinte'),
        summaryCard('Futuras', grupos.week.length + grupos.future.length, 'calendar', 'week', 'Após amanhã, sem limite de data')
      );
    }

    function summaryCard(label, value, iconName, tone, sub, progress) {
      var button = h('button.activity-summary.activity-summary--' + tone, {
        type: 'button', 'aria-pressed': 'false', onClick: function () { selectGroup(tone); }
      },
        h('div.activity-summary__top',
          h('span.activity-summary__icon', icon(iconName)),
          h('span.activity-summary__label', { text: label })
        ),
        h('div.activity-summary__value', { text: F.num(value) }),
        h('div.activity-summary__sub', { text: sub }),
        typeof progress === 'number' ? h('div.activity-summary__progress',
          h('span', { style: { width: progress + '%' } }),
          h('small', { text: progress + '%' })
        ) : null
      );
      summaryNodes[tone] = button;
      return button;
    }

    function selectGroup(group) {
      selectedGroup = group;
      Object.keys(summaryNodes).forEach(function (key) { summaryNodes[key].setAttribute('aria-pressed', String(key === group)); });
      renderKanban(activeSearch);
    }

    function updateSummary() {
      var counts = { overdue: atrasadas.length, today: agenda.length, tomorrow: grupos.tomorrow.length, week: grupos.week.length + grupos.future.length };
      Object.keys(summaryNodes).forEach(function (key) {
        var el = summaryNodes[key];
        el.querySelector('.activity-summary__value').textContent = F.num(counts[key]);
        if (key === 'today') {
          el.querySelector('.activity-summary__sub').textContent = concluidasHoje + ' concluídas de ' + totalDoDia;
          el.querySelector('.activity-summary__progress > span').style.width = progressoHoje + '%';
          el.querySelector('.activity-summary__progress > small').textContent = progressoHoje + '%';
        }
        if (key === 'overdue') el.querySelector('.activity-summary__sub').textContent = counts[key] ? 'Exigem ação imediata' : 'Nenhuma pendência vencida';
      });
    }

    function renderKanban(term) {
      if (!kanbanHost) return;
      activeSearch = normalizeSearch(term);
      var scrolls = [];
      for (var parent = kanbanHost; parent; parent = parent.parentElement) scrolls.push([parent, parent.scrollTop, parent.scrollLeft]);
      var focused = global.document.activeElement;
      var focusCard = focused && focused.closest('.activity-card');
      var focusId = focusCard && focusCard.dataset.activityId;
      var focusIndex = focusCard ? Array.from(focusCard.querySelectorAll('button')).indexOf(focused) : -1;
      var board = kanbanAtividades(activeSearch);
      if (!kanbanHost.firstElementChild) kanbanHost.appendChild(board);
      var liveIds = new Set(An.acts(f).map(function (a) { return String(a.id); }));
      cardCache.forEach(function (_, id) { if (!liveIds.has(id)) cardCache.delete(id); });
      if (focused && !focused.isConnected && focusId) {
        var replacement = cardCache.get(focusId);
        var target = replacement && replacement.el.isConnected && replacement.el.querySelectorAll('button')[focusIndex];
        if (!target) target = kanbanHost.querySelector('.activity-card__done') || node.querySelector('.activity-search input');
        if (target) target.focus({ preventScroll: true });
      }
      scrolls.forEach(function (entry) { entry[0].scrollTop = entry[1]; entry[0].scrollLeft = entry[2]; });
    }

    function kanbanAtividades(term) {
      var colunas = [
        { titulo: 'Atrasadas', caption: 'Resolva primeiro', tone: 'bad', emphasis: 'urgent', icon: 'alert', items: filtrarBusca(grupos.urgent, term) },
        { titulo: 'Hoje', caption: 'Prioridades do dia', tone: 'brand', emphasis: 'today', icon: 'target', items: filtrarBusca(grupos.today, term) },
        { titulo: 'Amanhã', caption: 'Dia seguinte', tone: 'info', emphasis: 'tomorrow', icon: 'arrowRight', items: filtrarBusca(grupos.tomorrow, term) },
        { titulo: 'Próximos 7 dias', caption: 'Depois de amanhã até ' + F.date(fimProximaSemana), tone: 'ok', emphasis: 'week', icon: 'calendar', items: filtrarBusca(grupos.week, term) },
        { titulo: 'Mais adiante', caption: 'Todas as datas posteriores', tone: 'neutral', emphasis: 'future', icon: 'calendar', items: filtrarBusca(grupos.future, term) }
      ];
      if (kanbanHost.firstElementChild) {
        colunas.forEach(activityColumn);
        var existing = kanbanHost.firstElementChild;
        existing.querySelector('.activity-board__planning-count').textContent = colunas.slice(2).reduce(function (total, col) { return total + col.items.length; }, 0);
        existing.querySelector('.activity-board__focus').hidden = selectedGroup === 'tomorrow' || selectedGroup === 'week';
        existing.querySelector('.activity-board__planning').hidden = selectedGroup === 'overdue' || selectedGroup === 'today';
        existing.dataset.filtered = String(selectedGroup !== 'all');
        return existing;
      }
      return h('div.activity-kanban.activity-board',
        h('div.activity-board__focus', colunas.slice(0, 2).map(activityColumn)),
        h('aside.activity-board__planning',
          h('div.activity-board__planning-head',
            h('div', h('span.activity-board__eyebrow', { text: 'Planejamento' }), h('h3', { text: 'Próximos passos' })),
            h('span.activity-board__planning-count', {
              text: colunas.slice(2).reduce(function (total, col) { return total + col.items.length; }, 0)
            })
          ),
          colunas.slice(2).map(activityColumn)
        )
      );
    }

    function activityColumn(col) {
      var limit = renderLimits[col.emphasis] || 20;
      var visiveis = col.items.slice(0, limit);
      var restantes = Math.max(0, col.items.length - visiveis.length);
      var column = columns[col.emphasis];
      if (!column) column = columns[col.emphasis] = h('section.activity-kanban__col.activity-kanban__col--' + col.emphasis,
        h('header.activity-kanban__head',
          h('span.activity-kanban__icon.activity-kanban__icon--' + col.tone, icon(col.icon)),
          h('div.activity-kanban__title', h('b', { text: col.titulo }), h('small', { text: col.caption })),
          h('span.activity-kanban__count', { text: col.items.length })
        ),
        h('div.activity-kanban__cards')
      );
      column.hidden = !(selectedGroup === 'all' || (selectedGroup === 'overdue' ? col.emphasis === 'urgent' : selectedGroup === 'week' ? ['week', 'future'].indexOf(col.emphasis) >= 0 : col.emphasis === selectedGroup));
      column.classList.toggle('is-empty', !col.items.length);
      column.querySelector('.activity-kanban__count').textContent = col.items.length;
      column.querySelector('.activity-kanban__title small').textContent = col.caption;
      var children = col.items.length
          ? [
            visiveis.map(function (a) {
              var id = String(a.id);
              var signature = JSON.stringify([a, oportunidadesById[a.oportunidadeId], usuariosById[a.ownerId], col.emphasis, inicioHoje.getTime()]);
              var cached = cardCache.get(id);
              if (!cached || cached.signature !== signature) {
                cached = { signature: signature, el: activityCard(a, col.emphasis) };
                cardCache.set(id, cached);
              }
              return cached.el;
            }),
            restantes ? h('button.activity-kanban__more', {
              onClick: function () {
                renderLimits[col.emphasis] += col.emphasis === 'today' ? 12 : 8;
                renderKanban(activeSearch);
              }
            },
              h('span', { text: 'Carregar mais' }),
              h('small', { text: F.num(visiveis.length) + ' de ' + F.num(col.items.length) }),
              icon('chevDown')
            ) : null
          ] : [emptyColumn(col)];
      children = children.flat().filter(Boolean);
      var cards = column.querySelector('.activity-kanban__cards');
      var scrollTop = cards.scrollTop;
      children.forEach(function (child, index) { if (cards.children[index] !== child) cards.insertBefore(child, cards.children[index] || null); });
      while (cards.children.length > children.length) cards.lastElementChild.remove();
      cards.scrollTop = scrollTop;
      return column;
    }

    function emptyColumn(col) {
      var messages = {
        urgent: ['Tudo em dia', 'Nenhuma atividade atrasada.'],
        today: ['Agenda livre', 'Não há atividades pendentes para hoje.'],
        tomorrow: ['Amanhã está livre', 'Nenhuma atividade programada.'],
        week: ['Próximos dias livres', 'Nenhuma atividade depois de amanhã nos próximos 7 dias.'],
        future: ['Sem atividades posteriores', 'Todas as atividades futuras aparecerão aqui.']
      };
      var copy = messages[col.emphasis];
      return h('div.activity-kanban__empty',
        h('span.activity-kanban__empty-icon', icon(col.emphasis === 'urgent' ? 'checkcircle' : 'calendar')),
        h('b', { text: copy[0] }), h('small', { text: copy[1] })
      );
    }

    function filtrarBusca(items, term) {
      if (!term) return items;
      return items.filter(function (a) {
        var op = oportunidadesById[a.oportunidadeId];
        var tipo = (W.ATV[a.tipo] || W.ATV.nota).label;
        return [op && op.cliente, a.nota, tipo].some(function (value) {
          return normalizeSearch(value).indexOf(term) >= 0;
        });
      });
    }

    function normalizeSearch(value) {
      return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function estaPendente(a) {
      return !a.status || a.status === 'pending' || a.status === 'scheduled' || a.resultado === 'pendente';
    }

    function activityCard(a, emphasis) {
      var t = W.ATV[a.tipo] || W.ATV.nota;
      var op = oportunidadesById[a.oportunidadeId];
      var u = usuariosById[a.ownerId];
      return h('article.activity-card.activity-card--' + emphasis, { 'data-activity-id': String(a.id) },
        h('div.activity-card__accent'),
        h('div.activity-card__top',
          h('span.activity-card__type', { style: { '--activity-type': t.cor } }, icon(t.icon), h('span', { text: t.label })),
          h('span.activity-card__due', { text: prazoLabel(a, emphasis) }),
          h('button.btn.btn--icon.btn--sm.btn--ghost.activity-card__more', { 'aria-label': 'Ações da atividade', onClick: function (e) { tarefaMenu(e.currentTarget, a, op); } }, icon('more'))
        ),
        h('button.activity-card__lead', { onClick: function () { if (op) AGIR.pages.oppDrawer(op.id); }, text: op ? op.cliente : 'Lead não encontrado' }),
        op ? h('div.activity-card__value', h('span', { text: 'Estorno solicitado' }), h('b.t-num', { text: F.moneyShort(AGIR.an.valorCRM(op)) })) : null,
        a.nota ? h('p.t-small.t-dim.activity-card__note', { text: a.nota }) : null,
        h('div.activity-card__footer',
          h('div.activity-card__owner', u ? AGIR.avatar(u, 'xs') : null, h('span', { text: u ? u.nome : 'Sem responsável' })),
          h('button.btn.btn--sm.activity-card__done', { onClick: function () { concluir(a); } }, icon('check'), h('span', { text: 'Concluir' }))
        )
      );
    }

    function prazoLabel(a, emphasis) {
      var d = F.toDate(a.agendadoPara || a.data);
      if (emphasis === 'urgent') {
        var dias = Math.max(1, Math.ceil((inicioHoje.getTime() - d.getTime()) / 86400000));
        return dias === 1 ? '1 dia atrasada' : dias + ' dias atrasada';
      }
      if (emphasis === 'today') return 'Hoje · ' + F.time(d);
      if (emphasis === 'tomorrow') return 'Amanhã · ' + F.time(d);
      return F.date(d) + ' · ' + F.time(d);
    }

    /* ------------------------------------------------------------------ */
    function listaTarefas() {
      var itens = vista === 'atrasadas' ? atrasadas
        : vista === 'semana' ? proximosSete() : agenda;

      if (!itens.length) {
        return W.section({
          body: UI.empty({
            icon: vista === 'atrasadas' ? 'checkcircle' : 'calendar',
            title: vista === 'atrasadas' ? 'Nada atrasado' : 'Agenda livre',
            text: vista === 'atrasadas'
              ? 'Todo compromisso marcado está em dia. Aproveite para prospectar.'
              : 'Nenhum compromisso marcado para este recorte.',
            action: { label: 'Registrar atividade', icon: 'plus',
              onClick: function () { AGIR.pages.registrarAtividade(null, function () { AGIR.router.resolve(); }); } }
          })
        });
      }

      /* agrupa por dia */
      var grupos = {};
      itens.forEach(function (a) {
        var k = F.iso(a.agendadoPara || a.data);
        (grupos[k] = grupos[k] || []).push(a);
      });

      return h('div.col.gap-5', Object.keys(grupos).sort().map(function (dia) {
        var lista = grupos[dia];
        var d = F.toDate(dia);
        var hojeIso = F.iso(new Date());
        var rotulo = dia === hojeIso ? 'Hoje' :
          dia === F.iso(F.addDays(new Date(), 1)) ? 'Amanhã' : F.weekdayLong(d);

        return W.section({
          title: rotulo,
          sub: F.plural(lista.length, 'compromisso') + ' · ' + F.date(d),
          flush: true,
          body: h('div', lista.map(function (a) { return linhaTarefa(a, dia < hojeIso); }))
        });
      }));
    }

    function linhaTarefa(a, vencida) {
      var t = W.ATV[a.tipo] || W.ATV.nota;
      var op = a.oportunidadeId ? S().byId('oportunidades', a.oportunidadeId) : null;
      var u = S().byId('usuarios', a.ownerId);

      return h('div.row.gap-4', {
        style: {
          padding: 'var(--sp-4) var(--sp-5)',
          borderBottom: '1px solid var(--line)',
          transition: 'background var(--dur-1) var(--ease-out)'
        },
        onMouseenter: function () { this.style.background = 'var(--bg-elev-2)'; },
        onMouseleave: function () { this.style.background = ''; }
      },
        h('button.check.no-ripple', {
          'data-tip': 'Marcar como concluída',
          onClick: function () { concluir(a); }
        },
          h('span.check__box', { style: { width: '20px', height: '20px' } }, icon('check'))
        ),
        h('span.kpi__icon', { style: { '--kpi-icon-bg': W.hexA('#000', 0), color: t.cor, background: 'var(--bg-elev-2)' } }, icon(t.icon)),
        h('div.grow', { style: { minWidth: 0 } },
          h('div.row.gap-2',
            h('b.t-small', { text: t.label }),
            op ? h('a.t-small.t-brand', {
              href: 'javascript:void 0',
              onClick: function (e) { e.preventDefault(); AGIR.pages.oppDrawer(op.id); },
              text: '· ' + op.cliente
            }) : null
          ),
          a.nota ? h('div.t-tiny.t-dimmer', { style: { marginTop: '2px' }, text: a.nota }) : null
        ),
        op ? h('span.t-small.t-num.t-dim', { 'data-tip': 'Estorno solicitado', text: F.moneyShort(AGIR.an.valorCRM(op)) }) : null,
        h('span.badge' + (vencida ? '.badge--bad' : ''), {
          text: F.time(a.agendadoPara || a.data) + (vencida ? ' · atrasada' : '')
        }),
        u ? h('span', { 'data-tip': u.nome }, AGIR.avatar(u, 'xs')) : null,
        h('button.btn.btn--icon.btn--sm.btn--ghost', {
          'aria-label': 'Ações',
          onClick: function (e) { tarefaMenu(e.currentTarget, a, op); }
        }, icon('more'))
      );
    }

    function tarefaMenu(anchor, a, op) {
      UI.popover(anchor, [
        { label: 'Concluir', icon: 'check', onClick: function () { concluir(a); } },
        op ? { label: 'Abrir oportunidade', icon: 'eye', onClick: function () { AGIR.pages.oppDrawer(op.id); } } : null,
        { label: 'Adiar para amanhã', icon: 'clock', onClick: function () {
          var originalDate = F.toDate(a.agendadoPara || a.data);
          var d = F.addDays(new Date(), 1);
          d.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            global.AGIR_BACKEND.rescheduleActivity({ activityId: a.id, scheduledAt: d.toISOString() }).then(function (saved) {
              S().update('atividades', a.id, { agendadoPara: saved.scheduled_at, data: saved.scheduled_at });
              UI.toast.info('Atividade adiada'); refreshActivities();
            }).catch(function (error) { UI.toast.error(error.message || 'Falha ao adiar atividade.'); });
          } else {
            S().update('atividades', a.id, { agendadoPara: d.toISOString(), data: d.toISOString() });
            UI.toast.info('Adiada para ' + F.date(d)); refreshActivities();
          }
        } },
        { sep: true },
        { label: 'Excluir', icon: 'trash', danger: true, onClick: function () {
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            global.AGIR_BACKEND.cancelActivity(a.id).then(function () {
              S().remove('atividades', a.id); UI.toast.warn('Atividade cancelada'); AGIR.router.resolve();
            }).catch(function (error) { UI.toast.error(error.message || 'Falha ao cancelar atividade.'); });
          } else {
            S().remove('atividades', a.id); UI.toast.warn('Atividade removida'); AGIR.router.resolve();
          }
        } }
      ].filter(Boolean), { align: 'right' });
    }

    function solicitarResultado(a) {
      var op = S().byId('oportunidades', a.oportunidadeId);
      var tipo = (W.ATV[a.tipo] || W.ATV.nota).label;
      var opcoesPorTipo = {
        reuniao: ['realizada'], visita: ['realizada'], tarefa: ['realizada'],
        proposta: ['enviada', 'respondeu', 'sem_interesse'],
        email: ['respondeu', 'nao_atendeu', 'agendou', 'sem_interesse'],
        whatsapp: ['respondeu', 'nao_atendeu', 'agendou', 'sem_interesse'],
        ligacao: ['atendeu', 'nao_atendeu', 'agendou', 'sem_interesse', 'numero_invalido'],
        followup: ['atendeu', 'nao_atendeu', 'agendou', 'sem_interesse'],
        virada_folha: ['realizada']
      };
      var opcoes = opcoesPorTipo[a.tipo] || ['realizada'];
      var selecionado = opcoes.length === 1 ? opcoes[0] : '';
      var observacao;
      var botoes = [];
      var modal;

      return new Promise(function (resolve) {
        var encerrado = false;
        function atualizar() {
          botoes.forEach(function (botao) {
            var ativo = botao.dataset.value === selecionado;
            botao.classList.toggle('is-selected', ativo);
            botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
          });
        }
        function cancelar() {
          if (encerrado) return;
          encerrado = true; modal.close(); resolve(null);
        }
        function confirmar() {
          if (!selecionado) return UI.toast.warn('Selecione o resultado da atividade');
          encerrado = true;
          var detalhe = observacao.value.trim();
          modal.close();
          resolve({ resultado: selecionado, observacao: detalhe });
        }

        botoes = opcoes.map(function (key) {
          return h('button.activity-result-option' + (selecionado === key ? '.is-selected' : ''), {
            type: 'button', 'data-value': key, 'aria-pressed': selecionado === key ? 'true' : 'false',
            onClick: function () { selecionado = key; atualizar(); }
          }, h('span.activity-result-option__mark', icon('check')), h('span', { text: W.RESULTADO[key] || key }));
        });

        modal = UI.modal({
          title: 'Concluir atividade',
          sub: tipo + (op ? ' · ' + op.cliente : ''),
          body: h('div.activity-result-form',
            h('div.activity-result-context',
              h('span.activity-result-context__icon', icon('checkcircle')),
              h('div',
                h('b', { text: op ? op.cliente : tipo }),
                h('small', { text: 'Registre o desfecho para manter o histórico do lead completo.' })
              ),
              h('span.activity-result-context__time', { text: F.time(a.agendadoPara || a.data) })
            ),
            h('div.field', h('label.field__label', h('span', { text: 'Qual foi o resultado?' }), h('span.field__required', { text: '*' })),
              h('div.activity-result-options', botoes)),
            h('div.field', h('label.field__label', { text: 'Observação do resultado' }),
              observacao = h('textarea.input', { rows: 3, placeholder: 'Ex.: cliente pediu retorno na sexta-feira...' }),
              h('div.field__hint', { text: 'Opcional. Use para registrar o contexto importante.' }))
          ),
          footer: [
            h('button.btn', { text: 'Cancelar', onClick: cancelar }),
            h('button.btn.btn--primary', { onClick: confirmar }, icon('check'), h('span', { text: 'Concluir atividade' }))
          ],
          onClose: function () { if (!encerrado) { encerrado = true; resolve(null); } }
        });
        modal.el.classList.add('activity-result-modal');
      });
    }

    async function concluir(a) {
      var preenchimento = await solicitarResultado(a);
      if (!preenchimento) return;
      var resultado = preenchimento.resultado;
      var notaResultado = preenchimento.observacao;
      var notaFinal = notaResultado
        ? ((a.nota ? a.nota + '\n' : '') + 'Resultado: ' + notaResultado)
        : (a.nota || null);
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        global.AGIR_BACKEND.completeActivity({
          activityId: a.id, result: resultado, notes: notaFinal,
          durationSeconds: a.duracaoSeg || null
        }).then(function (saved) {
          S().update('atividades', a.id, {
            resultado: saved.result, data: saved.completed_at, status: saved.status,
            duracaoSeg: saved.duration_seconds || 0, nota: saved.notes || ''
          });
          UI.toast.ok('Atividade concluida'); refreshActivities();
        }).catch(function (error) { UI.toast.error(error.message || 'Falha ao concluir atividade.'); });
        return;
      }
      S().update('atividades', a.id, { resultado: resultado, nota: notaFinal || '', status: 'completed', data: new Date().toISOString() });
      UI.toast({
        title: 'Concluída', text: (W.ATV[a.tipo] || {}).label, tone: 'ok',
        action: { label: 'Desfazer', onClick: function () {
          S().update('atividades', a.id, { resultado: a.resultado, status: a.status, data: a.data, nota: a.nota });
          refreshActivities();
        } }
      });
      refreshActivities();
    }

    function proximosSete() {
      var fim = F.addDays(new Date(), 7);
      return An.acts(f).filter(function (a) {
        if (a.resultado !== 'pendente') return false;
        var d = F.toDate(a.agendadoPara || a.data);
        return d >= new Date(new Date().setHours(0, 0, 0, 0)) && d <= fim;
      }).sort(function (a, b) { return (a.agendadoPara || a.data) < (b.agendadoPara || b.data) ? -1 : 1; });
    }

    function historico() {
      var r = An.range(f.periodo || '30d');
      var itens = An.acts(f).filter(function (a) {
        return a.resultado !== 'pendente' && An.inRange(a.data, r);
      }).sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 300);

      return W.section({
        title: 'Histórico de atividades',
        sub: F.plural(itens.length, 'registro') + ' no período (limitado a 300)',
        flush: true,
        body: W.dataTable({
          rows: itens,
          sort: { key: 'data', dir: 'desc' },
          onRowClick: function (a) { if (a.oportunidadeId) AGIR.pages.oppDrawer(a.oportunidadeId); },
          columns: [
            { key: 'tipo', label: 'Tipo', width: '12%',
              render: function (a) {
                var t = W.ATV[a.tipo] || W.ATV.nota;
                return h('span.row.gap-2', h('i.dot', { style: { background: t.cor } }),
                  h('span', { text: t.label }));
              } },
            { key: 'cliente', label: 'Cliente', width: '22%',
              value: function (a) {
                var op = a.oportunidadeId ? S().byId('oportunidades', a.oportunidadeId) : null;
                return op ? op.cliente : '';
              },
              render: function (a) {
                var op = a.oportunidadeId ? S().byId('oportunidades', a.oportunidadeId) : null;
                return op ? h('span.strong', { text: op.cliente })
                  : h('span.t-dimmer', { text: 'Prospecção ativa' });
              } },
            { key: 'resultado', label: 'Resultado', width: '14%',
              render: function (a) {
                var bom = ['atendeu', 'agendou', 'realizada', 'enviada', 'respondeu'].indexOf(a.resultado) >= 0;
                return h('span.badge' + (bom ? '.badge--ok' : ''), { text: W.RESULTADO[a.resultado] || '—' });
              } },
            { key: 'dur', label: 'Duração', align: 'right', width: '10%',
              value: function (a) { return a.duracaoSeg || 0; },
              render: function (a) { return h('span.t-num', { text: W.duracao(a.duracaoSeg) }); } },
            { key: 'owner', label: 'Quem fez', width: '15%',
              value: function (a) { return (S().byId('usuarios', a.ownerId) || {}).nome; },
              render: function (a) { return W.ownerChip(a.ownerId, 'xs'); } },
            { key: 'nota', label: 'Observação', width: '18%',
              render: function (a) { return h('span.t-dimmer.truncate', { text: a.nota || '—' }); } },
            { key: 'data', label: 'Quando', align: 'right', width: '11%',
              value: function (a) { return new Date(a.data).getTime(); },
              render: function (a) {
                return h('div',
                  h('div.t-small', { text: F.dateTime(a.data) }),
                  h('div.t-tiny.t-dimmer', { text: F.relative(a.data) })
                );
              } }
          ]
        })
      });
    }
  };

  /* ==========================================================================
     AUTOMAÇÕES
     ========================================================================== */
  AGIR.pages.crmAutomacoes = function (node) {
    var lista = S().get('automacoes') || [];
    var ativas = lista.filter(function (a) { return a.ativa; });
    var execucoes = lista.reduce(function (a, x) { return a + x.execucoes; }, 0);

    node.appendChild(W.pageHead({
      icon: 'zap',
      title: 'Automações',
      sub: 'Regras que rodam sozinhas para o time não depender de memória.',
      actions: [
        h('button.btn.btn--primary', { onClick: novaAutomacao },
          icon('plus'), h('span', { text: 'Nova automação' }))
      ]
    }));

    node.appendChild(h('div.grid.g-3',
      W.kpi({ label: 'Regras ativas', raw: ativas.length, icon: 'zap', tone: 'brand',
        sub: 'de ' + lista.length + ' cadastradas' }),
      W.kpi({ label: 'Execuções acumuladas', raw: execucoes, icon: 'refresh', tone: 'info' }),
      W.kpi({ label: 'Trabalho poupado', raw: execucoes * 2 / 60,
        format: function (v) { return F.num(v, 0); }, unit: ' h', icon: 'clock', tone: 'ok',
        sub: 'estimando 2 min por execução manual' })
    ));

    node.appendChild(h('div.col.gap-4', lista.map(function (a, i) {
      return h('div.card.card--pad.row.gap-4', { style: { '--i': i }, 'data-reveal': true },
        h('span.kpi__icon', {
          style: {
            '--kpi-icon-bg': a.ativa ? 'var(--brand-grad-soft)' : 'var(--bg-elev-2)',
            '--kpi-icon-fg': a.ativa ? 'var(--brand-500)' : 'var(--ink-4)',
            width: '40px', height: '40px'
          }
        }, icon('zap')),
        h('div.grow', { style: { minWidth: 0 } },
          h('div.row.gap-2',
            h('b.t-h4', { text: a.nome }),
            h('span.badge' + (a.ativa ? '.badge--ok' : ''), { text: a.ativa ? 'Ativa' : 'Pausada' })
          ),
          h('div.row.gap-2.wrap', { style: { marginTop: '8px' } },
            h('span.badge', icon('lightbulb'), h('span', { text: 'Quando' })),
            h('span.t-small.t-dim', { text: a.gatilho })
          ),
          h('div.row.gap-2.wrap', { style: { marginTop: '4px' } },
            h('span.badge', icon('arrowRight'), h('span', { text: 'Então' })),
            h('span.t-small.t-dim', { text: a.acao })
          )
        ),
        h('div.col.gap-2', { style: { alignItems: 'flex-end', flex: 'none' } },
          h('div.t-h4.t-num', { text: F.num(a.execucoes) }),
          h('div.t-tiny.t-dimmer', { text: 'execuções' }),
          h('div.t-tiny.t-dimmer', { text: 'última ' + F.relative(a.ultimaEm) })
        ),
        h('label.switch', { style: { flex: 'none' }, 'data-tip': a.ativa ? 'Pausar' : 'Ativar' },
          h('input', {
            type: 'checkbox', checked: a.ativa,
            onChange: function () {
              S().update('automacoes', a.id, { ativa: this.checked });
              UI.toast[this.checked ? 'ok' : 'warn'](
                this.checked ? 'Automação ativada' : 'Automação pausada', a.nome);
            }
          }),
          h('span.switch__track'), h('span.switch__thumb')
        )
      );
    })));

    function novaAutomacao() {
      var f = {};
      UI.modal({
        title: 'Nova automação',
        sub: 'Descreva o gatilho e a ação — a régua roda sozinha depois.',
        body: h('div.col.gap-4',
          AGIR.util.campo(f, 'nome', 'Nome da regra', { placeholder: 'Ex.: Proposta sem resposta em 3 dias', autofocus: true }),
          AGIR.util.campo(f, 'gatilho', 'Quando acontecer', { placeholder: 'Oportunidade parada em Proposta enviada por 3 dias' }),
          AGIR.util.campo(f, 'acao', 'Então fazer', { placeholder: 'Criar follow-up e notificar o gestor' })
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { text: 'Criar', onClick: function () {
              if (!f.nome.value.trim()) return UI.toast.bad('Falta o nome');
              S().insert('automacoes', {
                nome: f.nome.value.trim(), gatilho: f.gatilho.value.trim(),
                acao: f.acao.value.trim(), ativa: true, execucoes: 0,
                ultimaEm: new Date().toISOString()
              });
              api.close();
              UI.toast.ok('Automação criada');
              AGIR.router.resolve();
            } })
          ];
        }
      });
    }
  };

  /* ==========================================================================
     E-MAILS — modelos e desempenho
     ========================================================================== */
  AGIR.pages.crmEmails = function (node) {
    var lista = S().get('emails') || [];
    var enviados = lista.reduce(function (a, e) { return a + e.enviados; }, 0);
    var aberturaMedia = enviados
      ? lista.reduce(function (a, e) { return a + e.aberturaPct * e.enviados; }, 0) / enviados : 0;
    var respostaMedia = enviados
      ? lista.reduce(function (a, e) { return a + e.respostaPct * e.enviados; }, 0) / enviados : 0;

    node.appendChild(W.pageHead({
      icon: 'mail',
      title: 'E-mails',
      sub: 'Modelos por etapa do funil, com taxa de abertura e resposta de cada um.',
      actions: [h('button.btn.btn--primary', { onClick: novoModelo },
        icon('plus'), h('span', { text: 'Novo modelo' }))]
    }));

    node.appendChild(h('div.grid.g-3',
      W.kpi({ label: 'E-mails enviados', raw: enviados, icon: 'mail', tone: 'info' }),
      W.kpi({ label: 'Abertura média', raw: aberturaMedia, format: function (v) { return F.pct(v, 1); },
        icon: 'eye', tone: aberturaMedia >= 45 ? 'ok' : 'warn', sub: 'referência de mercado: 40%' }),
      W.kpi({ label: 'Resposta média', raw: respostaMedia, format: function (v) { return F.pct(v, 1); },
        icon: 'inbox', tone: respostaMedia >= 15 ? 'ok' : 'warn', sub: 'referência de mercado: 12%' })
    ));

    node.appendChild(W.section({
      title: 'Modelos cadastrados',
      flush: true,
      body: W.dataTable({
        rows: lista,
        sort: { key: 'enviados', dir: 'desc' },
        onRowClick: function (e) { verModelo(e); },
        columns: [
          { key: 'nome', label: 'Modelo', width: '26%',
            render: function (e) {
              return h('div',
                h('div.strong', { text: e.nome }),
                h('div.t-tiny.t-dimmer.truncate', { text: e.assunto })
              );
            } },
          { key: 'etapa', label: 'Etapa do funil', width: '16%',
            value: function (e) { return (An.etapaById(e.etapaId) || {}).ordem; },
            render: function (e) { return W.etapaBadge(e.etapaId); } },
          { key: 'enviados', label: 'Enviados', align: 'right', width: '11%',
            render: function (e) { return h('span.strong.t-num', { text: F.num(e.enviados) }); } },
          { key: 'aberturaPct', label: 'Abertura', align: 'right', width: '16%',
            render: function (e) {
              return h('div.col.gap-1',
                h('b.t-num', { style: { color: e.aberturaPct >= 45 ? 'var(--ok-500)' : 'var(--warn-500)' },
                  text: F.pct(e.aberturaPct, 1) }),
                M.progress(e.aberturaPct, { thin: true, color: e.aberturaPct >= 45 ? 'var(--ok-500)' : 'var(--warn-500)' })
              );
            } },
          { key: 'respostaPct', label: 'Resposta', align: 'right', width: '16%',
            render: function (e) {
              return h('div.col.gap-1',
                h('b.t-num', { style: { color: e.respostaPct >= 15 ? 'var(--ok-500)' : 'var(--ink-2)' },
                  text: F.pct(e.respostaPct, 1) }),
                M.progress(Math.min(100, e.respostaPct * 3), { thin: true, color: 'var(--series-4)' })
              );
            } },
          { key: 'ativa', label: 'Status', align: 'right', width: '10%',
            render: function (e) {
              return h('span.badge' + (e.ativa ? '.badge--ok' : ''), { text: e.ativa ? 'Ativo' : 'Pausado' });
            } }
        ]
      })
    }));

    function verModelo(e) {
      UI.drawer({
        eyebrow: 'Modelo de e-mail',
        title: e.nome,
        sub: (An.etapaById(e.etapaId) || {}).nome,
        body: h('div.col.gap-5',
          h('div.grid.g-3',
            W.miniStat('Enviados', F.num(e.enviados), 'mail'),
            W.miniStat('Abertura', F.pct(e.aberturaPct, 1), 'eye'),
            W.miniStat('Resposta', F.pct(e.respostaPct, 1), 'inbox')
          ),
          W.section({
            title: 'Assunto',
            body: h('div.t-body', { style: { padding: 'var(--sp-3)', background: 'var(--bg-inset)', borderRadius: 'var(--r-md)' }, text: e.assunto })
          }),
          W.section({
            title: 'Variáveis disponíveis',
            body: h('div.row.gap-2.wrap',
              ['{{cliente}}', '{{primeiro_nome}}', '{{produto}}', '{{valor}}',
               '{{parcela}}', '{{banco}}', '{{vendedor}}', '{{telefone_vendedor}}'].map(function (v) {
                return h('button.chip', {
                  text: v, onClick: function () { AGIR.util.copiar(v, 'Variável copiada'); }
                });
              })
            )
          })
        ),
        footer: [
          h('button.btn', { text: e.ativa ? 'Pausar' : 'Ativar', onClick: function () {
            S().update('emails', e.id, { ativa: !e.ativa });
            UI.toast.info(e.ativa ? 'Modelo pausado' : 'Modelo ativado');
            AGIR.router.resolve();
          } }),
          h('button.btn.btn--primary', { text: 'Fechar', onClick: function () { UI.closePopover(); } })
        ]
      });
    }

    function novoModelo() {
      var f = {};
      UI.modal({
        title: 'Novo modelo de e-mail',
        body: h('div.col.gap-4',
          AGIR.util.campo(f, 'nome', 'Nome interno', { placeholder: 'Ex.: Follow-up 48h', autofocus: true }),
          AGIR.util.campo(f, 'assunto', 'Assunto', { placeholder: 'Conseguiu ver a simulação, {{primeiro_nome}}?' }),
          (function () {
            f.etapaId = h('select.select', An.etapas().map(function (e) {
              return h('option', { value: e.id, text: e.nome });
            }));
            return h('div.field', h('label.field__label', { text: 'Disparar na etapa' }), f.etapaId);
          })()
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { text: 'Criar', onClick: function () {
              if (!f.nome.value.trim()) return UI.toast.bad('Falta o nome');
              S().insert('emails', {
                nome: f.nome.value.trim(), assunto: f.assunto.value.trim(),
                etapaId: f.etapaId.value, enviados: 0, aberturaPct: 0, respostaPct: 0, ativa: true
              });
              api.close();
              UI.toast.ok('Modelo criado');
              AGIR.router.resolve();
            } })
          ];
        }
      });
    }
  };
})(window);
