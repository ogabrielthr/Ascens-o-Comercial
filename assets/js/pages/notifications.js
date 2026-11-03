/* ========================================================================== 
   AGIR — Notificações
   Caixa pessoal com menções, alterações dos leads e leitura persistente.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui;
  var S = function () { return AGIR.store; };

  var TYPE_META = {
    mention: { label: 'Menção', icon: 'users', tone: 'brand' },
    lead_updated: { label: 'Lead alterado', icon: 'edit', tone: 'info' },
    lead_message: { label: 'Mensagem', icon: 'mail', tone: 'info' },
    activity_updated: { label: 'Atividade', icon: 'activity', tone: 'warn' },
    payment_receipt: { label: 'Comprovante', icon: 'receipt', tone: 'ok' }
  };

  AGIR.pages.notifications = function (node, ctx) {
    var view = (ctx.query && ctx.query.view) || 'all';
    var current = S().currentUser() || {};
    var host = h('div.notifications-host');
    var markAllButton = h('button.btn.btn--sm', { onClick: markAllRead },
      icon('checkcircle'), h('span', { text: 'Marcar todas como lidas' }));

    node.appendChild(W.pageHead({
      eyebrow: 'Central pessoal', icon: 'bell', title: 'Notificações',
      sub: 'Menções, atividades e tudo que muda nos leads sob sua responsabilidade.',
      actions: [markAllButton]
    }));
    node.appendChild(host);
    render();

    var unsubscribe = S().subscribe(['notificacoes'], render);
    if (typeof AGIR.onPageDispose === 'function') AGIR.onPageDispose(unsubscribe);

    function all() {
      return (S().get('notificacoes') || [])
        .filter(function (item) { return !current.id || !item.destinatarioId || item.destinatarioId === current.id; })
        .sort(function (a, b) { return new Date(b.criadoEm) - new Date(a.criadoEm); });
    }

    function unread() { return all().filter(function (item) { return !item.lidaEm; }); }

    function visible() {
      var items = all();
      if (view === 'unread') return items.filter(function (item) { return !item.lidaEm; });
      if (view === 'mentions') return items.filter(function (item) { return item.tipo === 'mention'; });
      if (view === 'leads') return items.filter(function (item) { return item.tipo !== 'mention'; });
      return items;
    }

    function render() {
      var items = all();
      var unreadItems = unread();
      var mentions = items.filter(function (item) { return item.tipo === 'mention'; });
      var leadUpdates = items.filter(function (item) { return item.tipo !== 'mention'; });
      var list = visible();
      markAllButton.disabled = unreadItems.length === 0;

      D.mount(host, h('div.notifications-page',
        h('section.notification-overview',
          summary('Não lidas', unreadItems.length, 'bell', 'brand', 'Pedem sua atenção'),
          summary('Menções', mentions.length, 'users', 'info', 'Conversas em que acionaram você'),
          summary('Atualizações', leadUpdates.length, 'activity', 'ok', 'Movimentos nos seus leads')
        ),
        h('div.notification-toolbar',
          h('div.tabs',
            tab('all', 'Todas', items.length),
            tab('unread', 'Não lidas', unreadItems.length),
            tab('mentions', 'Menções', mentions.length),
            tab('leads', 'Leads', leadUpdates.length)
          ),
          h('span.notification-toolbar__status',
            h('span.notification-live-dot'),
            h('span', { text: global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase' ? 'Atualização automática ativa' : 'Modo demonstração' })
          )
        ),
        list.length ? h('section.notification-list', groupRows(list)) : UI.empty({
          icon: view === 'unread' ? 'checkcircle' : 'bell',
          title: view === 'unread' ? 'Tudo em dia' : 'Nenhuma notificação por aqui',
          text: view === 'unread'
            ? 'Você já leu todas as atualizações recebidas.'
            : 'Menções e alterações dos seus leads aparecerão automaticamente nesta tela.'
        })
      ));
    }

    function summary(label, value, summaryIcon, tone, detail) {
      return h('div.notification-summary.notification-summary--' + tone,
        h('div.notification-summary__icon', icon(summaryIcon)),
        h('div',
          h('strong', { text: F.num(value) }),
          h('span', { text: label }),
          h('small', { text: detail })
        )
      );
    }

    function tab(id, label, count) {
      return h('a.tab' + (view === id ? '.is-active' : ''), {
        href: AGIR.router.href('/notifications', { view: id === 'all' ? null : id })
      }, h('span', { text: label }), count ? h('span.badge', { text: count }) : null);
    }

    function groupRows(items) {
      var today = F.iso(new Date());
      var recent = [], older = [];
      items.forEach(function (item) {
        (F.iso(item.criadoEm) === today ? recent : older).push(item);
      });
      var parts = [];
      if (recent.length) parts.push(group('Hoje', recent));
      if (older.length) parts.push(group('Anteriores', older));
      return parts;
    }

    function group(label, items) {
      return h('div.notification-group',
        h('div.notification-group__head',
          h('span', { text: label }),
          h('small', { text: F.plural(items.length, 'notificação', 'notificações') })
        ),
        h('div.notification-group__rows', items.map(row))
      );
    }

    function row(item) {
      var meta = TYPE_META[item.tipo] || TYPE_META.lead_updated;
      var actor = S().byId('usuarios', item.atorId);
      var opportunity = S().byId('oportunidades', item.oportunidadeId);
      return h('article.notification-row' + (!item.lidaEm ? '.is-unread' : ''), {
        role: item.oportunidadeId ? 'button' : 'article', tabindex: item.oportunidadeId ? '0' : null,
        onClick: function () { openNotification(item); },
        onKeydown: function (event) {
          if (item.oportunidadeId && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault(); openNotification(item);
          }
        }
      },
        h('div.notification-row__avatar',
          actor ? AGIR.shell.avatar(actor, 'sm') : h('span.notification-row__type.notification-row__type--' + meta.tone, icon(meta.icon))
        ),
        h('div.notification-row__content',
          h('div.notification-row__top',
            h('div.row.gap-2.wrap',
              h('strong', { text: item.titulo }),
              h('span.badge.notification-kind.notification-kind--' + meta.tone, { text: meta.label })
            ),
            h('time', { datetime: item.criadoEm, text: F.relative(item.criadoEm), title: F.dateTime(item.criadoEm) })
          ),
          item.texto ? h('p', { text: item.texto }) : null,
          opportunity ? h('div.notification-row__lead', icon('kanban'), h('span', { text: opportunity.cliente || opportunity.titulo })) : null
        ),
        !item.lidaEm ? h('span.notification-unread-dot', { 'aria-label': 'Não lida' }) : null,
        item.oportunidadeId ? h('span.notification-row__arrow', icon('chevRight')) : null
      );
    }

    async function setRead(item, read) {
      var previous = item.lidaEm;
      var next = read ? new Date().toISOString() : null;
      S().update('notificacoes', item.id, { lidaEm: next });
      if (!(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')) return true;
      try {
        await global.AGIR_BACKEND.markNotificationRead({
          organizationId: S().get('session.organizationId'), notificationId: item.id, read: read
        });
        return true;
      } catch (error) {
        S().update('notificacoes', item.id, { lidaEm: previous });
        UI.toast.bad('Não foi possível atualizar a notificação', error.message || 'Tente novamente.');
        return false;
      }
    }

    async function openNotification(item) {
      if (!item.lidaEm) await setRead(item, true);
      if (item.oportunidadeId) {
        AGIR.router.go('/crm/pipeline?lead=' + encodeURIComponent(item.oportunidadeId));
      }
    }

    async function markAllRead() {
      var pending = unread();
      if (!pending.length) return;
      var readAt = new Date().toISOString();
      var previous = S().get('notificacoes') || [];
      S().set('notificacoes', previous.map(function (item) {
        return !item.lidaEm ? Object.assign({}, item, { lidaEm: readAt }) : item;
      }));
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        try {
          await global.AGIR_BACKEND.markAllNotificationsRead({ organizationId: S().get('session.organizationId') });
        } catch (error) {
          S().set('notificacoes', previous);
          UI.toast.bad('Não foi possível marcar todas como lidas', error.message || 'Tente novamente.');
          return;
        }
      }
      UI.toast.ok('Notificações organizadas', F.plural(pending.length, 'item') + ' marcado(s) como lido(s).');
    }
  };
})(window);
