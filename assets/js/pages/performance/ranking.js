/* ==========================================================================
   AGIR — Performance / Ranking de Vendas
   Placar para TV, ordenado pelo Valor Estornado das vendas ganhas.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an;
  var S = function () { return AGIR.store; };

  AGIR.pages.perfRanking = function (node, ctx) {
    var f = W.readFilters(ctx.query || {});
    var linhas = An.rankingVendasEstornadas(f);
    var periodo = linhas.range || An.range(f.periodo);
    var totalEstornado = linhas.totalEstornado || 0;
    var vendas = linhas.reduce(function (s, l) { return s + l.vendasQtd; }, 0);
    var vendedoresAtivos = linhas.filter(function (l) { return l.estornoTotal > 0; }).length;
    var lider = linhas[0] || null;
    var refreshing = false;
    var lastUpdatedAt = null;
    var disposed = false;
    var celebrationTimer = null;
    var celebrationExitTimer = null, celebrationOverlay = null;
    var failures = 0, nextAttemptAt = 0, statusNode, board, boardSignature;
    var seenSales = new Set(), baselineLoaded = false, observedThrough = Date.now();
    var refreshTimer, rowsSignature = '', sourceRevision = '', rankingLease = null;
    var rankingController = new AbortController();
    var isRemote = global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase';
    var ambientTimer = global.setTimeout(function () { node.classList.add('is-motion-settled'); }, 10000);

    node.classList.add('page--wide', 'sales-rank-page');
    renderBoard();

    if (typeof AGIR.createWorkspaceLeader === 'function') {
      rankingLease = AGIR.createWorkspaceLeader({
        scope: 'ranking:' + S().get('session.organizationId') + ':' + JSON.stringify([
          periodo.from.toISOString(), periodo.to.toISOString(),
          f.equipeId || '', f.produtoId || '', f.origemId || ''
        ])
      });
      rankingLease.subscribe(function (message) {
        if (!rankingLease.isLeader() && message.type === 'ranking-data' && message.payload) {
          applyRankingResponse(message.payload.response, message.payload.requestedAt);
        }
      });
      rankingLease.onLeadership(function (leader) {
        global.clearTimeout(refreshTimer);
        if (leader) scheduleRefresh(0);
        else rankingController.abort();
      });
    } else scheduleRefresh(1200);
    global.document.addEventListener('visibilitychange', onVisibility);
    global.addEventListener('ascensao:sync-status', onSync);
    global.addEventListener('ascensao:crm-refreshed', onCrmChange);
    if (typeof AGIR.onPageDispose === 'function') {
      AGIR.onPageDispose(function () {
        disposed = true;
        rankingController.abort();
        global.clearTimeout(ambientTimer);
        global.clearInterval(refreshTimer);
        global.clearTimeout(refreshTimer);
        global.clearTimeout(celebrationTimer);
        global.clearTimeout(celebrationExitTimer);
        if (rankingLease) rankingLease.dispose();
        global.document.removeEventListener('visibilitychange', onVisibility);
        global.removeEventListener('ascensao:sync-status', onSync);
        global.removeEventListener('ascensao:crm-refreshed', onCrmChange);
        if (celebrationOverlay) celebrationOverlay.remove();
      });
    }

    function renderBoard() {
      linhas = An.rankingVendasEstornadas(f);
      periodo = linhas.range || An.range(f.periodo);
      totalEstornado = linhas.totalEstornado || 0;
      vendas = linhas.reduce(function (sum, line) { return sum + line.vendasQtd; }, 0);
      vendedoresAtivos = linhas.filter(function (line) { return line.estornoTotal > 0; }).length;
      lider = linhas[0] || null;
      var signature = JSON.stringify([linhas, totalEstornado, periodo.label, F.date(periodo.from), F.date(periodo.to), S().get('equipes'), Boolean(lastUpdatedAt)]);
      if (signature === boardSignature) return;
      var finishMeasurement = AGIR.perf ? AGIR.perf.start('ranking.render') : function () {};
      boardSignature = signature;
      var nextBoard = h('div.sales-rank-board',
        h('div.sales-rank-board__glow', { 'aria-hidden': 'true' }),
        board ? h('header.sales-rank-header') : cabecalho(),
        resumoGeral(),
        isRemote && !lastUpdatedAt ? h('div', { role: 'status', text: 'Carregando placar compartilhado…' })
          : linhas.length && totalEstornado > 0 ? podio() : vazio(),
        linhas.length > 3 ? classificacao() : null,
        h('div.sales-rank-footnote',
          icon('info'),
          h('span', { text: 'Critério: soma do Valor Estornado nas oportunidades marcadas como ganhas e fechadas no período selecionado.' })
        )
      );
      if (board) patchElement(board, nextBoard);
      else { board = nextBoard; D.mount(node, board); }
      finishMeasurement();
    }

    // Keep existing buttons, podium and list nodes, including keyboard focus.
    function patchElement(current, next) {
      if (current.nodeType === 3) {
        if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
        return;
      }
      if (current.classList.contains('sales-rank-header')) return;
      Array.from(current.attributes).forEach(function (attr) { if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name); });
      Array.from(next.attributes).forEach(function (attr) { if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value); });
      var keyed = new Map();
      Array.from(current.children).forEach(function (child) { if (child.dataset.rankKey) keyed.set(child.dataset.rankKey, child); });
      var nextChildren = Array.from(next.childNodes);
      nextChildren.forEach(function (child, index) {
        var key = child.nodeType === 1 && child.dataset.rankKey;
        var old = key ? keyed.get(key) : current.childNodes[index];
        if (!old || old.nodeType !== child.nodeType || old.nodeName !== child.nodeName || (!key && old.nodeType === 1 && old.dataset.rankKey)) {
          current.insertBefore(child, current.childNodes[index] || null);
        } else {
          if (current.childNodes[index] !== old) current.insertBefore(old, current.childNodes[index] || null);
          patchElement(old, child);
        }
      });
      while (current.childNodes.length > nextChildren.length) current.lastChild.remove();
    }

    function scheduleRefresh(delay) {
      global.clearTimeout(refreshTimer);
      if (disposed || global.document.hidden || (rankingLease && !rankingLease.isLeader())) return;
      refreshTimer = global.setTimeout(refreshRanking, Math.max(delay, nextAttemptAt - Date.now(), 0));
    }
    function onVisibility() {
      node.classList.toggle('is-motion-paused', global.document.hidden);
      if (global.document.hidden) { global.clearTimeout(refreshTimer); rankingController.abort(); }
      else scheduleRefresh(0);
    }
    var lastSyncStatus;
    function onCrmChange() {
      if (!failures) nextAttemptAt = 0;
      if (!refreshing) scheduleRefresh(0);
    }
    function onSync() {
      var status = (AGIR.syncState || {}).status;
      if (status === lastSyncStatus) return;
      lastSyncStatus = status;
      if (!refreshing && /connected|subscribed|live/.test(status || '')) scheduleRefresh(failures ? 0 : 1200);
    }
    function updateStatus() {
      if (!statusNode) return;
      var valid = lastUpdatedAt ? 'Atualizado ' + lastUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Aguardando atualização';
      statusNode.textContent = valid + (failures ? ' · Falha de conexão; nova tentativa automática' : '');
    }

    async function refreshRanking() {
      if (disposed || !node.isConnected) {
        global.clearInterval(refreshTimer);
        return;
      }
      if (refreshing || global.document.hidden || (rankingLease && !rankingLease.isLeader()) || !(global.AGIR_BACKEND
          && global.AGIR_BACKEND.mode === 'supabase'
          && typeof global.AGIR_BACKEND.loadSalesRanking === 'function')) return;
      refreshing = true;
      rankingController = new AbortController();
      var requestedAt = Date.now();
      try {
        var currentRange = An.range(f.periodo);
        var trendStart = F.addDays(currentRange.to, -8 * Math.max(1, Math.round(currentRange.dias / 8)) + 1);
        trendStart.setHours(0, 0, 0, 0);
        var response = await global.AGIR_BACKEND.loadSalesRanking({
          organizationId: S().get('session.organizationId'),
          from: new Date(Math.min(currentRange.prevFrom.getTime(), trendStart.getTime(), currentRange.from.getTime())),
          to: currentRange.to,
          teamId: f.equipeId || null,
          productId: f.produtoId || null,
          sourceId: f.origemId || null,
          recentAfter: baselineLoaded ? new Date(observedThrough) : null,
          signal: rankingController.signal
        });
        if (disposed || !node.isConnected || rankingController.signal.aborted) return;
        applyRankingResponse(response, requestedAt);
        if (rankingLease) rankingLease.broadcast('ranking-data', { response: response, requestedAt: requestedAt });
      } catch (error) {
        if (disposed || !node.isConnected || rankingController.signal.aborted) return;
        failures++;
        console.warn('[ranking] Nao foi possivel atualizar o placar automaticamente.', error);
      } finally {
        refreshing = false;
        if (!disposed && node.isConnected) {
          updateStatus();
          var delay = failures ? Math.min(300000, 15000 * Math.pow(2, Math.min(failures, 5))) : 15000;
          nextAttemptAt = Date.now() + delay;
          scheduleRefresh(delay);
        }
      }
    }

    function applyRankingResponse(response, requestedAt) {
        if (disposed || !node.isConnected) return;
        var rows = Array.isArray(response) ? response : response.entries;
        var recentSales = Array.isArray(response) ? response : response.recent;
        var signature = JSON.stringify(rows);
        if (signature !== rowsSignature) S().set('rankingVendas', rows.map(function (item) {
          return {
            id: item.sale_id || item.opportunity_id || item.id || null,
            ownerId: item.owner_id, fechadoEm: item.closed_at,
            estornoSolicitado: Number(item.requested_reversal) || 0,
            valorTotal: Number(item.production_value) || 0,
            quantidadeVendas: Math.max(1, Number(item.sales_count) || 1),
            produtoId: item.product_id, origemId: item.source_id,
            equipeId: item.team_id, status: 'ganho'
          };
        }));
        lastUpdatedAt = new Date();
        failures = 0;
        var revision = ['usuarios', 'equipes', 'cargos'].map(function (key) { return S().revision(key); }).join(':');
        if (signature !== rowsSignature || revision !== sourceRevision) renderBoard();
        rowsSignature = signature; sourceRevision = revision;
        var newSales = recentSales.filter(function (item) {
          var id = item.sale_id || item.opportunity_id || item.id;
          if (!id) return false; // Aggregates without a stable ID cannot prove a new sale.
          var completion = id + ':' + item.closed_at;
          var unseen = !seenSales.has(completion);
          seenSales.add(completion);
          var closedAt = new Date(item.closed_at).getTime();
          return baselineLoaded && unseen && closedAt >= observedThrough && closedAt <= requestedAt
            && closedAt >= periodo.from.getTime() && closedAt <= periodo.to.getTime()
            && (!f.equipeId || item.team_id === f.equipeId)
            && (!f.produtoId || item.product_id === f.produtoId)
            && (!f.origemId || item.source_id === f.origemId);
        });
        baselineLoaded = true;
        observedThrough = requestedAt;
        var sale = newSales[0];
        var winner = sale && linhas.find(function (line) { return line.usuario.id === sale.owner_id; });
        if (winner) celebrateSale(winner, { estorno: winner.estornoTotal - (Number(sale.requested_reversal) || 0) });
        updateStatus();
    }

    function celebrateSale(line, previous) {
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (celebrationOverlay) celebrationOverlay.remove();
      global.clearTimeout(celebrationExitTimer);
      var delta = Math.max(0, line.estornoTotal - ((previous && previous.estorno) || 0));
      var overlay = h('div.ranking-sale-celebration', { role: 'status', 'aria-live': 'polite' },
        h('div.ranking-sale-celebration__burst', { 'aria-hidden': 'true' },
          Array.from({ length: 24 }, function (_, index) { return h('i', { style: { '--i': index } }); })
        ),
        h('div.ranking-sale-celebration__content',
          h('span.ranking-sale-celebration__kicker', { text: 'NOVA VENDA NO PLACAR' }),
          h('div.ranking-sale-celebration__trophy', icon('trophy')),
          h('strong', { text: line.usuario.nome }),
          h('span', { text: delta > 0 ? '+' + F.money(delta) + ' em Estorno Solicitado' : 'Nova venda contabilizada' })
        )
      );
      node.appendChild(overlay);
      celebrationOverlay = overlay;
      global.clearTimeout(celebrationTimer);
      celebrationTimer = global.setTimeout(function () {
        overlay.classList.add('is-leaving');
        celebrationExitTimer = global.setTimeout(function () { overlay.remove(); celebrationOverlay = null; }, 700);
      }, 4200);
    }

    function cabecalho() {
      return h('header.sales-rank-header',
        h('div.sales-rank-heading',
          h('div.sales-rank-kicker',
            h('span.sales-rank-kicker__dot'),
            h('span', { text: 'PLACAR COMERCIAL' }),
            h('span.sales-rank-kicker__sep'),
            h('span', { text: 'VALOR ESTORNADO' })
          ),
          h('h1.sales-rank-title',
            h('span', { text: 'Ranking de ' }),
            h('strong', { text: 'Vendas' })
          ),
          h('p.sales-rank-subtitle', {
            text: 'Os maiores resultados da Ascensão Comercial, com destaque para quem lidera o valor estornado.'
          })
        ),
        h('div.sales-rank-controls',
          h('label.sales-rank-select',
            h('span', { text: 'Período' }),
            h('select.select', {
              'aria-label': 'Período do ranking',
              onChange: function () { AGIR.router.setQuery({ periodo: this.value }); }
            }, An.PRESETS.map(function (p) {
              return h('option', { value: p.value, text: p.label, selected: p.value === f.periodo });
            }))
          ),
          h('label.sales-rank-select',
            h('span', { text: 'Equipe' }),
            h('select.select', {
              'aria-label': 'Equipe do ranking',
              onChange: function () { AGIR.router.setQuery({ equipe: this.value || null }); }
            },
              h('option', { value: '', text: 'Todas as equipes' }),
              (S().get('equipes') || []).filter(function (e) { return e.ativo !== false; }).map(function (e) {
                return h('option', { value: e.id, text: e.nome, selected: e.id === f.equipeId });
              })
            )
          ),
          h('button.btn.btn--sm.sales-rank-tv', { onClick: entrarModoTV },
            icon('external'), h('span', { text: 'Tela cheia' })),
          statusNode = h('span.t-tiny.t-dimmer', { role: 'status', text: 'Aguardando atualização' })
        )
      );
    }

    function resumoGeral() {
      return h('section.sales-rank-summary', { 'data-rank-key': 'summary' },
        summaryItem('coins', 'Valor estornado no período', totalEstornado, F.money, 'is-primary'),
        summaryItem('trophy', 'Líder atual', lider ? primeiroNome(lider.usuario.nome) : '—', null, 'is-leader'),
        summaryItem('checkcircle', 'Vendas ganhas', vendas, F.num),
        summaryItem('users', 'Vendedores pontuando', vendedoresAtivos, F.num),
        h('div.sales-rank-summary__period',
          h('span', { text: periodo.label }),
          h('b', { text: F.date(periodo.from) + ' — ' + F.date(periodo.to) })
        )
      );
    }

    function summaryItem(icone, label, value, format, extraClass) {
      var valueNode = typeof value === 'number'
        ? h('span', { text: (format || F.num)(value) })
        : h('span', { text: value });
      return h('div.sales-rank-summary__item' + (extraClass ? '.' + extraClass : ''),
        h('span.sales-rank-summary__icon', icon(icone)),
        h('div',
          h('span.sales-rank-summary__label', { text: label }),
          h('strong.sales-rank-summary__value', valueNode)
        )
      );
    }

    function podio() {
      return h('section.sales-podium-section', { 'data-rank-key': 'podium' },
        h('div.sales-rank-section-title',
          h('div',
            h('span.sales-rank-section-title__eyebrow', { text: 'OS DESTAQUES DO PERÍODO' }),
            h('h2', { text: 'O topo é deles' })
          ),
          h('span.sales-rank-section-title__badge', icon('sparkles'), h('span', { text: 'TOP 3' }))
        ),
        h('div.sales-podium', linhas.slice(0, 3).map(function (l, i) {
          return podiumCard(l, i + 1);
        }))
      );
    }

    function podiumCard(l, posicao) {
      var equipe = S().byId('equipes', l.usuario.equipeId) || {};
      return h('button.sales-podium-card.sales-podium-card--' + posicao, {
        'data-rank-key': String(l.usuario.id),
        style: { '--podium-delay': ((posicao - 1) * 110) + 'ms' },
        onClick: function () { AGIR.pages.vendedorDrawer(l.usuario.id); },
        'aria-label': posicao + 'º lugar: ' + l.usuario.nome + ', ' + F.money(l.estornoTotal)
      },
        posicao === 1 ? h('div.sales-podium-card__rays', { 'aria-hidden': 'true' }) : null,
        posicao === 1 ? h('div.sales-podium-card__particles', { 'aria-hidden': 'true' },
          [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return h('i', { style: { '--p': n } }); })
        ) : null,
        h('div.sales-podium-card__top',
          h('span.sales-podium-card__medal', { text: posicao === 1 ? 'CAMPEÃO' : posicao + 'º LUGAR' }),
          movimento(l)
        ),
        h('div.sales-podium-card__avatar',
          posicao === 1 ? h('span.sales-podium-card__crown', icon('trophy')) : null,
          AGIR.avatar(l.usuario, 'xl'),
          h('span.sales-podium-card__position', { text: '#' + posicao })
        ),
        h('div.sales-podium-card__identity',
          h('strong', { text: l.usuario.nome }),
          h('span', { text: equipe.nome || 'Equipe comercial' })
        ),
        h('div.sales-podium-card__score',
          h('span', { text: F.money(l.estornoTotal) }),
          h('small', { text: 'em valor estornado' })
        ),
        h('div.sales-podium-card__share',
          h('span', { style: { width: Math.max(3, l.participacao) + '%' } }),
          h('b', { text: F.pct(l.participacao, 1) + ' do total' })
        ),
        h('div.sales-podium-card__stats',
          stat('Vendas ganhas', F.num(l.vendasQtd)),
          stat('Produção · Valor Total', F.moneyShort(l.valorVendas))
        ),
        h('div.sales-podium-card__base',
          h('span', { text: posicao === 1 ? '1' : posicao }),
          h('small', { text: posicao === 1 ? 'LIDERANÇA' : 'PÓDIO' })
        )
      );
    }

    function classificacao() {
      var maximo = linhas[0] ? linhas[0].estornoTotal : 0;
      var restantes = linhas.slice(3);
      var colunas = restantes.length <= 6 ? 2 : restantes.length <= 12 ? 3 : 4;
      return h('section.sales-rank-table', { 'data-rank-key': 'table' },
        h('div.sales-rank-section-title.sales-rank-section-title--compact',
          h('div',
            h('span.sales-rank-section-title__eyebrow', { text: 'CLASSIFICAÇÃO COMPLETA' }),
            h('h2', { text: 'A disputa continua' })
          ),
          h('span.sales-rank-table__count', { text: linhas.length + ' participantes' })
        ),
        h('div.sales-rank-list', { style: { '--rank-list-columns': colunas } }, restantes.map(function (l) {
          var equipe = S().byId('equipes', l.usuario.equipeId) || {};
          var pct = maximo ? (l.estornoTotal / maximo) * 100 : 0;
          return h('button.sales-rank-row', {
            'data-rank-key': String(l.usuario.id),
            onClick: function () { AGIR.pages.vendedorDrawer(l.usuario.id); }
          },
            h('span.sales-rank-row__position', { text: String(l.posicao).padStart(2, '0') }),
            AGIR.avatar(l.usuario, 'lg'),
            h('span.sales-rank-row__seller',
              h('b', { text: l.usuario.nome }),
              h('small', { text: equipe.nome || 'Equipe comercial' })
            ),
            h('span.sales-rank-row__bar', h('i', { style: { width: pct + '%' } })),
            h('span.sales-rank-row__sales',
              h('b.t-num', { text: F.num(l.vendasQtd) }),
              h('small', { text: F.moneyShort(l.valorVendas) + ' em Valor Total' })
            ),
            h('span.sales-rank-row__value',
              h('b.t-num', { text: F.money(l.estornoTotal) }),
              h('small', { text: F.pct(l.participacao, 1) + ' do total' })
            ),
            movimento(l)
          );
        }))
      );
    }

    function vazio() {
      return h('section.sales-rank-empty', { 'data-rank-key': 'empty' },
        h('span.sales-rank-empty__icon', icon('trophy')),
        h('h2', { text: linhas.length ? 'O pódio está esperando o primeiro resultado' : 'Ainda não há vendedores para classificar' }),
        h('p', {
          text: linhas.length
            ? 'Preencha o Valor Estornado e marque a oportunidade como ganha para ela entrar no ranking.'
            : 'Cadastre os vendedores em Configurações > Geral > Usuários.'
        })
      );
    }

    function movimento(l) {
      if (!l.movimento) return h('span.sales-rank-move.is-flat', h('i'), h('span', { text: 'estável' }));
      var subiu = l.movimento > 0;
      return h('span.sales-rank-move.' + (subiu ? 'is-up' : 'is-down'),
        icon(subiu ? 'trendUp' : 'trendDown'),
        h('span', { text: Math.abs(l.movimento) + (Math.abs(l.movimento) === 1 ? ' posição' : ' posições') })
      );
    }

    function stat(label, value) {
      return h('span', h('small', { text: label }), h('b.t-num', { text: value }));
    }

    function primeiroNome(nome) {
      return String(nome || '').trim().split(/\s+/)[0] || '—';
    }

    function entrarModoTV() {
      var acao = document.fullscreenElement
        ? document.exitFullscreen && document.exitFullscreen()
        : node.requestFullscreen && node.requestFullscreen();
      if (acao && typeof acao.catch === 'function') {
        acao.catch(function () {
          UI.toast({ title: 'Não foi possível abrir em tela cheia', text: 'Use a tecla F11 do navegador.', tone: 'bad' });
        });
      }
    }
  };
})(window);
