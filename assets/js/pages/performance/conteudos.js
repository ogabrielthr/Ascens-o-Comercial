/* ==========================================================================
   AGIR — Performance / Conteúdos
   Trilhas de treinamento com progresso individual e pontuação.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  /* Capas geradas em CSS — sem depender de arquivo de imagem externo */
  var CAPAS = {
    bdr:   { grad: 'linear-gradient(135deg,#3B2A12 0%,#0E1015 70%)', glow: 'rgba(255,149,0,.30)',  ico: 'shield' },
    mente: { grad: 'linear-gradient(135deg,#2B1636 0%,#0E1015 70%)', glow: 'rgba(167,139,250,.28)', ico: 'lightbulb' },
    intel: { grad: 'linear-gradient(135deg,#0E2A3A 0%,#0E1015 70%)', glow: 'rgba(90,185,245,.28)',  ico: 'search' },
    cold:  { grad: 'linear-gradient(135deg,#0D2E2A 0%,#0E1015 70%)', glow: 'rgba(45,212,167,.26)',  ico: 'phone' },
    obj:   { grad: 'linear-gradient(135deg,#3A1620 0%,#0E1015 70%)', glow: 'rgba(251,110,110,.26)', ico: 'handshake' }
  };

  function canManagePlans(u) {
    var role = S().get('session.role') || (u && u.role);
    return role === 'admin' || role === 'manager' ||
      (u && (u.cargoId === 'cg_admin' || u.cargoId === 'cg_gestor'));
  }

  function publishedTracks() {
    return (S().get('trilhas') || []).filter(function (t) { return t.publicado; })
      .sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });
  }

  function activeLearners() {
    return (S().get('usuarios') || []).filter(function (u) {
      var role = u.role || String(u.cargoId || '').replace(/^role_|^cg_/, '');
      return u.ativo !== false && ['admin', 'manager', 'gestor', 'finance', 'auditor'].indexOf(role) < 0;
    }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); });
  }

  function planTracks(planId) {
    return (S().get('planoTrilhas') || []).filter(function (x) { return x.planoId === planId; })
      .sort(function (a, b) { return a.ordem - b.ordem; });
  }

  function planStats(plan) {
    var entries = planTracks(plan.id);
    var lessonIds = [];
    entries.forEach(function (entry) {
      var track = S().byId('trilhas', entry.trilhaId);
      (track && track.aulas || []).filter(function (a) { return a.publicado !== false; })
        .forEach(function (a) { lessonIds.push(a.id); });
    });
    var progress = (S().get('progressoAulas') || []).filter(function (p) {
      return p.usuarioId === plan.usuarioId && lessonIds.indexOf(p.aulaId) >= 0;
    });
    var completed = progress.filter(function (p) { return p.status === 'completed'; }).length;
    var last = progress.map(function (p) { return p.atualizadoEm || p.concluidoEm || p.iniciadoEm; })
      .filter(Boolean).sort().slice(-1)[0] || null;
    var pct = lessonIds.length ? completed / lessonIds.length * 100 : 0;
    var overdue = plan.status !== 'completed' && plan.prazo && F.toDate(plan.prazo) < F.toDate(F.iso(new Date()));
    return { tracks: entries, lessonIds: lessonIds, total: lessonIds.length, completed: completed,
      started: progress.length, last: last, pct: pct, overdue: overdue };
  }

  function currentPlan(userId) {
    var order = { active: 0, draft: 1, paused: 2, completed: 3, cancelled: 4 };
    return (S().get('planosEstudo') || []).filter(function (p) { return p.usuarioId === userId; })
      .sort(function (a, b) {
        var rankA = Object.prototype.hasOwnProperty.call(order, a.status) ? order[a.status] : 9;
        var rankB = Object.prototype.hasOwnProperty.call(order, b.status) ? order[b.status] : 9;
        var status = rankA - rankB;
        return status || String(b.atualizadoEm || b.criadoEm).localeCompare(String(a.atualizadoEm || a.criadoEm));
      })[0] || null;
  }

  AGIR.pages.perfConteudos = function (node, ctx) {
    var q = ctx.query || {};
    var u = S().currentUser();
    if (q.t) return telaTrilha(node, q.t, u);

    var manager = canManagePlans(u);
    var view = q.view || (manager ? 'acompanhamento' : 'meu-plano');
    var allowed = manager ? ['acompanhamento', 'planos', 'biblioteca'] : ['meu-plano', 'biblioteca'];
    if (allowed.indexOf(view) < 0) view = allowed[0];

    var actions = [];
    if (manager) {
      actions.push(h('a.btn.btn--sm', { href: '#/config?sec=performance&tab=conteudos' },
        icon('settings'), h('span', { text: 'Gerenciar trilhas' })));
      actions.push(h('button.btn.btn--primary', { onClick: function () { openPlanBuilder(); } },
        icon('plus'), h('span', { text: 'Atribuir plano' })));
    }
    node.appendChild(W.pageHead({
      icon: 'book', title: 'Desenvolvimento',
      sub: manager
        ? 'Acompanhe o uso dos conteúdos e organize planos de estudo por vendedor.'
        : 'Seu plano, seus prazos e o próximo passo para evoluir nas vendas.',
      actions: actions
    }));
    node.appendChild(h('div.learning-view-tabs', UI.tabs((manager ? [
      { value: 'acompanhamento', label: 'Acompanhamento', icon: 'chart' },
      { value: 'planos', label: 'Planos de estudo', icon: 'calendar' },
      { value: 'biblioteca', label: 'Biblioteca', icon: 'book' }
    ] : [
      { value: 'meu-plano', label: 'Meu plano', icon: 'target' },
      { value: 'biblioteca', label: 'Biblioteca', icon: 'book' }
    ]), view, function (value) { AGIR.router.setQuery({ view: value }); })));

    if (view === 'acompanhamento') renderTracking(node);
    else if (view === 'planos') renderPlans(node);
    else if (view === 'meu-plano') renderMyPlan(node, u);
    else renderLibrary(node, u);
  };

  function statusBadge(status) {
    var map = {
      active: ['Em andamento', 'brand'], draft: ['Rascunho', 'info'],
      paused: ['Pausado', 'warn'], completed: ['Concluído', 'ok'], cancelled: ['Cancelado', 'bad']
    };
    var item = map[status] || [status || 'Sem status', 'info'];
    return h('span.badge.badge--' + item[1], { text: item[0] });
  }

  function progressCell(stats) {
    return h('div.learning-table-progress',
      h('div.row.between.gap-2',
        h('b.t-small.t-num', { text: F.pct(stats.pct, 0) }),
        h('span.t-tiny.t-dimmer', { text: stats.completed + '/' + stats.total + ' aulas' })
      ),
      M.progress(stats.pct, { thin: true, color: stats.pct === 100 ? 'var(--ok-500)' : 'var(--brand-500)' })
    );
  }

  function renderTracking(node) {
    var learners = activeLearners();
    var rows = learners.map(function (u) {
      var plan = currentPlan(u.id);
      return { user: u, plan: plan, stats: plan ? planStats(plan) : null };
    });
    var withPlan = rows.filter(function (r) { return r.plan; });
    var average = withPlan.length ? withPlan.reduce(function (sum, r) { return sum + r.stats.pct; }, 0) / withPlan.length : 0;
    var overdue = withPlan.filter(function (r) { return r.stats.overdue; }).length;
    var unstarted = withPlan.filter(function (r) { return r.stats.started === 0; }).length;

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Vendedores com plano', raw: withPlan.length, icon: 'users', tone: 'brand',
        sub: 'de ' + learners.length + ' pessoas elegíveis' }),
      W.kpi({ label: 'Progresso médio', raw: average, format: function (v) { return F.pct(v, 0); },
        icon: 'chart', tone: 'ok', progress: average, sub: 'aulas concluídas' }),
      W.kpi({ label: 'Planos atrasados', raw: overdue, icon: 'alert', tone: overdue ? 'bad' : 'ok',
        sub: overdue ? 'precisam de acompanhamento' : 'todos dentro do prazo' }),
      W.kpi({ label: 'Ainda não iniciados', raw: unstarted, icon: 'clock', tone: unstarted ? 'warn' : 'info',
        sub: 'planos sem acesso registrado' })
    ));

    node.appendChild(W.section({
      title: 'Uso da plataforma',
      sub: 'Progresso, prazo e último acesso de cada vendedor.',
      actions: [h('button.btn.btn--sm', { onClick: function () { openPlanBuilder(); } },
        icon('plus'), h('span', { text: 'Novo plano' }))],
      body: W.dataTable({
        rows: rows,
        sort: { key: 'nome', dir: 'asc' },
        onRowClick: function (row) { openProgressDrawer(row.user, row.plan); },
        columns: [
          { key: 'nome', label: 'Vendedor', value: function (r) { return r.user.nome; },
            render: function (r) { return h('div.row.gap-3', AGIR.avatar(r.user, 'sm'),
              h('div', h('b.t-small', { text: r.user.nome }),
                h('div.t-tiny.t-dimmer', { text: (S().byId('equipes', r.user.equipeId) || {}).nome || 'Sem equipe' }))); } },
          { key: 'plano', label: 'Plano atual', value: function (r) { return r.plan ? r.plan.titulo : ''; },
            render: function (r) { return r.plan
              ? h('div.col.gap-1', h('span.t-small', { text: r.plan.titulo }), statusBadge(r.plan.status))
              : h('span.badge.badge--outline', { text: 'Sem plano' }); } },
          { key: 'progresso', label: 'Progresso', width: '230px', value: function (r) { return r.stats ? r.stats.pct : -1; },
            render: function (r) { return r.stats ? progressCell(r.stats) : h('span.t-dimmer', { text: '—' }); } },
          { key: 'prazo', label: 'Prazo', value: function (r) { return r.plan && r.plan.prazo || ''; },
            render: function (r) { return r.plan && r.plan.prazo
              ? h('span' + (r.stats.overdue ? '.t-bad' : '.t-small'), { text: F.date(r.plan.prazo) })
              : h('span.t-dimmer', { text: 'Sem prazo' }); } },
          { key: 'acesso', label: 'Último acesso', value: function (r) { return r.stats && r.stats.last || ''; },
            render: function (r) { return h('span.t-small.t-dimmer', { text: r.stats && r.stats.last ? F.relative(r.stats.last) : 'Nunca acessou' }); } }
        ],
        empty: UI.empty({ icon: 'users', title: 'Nenhum vendedor encontrado' })
      })
    }));
  }

  function openProgressDrawer(user, plan) {
    var stats = plan ? planStats(plan) : null;
    UI.drawer({
      eyebrow: 'Acompanhamento individual', title: user.nome,
      sub: (S().byId('equipes', user.equipeId) || {}).nome || 'Sem equipe',
      body: h('div.col.gap-4',
        h('div.learning-person-summary',
          AGIR.avatar(user, 'lg'),
          h('div.grow', h('b', { text: plan ? plan.titulo : 'Sem plano de estudo' }),
            h('div.t-small.t-dimmer', { text: plan && plan.prazo ? 'Prazo até ' + F.date(plan.prazo) : 'Nenhum prazo definido' })),
          plan ? statusBadge(plan.status) : null
        ),
        plan ? h('div.grid.g-2',
          W.kpi({ label: 'Progresso', raw: stats.pct, format: function (v) { return F.pct(v, 0); }, icon: 'chart', tone: 'brand' }),
          W.kpi({ label: 'Aulas concluídas', raw: stats.completed, icon: 'checkcircle', tone: 'ok', sub: 'de ' + stats.total })
        ) : null,
        plan ? W.section({ title: 'Trilhas atribuídas', body: h('div.col.gap-3', stats.tracks.map(function (entry, index) {
          var track = S().byId('trilhas', entry.trilhaId) || { titulo: 'Trilha indisponível', aulas: [] };
          var completed = (S().get('progressoAulas') || []).filter(function (p) {
            return p.usuarioId === user.id && p.status === 'completed' &&
              track.aulas.some(function (a) { return a.id === p.aulaId; });
          }).length;
          var pct = track.aulas.length ? completed / track.aulas.length * 100 : 0;
          return h('div.study-mini-order',
            h('span.study-roadmap__step', { text: index + 1 }),
            h('div.grow', h('div.row.between.gap-2', h('b.t-small', { text: track.titulo }),
              h('span.t-tiny.t-dimmer', { text: completed + '/' + track.aulas.length })),
              M.progress(pct, { thin: true }),
              entry.prazo ? h('div.t-tiny.t-dimmer.mt-2', { text: 'Prazo: ' + F.date(entry.prazo) }) : null)
          );
        })) }) : UI.empty({ icon: 'calendar', title: 'Nenhum plano atribuído',
          text: 'Crie uma sequência de estudos para este vendedor.' })
      ),
      footer: [
        plan ? h('button.btn', { onClick: function () { openPlanBuilder(plan); } }, icon('edit'), h('span', { text: 'Editar plano' })) : null,
        h('button.btn.btn--primary', { onClick: function () { openPlanBuilder(plan || null, user.id); } },
          icon(plan ? 'refresh' : 'plus'), h('span', { text: plan ? 'Reatribuir' : 'Atribuir plano' }))
      ]
    });
  }

  function renderPlans(node) {
    var plans = (S().get('planosEstudo') || []).slice().sort(function (a, b) {
      return String(b.atualizadoEm || b.criadoEm).localeCompare(String(a.atualizadoEm || a.criadoEm));
    });
    if (!plans.length) return node.appendChild(UI.empty({
      icon: 'calendar', title: 'Nenhum plano de estudo criado',
      text: 'Monte uma sequência de trilhas, atribua a um vendedor e acompanhe a conclusão.',
      action: { label: 'Criar primeiro plano', icon: 'plus', onClick: function () { openPlanBuilder(); } }
    }));
    node.appendChild(h('div.grid.g-3.stagger', plans.map(function (plan, index) {
      var user = S().byId('usuarios', plan.usuarioId) || { nome: 'Usuário indisponível' };
      var stats = planStats(plan);
      return h('article.card.card--pad.plan-card', { style: { '--i': index } },
        h('div.row.between.gap-3', h('div.row.gap-3', AGIR.avatar(user, 'sm'),
          h('div.grow', h('b.t-small', { text: user.nome }),
            h('div.t-tiny.t-dimmer', { text: planTracks(plan.id).length + ' trilhas atribuídas' }))), statusBadge(plan.status)),
        h('div', h('h3.t-h4', { text: plan.titulo }),
          plan.descricao ? h('p.t-small.t-dimmer.clamp-2.mt-2', { text: plan.descricao }) : null),
        progressCell(stats),
        h('div.row.between.gap-3',
          h('span.t-tiny' + (stats.overdue ? '.t-bad' : '.t-dimmer'),
            { text: plan.prazo ? (stats.overdue ? 'Atrasado desde ' : 'Prazo ') + F.date(plan.prazo) : 'Sem prazo final' }),
          h('div.row.gap-1',
            h('button.btn.btn--icon.btn--sm.btn--ghost', { 'aria-label': 'Editar plano', onClick: function () { openPlanBuilder(plan); } }, icon('edit')),
            h('button.btn.btn--icon.btn--sm.btn--ghost', { 'aria-label': 'Arquivar plano', onClick: function () { archivePlan(plan); } }, icon('trash'))
          )
        )
      );
    })));
  }

  function renderMyPlan(node, user) {
    var plan = currentPlan(user.id);
    if (!plan) return node.appendChild(UI.empty({
      icon: 'target', title: 'Seu plano ainda não foi atribuído',
      text: 'Quando sua liderança montar a sequência, ela aparecerá aqui com trilhas e prazos.'
    }));
    var stats = planStats(plan);
    node.appendChild(h('section.study-plan-hero',
      h('div.study-plan-hero__copy',
        h('div.row.gap-2.wrap', h('span.t-eyebrow', { text: 'Seu plano atual' }), statusBadge(plan.status)),
        h('h2.t-display', { text: plan.titulo }),
        h('p.t-body.t-dim', { text: plan.descricao || 'Siga a sequência abaixo para concluir seu desenvolvimento.' }),
        h('div.row.gap-4.wrap',
          h('span.row.gap-2.t-small', icon('calendar'), h('span', { text: plan.prazo ? 'Concluir até ' + F.date(plan.prazo) : 'Sem prazo final' })),
          h('span.row.gap-2.t-small', icon('checkcircle'), h('span', { text: stats.completed + ' de ' + stats.total + ' aulas' }))
        )
      ),
      h('div.study-plan-ring', { style: { '--plan-progress': stats.pct + '%' } },
        h('b.t-h2.t-num', { text: F.pct(stats.pct, 0) }), h('span.t-tiny.t-dimmer', { text: 'concluído' }))
    ));
    node.appendChild(h('div.study-roadmap', stats.tracks.map(function (entry, index) {
      var track = S().byId('trilhas', entry.trilhaId) || { titulo: 'Trilha indisponível', aulas: [] };
      var done = track.aulas.filter(function (a) {
        return (S().get('progressoAulas') || []).some(function (p) {
          return p.usuarioId === user.id && p.aulaId === a.id && p.status === 'completed';
        });
      }).length;
      var pct = track.aulas.length ? done / track.aulas.length * 100 : 0;
      return h('article.study-roadmap__item' + (pct === 100 ? '.is-complete' : ''),
        h('span.study-roadmap__step', pct === 100 ? icon('check') : h('span', { text: index + 1 })),
        h('a.study-roadmap__body', { href: '#/performance/conteudos?t=' + track.id },
          h('div.grow', h('div.row.gap-2.wrap', h('h3.t-h4', { text: track.titulo }), pct === 100 ? h('span.badge.badge--ok', { text: 'Concluída' }) : null),
            h('p.t-small.t-dimmer.mt-2', { text: track.descricao || 'Conteúdo atribuído ao seu plano.' }),
            h('div.row.gap-3.mt-4', h('span.t-tiny.t-dimmer', { text: done + '/' + track.aulas.length + ' aulas' }),
              entry.prazo ? h('span.t-tiny' + (F.toDate(entry.prazo) < F.toDate(F.iso(new Date())) && pct < 100 ? '.t-bad' : '.t-dimmer'),
                { text: 'Prazo ' + F.date(entry.prazo) }) : null), M.progress(pct, { thin: true })
          ),
          icon('arrowRight')
        )
      );
    })));
  }

  function renderLibrary(node, user) {
    var tracks = publishedTracks();
    var completed = (S().get('progressoAulas') || []).filter(function (p) {
      return p.usuarioId === user.id && p.status === 'completed';
    });
    node.appendChild(h('div.grid.g-3.stagger', tracks.map(function (track, index) {
      var cover = CAPAS[track.capa] || CAPAS.bdr;
      var done = track.aulas.filter(function (a) { return completed.some(function (p) { return p.aulaId === a.id; }); }).length;
      var pct = track.aulas.length ? done / track.aulas.length * 100 : 0;
      var minutes = track.aulas.reduce(function (sum, a) { return sum + Number(a.duracaoMin || 0); }, 0);
      return h('a.mcard', { href: '#/performance/conteudos?t=' + track.id, style: { '--i': index } },
        h('div.mcard__cover.learning-cover', { style: { '--cover': cover.grad, '--cover-glow': cover.glow } },
          h('span.mcard__tag', { text: track.aulas.length + ' aulas' }),
          h('span.learning-cover-title', h('span.kpi__icon', icon(cover.ico)), h('strong', { text: track.titulo })),
          pct === 100 ? h('span.badge.badge--ok.learning-cover-done', icon('check'), h('span', { text: 'Concluída' })) : null),
        h('div.mcard__foot', h('p.mcard__desc', { text: track.descricao }),
          h('div.row.gap-3', h('span.t-tiny.t-dimmer', { text: minutes + ' min' }),
            h('span.t-tiny.t-dimmer', { text: done + '/' + track.aulas.length + ' concluídas' })),
          M.progress(pct, { thin: true }),
          h('span.mcard__cta', h('span', { text: pct ? 'Continuar' : 'Começar' }), icon('arrowRight')))
      );
    })));
    if (!tracks.length) node.appendChild(UI.empty({ icon: 'book', title: 'Nenhuma trilha publicada' }));
  }

  function openPlanBuilder(plan, fixedUserId) {
    var learners = activeLearners();
    var tracks = publishedTracks();
    if (!learners.length) return UI.toast.warn('Nenhum vendedor disponível', 'Cadastre e ative um usuário primeiro.');
    if (!tracks.length) return UI.toast.warn('Nenhuma trilha publicada', 'Publique ao menos uma trilha nas configurações.');

    var existing = plan ? planTracks(plan.id) : [];
    var selected = existing.map(function (x) { return { trackId: x.trilhaId, dueOn: x.prazo || '' }; });
    var today = F.iso(new Date());
    var defaultDue = F.iso(F.addDays(new Date(), 30));
    var fields = {};
    var choicesHost = h('div');
    var orderHost = h('div');
    var selectedCount = h('span.badge.badge--brand');

    function label(text, required) {
      return h('label.field__label', h('span', { text: text }), required ? h('span.field__required', { text: '*' }) : null);
    }
    function field(text, input, required) { return h('div.field', label(text, required), input); }
    function setTextAreaValue(el, value) { el.value = value || ''; return el; }

    fields.userId = h('select.select', { disabled: Boolean(fixedUserId) },
      h('option', { value: '', text: 'Selecione um vendedor' }),
      learners.map(function (u) { return h('option', {
        value: u.id, text: u.nome, selected: u.id === (fixedUserId || (plan && plan.usuarioId))
      }); })
    );
    fields.title = h('input.input', { value: plan ? plan.titulo : 'Plano de desenvolvimento comercial', maxlength: 160 });
    fields.description = setTextAreaValue(h('textarea.textarea', {
      maxlength: 2000, placeholder: 'Explique o objetivo deste plano para o vendedor.'
    }), plan && plan.descricao);
    fields.startsOn = h('input.input', { type: 'date', value: plan && plan.inicio || today, onChange: renderOrder });
    fields.dueOn = h('input.input', { type: 'date', value: plan && plan.prazo || defaultDue, onChange: renderOrder });
    fields.status = h('select.select',
      [
        ['active', 'Em andamento'], ['draft', 'Rascunho'], ['paused', 'Pausado'], ['completed', 'Concluído']
      ].map(function (x) { return h('option', { value: x[0], text: x[1], selected: x[0] === (plan && plan.status || 'active') }); })
    );

    function renderChoices() {
      selectedCount.textContent = selected.length + (selected.length === 1 ? ' selecionada' : ' selecionadas');
      D.mount(choicesHost, h('div.study-track-choices', tracks.map(function (track) {
        var checked = selected.some(function (x) { return x.trackId === track.id; });
        return h('label.study-track-choice' + (checked ? '.is-selected' : ''),
          h('input', { type: 'checkbox', checked: checked, onChange: function () {
            if (this.checked) selected.push({ trackId: track.id, dueOn: '' });
            else selected = selected.filter(function (x) { return x.trackId !== track.id; });
            renderChoices(); renderOrder();
          } }),
          h('span.kpi__icon', icon((CAPAS[track.capa] || CAPAS.bdr).ico)),
          h('span.grow', h('b.t-small', { text: track.titulo }),
            h('span.t-tiny.t-dimmer', { text: track.aulas.length + ' aulas' })),
          icon(checked ? 'checkcircle' : 'plus')
        );
      })));
    }

    function move(index, direction) {
      var target = index + direction;
      if (target < 0 || target >= selected.length) return;
      var tmp = selected[index]; selected[index] = selected[target]; selected[target] = tmp;
      renderOrder();
    }

    function renderOrder() {
      if (!selected.length) return D.mount(orderHost, h('div.plan-builder-empty',
        icon('layers'), h('span', { text: 'Selecione as trilhas acima para montar a ordem.' })));
      D.mount(orderHost, h('div.col.gap-2', selected.map(function (entry, index) {
        var track = S().byId('trilhas', entry.trackId) || { titulo: 'Trilha indisponível', aulas: [] };
        return h('div.plan-builder-row',
          h('span.study-roadmap__step', { text: index + 1 }),
          h('div.grow', h('b.t-small', { text: track.titulo }),
            h('div.t-tiny.t-dimmer', { text: track.aulas.length + ' aulas' })),
          h('label.plan-builder-deadline', h('span', { text: 'Prazo da trilha' }), h('input.input', {
            type: 'date', value: entry.dueOn || '', min: fields.startsOn.value || today,
            max: fields.dueOn.value || '', onChange: function () { entry.dueOn = this.value; }
          })),
          h('div.row.gap-1',
            h('button.btn.btn--icon.btn--sm.btn--ghost', { type: 'button', disabled: index === 0,
              'aria-label': 'Mover para cima', onClick: function () { move(index, -1); } }, icon('chevUp')),
            h('button.btn.btn--icon.btn--sm.btn--ghost', { type: 'button', disabled: index === selected.length - 1,
              'aria-label': 'Mover para baixo', onClick: function () { move(index, 1); } }, icon('chevDown'))
          )
        );
      })));
    }

    renderChoices(); renderOrder();
    UI.modal({
      wide: true, title: plan ? 'Editar plano de estudo' : 'Atribuir plano de estudo',
      sub: 'Defina a sequência ideal e os prazos. Você poderá editar tudo depois.',
      body: h('div.col.gap-5',
        h('div.grid.g-2', field('Vendedor', fields.userId, true), field('Status', fields.status, true)),
        field('Nome do plano', fields.title, true), field('Orientação para o vendedor', fields.description),
        h('div.grid.g-2', field('Data de início', fields.startsOn, true), field('Prazo final', fields.dueOn)),
        h('div', h('div.row.between.gap-3.mb-4',
          h('div', h('h3.t-h4', { text: 'Trilhas do plano' }),
            h('p.t-small.t-dimmer', { text: 'Escolha os conteúdos que fazem sentido para este vendedor.' })),
          selectedCount), choicesHost),
        h('div', h('div.row.between.gap-3.mb-4',
          h('div', h('h3.t-h4', { text: 'Ordem e prazos' }),
            h('p.t-small.t-dimmer', { text: 'A sequência abaixo será a jornada exibida ao vendedor.' }))), orderHost)
      ),
      footer: function (api) {
        return [
          h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
          h('button.btn.btn--primary', { onClick: async function () {
            var userId = fields.userId.value || fixedUserId;
            if (!userId) return UI.toast.bad('Selecione o vendedor');
            if (!fields.title.value.trim()) return UI.toast.bad('Informe o nome do plano');
            if (!fields.startsOn.value) return UI.toast.bad('Informe a data de início');
            if (fields.dueOn.value && fields.dueOn.value < fields.startsOn.value) return UI.toast.bad('Prazo inválido', 'O prazo final deve ser posterior ao início.');
            if (!selected.length) return UI.toast.bad('Selecione pelo menos uma trilha');
            var invalidDue = selected.some(function (x) {
              return x.dueOn && (x.dueOn < fields.startsOn.value || (fields.dueOn.value && x.dueOn > fields.dueOn.value));
            });
            if (invalidDue) return UI.toast.bad('Prazo de trilha inválido', 'Os prazos precisam estar dentro do período do plano.');
            this.disabled = true;
            try {
              await persistPlan({
                planId: plan && plan.id, userId: userId, title: fields.title.value.trim(),
                description: fields.description.value.trim(), startsOn: fields.startsOn.value,
                dueOn: fields.dueOn.value || null, status: fields.status.value,
                trackIds: selected.map(function (x) { return x.trackId; }),
                trackDueDates: selected.map(function (x) { return x.dueOn || null; })
              });
              api.close();
              UI.toast.ok(plan ? 'Plano atualizado' : 'Plano atribuído', 'A jornada do vendedor já está organizada.');
              AGIR.router.setQuery({ view: 'planos' });
            } catch (error) {
              this.disabled = false;
              UI.toast.bad('Não foi possível salvar o plano', error.message || 'Tente novamente.');
            }
          } }, icon('check'), h('span', { text: plan ? 'Salvar alterações' : 'Atribuir plano' }))
        ];
      }
    });
  }

  async function persistPlan(payload) {
    if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
      var saved = await global.AGIR_BACKEND.saveStudyPlan(Object.assign({}, payload, {
        organizationId: S().get('session.organizationId')
      }));
      var row = saved.plan;
      var mapped = {
        id: row.id, usuarioId: row.user_id, titulo: row.title, descricao: row.description || '',
        inicio: row.starts_on, prazo: row.due_on, status: row.status, criadoPor: row.created_by,
        concluidoEm: row.completed_at, criadoEm: row.created_at, atualizadoEm: row.updated_at
      };
      if (S().byId('planosEstudo', mapped.id)) S().update('planosEstudo', mapped.id, mapped);
      else S().insert('planosEstudo', mapped);
      (S().get('planoTrilhas') || []).filter(function (x) { return x.planoId === mapped.id; })
        .forEach(function (x) { S().remove('planoTrilhas', x.id); });
      (saved.tracks || []).forEach(function (x) {
        S().insert('planoTrilhas', { id: x.id, planoId: x.plan_id, trilhaId: x.track_id,
          ordem: x.position, prazo: x.due_on, atribuidoEm: x.assigned_at, atualizadoEm: x.updated_at });
      });
      return mapped;
    }

    var now = new Date().toISOString();
    var id = payload.planId || S().uid('plan');
    var record = { id: id, usuarioId: payload.userId, titulo: payload.title, descricao: payload.description,
      inicio: payload.startsOn, prazo: payload.dueOn, status: payload.status, criadoPor: (S().currentUser() || {}).id,
      concluidoEm: payload.status === 'completed' ? now : null, criadoEm: now, atualizadoEm: now };
    S().batch(function () {
      if (S().byId('planosEstudo', id)) S().update('planosEstudo', id, record);
      else S().insert('planosEstudo', record);
      (S().get('planoTrilhas') || []).filter(function (x) { return x.planoId === id; })
        .slice().forEach(function (x) { S().remove('planoTrilhas', x.id); });
      payload.trackIds.forEach(function (trackId, index) {
        S().insert('planoTrilhas', { planoId: id, trilhaId: trackId, ordem: index + 1,
          prazo: payload.trackDueDates[index], atribuidoEm: now, atualizadoEm: now });
      });
    });
    return record;
  }

  async function archivePlan(plan) {
    if (!await UI.confirm({ title: 'Arquivar este plano?',
      text: 'Ele deixará de aparecer para o vendedor. O progresso das aulas será preservado.',
      okLabel: 'Arquivar', danger: true })) return;
    try {
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        await global.AGIR_BACKEND.archiveStudyPlan(plan.id);
      }
      S().remove('planosEstudo', plan.id);
      (S().get('planoTrilhas') || []).filter(function (x) { return x.planoId === plan.id; })
        .slice().forEach(function (x) { S().remove('planoTrilhas', x.id); });
      UI.toast.ok('Plano arquivado');
      AGIR.router.resolve();
    } catch (error) { UI.toast.bad('Não foi possível arquivar', error.message || 'Tente novamente.'); }
  }

  /* ==========================================================================
     Tela de uma trilha
     ========================================================================== */
  function telaTrilha(node, trilhaId, u) {
    var t = S().byId('trilhas', trilhaId);
    if (!t) {
      return node.appendChild(UI.empty({
        icon: 'search', title: 'Trilha não encontrada',
        action: { label: 'Voltar', icon: 'arrowLeft',
          onClick: function () { AGIR.router.go('/performance/conteudos'); } }
      }));
    }

    var prog = (S().get('progresso') || []).filter(function (p) {
      return p.usuarioId === u.id && p.trilhaId === t.id;
    });
    function concluida(aulaId) {
      return prog.some(function (p) { return p.aulaId === aulaId; });
    }

    var aulaAtual = t.aulas.find(function (a) { return !concluida(a.id); }) || t.aulas[0];
    var feitas = prog.length;
    var pct = t.aulas.length ? feitas / t.aulas.length * 100 : 0;
    var minutos = t.aulas.reduce(function (a, x) { return a + x.duracaoMin; }, 0);
    var capa = CAPAS[t.capa] || CAPAS.bdr;

    node.appendChild(h('div.row.gap-3',
      h('button.btn.btn--icon.btn--sm', { 'aria-label': 'Voltar',
        onClick: function () { AGIR.router.go('/performance/conteudos'); } }, icon('arrowLeft')),
      h('div.grow',
        h('h1.t-h2', { text: t.titulo }),
        h('div.t-small.t-dimmer', {
          text: feitas + '/' + t.aulas.length + ' aulas · ' + F.num(minutos) + ' min · ' +
            (t.aulas.length * t.pontosAula + t.pontosConclusao) + ' pontos'
        })
      ),
      pct === 100 ? h('span.badge.badge--ok', icon('check'), h('span', { text: 'Trilha concluída' })) : null
    ));

    node.appendChild(M.progress(pct, { thick: true }));

    var palco = h('div');
    var painel = h('div.col.gap-3');

    node.appendChild(h('div.grid.learning-player-layout',
      h('div.col.gap-4', palco),
      W.section({
        title: 'Aulas',
        sub: feitas + ' de ' + t.aulas.length + ' concluídas',
        body: painel
      })
    ));

    renderPainel();
    abrir(aulaAtual);

    function renderPainel() {
      D.clear(painel);
      t.aulas.forEach(function (a, i) {
        var ok = concluida(a.id);
        var ativa = aulaAtual && a.id === aulaAtual.id;
        painel.appendChild(h('button.row.gap-3.no-ripple', {
          style: {
            width: '100%', textAlign: 'left', padding: 'var(--sp-3)',
            borderRadius: 'var(--r-md)',
            background: ativa ? 'var(--brand-grad-soft)' : 'transparent',
            border: '1px solid ' + (ativa ? 'var(--line-brand)' : 'transparent'),
            transition: 'all var(--dur-2) var(--ease-out)'
          },
          onClick: function () { abrir(a); }
        },
          h('span.kpi__icon', {
            style: {
              '--kpi-icon-bg': ok ? 'var(--ok-soft)' : 'var(--bg-elev-2)',
              '--kpi-icon-fg': ok ? 'var(--ok-500)' : (ativa ? 'var(--brand-500)' : 'var(--ink-3)')
            }
          }, icon(ok ? 'checkcircle' : 'play')),
          h('div.grow', { style: { minWidth: 0 } },
            h('div.t-small', {
              style: { fontWeight: ativa ? 700 : 550, color: ok ? 'var(--ink-2)' : 'var(--ink)' },
              text: (i + 1) + '. ' + a.titulo
            }),
            h('div.t-tiny.t-dimmer', { text: a.duracaoMin + ' min' + (a.autor ? ' · ' + a.autor : '') })
          )
        ));
      });
    }

    function abrir(a) {
      if (!a) return;
      aulaAtual = a;
      renderPainel();
      registerLessonAccess(a);

      var ok = concluida(a.id);
      D.mount(palco, h('div.col.gap-4',
        /* palco do vídeo — placeholder honesto: sem URL cadastrada, não finge player */
        h('div.card.card--flush', {
          style: {
            aspectRatio: '16/9', display: 'grid', placeItems: 'center',
            background: capa.grad, position: 'relative', overflow: 'hidden'
          }
        },
          h('div', {
            style: {
              position: 'absolute', inset: 0,
              background: 'radial-gradient(60% 60% at 50% 45%, ' + capa.glow + ' 0%, transparent 72%)'
            }
          }),
          h('div.col.gap-3', { style: { position: 'relative', zIndex: 1, alignItems: 'center', textAlign: 'center', padding: 'var(--sp-6)' } },
            h('span.kpi__icon', {
              style: { width: '64px', height: '64px', '--kpi-icon-bg': 'rgba(255,255,255,.08)', '--kpi-icon-fg': '#fff' }
            }, icon('play')),
            h('div.t-h3', { text: a.titulo }),
            h('div.t-small.t-dimmer', { text: a.autor ? a.autor + ' · ' + a.duracaoMin + ' min' : a.duracaoMin + ' min' }),
            a.url
              ? h('a.btn.btn--primary.mt-2', { href: a.url, target: '_blank', rel: 'noopener' },
                  icon('play'), h('span', { text: 'Assistir' }))
              : h('div.t-tiny.t-dimmer.mt-2', {
                  style: { maxWidth: '42ch' },
                  text: 'Nenhum vídeo vinculado a esta aula ainda. Cadastre o link em Configurações > Performance > Conteúdos.'
                })
          )
        ),

        h('div.card.card--pad.row.between.gap-4',
          h('div',
            h('div.t-h4', { text: a.titulo }),
            h('div.t-small.t-dimmer', { style: { marginTop: '4px' },
              text: ok ? 'Você concluiu esta aula.' : 'Marque como concluída para somar ' + t.pontosAula + ' pontos.' })
          ),
          h('button.btn' + (ok ? '' : '.btn--primary'), {
            onClick: function () { alternar(a); }
          }, icon(ok ? 'checkcircle' : 'check'),
            h('span', { text: ok ? 'Concluída' : 'Marcar como concluída' }))
        )
      ));
    }

    async function alternar(a) {
      var existente = prog.find(function (p) { return p.aulaId === a.id; });
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        try {
          var saved = await global.AGIR_BACKEND.setLessonCompletion({ lessonId: a.id, completed: !existente });
          var progressMapped = {
            id: saved.id, usuarioId: saved.user_id, trilhaId: t.id, aulaId: saved.lesson_id,
            status: saved.status, progressoPct: Number(saved.progress_percent || 0),
            iniciadoEm: saved.started_at, concluidoEm: saved.completed_at, atualizadoEm: saved.updated_at
          };
          if (S().byId('progressoAulas', progressMapped.id)) S().update('progressoAulas', progressMapped.id, progressMapped);
          else S().insert('progressoAulas', progressMapped);
          if (existente) {
            S().remove('progresso', existente.id);
            prog = prog.filter(function (p) { return p.id !== existente.id; });
            UI.toast.info('Aula desmarcada', a.titulo);
          } else {
            var novoReal = {
              id: saved.id, usuarioId: saved.user_id, trilhaId: t.id,
              aulaId: saved.lesson_id, concluidoEm: saved.completed_at
            };
            S().insert('progresso', novoReal); prog.push(novoReal);
            var todasReal = t.aulas.every(function (x) { return prog.some(function (p) { return p.aulaId === x.id; }); });
            UI.toast({ title: todasReal ? 'Trilha concluida!' : '+' + t.pontosAula + ' pontos',
              text: todasReal ? t.titulo + ' - +' + t.pontosConclusao + ' pontos de bonus' : a.titulo, tone: 'ok' });
          }
          AGIR.router.resolve();
        } catch (error) { UI.toast.bad('Nao foi possivel atualizar o progresso', error.message || 'Tente novamente.'); }
        return;
      }
      if (existente) {
        S().remove('progresso', existente.id);
        prog = prog.filter(function (p) { return p.id !== existente.id; });
        var localProgress = (S().get('progressoAulas') || []).find(function (p) {
          return p.usuarioId === u.id && p.aulaId === a.id;
        });
        if (localProgress) S().update('progressoAulas', localProgress.id, {
          status: 'in_progress', progressoPct: 0, concluidoEm: null, atualizadoEm: new Date().toISOString()
        });
        UI.toast.info('Aula desmarcada', a.titulo);
      } else {
        var novo = S().insert('progresso', {
          usuarioId: u.id, trilhaId: t.id, aulaId: a.id,
          concluidoEm: new Date().toISOString()
        });
        prog.push(novo);
        var local = (S().get('progressoAulas') || []).find(function (p) {
          return p.usuarioId === u.id && p.aulaId === a.id;
        });
        if (local) S().update('progressoAulas', local.id, {
          status: 'completed', progressoPct: 100, concluidoEm: novo.concluidoEm, atualizadoEm: novo.concluidoEm
        });
        else S().insert('progressoAulas', {
          usuarioId: u.id, trilhaId: t.id, aulaId: a.id, status: 'completed', progressoPct: 100,
          iniciadoEm: novo.concluidoEm, concluidoEm: novo.concluidoEm, atualizadoEm: novo.concluidoEm
        });
        var todas = t.aulas.every(function (x) {
          return prog.some(function (p) { return p.aulaId === x.id; });
        });
        UI.toast({
          title: todas ? 'Trilha concluída!' : '+' + t.pontosAula + ' pontos',
          text: todas
            ? t.titulo + ' · +' + t.pontosConclusao + ' pontos de bônus'
            : a.titulo,
          tone: 'ok'
        });
      }
      AGIR.router.resolve();
    }

    async function registerLessonAccess(a) {
      var now = new Date().toISOString();
      var current = (S().get('progressoAulas') || []).find(function (p) {
        return p.usuarioId === u.id && p.aulaId === a.id;
      });
      if (!(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')) {
        if (current) S().update('progressoAulas', current.id, { atualizadoEm: now });
        else S().insert('progressoAulas', { usuarioId: u.id, trilhaId: t.id, aulaId: a.id,
          status: 'in_progress', progressoPct: 0, iniciadoEm: now, concluidoEm: null, atualizadoEm: now });
        return;
      }
      try {
        var saved = await global.AGIR_BACKEND.markLessonStarted(a.id);
        var mapped = { id: saved.id, usuarioId: saved.user_id, trilhaId: t.id, aulaId: saved.lesson_id,
          status: saved.status, progressoPct: Number(saved.progress_percent || 0), iniciadoEm: saved.started_at,
          concluidoEm: saved.completed_at, atualizadoEm: saved.updated_at };
        if (S().byId('progressoAulas', mapped.id)) S().update('progressoAulas', mapped.id, mapped);
        else S().insert('progressoAulas', mapped);
      } catch (error) {
        console.warn('[conteudos] não foi possível registrar o acesso à aula', error);
      }
    }
  }
})(window);
