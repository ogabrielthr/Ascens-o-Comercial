/* ==========================================================================
   AGIR — app.js
   Shell da aplicação: módulos, navegação, topbar, command palette, temas,
   registro de páginas e boot.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt;

  AGIR.pages = AGIR.pages || {};

  /* ==========================================================================
     Módulos
     ========================================================================== */
  var MODULES = [
    {
      id: 'crm', nome: 'CRM', tag: 'Vendas', icone: 'kanban', home: '/crm/pipeline',
      palavra: 'CRM',
      desc: 'Pipeline, leads, contatos, atividades e automações comerciais.',
      cover: 'linear-gradient(150deg,#2A1B06 0%,#0E1015 62%)',
      glow: 'rgba(255,149,0,.26)',
      nav: [
        { grupo: 'CRM' },
        { path: '/crm/pipeline',    label: 'Pipeline',    icone: 'kanban' },
        { path: '/crm/dashboard',   label: 'Dashboard',   icone: 'gauge' },
        { path: '/crm/leads',       label: 'Leads',       icone: 'users' },
        { path: '/crm/contatos',    label: 'Contatos',    icone: 'contact' },
        { path: '/crm/atividades',  label: 'Atividades',  icone: 'activity' },
        { path: '/crm/automacoes',  label: 'Automações',  icone: 'zap' },
        { path: '/crm/emails',      label: 'E-mails',     icone: 'mail' },
        { path: '/crm/relatorios',  label: 'Relatórios',  icone: 'chart' },
        { path: '/crm/metas',       label: 'Metas',       icone: 'target' }
      ]
    },
    {
      id: 'performance', nome: 'Performance', tag: 'Treinamento', icone: 'trophy',
      home: '/performance/cockpit', palavra: 'PERFORMANCE',
      desc: 'Cockpit do gestor, conteúdos, análise de ligações, ranking e equipe.',
      cover: 'linear-gradient(150deg,#0B2222 0%,#0E1015 62%)',
      glow: 'rgba(45,212,167,.20)',
      nav: [
        { grupo: 'Performance' },
        { path: '/performance/cockpit',   label: 'Cockpit',            icone: 'gauge' },
        { path: '/performance/inicio',    label: 'Início',             icone: 'home' },
        { path: '/performance/conteudos', label: 'Conteúdos',          icone: 'book' },
        { path: '/performance/ranking',   label: 'Ranking',            icone: 'trophy' },
        { path: '/performance/clima',     label: 'Clima do time',      icone: 'sparkles' },
        { path: '/performance/ligacoes',  label: 'Análise de Ligações', icone: 'phone' },
        { path: '/performance/arquivos',  label: 'Arquivos',           icone: 'folder' },
        { path: '/performance/usuarios',  label: 'Usuários',           icone: 'users' }
      ]
    },
    {
      id: 'financeiro', nome: 'Financeiro', tag: 'Gestão', icone: 'wallet',
      home: '/financeiro/visao', palavra: 'FINANCEIRO',
      desc: 'Gestão financeira, DRE, fluxo de caixa, lançamentos e orçamento.',
      cover: 'linear-gradient(150deg,#0A1D2B 0%,#0E1015 62%)',
      glow: 'rgba(90,185,245,.20)',
      nav: [
        { grupo: 'Financeiro' },
        { path: '/financeiro/visao',       label: 'Dashboard',     icone: 'gauge' },
        { path: '/financeiro/pagar',       label: 'Contas a pagar', icone: 'arrowUp' },
        { path: '/financeiro/receber',     label: 'Contas a receber', icone: 'arrowDown' },
        { path: '/financeiro/dre',         label: 'DRE',           icone: 'receipt' },
        { path: '/financeiro/fluxo',       label: 'Fluxo de caixa', icone: 'coins' },
        { path: '/financeiro/lancamentos', label: 'Lançamentos',   icone: 'filetext' },
        { path: '/financeiro/orcamento',   label: 'Orçamento',     icone: 'calc' },
        { path: '/financeiro/contas', label: 'Contas bancárias', icone: 'wallet' },
        { path: '/financeiro/conciliacao', label: 'Conciliação', icone: 'check' },
        { path: '/financeiro/aprovacoes', label: 'Aprovações', icone: 'shield' },
        { path: '/financeiro/relatorios', label: 'Relatórios', icone: 'chart' },
        { path: '/financeiro/analise', label: 'Análise financeira', icone: 'sparkles' },
        { path: '/financeiro/cadastros', label: 'Cadastros', icone: 'folder' },
        { path: '/financeiro/auditoria', label: 'Histórico e fechamento', icone: 'clock' }
      ]
    }
  ];

  var HIDDEN_MODULE_PATHS = ['/crm/metas', '/performance/usuarios'];
  MODULES.forEach(function (module) {
    module.nav = module.nav.filter(function (item) {
      return !item.path || HIDDEN_MODULE_PATHS.indexOf(item.path) < 0;
    });
  });

  var NAV_GESTAO = [
    { grupo: 'Gestão' },
    { path: '/notifications', label: 'Notificações', icone: 'bell' },
    { path: '/config', label: 'Configurações', icone: 'settings' }
  ];

  function moduleOf(path) {
    var id = path.split('/')[1];
    return MODULES.find(function (m) { return m.id === id; }) || null;
  }
  function moduleById(id) { return MODULES.find(function (m) { return m.id === id; }) || null; }

  function isManagement() {
    var role = AGIR.store && AGIR.store.get('session.role');
    var current = AGIR.store && AGIR.store.currentUser && AGIR.store.currentUser();
    if (current) role = current.role || (current.cargoId === 'cg_admin' ? 'admin' : current.cargoId === 'cg_gestor' ? 'manager' : 'commercial');
    return role === 'admin' || role === 'manager';
  }

  function canAccessFinance() {
    var role = AGIR.store && AGIR.store.get('session.role');
    var user = AGIR.store && AGIR.store.currentUser && AGIR.store.currentUser();
    if (user) role = user.role || (user.cargoId === 'cg_admin' ? 'admin' : role);
    return role === 'admin' || role === 'finance';
  }

  function canAccessModule(module) {
    return !module || module.id !== 'financeiro' || canAccessFinance();
  }

  function visibleNav(module) {
    return module.nav.filter(function (item) {
      if (!item.path) return true;
      if (item.path === '/performance/clima') return isManagement();
      return true;
    });
  }

  /* ==========================================================================
     Tema e densidade
     ========================================================================== */
  function applyPrefs() {
    var st = AGIR.store.get('settings') || {};
    document.documentElement.setAttribute('data-theme', st.theme || 'dark');
    document.documentElement.setAttribute('data-density', st.density || 'normal');
  }

  function persistPrefs() {
    if (!(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')) return Promise.resolve();
    var st = AGIR.store.get('settings') || {};
    var user = AGIR.store.currentUser();
    if (!user) return Promise.resolve();
    return global.AGIR_BACKEND.savePreferences({
      userId: user.id, theme: st.theme || 'dark', density: st.density || 'normal',
      sidebarCollapsed: st.sidebarCollapsed, hideCurrency: st.moedaOculta,
      defaultModule: st.modulo, moodCheckinEnabled: st.humorAtivo !== false,
      dashboardWidgets: st.dashboardWidgets || []
    }).catch(function (error) { console.error('[preferencias] Falha ao sincronizar.', error); });
  }

  function toggleTheme() {
    var next = (AGIR.store.pref('theme') === 'dark') ? 'light' : 'dark';
    AGIR.store.pref('theme', next);
    applyPrefs();
    persistPrefs();
    AGIR.ui.toast({ title: next === 'dark' ? 'Tema escuro' : 'Tema claro', tone: 'info', ms: 1600 });
  }

  function toggleDensity() {
    var next = (AGIR.store.pref('density') === 'compact') ? 'normal' : 'compact';
    AGIR.store.pref('density', next);
    applyPrefs();
    persistPrefs();
    AGIR.ui.toast({ title: next === 'compact' ? 'Modo compacto' : 'Modo confortável', tone: 'info', ms: 1600 });
  }

  /* ==========================================================================
     Shell — sidebar + topbar + área de conteúdo
     ========================================================================== */
  var root, shellEl = null, mainEl = null, pageHost = null, sideEl = null, topNotificationHost = null, currentModId = null;
  var pageDisposers = [];

  /** Registra timers, observers e listeners que pertencem somente a pagina atual. */
  AGIR.onPageDispose = function (dispose) {
    if (typeof dispose === 'function') pageDisposers.push(dispose);
    return dispose;
  };

  function disposeCurrentPage() {
    var pending = pageDisposers.splice(0);
    pending.forEach(function (dispose) {
      try { dispose(); } catch (error) { console.warn('[pagina] Falha ao liberar recurso.', error); }
    });
  }

  function buildShell(mod) {
    currentModId = mod.id;
    var collapsed = AGIR.store.pref('sidebarCollapsed');

    sideEl = h('aside.side', { role: 'navigation', 'aria-label': 'Menu principal' },
      h('a.side__brand', { href: '#/', 'data-tip': 'Voltar para a escolha de módulos' },
        h('span.side__mark', h('img', { src: 'assets/brand/icon-orange.svg', alt: '' })),
        h('span.side__name',
          h('b', { text: 'Ascensão Comercial' }),
          h('span', { text: mod.nome })
        )
      ),
      h('nav.side__nav', navList(mod)),
      h('div.side__foot', userButton())
    );

    var top = h('header.top',
      h('button.btn.btn--icon.btn--sm.btn--ghost', {
        'aria-label': 'Recolher menu', 'data-tip': 'Recolher menu  (Ctrl+B)',
        onClick: toggleSidebar
      }, icon('sidebar')),
      h('div.top__crumbs#crumbs'),
      h('div.spacer'),
      h('button.btn.btn--sm.top__search', {
        style: { justifyContent: 'space-between', color: 'var(--ink-3)', fontWeight: 500 },
        onClick: openPalette
      },
        h('span.row.gap-2', icon('search'), h('span', { text: 'Buscar em tudo…' })),
        h('kbd', { text: isMac() ? '⌘K' : 'Ctrl K' })
      ),
      h('button.btn.btn--icon.btn--sm.btn--ghost', {
        'aria-label': 'Buscar', class: 'only-mobile', onClick: openPalette
      }, icon('search')),
      (topNotificationHost = h('div.top-notification-host', notificationButton())),
      h('button.btn.btn--icon.btn--sm.btn--ghost', {
        'aria-label': 'Trocar módulo', 'data-tip': 'Trocar de módulo',
        onClick: function (e) { moduleMenu(e.currentTarget); }
      }, icon('grid')),
      h('button.btn.btn--icon.btn--sm.btn--ghost', {
        'aria-label': 'Preferências', 'data-tip': 'Aparência e dados',
        onClick: function (e) { prefsMenu(e.currentTarget); }
      }, icon('settings')),
      h('button.btn.btn--sm.btn--primary', {
        onClick: quickAdd, 'data-tip': 'Nova oportunidade  (N)'
      }, icon('plus'), h('span.only-desk', { text: 'Novo' }))
    );

    pageHost = h('div#page-host');
    mainEl = h('main.main', top, pageHost);
    shellEl = h('div.shell' + (collapsed ? '.is-collapsed' : ''), sideEl, mainEl);
    D.mount(root, shellEl);
  }

  function navList(mod) {
    var frag = document.createDocumentFragment();
    var counts = navCounts();
    visibleNav(mod).concat(NAV_GESTAO).forEach(function (item) {
      if (item.grupo) {
        frag.appendChild(h('div.side__section', h('span', { text: item.grupo })));
        return;
      }
      frag.appendChild(h('a.nav-item', {
        href: '#' + item.path, 'data-path': item.path,
        'data-tip': item.label
      },
        icon(item.icone),
        h('span', { text: item.label }),
        counts[item.path] ? h('span.nav-item__count', { text: counts[item.path] }) : null
      ));
    });
    return frag;
  }

  function navCounts() {
    var out = {};
    try {
      var abertas = (AGIR.store.get('oportunidades') || []).filter(function (o) { return o.status === 'aberto'; });
      out['/crm/pipeline'] = abertas.length;
      var hoje = AGIR.an.agenda({}).length + AGIR.an.atrasadas({}).length;
      if (hoje) out['/crm/atividades'] = hoje;
      var unread = (AGIR.store.get('notificacoes') || []).filter(function (item) { return !item.lidaEm; }).length;
      if (unread) out['/notifications'] = unread > 99 ? '99+' : unread;
    } catch (e) { /* base ainda carregando */ }
    return out;
  }

  function notificationButton() {
    var unread = (AGIR.store.get('notificacoes') || []).filter(function (item) { return !item.lidaEm; }).length;
    return h('a.btn.btn--icon.btn--sm.btn--ghost.top-notification', {
      href: '#/notifications',
      'aria-label': unread ? unread + ' notificações não lidas' : 'Notificações',
      'data-tip': unread ? unread + ' não lida(s)' : 'Notificações'
    }, icon('bell'), unread ? h('span.top-notification__count', { text: unread > 99 ? '99+' : unread }) : null);
  }

  function markActive(path) {
    if (!sideEl) return;
    D.qsa('.nav-item', sideEl).forEach(function (a) {
      var p = a.dataset.path;
      a.classList.toggle('is-active', p === path || (p !== '/' && path.indexOf(p + '/') === 0));
    });
  }

  function toggleSidebar() {
    var next = !AGIR.store.pref('sidebarCollapsed');
    AGIR.store.pref('sidebarCollapsed', next);
    if (shellEl) shellEl.classList.toggle('is-collapsed', next);
    persistPrefs();
  }

  function userButton() {
    var u = AGIR.store.currentUser();
    if (!u) return null;
    var cargo = AGIR.store.byId('cargos', u.cargoId);
    return h('button.side__user', {
      onClick: function (e) { userMenu(e.currentTarget); },
      'data-tip': u.nome
    },
      avatar(u, 'sm'),
      h('span.side__user-info.grow',
        h('b', { text: u.nome }),
        h('span', { text: cargo ? cargo.nome : u.email })
      ),
      icon('chevUpDown')
    );
  }

  /* ==========================================================================
     Avatar
     ========================================================================== */
  function avatar(u, size) {
    if (!u) return h('span.av' + (size ? '.av--' + size : ''), { text: '?' });
    var hue = u.hue !== undefined ? u.hue : F.hueOf(u.nome || '');
    var photo = u.avatarUrl || (u.avatarPath && global.AGIR_BACKEND && global.AGIR_BACKEND.avatarUrl
      ? global.AGIR_BACKEND.avatarUrl(u.avatarPath) : null);
    return h('span.av' + (size ? '.av--' + size : ''), {
      style: {
        background: photo ? '#171a20' : 'linear-gradient(135deg, hsl(' + hue + ' 62% 42%), hsl(' + ((hue + 40) % 360) + ' 58% 30%))',
        color: '#fff', borderColor: 'transparent'
      },
      'aria-hidden': 'true'
    }, photo ? h('img', { src: photo, alt: '', loading: 'lazy' }) : F.initials(u.nome));
  }
  AGIR.avatar = avatar;

  /* ==========================================================================
     Menus
     ========================================================================== */
  function moduleMenu(anchor) {
    AGIR.ui.popover(anchor, [{ group: 'Módulos' }].concat(MODULES.filter(canAccessModule).map(function (m) {
      return {
        label: m.nome, icon: m.icone, hint: m.tag, active: m.id === currentModId,
        onClick: function () { AGIR.router.go(m.home); }
      };
    })).concat([
      { sep: true },
      { label: 'Todos os módulos', icon: 'grid', onClick: function () { AGIR.router.go('/'); } }
    ]), { align: 'right' });
  }

  function prefsMenu(anchor) {
    var st = AGIR.store.get('settings');
    AGIR.ui.popover(anchor, [
      { group: 'Aparência' },
      { label: st.theme === 'dark' ? 'Tema claro' : 'Tema escuro',
        icon: st.theme === 'dark' ? 'sun' : 'moon', onClick: toggleTheme },
      { label: st.density === 'compact' ? 'Modo confortável' : 'Modo compacto',
        icon: 'rows', onClick: toggleDensity },
      backendReal() ? null : { sep: true },
      backendReal() ? null : { group: 'Dados de demonstracao' },
      backendReal() ? null : { label: 'Exportar dados gerais (JSON)', icon: 'download', onClick: exportarBase },
      backendReal() ? null : { label: 'Importar dados gerais', icon: 'upload', onClick: importarBase },
      backendReal() ? null : { label: 'Recriar dados de exemplo', icon: 'refresh', danger: true, onClick: recriarBase }
    ].filter(Boolean), { align: 'right' });
  }

  function userMenu(anchor) {
    var u = AGIR.store.currentUser();
    var outros = backendReal() ? [] : (AGIR.store.get('usuarios') || []).filter(function (x) { return x.id !== u.id; });
    AGIR.ui.popover(anchor, [
      { group: 'Sessão' },
      { label: 'Meu perfil', icon: 'user', onClick: function () { AGIR.router.go('/config?sec=geral&tab=perfil'); } },
      { label: 'Configurações', icon: 'settings', onClick: function () { AGIR.router.go('/config'); } },
      { sep: true },
      { group: 'Ver o sistema como' }
    ].concat(outros.slice(0, 6).map(function (x) {
      var c = AGIR.store.byId('cargos', x.cargoId);
      return {
        label: x.nome, icon: 'eye', hint: c ? c.nome : '',
        onClick: function () {
          AGIR.store.set('session.userId', x.id);
          AGIR.store.set('session.role', x.role || (x.cargoId === 'cg_admin' ? 'admin' : x.cargoId === 'cg_gestor' ? 'manager' : 'commercial'));
          AGIR.ui.toast({ title: 'Visualizando como ' + F.firstName(x.nome), tone: 'info' });
          AGIR.router.resolve();
          if (sideEl) D.mount(D.qs('.side__foot', sideEl), userButton());
          talvezCheckin(500);
        }
      };
    })).concat([
      { sep: true },
      { label: 'Sair', icon: 'logout', danger: true, onClick: logout }
    ]), { align: 'left' });
  }

  function backendReal() {
    return global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase';
  }

  function mapNotifications(rows) {
    return (rows || []).map(function (item) {
      return {
        id: item.id, destinatarioId: item.recipient_id, atorId: item.actor_id,
        oportunidadeId: item.opportunity_id, tipo: item.notification_type,
        titulo: item.title, texto: item.body || '', metadados: item.metadata || {},
        lidaEm: item.read_at, criadoEm: item.created_at
      };
    });
  }

  function upsertRealtime(path, record) {
    if (!record || !record.id) return;
    if (AGIR.store.byId(path, record.id)) AGIR.store.update(path, record.id, record);
    else AGIR.store.insert(path, record);
  }

  function applyCrmRealtimeDelta(change, silent) {
    if (!change || !change.payload) return;
    var payload = change.payload;
    var row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    if (!row) return;
    var removed = payload.eventType === 'DELETE' || row.deleted_at || row.status === 'cancelled';
    var table = change.table;
    var paths = { opportunities: 'oportunidades', activities: 'atividades',
      opportunity_messages: 'mensagensLead', payment_receipts: 'comprovantesPagamento',
      opportunity_change_history: 'historicoAlteracoes', opportunity_stage_history: 'historicoEtapas' };
    if (!paths[table] && !['contacts', 'tags', 'opportunity_tags'].includes(table)) return;
    if (row.organization_id && row.organization_id !== AGIR.store.get('session.organizationId')) return;
    var previous = paths[table] && AGIR.store.byId(paths[table], row.id);
    if (row.opportunity_id && table !== 'opportunity_tags' &&
        !AGIR.store.byId('oportunidades', row.opportunity_id)) {
      // Replays silenciosos vem de um snapshot ja autoritativo: se o lead nao
      // esta no escopo (cancelado ou de outro dono), a atividade e orfa.
      // Pedir outra recarga aqui devolvia a mesma linha e criava um ciclo
      // de recargas completas a cada ~1s, que impedia editar qualquer lead.
      if (silent) return;
      needsReconciliation = true;
      scheduleCrmRefresh(0, true);
      return;
    }
    var ids = [row.opportunity_id, payload.old && payload.old.opportunity_id,
      previous && previous.oportunidadeId].filter(Boolean);
    if (table === 'opportunities') ids = [row.id];
    if (table === 'contacts' || table === 'tags') {
      ids = (AGIR.store.get('oportunidades') || []).filter(function (op) {
        return table === 'contacts' ? op.contatoId === row.id : (op.tags || []).includes(row.id);
      }).map(function (op) { return op.id; });
    }
    // UPDATE de transferencia pode ser o ultimo evento visivel pela RLS.
    var revoked = ['opportunities', 'contacts'].includes(table) && row.owner_id &&
      AGIR.store.get('session.role') !== 'admin' && row.owner_id !== AGIR.store.get('session.userId');
    removed = removed || revoked;
    if (table === 'opportunities' && !removed && previous && Number(previous.version) > Number(row.version)) return;
    var activityTypes = { call: 'ligacao', meeting: 'reuniao', whatsapp: 'whatsapp', email: 'email', proposal: 'proposta', follow_up: 'followup', payroll_turn: 'virada_folha', task: 'tarefa' };

    AGIR.store.batch(function () {
      if (table === 'contacts') {
        if (removed) AGIR.store.remove('contatos', row.id);
        else {
          var contact = {
            id: row.id, nome: row.full_name, cpf: row.cpf, email: row.email,
            telefone: row.phone, cidade: row.city, uf: row.state,
            empresaId: row.company_id, ownerId: row.owner_id,
            consentimento: row.consent_status, ativo: row.active, criadoEm: row.created_at,
            atualizadoEm: row.updated_at
          };
          upsertRealtime('contatos', contact);
          (AGIR.store.get('oportunidades') || []).filter(function (item) { return item.contatoId === row.id; })
            .forEach(function (item) {
              AGIR.store.update('oportunidades', item.id, {
                cliente: contact.nome, cpf: contact.cpf, telefone: contact.telefone,
                email: contact.email, cidade: contact.cidade, uf: contact.uf
              });
            });
        }
      } else if (table === 'opportunities') {
        if (removed) {
          AGIR.store.remove('oportunidades', row.id);
          ['atividades', 'mensagensLead', 'historicoEtapas', 'historicoAlteracoes', 'comprovantesPagamento'].forEach(function (path) {
            (AGIR.store.get(path) || []).filter(function (item) { return item.oportunidadeId === row.id; })
              .forEach(function (item) { AGIR.store.remove(path, item.id); });
          });
        }
        else {
          var linked = AGIR.store.byId('contatos', row.contact_id) || {};
          var current = AGIR.store.byId('oportunidades', row.id) || {};
          upsertRealtime('oportunidades', {
            id: row.id, pipelineId: row.pipeline_id, titulo: row.title,
            cliente: linked.nome || current.cliente || row.title, contatoId: row.contact_id,
            cpf: linked.cpf || current.cpf, telefone: linked.telefone || current.telefone,
            email: linked.email || current.email, cidade: linked.cidade || current.cidade,
            uf: linked.uf || current.uf, empresaId: row.company_id,
            produtoId: row.product_id, convenioId: row.convention_id,
            matricula: row.registration_number || '', bancoId: row.bank_id, origemId: row.source_id,
            valor: Number(row.amount), comissao: Number(row.expected_commission),
            valorTotal: row.total_value == null ? null : Number(row.total_value),
            valorFinal: row.final_value == null ? null : Number(row.final_value),
            estornoSolicitado: row.requested_reversal == null ? null : Number(row.requested_reversal),
            ownerId: row.owner_id, etapaId: row.stage_id,
            status: row.status === 'won' ? 'ganho' : row.status === 'lost' ? 'perdido' : 'aberto',
            motivoPerdaId: row.loss_reason_id, criadoEm: row.created_at,
            entrouEtapaEm: row.stage_entered_at, atualizadoEm: row.updated_at,
            fechadoEm: row.closed_at, previsaoFechamento: row.expected_close_date,
            tags: current.tags || [], obs: row.notes || '', version: row.version
          });
        }
      } else if (table === 'opportunity_change_history' && !removed) {
        if (AGIR.openLeadCounts && AGIR.openLeadCounts.has(row.opportunity_id)) upsertRealtime('historicoAlteracoes', {
          id: row.id, oportunidadeId: row.opportunity_id, alteradoPor: row.changed_by,
          tipo: row.event_type, alteracoes: row.changes || {}, alteradoEm: row.changed_at
        });
      } else if (table === 'opportunity_stage_history' && !removed) {
        upsertRealtime('historicoEtapas', {
          id: row.id, oportunidadeId: row.opportunity_id, deEtapaId: row.from_stage_id,
          paraEtapaId: row.to_stage_id, alteradoPor: row.changed_by,
          alteradoEm: row.changed_at, duracaoSeg: Number(row.duration_seconds || 0)
        });
      } else if (table === 'activities') {
        if (removed) AGIR.store.remove('atividades', row.id);
        else upsertRealtime('atividades', {
          id: row.id, tipo: activityTypes[row.activity_type] || row.activity_type,
          ownerId: row.owner_id, oportunidadeId: row.opportunity_id,
          data: row.completed_at || row.scheduled_at || row.created_at,
          duracaoSeg: row.duration_seconds || 0,
          resultado: row.status === 'pending' ? 'pendente' : (row.result || ''),
          nota: row.notes || '', agendadoPara: row.scheduled_at, status: row.status, atualizadoEm: row.updated_at
        });
      } else if (table === 'opportunity_messages') {
        if (removed) AGIR.store.remove('mensagensLead', row.id);
        else upsertRealtime('mensagensLead', {
          id: row.id, oportunidadeId: row.opportunity_id, autorId: row.author_id,
          tipo: row.message_type, texto: row.body,
          mencionados: row.mentioned_user_ids || [], criadoEm: row.created_at
        });
      } else if (table === 'payment_receipts') {
        if (removed) AGIR.store.remove('comprovantesPagamento', row.id);
        else upsertRealtime('comprovantesPagamento', {
          id: row.id, oportunidadeId: row.opportunity_id, autorId: row.uploaded_by,
          nome: row.original_name, storagePath: row.storage_path, mimeType: row.mime_type,
          tamanho: Number(row.size_bytes || 0), criadoEm: row.created_at
        });
      } else if (table === 'tags') {
        if (removed) AGIR.store.remove('etiquetas', row.id);
        else upsertRealtime('etiquetas', { id: row.id, nome: row.name, cor: row.color || 'var(--brand-500)' });
      } else if (table === 'opportunity_tags') {
        var opportunity = AGIR.store.byId('oportunidades', row.opportunity_id);
        if (opportunity) {
          var tags = (opportunity.tags || []).slice();
          var index = tags.indexOf(row.tag_id);
          if (removed && index >= 0) tags.splice(index, 1);
          if (!removed && index < 0) tags.push(row.tag_id);
          AGIR.store.update('oportunidades', opportunity.id, { tags: tags });
        }
      }
    });
    if (!silent) global.dispatchEvent(new CustomEvent('ascensao:crm-refreshed', {
      detail: { table: table, opportunityIds: Array.from(new Set(ids)), full: !ids.length }
    }));
    if (revoked) { needsReconciliation = true; scheduleCrmRefresh(0, true); }
  }

  function receiveRealtimeNotification(payload) {
    var row = payload && (payload.new && Object.keys(payload.new).length ? payload.new : payload.old);
    if (!row || !row.id) return;
    if (payload.eventType === 'DELETE') {
      AGIR.store.remove('notificacoes', row.id);
      return;
    }
    var item = mapNotifications([row])[0];
    upsertRealtime('notificacoes', item);
    lastNotificationSyncAt = Date.now();
    notificationFailures = 0;
    nextNotificationAllowedAt = 0;
    if (payload.eventType === 'INSERT') {
      AGIR.ui.toast({
        title: item.titulo || 'Nova notificacao', text: item.texto || 'Ha uma atualizacao para voce.',
        tone: item.tipo === 'mention' ? 'warn' : 'info', ms: 9000,
        action: item.oportunidadeId ? {
          label: 'Abrir lead',
          onClick: function () { AGIR.router.go('/crm/pipeline?lead=' + encodeURIComponent(item.oportunidadeId)); }
        } : { label: 'Ver', onClick: function () { AGIR.router.go('/notifications'); } }
      });
    }
  }

  function reconciliationVersions() {
    var paths = { contacts: 'contatos', opportunities: 'oportunidades', activities: 'atividades' };
    var known = {};
    Object.keys(paths).forEach(function (table) {
      known[table] = (AGIR.store.get(paths[table]) || []).map(function (row) {
        return { id: row.id, updated_at: row.atualizadoEm };
      });
    });
    return known;
  }

  function applyCrmReconciliation(snapshot, silent) {
    var paths = { contacts: 'contatos', opportunities: 'oportunidades', activities: 'atividades' };
    var scopes = {};
    // Validate the entire envelope before removing any local record.
    Object.keys(paths).forEach(function (table) {
      var part = snapshot.incremental[table];
      if (!part || !Array.isArray(part.ids) || !Array.isArray(part.rows)) throw new Error('Reconciliação incompleta.');
      scopes[table] = new Set(part.ids);
      if (scopes[table].size !== part.ids.length || part.rows.some(function (row) { return !scopes[table].has(row.id); })) {
        throw new Error('Escopo de reconciliação inválido.');
      }
    });
    ['tags', 'opportunityTags', 'opportunityMessages', 'paymentReceipts'].forEach(function (key) {
      if (!Array.isArray(snapshot[key])) throw new Error('Índice de reconciliação ausente.');
    });
    function keep(path, predicate) {
      var before = AGIR.store.get(path) || [], after = before.filter(predicate);
      if (before.length !== after.length) AGIR.store.set(path, after);
    }
    AGIR.store.batch(function () {
      Object.keys(paths).forEach(function (table) {
        snapshot.incremental[table].rows.forEach(function (row) {
          applyCrmRealtimeDelta({ table: table, payload: { eventType: 'UPDATE', new: row, old: {} } }, true);
        });
        keep(paths[table], function (row) { return scopes[table].has(row.id); });
      });
      var tags = Object.create(null);
      snapshot.opportunityTags.forEach(function (row) { (tags[row.opportunity_id] = tags[row.opportunity_id] || []).push(row.tag_id); });
      AGIR.store.set('etiquetas', snapshot.tags.map(function (row) { return { id: row.id, nome: row.name, cor: row.color || 'var(--brand-500)' }; }));
      (AGIR.store.get('oportunidades') || []).forEach(function (op) {
        var next = tags[op.id] || [], previous = op.tags || [];
        if (next.length !== previous.length || next.some(function (id) { return previous.indexOf(id) < 0; })) AGIR.store.update('oportunidades', op.id, { tags: next });
        if (!scopes.contacts.has(op.contatoId)) AGIR.store.update('oportunidades', op.id, {
          cliente: op.titulo, cpf: undefined, telefone: undefined, email: undefined, cidade: undefined, uf: undefined
        });
      });
      AGIR.store.set('mensagensLead', snapshot.opportunityMessages.filter(function (row) { return scopes.opportunities.has(row.opportunity_id); }).map(function (row) {
        return Object.assign({}, AGIR.store.byId('mensagensLead', row.id) || {}, { id: row.id, oportunidadeId: row.opportunity_id, criadoEm: row.created_at });
      }));
      AGIR.store.set('comprovantesPagamento', snapshot.paymentReceipts.filter(function (row) { return scopes.opportunities.has(row.opportunity_id); }).map(function (row) {
        return Object.assign({}, AGIR.store.byId('comprovantesPagamento', row.id) || {}, { id: row.id, oportunidadeId: row.opportunity_id });
      }));
      ['historicoEtapas', 'historicoAlteracoes', 'atividades'].forEach(function (path) {
        keep(path, function (row) { return scopes.opportunities.has(row.oportunidadeId); });
      });
    });
    if (!silent) global.dispatchEvent(new CustomEvent('ascensao:crm-refreshed', { detail: { table: null, opportunityIds: [], full: true } }));
  }

  function applyCrmRealtimeSnapshot(snapshot, silent) {
    if (!snapshot) return;
    if (snapshot.incremental) { applyCrmReconciliation(snapshot, silent); return; }
    var contactsById = Object.create(null);
    (snapshot.contacts || []).forEach(function (item) { contactsById[item.id] = item; });
    var tagsByOpportunity = Object.create(null);
    (snapshot.opportunityTags || []).forEach(function (item) {
      (tagsByOpportunity[item.opportunity_id] = tagsByOpportunity[item.opportunity_id] || []).push(item.tag_id);
    });
    var activityTypes = { call: 'ligacao', meeting: 'reuniao', whatsapp: 'whatsapp', email: 'email', proposal: 'proposta', follow_up: 'followup', payroll_turn: 'virada_folha', task: 'tarefa' };

    AGIR.store.batch(function () {
      AGIR.store.set('contatos', (snapshot.contacts || []).map(function (item) {
        return {
          id: item.id, nome: item.full_name, cpf: item.cpf, email: item.email,
          telefone: item.phone, cidade: item.city, uf: item.state,
          empresaId: item.company_id, ownerId: item.owner_id,
          consentimento: item.consent_status, ativo: item.active, criadoEm: item.created_at, atualizadoEm: item.updated_at
        };
      }));
      AGIR.store.set('etiquetas', (snapshot.tags || []).map(function (item) {
        return { id: item.id, nome: item.name, cor: item.color || 'var(--brand-500)' };
      }));
      AGIR.store.set('oportunidades', (snapshot.opportunities || []).map(function (item) {
        var contact = contactsById[item.contact_id] || {};
        return {
          id: item.id, pipelineId: item.pipeline_id, titulo: item.title,
          cliente: contact.full_name || item.title, contatoId: item.contact_id,
          cpf: contact.cpf, telefone: contact.phone, email: contact.email,
          cidade: contact.city, uf: contact.state, empresaId: item.company_id,
          produtoId: item.product_id, convenioId: item.convention_id,
          matricula: item.registration_number || '', bancoId: item.bank_id, origemId: item.source_id,
          valor: Number(item.amount), comissao: Number(item.expected_commission),
          valorTotal: item.total_value == null ? null : Number(item.total_value),
          valorFinal: item.final_value == null ? null : Number(item.final_value),
          estornoSolicitado: item.requested_reversal == null ? null : Number(item.requested_reversal),
          ownerId: item.owner_id, etapaId: item.stage_id,
          status: item.status === 'won' ? 'ganho' : item.status === 'lost' ? 'perdido' : item.status === 'cancelled' ? 'cancelado' : 'aberto',
          motivoPerdaId: item.loss_reason_id, criadoEm: item.created_at,
          entrouEtapaEm: item.stage_entered_at, atualizadoEm: item.updated_at,
          fechadoEm: item.closed_at, previsaoFechamento: item.expected_close_date,
          tags: tagsByOpportunity[item.id] || [], obs: item.notes || '', version: item.version
        };
      }));
      if (snapshot.stageHistory) AGIR.store.set('historicoEtapas', snapshot.stageHistory.map(function (item) {
        return {
          id: item.id, oportunidadeId: item.opportunity_id,
          deEtapaId: item.from_stage_id, paraEtapaId: item.to_stage_id,
          alteradoPor: item.changed_by, alteradoEm: item.changed_at,
          duracaoSeg: Number(item.duration_seconds || 0)
        };
      }));
      if (snapshot.changeHistory) AGIR.store.set('historicoAlteracoes', snapshot.changeHistory.map(function (item) {
        return {
          id: item.id, oportunidadeId: item.opportunity_id,
          alteradoPor: item.changed_by, tipo: item.event_type,
          alteracoes: item.changes || {}, alteradoEm: item.changed_at
        };
      }));
      AGIR.store.set('atividades', (snapshot.activities || []).map(function (item) {
        return {
          id: item.id, tipo: activityTypes[item.activity_type] || item.activity_type,
          ownerId: item.owner_id, oportunidadeId: item.opportunity_id,
          data: item.completed_at || item.scheduled_at || item.created_at,
          duracaoSeg: item.duration_seconds || 0,
          resultado: item.status === 'pending' ? 'pendente' : (item.result || ''),
          nota: item.notes || '', agendadoPara: item.scheduled_at, status: item.status, atualizadoEm: item.updated_at
        };
      }));
      AGIR.store.set('mensagensLead', (snapshot.opportunityMessages || []).map(function (item) {
        var previous = AGIR.store.byId('mensagensLead', item.id) || {};
        return Object.assign({}, previous, {
          id: item.id, oportunidadeId: item.opportunity_id,
          criadoEm: item.created_at
        });
      }));
      AGIR.store.set('comprovantesPagamento', (snapshot.paymentReceipts || []).map(function (item) {
        return Object.assign({}, AGIR.store.byId('comprovantesPagamento', item.id) || {}, {
          id: item.id, oportunidadeId: item.opportunity_id
        });
      }));
      // A recovered scope is authoritative, including deletions/ownership changes.
      var allowed = new Set((snapshot.opportunities || []).map(function (item) { return item.id; }));
      ['historicoEtapas', 'historicoAlteracoes'].forEach(function (path) {
        AGIR.store.set(path, (AGIR.store.get(path) || []).filter(function (entry) { return allowed.has(entry.oportunidadeId); }));
      });
      if (snapshot.notifications) AGIR.store.set('notificacoes', mapNotifications(snapshot.notifications));
    });
    if (!silent) global.dispatchEvent(new CustomEvent('ascensao:crm-refreshed', { detail: { table: null, opportunityIds: [], full: true } }));
  }

  var realtimeStop = null;
  var realtimeTimer = null;
  var reconnectTimer = null;
  var realtimeRefreshing = false;
  var realtimePending = false;
  var realtimeStarting = false;
  var realtimeStatus = 'CLOSED';
  var snapshotFailures = 0;
  var nextSnapshotAllowedAt = 0;
  var notificationFailures = 0;
  var nextNotificationAllowedAt = 0;
  var lastCrmFullSyncAt = 0;
  var lastNotificationSyncAt = 0;
  var syncEpoch = 0;
  var channelEpoch = 0;
  var reconnectFailures = 0;
  var needsReconciliation = true;
  var snapshotDeltas = [];
  var snapshotOverflow = false;
  var notificationRequest = null;
  var workspaceCoordinator = null;

  function ownsWorkspaceSync() {
    return !workspaceCoordinator || workspaceCoordinator.isLeader();
  }

  // Contrato publico UX-04: status = connecting|reconnecting|offline|connected.
  // lastUpdatedAt = ISO UTC da ultima carga/delta confirmado, ou null.
  // SUBSCRIBED sozinho nao confirma recuperacao dos eventos perdidos.
  AGIR.syncState = Object.freeze({ status: 'offline', lastUpdatedAt: null });
  function setSyncState(status, updated) {
    var lastUpdatedAt = updated ? new Date().toISOString() : AGIR.syncState.lastUpdatedAt;
    if (AGIR.syncState.status === status && AGIR.syncState.lastUpdatedAt === lastUpdatedAt) return;
    AGIR.syncState = Object.freeze({ status: status, lastUpdatedAt: lastUpdatedAt });
    global.dispatchEvent(new CustomEvent('ascensao:sync-status', { detail: AGIR.syncState }));
    if (workspaceCoordinator && workspaceCoordinator.isLeader()) {
      workspaceCoordinator.broadcast('sync-state', AGIR.syncState);
    }
  }
  function online() { return !global.navigator || global.navigator.onLine !== false; }
  function activeSync(epoch) {
    return epoch === syncEpoch && backendReal() && AGIR.store.get('session.autenticado');
  }
  function resetWorkspaceSync() {
    if (global.AGIR_BACKEND && global.AGIR_BACKEND.cancelSessionReads) global.AGIR_BACKEND.cancelSessionReads();
    syncEpoch += 1;
    channelEpoch += 1;
    clearTimeout(realtimeTimer);
    clearTimeout(reconnectTimer);
    var stop = realtimeStop;
    realtimeStop = null;
    if (stop) Promise.resolve(stop()).catch(function () {});
    if (workspaceCoordinator) workspaceCoordinator.dispose();
    workspaceCoordinator = null;
    realtimeStarting = realtimeRefreshing = realtimePending = false;
    realtimeStatus = 'CLOSED';
    snapshotFailures = notificationFailures = reconnectFailures = 0;
    nextSnapshotAllowedAt = nextNotificationAllowedAt = lastCrmFullSyncAt = lastNotificationSyncAt = 0;
    notificationRequest = null;
    snapshotDeltas = [];
    snapshotOverflow = false;
    needsReconciliation = true;
    moduleDataCache.clear();
    AGIR.syncState = Object.freeze({ status: 'offline', lastUpdatedAt: null });
    global.dispatchEvent(new CustomEvent('ascensao:sync-status', { detail: AGIR.syncState }));
  }

  function refreshNotifications(force) {
    if (!backendReal() || !AGIR.store.get('session.autenticado') || !online()) return Promise.resolve();
    if (!ownsWorkspaceSync()) return Promise.resolve();
    if (notificationRequest) return notificationRequest;
    if (!force && realtimeStatus === 'SUBSCRIBED') return Promise.resolve();
    if (Date.now() < nextNotificationAllowedAt) return Promise.resolve();
    if (!force && Date.now() - lastNotificationSyncAt < 60000) return Promise.resolve();
    var epoch = syncEpoch;
    notificationRequest = Promise.resolve().then(function () {
      return global.AGIR_BACKEND.loadNotifications({ organizationId: AGIR.store.get('session.organizationId') });
    }).then(function (rows) {
      if (!activeSync(epoch)) return;
      AGIR.store.set('notificacoes', mapNotifications(rows));
      if (workspaceCoordinator) workspaceCoordinator.broadcast('notifications', rows);
      lastNotificationSyncAt = Date.now();
      notificationFailures = 0;
      nextNotificationAllowedAt = 0;
    }).catch(function (error) {
      if (!activeSync(epoch)) return;
      notificationFailures += 1;
      nextNotificationAllowedAt = Date.now() + Math.min(300000, 15000 * Math.pow(2, notificationFailures - 1));
      console.warn('[notificacoes] Atualizacao em tempo real indisponivel.', error);
    }).finally(function () { if (epoch === syncEpoch) notificationRequest = null; });
    return notificationRequest;
  }

  function scheduleCrmRefresh(delay, force) {
    if (!backendReal() || !AGIR.store.get('session.autenticado')) return;
    if (!ownsWorkspaceSync()) return;
    if (force) needsReconciliation = true;
    if (!force && !needsReconciliation && realtimeStatus === 'SUBSCRIBED') return;
    if (!force && !needsReconciliation && Date.now() - lastCrmFullSyncAt < 300000) return;
    if (realtimeRefreshing) { realtimePending = true; return; }
    clearTimeout(realtimeTimer);
    if (!online() || document.hidden) { realtimePending = true; return; }
    var epoch = syncEpoch;
    // force solicita reconciliacao, mas nunca ignora o backoff de falha.
    var wait = Math.max(delay === undefined ? 480 : delay, nextSnapshotAllowedAt - Date.now(), 0);
    realtimeTimer = setTimeout(function () {
      if (!activeSync(epoch)) return;
      if (!online() || document.hidden) { realtimePending = true; return; }
      realtimeRefreshing = true;
      realtimePending = false;
      snapshotDeltas = [];
      snapshotOverflow = false;
      setSyncState('reconnecting');
      Promise.resolve().then(function () {
        return global.AGIR_BACKEND.loadCrmRealtimeSnapshot({
          organizationId: AGIR.store.get('session.organizationId'), known: reconciliationVersions()
        });
      }).then(function (snapshot) {
        if (!activeSync(epoch)) return;
        if (!snapshot || snapshotOverflow) throw new Error('Snapshot incompleto; reconciliacao pendente.');
        // Reaplica eventos recebidos durante as paginas para nao regredir versoes.
        applyCrmRealtimeSnapshot(snapshot, true);
        snapshotDeltas.forEach(function (change) { applyCrmRealtimeDelta(change, true); });
        if (workspaceCoordinator) workspaceCoordinator.broadcast('crm-snapshot', snapshot);
        global.dispatchEvent(new CustomEvent('ascensao:crm-refreshed', { detail: { table: null, opportunityIds: [], full: true } }));
        lastCrmFullSyncAt = Date.now();
        snapshotFailures = 0;
        nextSnapshotAllowedAt = 0;
        needsReconciliation = realtimePending || realtimeStatus !== 'SUBSCRIBED';
        if (realtimeStatus === 'SUBSCRIBED' && !needsReconciliation) reconnectFailures = 0;
        setSyncState(needsReconciliation ? (online() ? 'reconnecting' : 'offline') : 'connected', true);
      }).catch(function (error) {
        if (!activeSync(epoch)) return;
        needsReconciliation = true;
        snapshotFailures += 1;
        nextSnapshotAllowedAt = Date.now() + Math.min(300000, 15000 * Math.pow(2, snapshotFailures - 1));
        setSyncState(online() ? 'reconnecting' : 'offline');
        console.warn('[realtime] Nao foi possivel atualizar o pipeline.', error);
      }).finally(function () {
        if (!activeSync(epoch)) return;
        realtimeRefreshing = false;
        snapshotDeltas = [];
        if (realtimePending || needsReconciliation) {
          scheduleCrmRefresh(snapshotFailures ? 0 : realtimeStatus === 'SUBSCRIBED' ? 220 : 300000, false);
        }
      });
    }, wait);
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    if (!online() || document.hidden) return;
    var epoch = syncEpoch;
    var delay = Math.min(60000, 1000 * Math.pow(2, Math.min(reconnectFailures++, 6)));
    reconnectTimer = setTimeout(function () {
      if (activeSync(epoch)) startRealtimeSync();
    }, delay);
  }

  function startRealtimeSync() {
    if (!backendReal() || !AGIR.store.get('session.autenticado')) return;
    if (!ownsWorkspaceSync()) return;
    if (!online()) { setSyncState('offline'); return; }
    if (document.hidden || realtimeStarting || realtimeStatus === 'SUBSCRIBED') return;
    realtimeStarting = true;
    var epoch = syncEpoch, channel = ++channelEpoch;
    setSyncState(AGIR.syncState.lastUpdatedAt ? 'reconnecting' : 'connecting');
    var previous = realtimeStop;
    realtimeStop = null;
    Promise.resolve().then(function () { return previous && previous(); }).catch(function () {}).then(function () {
      if (!activeSync(epoch) || channel !== channelEpoch) return null;
      return global.AGIR_BACKEND.subscribeWorkspace({
        organizationId: AGIR.store.get('session.organizationId'),
        userId: AGIR.store.get('session.userId'),
        onNotification: function (payload) {
          if (activeSync(epoch) && channel === channelEpoch) {
            receiveRealtimeNotification(payload);
            if (workspaceCoordinator) workspaceCoordinator.broadcast('notification', payload);
          }
        },
        onCrmChange: function (change) {
          if (!activeSync(epoch) || channel !== channelEpoch) return;
          if (realtimeRefreshing) {
            if (snapshotDeltas.length < 1000) snapshotDeltas.push(change);
            else snapshotOverflow = true;
          }
          applyCrmRealtimeDelta(change);
          if (workspaceCoordinator) workspaceCoordinator.broadcast('crm-change', change);
          if (!needsReconciliation && realtimeStatus === 'SUBSCRIBED') setSyncState('connected', true);
        },
        onStatus: function (status) {
          if (!activeSync(epoch) || channel !== channelEpoch) return;
          var wasSubscribed = realtimeStatus === 'SUBSCRIBED';
          realtimeStatus = status;
          if (status === 'SUBSCRIBED') {
            clearTimeout(reconnectTimer);
            if (!wasSubscribed || needsReconciliation) {
              setSyncState('reconnecting');
              scheduleCrmRefresh(0, true);
              refreshNotifications(true);
            }
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            needsReconciliation = true;
            setSyncState(online() ? 'reconnecting' : 'offline');
            scheduleReconnect();
            scheduleCrmRefresh(1200, false);
          }
        }
      });
    }).then(function (stop) {
      if (!activeSync(epoch) || channel !== channelEpoch) {
        if (stop) return stop();
        return;
      }
      realtimeStop = stop;
    }).catch(function (error) {
      if (!activeSync(epoch) || channel !== channelEpoch) return;
      realtimeStatus = 'CHANNEL_ERROR';
      needsReconciliation = true;
      setSyncState(online() ? 'reconnecting' : 'offline');
      scheduleReconnect();
      scheduleCrmRefresh(1200, false);
      console.warn('[realtime] Falha ao iniciar sincronizacao.', error);
    }).finally(function () {
      if (epoch === syncEpoch && channel === channelEpoch) realtimeStarting = false;
    });
  }

  function initWorkspaceCoordinator() {
    if (!backendReal() || typeof AGIR.createWorkspaceLeader !== 'function') return;
    var organizationId = AGIR.store.get('session.organizationId');
    var userId = AGIR.store.get('session.userId');
    if (!organizationId || !userId) return;
    workspaceCoordinator = AGIR.createWorkspaceLeader({ scope: organizationId + ':' + userId });
    workspaceCoordinator.subscribe(function (message) {
      if (!message || workspaceCoordinator.isLeader()) return;
      if (message.type === 'crm-change') {
        applyCrmRealtimeDelta(message.payload);
        setSyncState('connected', true);
      } else if (message.type === 'notification') {
        receiveRealtimeNotification(message.payload);
      } else if (message.type === 'notifications' && Array.isArray(message.payload)) {
        AGIR.store.set('notificacoes', mapNotifications(message.payload));
      } else if (message.type === 'crm-snapshot' && message.payload) {
        applyCrmRealtimeSnapshot(message.payload, true);
        setSyncState('connected', true);
      } else if (message.type === 'sync-state' && message.payload) {
        setSyncState(message.payload.status || 'connected', false);
      }
    });
    workspaceCoordinator.onLeadership(function (leader) {
      if (!AGIR.store.get('session.autenticado')) return;
      if (leader) {
        needsReconciliation = true;
        startRealtimeSync();
        refreshNotifications(true);
        scheduleCrmRefresh(0, true);
        return;
      }
      clearTimeout(realtimeTimer);
      clearTimeout(reconnectTimer);
      channelEpoch += 1;
      realtimeStatus = 'FOLLOWER';
      var stop = realtimeStop;
      realtimeStop = null;
      if (stop) Promise.resolve(stop()).catch(function () {});
      setSyncState('connected', false);
    });
  }

  // Cache apenas em memoria da sessao. TTL limita dados de modulos sem realtime.
  // Nenhum dado lazy participa de totais comerciais antes de carregar a tela.
  var moduleDataCache = new Map();
  function pageDataModules(key, ctx) {
    if (key === 'crmRelatorios') return ['analytics'];
    if (key === 'crmDashboard') {
      var view = ctx && ctx.query && ctx.query.view || 'visao';
      var selected = (AGIR.store.get('settings') || {}).dashboardWidgets;
      return view === 'funil' || (view === 'visao' && (!selected || !selected.length || selected.includes('funil'))) ? ['analytics'] : [];
    }
    if (key === 'config') return ['learning', 'files'];
    if (['perfConteudos', 'perfCockpit', 'perfInicio'].includes(key)) return ['learning'];
    if (key === 'perfArquivos') return ['files'];
    return [];
  }
  function applyCommercialModule(commercial, module) {
    if (module === 'analytics') {
      AGIR.store.set('historicoEtapas', (commercial.stageHistory || []).map(function (item) {
        return { id: item.id, oportunidadeId: item.opportunity_id, deEtapaId: item.from_stage_id,
          paraEtapaId: item.to_stage_id, alteradoPor: item.changed_by, alteradoEm: item.changed_at,
          duracaoSeg: Number(item.duration_seconds || 0) };
      }));
    } else if (module === 'learning') {
      var lessonPoints = 10, trackPoints = 50;
      (commercial.gamificationRules || []).forEach(function (rule) {
        if (rule.event_type === 'lesson_completed') lessonPoints = rule.points;
        if (rule.event_type === 'track_completed') trackPoints = rule.points;
      });
      var lessonsByTrack = Object.create(null);
      (commercial.lessons || []).forEach(function (lesson) {
        if (!lessonsByTrack[lesson.track_id]) lessonsByTrack[lesson.track_id] = [];
        lessonsByTrack[lesson.track_id].push({
          id: lesson.id, titulo: lesson.title, descricao: lesson.description || '',
          autor: lesson.description && lesson.description.indexOf('Autor: ') === 0 ? lesson.description.slice(7) : '',
          tipo: lesson.content_type, url: lesson.content_url || '',
          duracaoMin: lesson.duration_minutes, ordem: lesson.position,
          publicado: lesson.published
        });
      });
      AGIR.store.set('trilhas', (commercial.tracks || []).map(function (track) {
        return {
          id: track.id, titulo: track.title, descricao: track.description || '',
          capa: track.cover_path || 'bdr', publicado: track.published,
          ordem: track.position, pontosAula: lessonPoints,
          pontosConclusao: trackPoints, aulas: lessonsByTrack[track.id] || []
        };
      }));
      AGIR.store.set('progressoAulas', (commercial.lessonProgress || []).map(function (item) {
        var lesson = (commercial.lessons || []).find(function (x) { return x.id === item.lesson_id; }) || {};
        return {
          id: item.id, usuarioId: item.user_id, trilhaId: lesson.track_id,
          aulaId: item.lesson_id, status: item.status,
          progressoPct: Number(item.progress_percent || 0),
          iniciadoEm: item.started_at, concluidoEm: item.completed_at,
          atualizadoEm: item.updated_at
        };
      }));
      AGIR.store.set('progresso', (commercial.lessonProgress || []).filter(function (item) {
        return item.status === 'completed';
      }).map(function (item) {
        var lesson = (commercial.lessons || []).find(function (x) { return x.id === item.lesson_id; }) || {};
        return {
          id: item.id, usuarioId: item.user_id, trilhaId: lesson.track_id,
          aulaId: item.lesson_id, concluidoEm: item.completed_at
        };
      }));
      AGIR.store.set('planosEstudo', (commercial.studyPlans || []).map(function (item) {
        return {
          id: item.id, usuarioId: item.user_id, titulo: item.title,
          descricao: item.description || '', inicio: item.starts_on,
          prazo: item.due_on, status: item.status, criadoPor: item.created_by,
          concluidoEm: item.completed_at, criadoEm: item.created_at,
          atualizadoEm: item.updated_at
        };
      }));
      AGIR.store.set('planoTrilhas', (commercial.studyPlanTracks || []).map(function (item) {
        return {
          id: item.id, planoId: item.plan_id, trilhaId: item.track_id,
          ordem: item.position, prazo: item.due_on,
          atribuidoEm: item.assigned_at, atualizadoEm: item.updated_at
        };
      }));
    } else if (module === 'files') {
      AGIR.store.set('categoriasArquivo', (commercial.fileCategories || []).map(function (item) {
        return {
          id: item.id, nome: item.name,
          restrito: item.access_level !== 'organization', accessLevel: item.access_level,
          ativo: item.active
        };
      }));
      AGIR.store.set('arquivos', (commercial.files || []).map(function (item) {
        var extension = (item.name.split('.').pop() || '').toLowerCase();
        var type = /pdf/.test(item.mime_type) ? 'pdf'
          : /spreadsheet|excel|csv/.test(item.mime_type) || /xls/.test(extension) ? 'xls'
          : /presentation|powerpoint/.test(item.mime_type) || /ppt/.test(extension) ? 'ppt'
          : /image/.test(item.mime_type) ? 'img' : 'doc';
        return {
          id: item.id, nome: item.name, categoriaId: item.category_id,
          tipo: type, tamanho: Number(item.size_bytes),
          downloads: Number((item.file_downloads && item.file_downloads[0] && item.file_downloads[0].count) || 0),
          autorId: item.uploaded_by, criadoEm: item.created_at,
          storagePath: item.storage_path, accessLevel: item.access_level
        };
      }));
    }
  }
  function ensurePageData(key, ctx) {
    if (!backendReal()) return Promise.resolve();
    var epoch = syncEpoch;
    var organizationId = AGIR.store.get('session.organizationId');
    var userId = AGIR.store.get('session.userId');
    if (!AGIR.store.get('session.autenticado')) return Promise.reject(new Error('Sessao encerrada.'));
    return Promise.all(pageDataModules(key, ctx).map(function (module) {
      var cacheKey = organizationId + ':' + userId + ':' + module;
      var cached = moduleDataCache.get(cacheKey);
      if (cached && (cached.pending || Date.now() - cached.loadedAt < 60000)) return cached.promise;
      var entry = { pending: true, loadedAt: 0 };
      entry.promise = Promise.resolve().then(function () {
        return global.AGIR_BACKEND.loadCommercialModule({ organizationId: organizationId, module: module });
      }).then(function (data) {
        if (!activeSync(epoch) || organizationId !== AGIR.store.get('session.organizationId') ||
            userId !== AGIR.store.get('session.userId')) throw new Error('Sessao alterada durante o carregamento.');
        AGIR.store.batch(function () { applyCommercialModule(data, module); });
        entry.pending = false;
        entry.loadedAt = Date.now();
      }).catch(function (error) {
        if (moduleDataCache.get(cacheKey) === entry) moduleDataCache.delete(cacheKey);
        throw error;
      });
      moduleDataCache.set(cacheKey, entry);
      return entry.promise;
    }));
  }

  function applyBackendSession(payload) {
    if (AGIR.fin && AGIR.fin.resetSession) AGIR.fin.resetSession();
    resetWorkspaceSync();
    // Descarta colecoes da sessao anterior mesmo se o novo bootstrap falhar.
    if (backendReal()) AGIR.store.load();
    var session = payload && payload.session;
    var context = payload && payload.context;
    var profile = context && context.profile;
    var organizations = (context && context.organizations) || [];
    var organization = organizations[0] || null;

    if (!session || !profile || !organization) {
      AGIR.store.set('session.autenticado', false);
      return null;
    }

    var roleCatalog = {
      admin: { nome: 'Administrador', nivel: 100, cor: 'var(--series-4)', permissoes: ['Acesso total'] },
      manager: { nome: 'Gestor', nivel: 80, cor: 'var(--series-1)', permissoes: ['CRM proprio', 'Dashboard e metas', 'Performance da equipe'] },
      commercial: { nome: 'Vendedor', nivel: 60, cor: 'var(--series-3)', permissoes: ['CRM proprio', 'Atividades proprias', 'Dashboard proprio'] },
      bdr: { nome: 'BDR / Prospeccao', nivel: 50, cor: 'var(--series-2)', permissoes: ['CRM proprio', 'Prospeccao e atividades', 'Dashboard proprio'] },
      operations: { nome: 'Operacoes', nivel: 40, cor: 'var(--series-6)', permissoes: ['Operacao comercial', 'Atividades proprias'] },
      finance: { nome: 'Financeiro', nivel: 40, cor: 'var(--ok-500)', permissoes: ['Financeiro', 'Relatorios financeiros'] },
      user: { nome: 'Usuario', nivel: 20, cor: 'var(--ink-3)', permissoes: ['Acesso basico', 'Registros proprios'] },
      auditor: { nome: 'Auditor', nivel: 30, cor: 'var(--series-7)', permissoes: ['Leitura de auditoria', 'Relatorios permitidos'] }
    };
    var cargoId = 'role_' + organization.role;
    var cargos = Object.keys(roleCatalog).map(function (role) {
      return Object.assign({ id: 'role_' + role, role: role }, roleCatalog[role]);
    });
    AGIR.store.set('cargos', cargos);

    var realUser = {
      id: profile.id,
      nome: profile.full_name,
      email: session.user.email,
      telefone: profile.phone || '',
      ramal: profile.extension || '',
      avatarPath: profile.avatar_path || null,
      avatarUrl: global.AGIR_BACKEND && global.AGIR_BACKEND.avatarUrl ? global.AGIR_BACKEND.avatarUrl(profile.avatar_path) : null,
      cargoId: cargoId,
      equipeId: organization.teams && organization.teams[0] ? organization.teams[0].id : null,
      ativo: profile.active !== false,
      role: organization.role,
      organizationId: organization.id
    };
    AGIR.store.set('usuarios', [realUser]);
    AGIR.store.set('session.userId', realUser.id);
    AGIR.store.set('session.organizationId', organization.id);
    AGIR.store.set('session.role', organization.role);
    AGIR.store.set('session.autenticado', true);
    var preferences = context.preferences || {};
    var currentSettings = AGIR.store.get('settings') || {};
    AGIR.store.set('settings', Object.assign({}, currentSettings, {
      theme: preferences.theme || currentSettings.theme || 'dark',
      density: preferences.density || currentSettings.density || 'normal',
      sidebarCollapsed: preferences.sidebar_collapsed === true,
      moedaOculta: preferences.hide_currency === true,
      modulo: preferences.default_module || null,
      humorAtivo: preferences.mood_checkin_enabled !== false,
      dashboardWidgets: Array.isArray(preferences.dashboard_widgets)
        ? preferences.dashboard_widgets : currentSettings.dashboardWidgets
    }));

    var mood = payload.mood;
    if (mood) {
      AGIR.store.set('escalaHumor', mood.scale.map(function (item) {
        return { nota: item.score, label: item.label, curto: item.label, cor: item.color || 'var(--ink-3)' };
      }));
      AGIR.store.set('fatoresHumor', mood.factors.map(function (item) {
        return {
          id: item.id,
          nome: item.name,
          tom: item.sentiment === 'positive' ? 'bom' : item.sentiment === 'negative' ? 'ruim' : 'neutro'
        };
      }));
      var checkin = mood.checkin;
      AGIR.store.set('humor', checkin ? [{
        id: checkin.id,
        usuarioId: realUser.id,
        data: mood.date,
        nota: checkin.score,
        fatores: (checkin.mood_checkin_factors || []).map(function (item) { return item.factor_id; }),
        comentario: checkin.comment || '',
        criadoEm: checkin.submitted_at
      }] : []);
      var adiado = {};
      if (mood.skipped) adiado[realUser.id] = mood.date;
      AGIR.store.set('settings.humorAdiado', adiado);
    }
    var commercial = payload.commercial;
    if (commercial) {
      var membershipByUser = Object.create(null);
      commercial.memberships.forEach(function (item) { membershipByUser[item.user_id] = item; });
      var teamByUser = Object.create(null);
      commercial.teamMembers.forEach(function (item) { if (!teamByUser[item.user_id]) teamByUser[item.user_id] = item.team_id; });

      AGIR.store.set('equipes', commercial.teams.map(function (item) {
        return { id: item.id, nome: item.name, cor: item.color || 'var(--series-1)', gestorId: item.manager_id, ativo: item.active };
      }));
      var realUsers = commercial.profiles.map(function (item) {
        var membership = membershipByUser[item.id];
        var userRole = membership ? membership.role : (item.id === realUser.id ? realUser.role : 'user');
        var userCargoId = 'role_' + userRole;
        if (!cargos.some(function (cargo) { return cargo.id === userCargoId; })) {
          cargos.push({ id: userCargoId, nome: userRole, role: userRole, nivel: 10, permissoes: ['Acesso definido pelo perfil'] });
        }
        return {
          id: item.id, nome: item.full_name, email: item.email,
          telefone: item.phone || '', ramal: item.extension || '',
          avatarPath: item.avatar_path || null,
          avatarUrl: global.AGIR_BACKEND && global.AGIR_BACKEND.avatarUrl ? global.AGIR_BACKEND.avatarUrl(item.avatar_path) : null,
          cargoId: userCargoId,
          equipeId: teamByUser[item.id] || null, ativo: item.active !== false && (!membership || membership.active !== false),
          admissao: item.admission_date, role: userRole, organizationId: organization.id
        };
      });
      AGIR.store.set('usuarios', realUsers.length ? realUsers : [realUser]);
      AGIR.store.set('rankingVendas', (commercial.salesRanking || []).map(function (item) {
        return {
          ownerId: item.owner_id, fechadoEm: item.closed_at,
          estornoSolicitado: Number(item.requested_reversal) || 0,
          valorTotal: Number(item.production_value) || 0,
          quantidadeVendas: Math.max(1, Number(item.sales_count) || 1),
          produtoId: item.product_id, origemId: item.source_id,
          equipeId: item.team_id, status: 'ganho'
        };
      }));

      AGIR.store.set('pipelines', commercial.pipelines.map(function (pipeline) {
        return {
          id: pipeline.id, nome: pipeline.name, padrao: pipeline.is_default, ativo: pipeline.active,
          etapas: commercial.stages.filter(function (stage) { return stage.pipeline_id === pipeline.id; }).map(function (stage) {
            return {
              id: stage.id, nome: stage.name, ordem: stage.position,
              tipo: stage.stage_type === 'won' ? 'ganho' : stage.stage_type === 'lost' ? 'perdido' : 'aberto',
              prob: Number(stage.probability), sla: stage.sla_days || 0,
              cor: stage.color || 'var(--series-1)', ativo: stage.active
            };
          })
        };
      }));
      AGIR.store.set('produtos', commercial.products.map(function (item) {
        return {
          id: item.id, nome: item.name, codigo: item.code,
          comissaoPct: Number(item.default_commission_rate),
          ticket: [Number(item.min_amount || 0), Number(item.max_amount || 0)], ativo: item.active
        };
      }));
      AGIR.store.set('convenios', commercial.conventions.map(function (item) {
        return { id: item.id, nome: item.name, codigo: item.code, ativo: item.active };
      }));
      AGIR.store.set('bancos', commercial.banks.map(function (item) {
        return { id: item.id, nome: item.name, codigo: item.code, ativo: item.active };
      }));
      AGIR.store.set('origens', commercial.sources.map(function (item, index) {
        return { id: item.id, nome: item.name, codigo: item.code, ativo: item.active, cor: 'var(--series-' + ((index % 8) + 1) + ')' };
      }));
      AGIR.store.set('motivosPerda', commercial.lossReasons.map(function (item) {
        return { id: item.id, nome: item.name, codigo: item.code, ativo: item.active };
      }));
      AGIR.store.set('empresas', (commercial.companies || []).map(function (item) {
        return {
          id: item.id, nome: item.name, razao: item.legal_name, cnpj: item.cnpj,
          tipo: item.company_type, contato: item.contact_name, telefone: item.phone,
          cidade: item.city, uf: item.state, responsavelId: item.owner_id,
          ativo: item.active, criadoEm: item.created_at
        };
      }));
      AGIR.store.set('contatos', commercial.contacts.map(function (item) {
        return {
          id: item.id, nome: item.full_name, cpf: item.cpf, email: item.email,
          telefone: item.phone, cidade: item.city, uf: item.state,
          empresaId: item.company_id, ownerId: item.owner_id,
          consentimento: item.consent_status, ativo: item.active, criadoEm: item.created_at, atualizadoEm: item.updated_at
        };
      }));
      var contactsById = Object.create(null);
      commercial.contacts.forEach(function (item) { contactsById[item.id] = item; });
      AGIR.store.set('etiquetas', commercial.tags.map(function (item) {
        return { id: item.id, nome: item.name, cor: item.color || 'var(--brand-500)' };
      }));
      var tagsByOpportunity = Object.create(null);
      commercial.opportunityTags.forEach(function (item) {
        (tagsByOpportunity[item.opportunity_id] = tagsByOpportunity[item.opportunity_id] || []).push(item.tag_id);
      });
      AGIR.store.set('oportunidades', commercial.opportunities.map(function (item) {
        var contact = contactsById[item.contact_id] || {};
        return {
          id: item.id, pipelineId: item.pipeline_id, titulo: item.title,
          cliente: contact.full_name || item.title, contatoId: item.contact_id,
          cpf: contact.cpf, telefone: contact.phone, email: contact.email,
          cidade: contact.city, uf: contact.state, empresaId: item.company_id,
          produtoId: item.product_id, convenioId: item.convention_id,
          matricula: item.registration_number || '',
          bancoId: item.bank_id, origemId: item.source_id,
          valor: Number(item.amount), comissao: Number(item.expected_commission),
          valorTotal: item.total_value == null ? null : Number(item.total_value),
          valorFinal: item.final_value == null ? null : Number(item.final_value),
          estornoSolicitado: item.requested_reversal == null ? null : Number(item.requested_reversal),
          ownerId: item.owner_id, etapaId: item.stage_id,
          status: item.status === 'won' ? 'ganho' : item.status === 'lost' ? 'perdido' : item.status === 'cancelled' ? 'cancelado' : 'aberto',
          motivoPerdaId: item.loss_reason_id, criadoEm: item.created_at,
          entrouEtapaEm: item.stage_entered_at, atualizadoEm: item.updated_at,
          fechadoEm: item.closed_at, previsaoFechamento: item.expected_close_date,
          tags: tagsByOpportunity[item.id] || [], obs: item.notes || '', version: item.version
        };
      }));
      AGIR.store.set('historicoEtapas', (commercial.stageHistory || []).map(function (item) {
        return {
          id: item.id, oportunidadeId: item.opportunity_id,
          deEtapaId: item.from_stage_id, paraEtapaId: item.to_stage_id,
          alteradoPor: item.changed_by, alteradoEm: item.changed_at,
          duracaoSeg: Number(item.duration_seconds || 0)
        };
      }));
      AGIR.store.set('historicoAlteracoes', (commercial.changeHistory || []).map(function (item) {
        return {
          id: item.id, oportunidadeId: item.opportunity_id,
          alteradoPor: item.changed_by, tipo: item.event_type,
          alteracoes: item.changes || {}, alteradoEm: item.changed_at
        };
      }));
      var activityTypes = { call: 'ligacao', meeting: 'reuniao', whatsapp: 'whatsapp', email: 'email', proposal: 'proposta', follow_up: 'followup', payroll_turn: 'virada_folha', task: 'tarefa' };
      AGIR.store.set('atividades', commercial.activities.map(function (item) {
        return {
          id: item.id, tipo: activityTypes[item.activity_type] || item.activity_type,
          ownerId: item.owner_id, oportunidadeId: item.opportunity_id,
          data: item.completed_at || item.scheduled_at || item.created_at,
          duracaoSeg: item.duration_seconds || 0,
          resultado: item.status === 'pending' ? 'pendente' : (item.result || ''),
          nota: item.notes || '', agendadoPara: item.scheduled_at,
          status: item.status, atualizadoEm: item.updated_at
        };
      }));
      AGIR.store.set('metas', commercial.goals.map(function (item) {
        return {
          id: item.id, usuarioId: item.user_id, ano: item.year, mes: item.month,
          ligacoes: item.calls, agendamentos: item.appointments, reunioes: item.meetings,
          propostas: item.proposals, vendasQtd: item.sales_count,
          vendasValor: Number(item.requested_reversal_amount == null
            ? item.sales_amount : item.requested_reversal_amount)
        };
      }));
      if (commercial.organization) {
        var orgData = commercial.organization;
        AGIR.store.set('empresa', Object.assign({}, AGIR.store.get('empresa') || {}, {
          id: orgData.id, nome: orgData.name, razao: orgData.legal_name || '',
          cnpj: orgData.cnpj || '', telefone: orgData.phone || '', site: orgData.site || '',
          cidade: orgData.city || '', uf: orgData.state || '',
          fundacao: orgData.founded_on || '', segmento: orgData.segment || ''
        }));
      }
      applyCommercialModule(commercial, 'learning');
      applyCommercialModule(commercial, 'files');
      AGIR.store.set('mensagensLead', (commercial.opportunityMessages || []).map(function (item) {
        return {
          id: item.id, oportunidadeId: item.opportunity_id,
          autorId: item.author_id, tipo: item.message_type,
          texto: item.body, mencionados: item.mentioned_user_ids || [],
          criadoEm: item.created_at
        };
      }));
      AGIR.store.set('comprovantesPagamento', (commercial.paymentReceipts || []).map(function (item) {
        return {
          id: item.id, oportunidadeId: item.opportunity_id,
          autorId: item.uploaded_by, nome: item.original_name,
          storagePath: item.storage_path, mimeType: item.mime_type,
          tamanho: Number(item.size_bytes || 0), criadoEm: item.created_at
        };
      }));
      AGIR.store.set('notificacoes', mapNotifications(commercial.notifications));
    }

    if (commercial) {
      lastCrmFullSyncAt = Date.now();
      setSyncState('connecting', true);
    }
    initWorkspaceCoordinator();
    setTimeout(startRealtimeSync, 0);
    return realUser;
  }

  async function logout() {
    AGIR.store.set('session.autenticado', false);
    resetWorkspaceSync();
    if (backendReal()) AGIR.store.load();
    global.AGIR_BOOTSTRAP = null;
    try {
      clearTimeout(realtimeTimer);
      if (realtimeStop) await Promise.resolve(realtimeStop()).catch(function () {});
      realtimeStop = null;
      realtimeStatus = 'CLOSED';
      realtimeStarting = false;
      if (backendReal()) await global.AGIR_BACKEND.signOut();
    } catch (error) {
      console.error('[auth] Falha ao encerrar sessao.', error);
    }
    if (AGIR.fin && AGIR.fin.resetSession) AGIR.fin.resetSession();
    AGIR.store.set('session.autenticado', false);
    AGIR.router.go('/login');
  }

  /* ==========================================================================
     Base de demonstração
     ========================================================================== */
  function exportarBase() {
    var blob = new Blob([AGIR.store.exportJSON()], { type: 'application/json' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'ascensao-base-' + F.iso(new Date()) + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
    AGIR.ui.toast.ok('Dados gerais exportados', 'O backup financeiro é feito em Financeiro › Histórico e fechamento.');
  }

  function importarBase() {
    var inp = h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          AGIR.store.importJSON(fr.result);
          AGIR.ui.toast.ok('Base importada', 'Recarregando as telas…');
          AGIR.router.resolve();
        } catch (e) {
          AGIR.ui.toast.bad('Não deu para importar', e.message);
        }
      };
      fr.readAsText(f);
    });
    document.body.appendChild(inp); inp.click(); inp.remove();
  }

  function recriarBase() {
    AGIR.ui.confirm({
      title: 'Recriar dados de exemplo?',
      text: 'Os exemplos de CRM e treinamento serão recriados. Seus registros financeiros serão preservados no armazenamento próprio do Financeiro.',
      okLabel: 'Recriar', danger: true
    }).then(function (ok) {
      if (!ok) return;
      AGIR.store.reset();
      AGIR.ui.toast.ok('Base recriada', 'Dados de exemplo atualizados.');
      AGIR.router.resolve();
    });
  }

  /* ==========================================================================
     Command palette
     ========================================================================== */
  var paletteOpen = false;

  function paletteItems() {
    var items = [];

    MODULES.forEach(function (m) {
      m.nav.forEach(function (n) {
        if (n.grupo) return;
        items.push({
          group: m.nome, label: n.label, icon: n.icone,
          sub: m.nome, go: n.path,
          key: F.norm(m.nome + ' ' + n.label)
        });
      });
    });
    items.push({ group: 'Sistema', label: 'Configurações', icon: 'settings', go: '/config', key: 'configuracoes ajustes' });
    items.push({ group: 'Sistema', label: 'Escolher módulo', icon: 'grid', go: '/', key: 'modulos trocar' });

    items.push({ group: 'Ações', label: 'Nova oportunidade', icon: 'plus', key: 'nova oportunidade lead negocio',
      run: quickAdd });
    items.push({ group: 'Ações', label: 'Alternar tema claro/escuro', icon: 'moon', key: 'tema dark light escuro claro',
      run: toggleTheme });
    items.push({ group: 'Ações', label: 'Alternar densidade', icon: 'rows', key: 'densidade compacto',
      run: toggleDensity });
    items.push({ group: 'Ações', label: 'Exportar base', icon: 'download', key: 'exportar backup json', run: exportarBase });

    (AGIR.store.get('usuarios') || []).forEach(function (u) {
      items.push({
        group: 'Vendedores', label: u.nome, icon: 'user',
        sub: (AGIR.store.byId('cargos', u.cargoId) || {}).nome,
        key: F.norm(u.nome + ' ' + u.email),
        run: function () { AGIR.pages.vendedorDrawer && AGIR.pages.vendedorDrawer(u.id); }
      });
    });

    (AGIR.store.get('oportunidades') || []).slice(0, 900).forEach(function (o) {
      items.push({
        group: 'Oportunidades', label: o.cliente, icon: 'handshake',
        sub: (AGIR.store.byId('produtos', o.produtoId) || {}).nome + ' · ' + F.moneyShort(o.valor),
        key: F.norm(o.cliente + ' ' + o.titulo + ' ' + o.telefone + ' ' + o.cpf),
        run: function () { AGIR.pages.oppDrawer && AGIR.pages.oppDrawer(o.id); }
      });
    });

    return items;
  }

  function openPalette() {
    if (paletteOpen) return;
    paletteOpen = true;
    var all = paletteItems();
    var input, list;
    var active = 0, shown = [];

    var box = h('div.palette', { role: 'dialog', 'aria-label': 'Busca global' },
      h('div.palette__input',
        icon('search'),
        input = h('input', {
          placeholder: 'Buscar página, vendedor, cliente ou ação…',
          'aria-label': 'Buscar', autofocus: true,
          onInput: function () { render(input.value); },
          onKeydown: onKey
        })
      ),
      list = h('div.palette__list'),
      h('div.palette__foot',
        h('span', h('kbd', { text: '↑↓' }), ' navegar'),
        h('span', h('kbd', { text: '↵' }), ' abrir'),
        h('span', h('kbd', { text: 'esc' }), ' fechar'),
        h('span.spacer'),
        h('span', { text: F.num(all.length) + ' itens' })
      )
    );

    var scrim = h('div.palette-scrim', {
      onMousedown: function (e) { if (e.target === scrim) close(); }
    }, box);
    document.body.appendChild(scrim);
    document.body.style.overflow = 'hidden';
    setTimeout(function () { input.focus(); }, 40);

    function close() {
      paletteOpen = false;
      scrim.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', esc, true);
    }
    function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', esc, true);

    function score(it, q) {
      var i = it.key.indexOf(q);
      if (i < 0) return -1;
      return (i === 0 ? 100 : 50) - i + (it.group === 'Ações' ? 12 : 0);
    }

    function render(q) {
      q = F.norm(q).trim();
      shown = (!q ? all.filter(function (i) {
        return i.group === 'CRM' || i.group === 'Ações' || i.group === 'Performance' || i.group === 'Financeiro';
      }).slice(0, 14)
        : all.map(function (i) { return { it: i, s: score(i, q) }; })
            .filter(function (x) { return x.s >= 0; })
            .sort(function (a, b) { return b.s - a.s; })
            .slice(0, 24)
            .map(function (x) { return x.it; })
      );
      active = 0;
      D.clear(list);
      if (!shown.length) {
        list.appendChild(h('div.empty', { style: { padding: 'var(--sp-8) 0' } },
          h('div.empty__title', { text: 'Nada encontrado' }),
          h('div.empty__text', { text: 'Tente o nome do cliente, do vendedor ou da página.' })
        ));
        return;
      }
      var lastGroup = null;
      shown.forEach(function (it, i) {
        if (it.group !== lastGroup) {
          list.appendChild(h('div.palette__group', { text: it.group }));
          lastGroup = it.group;
        }
        list.appendChild(h('button.palette__item', {
          class: i === active ? 'is-active' : '', 'data-i': i,
          onMouseenter: function () { setActive(i); },
          onClick: function () { pick(it); }
        },
          icon(it.icon),
          h('span.grow',
            highlight(it.label, q),
            it.sub ? h('div.t-tiny.t-dimmer', { text: it.sub }) : null
          ),
          h('span.palette__go', { text: '↵' })
        ));
      });
    }

    function highlight(text, q) {
      if (!q) return h('span', { text: text });
      var i = F.norm(text).indexOf(q);
      if (i < 0) return h('span', { text: text });
      return h('span',
        text.slice(0, i),
        h('mark', { text: text.slice(i, i + q.length) }),
        text.slice(i + q.length)
      );
    }

    function setActive(i) {
      active = i;
      D.qsa('.palette__item', list).forEach(function (b) {
        b.classList.toggle('is-active', +b.dataset.i === i);
      });
      var el = D.qs('.palette__item[data-i="' + i + '"]', list);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % shown.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + shown.length) % shown.length); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    }

    function pick(it) {
      close();
      if (it.go) AGIR.router.go(it.go);
      else if (it.run) it.run();
    }

    render('');
  }

  /* ==========================================================================
     Check-in de humor — primeiro acesso do dia
     ========================================================================== */
  var checkinPendente = false;

  /**
   * Abre o check-in se for o primeiro acesso do dia e o usuário não for admin.
   * Fica fora do fluxo de render da página: a tela carrega normal por trás,
   * então quem pular não perde nada.
   */
  function talvezCheckin(atraso) {
    if (checkinPendente) return;
    if (!AGIR.store.get('session.autenticado')) return;
    if (!AGIR.an.precisaCheckin()) return;
    if (!AGIR.pages.checkinHumor) return;

    checkinPendente = true;
    setTimeout(function () {
      /* revalida: o usuário pode ter respondido em outra aba nesse meio-tempo */
      if (AGIR.an.precisaCheckin()) {
        AGIR.pages.checkinHumor({
          onDone: function () {
            checkinPendente = false;
            AGIR.router.resolve();
          }
        });
      } else {
        checkinPendente = false;
      }
    }, atraso === undefined ? 650 : atraso);
  }

  /* ==========================================================================
     Ação rápida — nova oportunidade
     ========================================================================== */
  function quickAdd() {
    if (AGIR.pages.novaOportunidade) AGIR.pages.novaOportunidade();
    else AGIR.router.go('/crm/pipeline');
  }

  /* ==========================================================================
     Atalhos globais
     ========================================================================== */
  function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); }

  function initShortcuts() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var digitando = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); openPalette(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault(); toggleSidebar(); return;
      }
      if (digitando) return;

      if (e.key === '/') { e.preventDefault(); openPalette(); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); quickAdd(); }
      else if (e.key === '?') { e.preventDefault(); atalhosModal(); }
      else if (e.key.toLowerCase() === 'g') {
        /* sequência "g" + tecla → ir para */
        var once = function (ev) {
          document.removeEventListener('keydown', once, true);
          var map = { p: '/crm/pipeline', d: '/crm/dashboard', l: '/crm/leads', r: '/crm/relatorios',
            m: '/crm/dashboard?view=metas', c: '/performance/cockpit', k: '/performance/ranking', f: '/financeiro/visao' };
          if (map[ev.key.toLowerCase()]) { ev.preventDefault(); AGIR.router.go(map[ev.key.toLowerCase()]); }
        };
        document.addEventListener('keydown', once, true);
        setTimeout(function () { document.removeEventListener('keydown', once, true); }, 1400);
      }
    });
  }

  function atalhosModal() {
    var linhas = [
      ['Ctrl K  /  /', 'Busca global'],
      ['N', 'Nova oportunidade'],
      ['Ctrl B', 'Recolher menu'],
      ['G depois P', 'Ir para Pipeline'],
      ['G depois D', 'Ir para Dashboard'],
      ['G depois L', 'Ir para Leads'],
      ['G depois R', 'Ir para Relatórios'],
      ['G depois C', 'Ir para Cockpit'],
      ['G depois K', 'Ir para Ranking'],
      ['G depois F', 'Ir para Financeiro'],
      ['Esc', 'Fechar painel aberto'],
      ['?', 'Esta lista']
    ];
    AGIR.ui.modal({
      title: 'Atalhos de teclado',
      sub: 'Quem usa atalho fecha mais rápido.',
      body: h('div.col.gap-2', linhas.map(function (l) {
        return h('div.row.between', { style: { padding: '6px 0', borderBottom: '1px solid var(--line)' } },
          h('span.t-small.t-dim', { text: l[1] }),
          h('kbd', { text: l[0] })
        );
      }))
    });
  }

  /* ==========================================================================
     Breadcrumbs
     ========================================================================== */
  function setCrumbs(mod, label) {
    var el = D.qs('#crumbs');
    if (!el) return;
    D.mount(el, h('span.row.gap-2',
      h('a', { href: '#/', text: 'Módulos' }),
      h('span.sep', { text: '/' }),
      h('a', { href: '#' + mod.home, text: mod.nome }),
      h('span.sep', { text: '/' }),
      h('b', { text: label })
    ));
  }

  /* ==========================================================================
     Render de página
     ========================================================================== */
  function renderPage(ctx, builder) {
    var mod = moduleOf(ctx.path) || moduleById((ctx.path === '/config' || ctx.path === '/notifications') ? (currentModId || 'crm') : 'crm');

    if (!canAccessModule(mod)) {
      AGIR.ui.toast.warn('Acesso restrito', 'O módulo Financeiro exige perfil de administrador ou financeiro.');
      AGIR.router.go('/crm/pipeline', true);
      return;
    }

    disposeCurrentPage();
    if (!shellEl || currentModId !== mod.id) buildShell(mod);
    markActive(ctx.path);

    var navItem = mod.nav.concat(NAV_GESTAO).find(function (n) { return n.path === ctx.path; });
    setCrumbs(mod, navItem ? navItem.label : (ctx.meta.titulo || ''));
    document.title = (navItem ? navItem.label + ' · ' : '') + mod.nome + ' · Ascensão Comercial';

    AGIR.motion.loadStart();
    var node = h('div.page');
    try {
      builder(node, ctx);
    } catch (err) {
      console.error('[página]', err);
      node.appendChild(errorBox(err));
    }
    D.mount(pageHost, AGIR.motion.pageIn(node));
    AGIR.motion.initReveal(node);
    AGIR.motion.loadEnd();
    if (mainEl) mainEl.scrollTop = 0;
    global.scrollTo({ top: 0, behavior: 'instant' in global ? 'instant' : 'auto' });
  }

  function errorBox(err) {
    return h('div.card.card--pad.col.gap-3', { style: { borderColor: 'var(--bad-500)' } },
      h('div.row.gap-2', icon('alert', 'ico'), h('b', { text: 'Esta tela quebrou ao montar' })),
      h('div.t-small.t-dim', { text: String(err && err.message || err) }),
      h('pre.t-mono.t-tiny', {
        style: { whiteSpace: 'pre-wrap', color: 'var(--ink-3)', maxHeight: '220px', overflow: 'auto' },
        text: String(err && err.stack || '')
      })
    );
  }

  AGIR.shell = {
    MODULES: MODULES, moduleOf: moduleOf, moduleById: moduleById,
    renderPage: renderPage, openPalette: openPalette, avatar: avatar,
    toggleTheme: toggleTheme, applyPrefs: applyPrefs, persistPrefs: persistPrefs,
    quickAdd: quickAdd, atalhos: atalhosModal, recriarBase: recriarBase,
    talvezCheckin: talvezCheckin
  };

  /* ==========================================================================
     Telas fora do shell: login e seletor de módulos
     ========================================================================== */
  function loginPage() {
    disposeCurrentPage();
    document.title = 'Entrar · Ascensão Comercial';
    var email, senha, submit, helper;
    var view = h('div.login',
      h('form.login__card', {
        onSubmit: function (e) {
          e.preventDefault();
          entrar(email.value.trim());
        }
      },
        h('img.login__logo', { src: 'assets/brand/icon-orange.svg', alt: 'Ascensão Comercial' }),
        h('div.t-h2', { style: { textAlign: 'center' }, text: 'Acesse sua conta' }),
        h('p.t-small.t-dimmer.mt-2', { style: { textAlign: 'center' },
          text: 'Acesso seguro para o expediente da Ascensão Comercial.' }),
        h('div.col.gap-4.mt-7',
          h('div.field',
            h('label.field__label', { for: 'lg-email', text: 'E-mail' }),
            email = h('input.input#lg-email', {
              type: 'email', autocomplete: 'username', required: true,
              value: backendReal() ? '' : 'admin@ascensao.example.test'
            })
          ),
          h('div.col.gap-3',
            h('div.field',
              h('label.field__label', { for: 'lg-senha', text: 'Senha' }),
              senha = h('input.input#lg-senha', {
                type: 'password', autocomplete: 'current-password', required: true,
                value: backendReal() ? '' : 'demonstracao'
              })
            )
          ),
          submit = h('button.btn.btn--primary.btn--lg.btn--block', { type: 'submit', text: 'Entrar' })
        ),
        h('div.row.center.gap-2.mt-6',
          icon('info', 'ico'),
          helper = h('span.t-tiny.t-dimmer', { text: backendReal() ? 'Sua sessao permanece ativa com renovacao segura.' : 'Ambiente de demonstracao.' })
        )
      )
    );
    D.mount(root, view);
    shellEl = null; currentModId = null;

    async function entrar(mail) {
      if (backendReal()) {
        submit.disabled = true;
        submit.textContent = 'Entrando...';
        try {
          var payload = await global.AGIR_BACKEND.signIn(mail, senha.value);
          var realUser = applyBackendSession(payload);
          if (!realUser) throw new Error('Usuario sem acesso ativo a uma organizacao.');
          AGIR.router.go('/');
          if (AGIR.an.precisaCheckin()) talvezCheckin(420);
          else AGIR.ui.toast.ok('Bem-vindo, ' + F.firstName(realUser.nome), 'Escolha um modulo para comecar.');
        } catch (error) {
          console.error('[auth] Login recusado.', error);
          var authError = error && (
            error.name === 'AuthApiError' ||
            error.status === 400 ||
            /invalid login credentials/i.test(error.message || '')
          );
          AGIR.ui.toast.bad(
            'Nao foi possivel entrar',
            authError
              ? 'Confira o e-mail e a senha.'
              : ((error && error.message) || 'Nao foi possivel carregar os dados da sua conta.')
          );
        } finally {
          submit.disabled = false;
          submit.textContent = 'Entrar';
        }
        return;
      }

      var u = (AGIR.store.get('usuarios') || []).find(function (x) {
        return F.norm(x.email) === F.norm(mail);
      }) || AGIR.store.currentUser();
      AGIR.store.set('session.userId', u.id);
      AGIR.store.set('session.role', u.role || (u.cargoId === 'cg_admin' ? 'admin' : u.cargoId === 'cg_gestor' ? 'manager' : 'commercial'));
      AGIR.store.set('session.autenticado', true);
      AGIR.router.go('/');
      if (AGIR.an.precisaCheckin()) talvezCheckin(420);
      else AGIR.ui.toast.ok('Bem-vindo, ' + F.firstName(u.nome), 'Escolha um modulo para comecar.');
    }
  }

  function pickerPage() {
    disposeCurrentPage();
    document.title = 'Módulos · Ascensão Comercial';
    var u = AGIR.store.currentUser();
    shellEl = null; currentModId = null;

    var resumo = resumoModulos();

    var view = h('div.picker',
      h('header.picker__top',
        h('div.picker__brand',
          h('img', { src: 'assets/brand/icon-orange.svg', alt: '' }),
          h('div',
            h('b.t-h4', { text: 'Ascensão Comercial' }),
            h('div.t-tiny.t-dimmer', { text: 'Plataforma Comercial' })
          )
        ),
        h('div.row.gap-2',
          h('button.btn.btn--sm.btn--ghost', {
            onClick: openPalette
          }, icon('search'), h('span', { text: 'Buscar' })),
          h('button.btn.btn--icon.btn--sm.btn--ghost', {
            'aria-label': 'Tema', 'data-tip': 'Alternar tema', onClick: toggleTheme
          }, icon(AGIR.store.pref('theme') === 'dark' ? 'sun' : 'moon')),
          h('button.btn.btn--sm.btn--ghost', { onClick: function () { AGIR.router.go('/config'); } },
            icon('settings'), h('span.only-desk', { text: 'Configurações' })),
          h('button.btn.btn--icon.btn--sm.btn--ghost', {
            'aria-label': 'Sair', 'data-tip': 'Sair', onClick: logout
          }, icon('logout')),
          h('button.no-ripple', { onClick: function (e) { userMenu(e.currentTarget); } }, avatar(u))
        )
      ),
      h('div.picker__body',
        h('div.animate-in',
          h('div.picker__hello', { text: 'Olá, ' + F.firstName(u.nome) }),
          h('h1.picker__h1', { text: 'Escolha um módulo para começar' }),
          h('p.picker__lead', {
            text: 'Acesse a área em que você quer trabalhar agora. Dá para trocar de módulo a qualquer momento pelo menu lateral ou por ' + (isMac() ? '⌘K' : 'Ctrl+K') + '.'
          })
        ),
        h('div.picker__grid.stagger', MODULES.filter(canAccessModule).map(function (m, i) {
          var r = resumo[m.id] || {};
          return h('a.mcard', { href: '#' + m.home, style: { '--i': i } },
            h('div.mcard__cover', {
              style: { '--cover': m.cover, '--cover-glow': m.glow }
            },
              h('span.mcard__tag', { text: m.tag }),
              h('span.mcard__word', { class: 't-display', text: m.palavra }),
              r.stats ? h('div.mcard__meta', r.stats.map(function (st) {
                return h('div.mcard__stat', h('b', { text: st.v }), h('span', { text: st.l }));
              })) : null
            ),
            h('div.mcard__foot',
              h('div.mcard__name', icon(m.icone), h('span', { text: m.nome })),
              h('p.mcard__desc', { text: m.desc }),
              h('span.mcard__cta', h('span', { text: 'Acessar' }), icon('arrowRight'))
            )
          );
        })),
        rodapeAtalhos()
      )
    );
    D.mount(root, view);
    AGIR.motion.initReveal(view);
  }

  function resumoModulos() {
    var out = {};
    try {
      var k = AGIR.an.kpis({ periodo: 'mes' }).atual;
      var p = AGIR.an.paceMes({});
      var abertas = (AGIR.store.get('oportunidades') || []).filter(function (o) { return o.status === 'aberto'; });
      var valorAberto = abertas.reduce(function (a, o) { return a + o.valor; }, 0);

      out.crm = { stats: [
        { v: F.num(abertas.length), l: 'em aberto' },
        { v: F.moneyShort(valorAberto), l: 'no funil' }
      ] };

      var prog = AGIR.store.get('progresso') || [];
      out.performance = { stats: [
        { v: F.num(k.ligacoes), l: 'ligações/mês' },
        { v: F.num(prog.length), l: 'aulas feitas' }
      ] };

      var d = AGIR.an.dre(AGIR.an.competenciaAtual());
      if (AGIR.fin && AGIR.store.get('financeiro.schemaVersion') === 2) {
        var financialResult = AGIR.fin.dre({ month: AGIR.an.competenciaAtual() });
        d = { receitaBruta: financialResult.receitaBrutaCentavos / 100, margemPct: financialResult.margemLiquida };
      }
      out.financeiro = { stats: [
        { v: F.moneyShort(d.receitaBruta), l: 'receita mês' },
        { v: F.pct(d.margemPct, 0), l: 'margem' }
      ] };
      /* silencia se não há meta configurada */
      if (!p.vendasValor.meta) delete out.crm.stats[1];
    } catch (e) { /* base vazia */ }
    return out;
  }

  function rodapeAtalhos() {
    return h('div.row.gap-4.wrap.mt-7', { style: { opacity: .75 } },
      h('span.t-tiny.t-dimmer', { text: 'Atalhos:' }),
      h('span.t-tiny.t-dimmer', h('kbd', { text: isMac() ? '⌘K' : 'Ctrl K' }), ' buscar'),
      h('span.t-tiny.t-dimmer', h('kbd', { text: 'N' }), ' nova oportunidade'),
      h('span.t-tiny.t-dimmer', h('kbd', { text: 'G' }), ' + ', h('kbd', { text: 'P' }), ' pipeline'),
      h('button.t-tiny', { style: { color: 'var(--brand-500)', fontWeight: 600 }, onClick: atalhosModal },
        'ver todos')
    );
  }

  /* ==========================================================================
     Rotas
     ========================================================================== */
  function registerRoutes() {
    var R = AGIR.router;

    AGIR.pages.crmEmDesenvolvimento = function (node) {
      node.appendChild(AGIR.w.pageHead({
        icon: 'clock', title: 'Em desenvolvimento',
        sub: 'Este recurso está sendo preparado para uma próxima versão da plataforma.'
      }));
      node.appendChild(AGIR.ui.empty({
        icon: 'layers', title: 'Em desenvolvimento',
        text: 'A estrutura desta área será liberada quando o fluxo estiver pronto para uso.'
      }));
    };

    R.guard(function (ctx) {
      if (ctx.path === '/login') return AGIR.store.get('session.autenticado') ? '/' : undefined;
      if (!AGIR.store.get('session.autenticado')) return '/login';
      if (ctx.path.indexOf('/financeiro/') === 0 && !canAccessFinance()) return '/crm/pipeline';
      if (ctx.path === '/performance/clima' && !isManagement()) return '/performance/inicio';
    });

    R.on('/login', loginPage);
    R.on('/', pickerPage);

    function page(path, key) {
      R.on(path, function (ctx) {
        var builder = AGIR.pages[key];
        if (builder && !/^fin/.test(key) && (!backendReal() || !pageDataModules(key, ctx).length)) { renderPage(ctx, builder); return; }

        if (typeof global.AGIR_LOAD_PAGE_SCRIPT !== 'function') {
          renderPage(ctx, function (node) {
            node.appendChild(AGIR.ui.empty({
              icon: 'layers', title: 'Esta tela ainda não foi montada',
              text: 'O módulo de tela "' + key + '" não está disponível.'
            }));
          });
          return;
        }

        renderPage(ctx, function (node) {
          node.appendChild(h('div.page__head', h('div',
            h('h1.page__title', { text: 'Carregando' }),
            h('p.page__sub', { text: 'Preparando esta área somente no primeiro acesso.' })
          )));
          node.appendChild(h('div.col.gap-3',
            h('div.sk.sk--title'), h('div.sk', { style: { height: '120px' } }),
            h('div.sk', { style: { height: '260px' } })
          ));
        });

        Promise.all([global.AGIR_LOAD_PAGE_SCRIPT(key), ensurePageData(key, ctx)]).then(function () {
          var current = R.current;
          if (!current || current.raw !== ctx.raw) return;
          var loadedBuilder = AGIR.pages[key];
          if (!loadedBuilder) throw new Error('O arquivo carregou, mas não registrou a tela "' + key + '".');
          renderPage(ctx, loadedBuilder);
        }).catch(function (error) {
          var current = R.current;
          if (!current || current.raw !== ctx.raw) return;
          console.error('[rota] Falha ao carregar ' + key + '.', error);
          renderPage(ctx, function (node) { node.appendChild(errorBox(error)); });
        });
      });
    }

    page('/crm/pipeline', 'crmPipeline');
    page('/crm/dashboard', 'crmDashboard');
    page('/crm/leads', 'crmLeads');
    page('/crm/contatos', 'crmContatos');
    page('/crm/atividades', 'crmAtividades');
    page('/crm/automacoes', 'crmEmDesenvolvimento');
    page('/crm/emails', 'crmEmDesenvolvimento');
    page('/crm/relatorios', 'crmRelatorios');
    R.on('/crm/metas', function () { R.go('/crm/dashboard?view=metas', true); });

    page('/performance/cockpit', 'perfCockpit');
    page('/performance/inicio', 'perfInicio');
    page('/performance/conteudos', 'perfConteudos');
    page('/performance/ranking', 'perfRanking');
    page('/performance/clima', 'perfClima');
    page('/performance/ligacoes', 'perfLigacoes');
    page('/performance/arquivos', 'perfArquivos');
    R.on('/performance/usuarios', function () { R.go('/config?sec=geral&tab=usuarios', true); });

    page('/financeiro/visao', 'finVisao');
    page('/financeiro/dre', 'finDRE');
    page('/financeiro/fluxo', 'finFluxo');
    page('/financeiro/lancamentos', 'finLancamentos');
    page('/financeiro/orcamento', 'finOrcamento');
    page('/financeiro/pagar', 'finPagar');
    page('/financeiro/receber', 'finReceber');
    page('/financeiro/contas', 'finContas');
    page('/financeiro/conciliacao', 'finConciliacao');
    page('/financeiro/cadastros', 'finCadastros');
    page('/financeiro/aprovacoes', 'finAprovacoes');
    page('/financeiro/relatorios', 'finRelatorios');
    page('/financeiro/analise', 'finAnalise');
    page('/financeiro/auditoria', 'finAuditoria');

    page('/config', 'config');
    page('/notifications', 'notifications');

    R.fallback(function (ctx) {
      renderPage({ path: '/crm/pipeline', meta: {}, query: {} }, function (node) {
        node.appendChild(AGIR.ui.empty({
          icon: 'search', title: 'Página não encontrada',
          text: 'O endereço ' + ctx.path + ' não existe nesta plataforma.',
          action: { label: 'Voltar para os módulos', icon: 'grid', onClick: function () { R.go('/'); } }
        }));
      });
    });
  }

  /* ==========================================================================
     Boot
     ========================================================================== */
  function boot() {
    root = D.qs('#app');
    AGIR.store.load();
    if (backendReal()) applyBackendSession(global.AGIR_BOOTSTRAP);
    applyPrefs();
    AGIR.ui.init();
    if (backendReal() && global.AGIR_BOOTSTRAP && global.AGIR_BOOTSTRAP.loadError) {
      setTimeout(function () {
        AGIR.ui.toast.warn('Sessao restaurada', 'Alguns dados comerciais nao responderam, mas seu acesso foi mantido. Tente novamente em instantes.');
      }, 300);
    }
    initShortcuts();
    registerRoutes();
    AGIR.router.start();

    /* recalcula contadores da sidebar quando os dados mudam */
    var navRefreshPending = false, navRefreshTimer, previousNavSignature = '';
    function refreshNavigationCounts() {
      navRefreshTimer = null;
      if (document.hidden) { navRefreshPending = true; return; }
      navRefreshPending = false;
      if (!sideEl) return;
      var mod = moduleById(currentModId);
      if (!mod) return;
      var signature = JSON.stringify([currentModId, navCounts()]);
      if (signature === previousNavSignature) return;
      previousNavSignature = signature;
      D.mount(D.qs('.side__nav', sideEl), navList(mod));
      if (topNotificationHost) D.mount(topNotificationHost, notificationButton());
      var cur = AGIR.router.current;
      if (cur) markActive(cur.path);
    }
    AGIR.store.subscribe(['oportunidades', 'atividades', 'notificacoes'], function () {
      navRefreshPending = true;
      if (!navRefreshTimer && !document.hidden) navRefreshTimer = setTimeout(refreshNavigationCounts, 120);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden || !AGIR.store.get('session.autenticado')) return;
      if (navRefreshPending) refreshNavigationCounts();
      refreshNotifications();
      if (realtimeStatus !== 'SUBSCRIBED') startRealtimeSync();
      if (realtimePending || needsReconciliation) scheduleCrmRefresh(0, false);
    });
    global.addEventListener('online', function () {
      if (!AGIR.store.get('session.autenticado')) return;
      startRealtimeSync();
      refreshNotifications();
      scheduleCrmRefresh(0, true);
    });
    global.addEventListener('offline', function () {
      if (!backendReal()) return;
      clearTimeout(reconnectTimer);
      clearTimeout(realtimeTimer);
      needsReconciliation = realtimePending = true;
      realtimeStatus = 'CLOSED';
      setSyncState('offline');
    });
    global.addEventListener('ascensao:opportunity-committed', function (event) {
      var row = (event.detail || {}).row;
      if (row) applyCrmRealtimeDelta({ table: 'opportunities', payload: { eventType: 'UPDATE', new: row } });
    });
    global.addEventListener('ascensao:business-conflict', function (event) {
      // The write coordinator already performed one bounded, RLS-scoped read.
      // Reuse it instead of reloading all CRM tables after every conflict.
      var detail = event.detail || {};
      if (!detail.reconciled) {
        needsReconciliation = true;
        return;
      }
      if (detail.row && detail.row.contacts) {
        applyCrmRealtimeDelta({ table: 'contacts', payload: { eventType: 'UPDATE', new: detail.row.contacts } });
      }
      applyCrmRealtimeDelta({ table: 'opportunities', payload: detail.row
        ? { eventType: 'UPDATE', new: detail.row }
        : { eventType: 'DELETE', old: { id: detail.opportunityId } } });
    });

    talvezCheckin();

    var boas = AGIR.store.get('settings.primeiroAcesso');
    if (boas && !backendReal()) {
      AGIR.store.pref('primeiroAcesso', false);
      setTimeout(function () {
        AGIR.ui.toast({
          title: 'Base de demonstração carregada',
          text: '~6 meses de histórico comercial gerado. Tudo que você editar fica salvo neste navegador.',
          tone: 'info', ms: 8000,
          action: { label: 'Ver atalhos', onClick: atalhosModal }
        });
      }, 900);
    }

    global.dispatchEvent(new CustomEvent('ascensao:ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
