/* ==========================================================================
   AGIR — CRM / Leads, Contatos e Empresas
   Três telas de lista que compartilham o mesmo esqueleto: filtros na URL,
   busca instantânea, tabela ordenável e painel lateral no clique.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  /* ==========================================================================
     LEADS / OPORTUNIDADES
     ========================================================================== */
  AGIR.pages.crmLeads = function (node, ctx) {
    var q = ctx.query || {};
    var f = W.readFilters(q);
    var termo = q.q || '';
    var vista = q.v || 'abertas';
    var soFrios = q.frios === '1';

    node.appendChild(W.pageHead({
      icon: 'users',
      title: 'Leads e oportunidades',
      sub: 'Toda a carteira em lista, com filtro salvo na URL — dá para compartilhar o recorte.',
      actions: [
        h('div.search', { style: { width: 'min(320px,42vw)' } },
          icon('search'),
          h('input.input', {
            placeholder: 'Cliente, CPF, telefone…', value: termo,
            onInput: deb(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260)
          })
        ),
        h('button.btn.btn--sm', { onClick: exportarCSV }, icon('download'), h('span', { text: 'CSV' })),
        h('a.btn.btn--sm', { href: '#/crm/pipeline' }, icon('kanban'), h('span', { text: 'Ver kanban' })),
        h('button.btn.btn--sm', { onClick: novaContato },
          icon('plus'), h('span', { text: 'Novo contato' })),
        h('button.btn.btn--primary', { onClick: function () { AGIR.pages.novaOportunidade(); } },
          icon('plus'), h('span', { text: 'Nova oportunidade' }))
      ]
    }));

    node.appendChild(UI.segmented([
      { value: 'abertas', label: 'Em aberto', icon: 'layers' },
      { value: 'ganhas', label: 'Ganhas', icon: 'trophy' },
      { value: 'perdidas', label: 'Perdidas', icon: 'x' },
      { value: 'todas', label: 'Todas', icon: 'rows' }
    ], vista, function (v) { AGIR.router.setQuery({ v: v === 'abertas' ? null : v }); }));

    node.appendChild(W.filterBar(Object.assign({}, ctx, { allTimePeriod: true }), ['periodo', 'owner', 'equipe', 'produto', 'origem', 'banco']));

    var lista = calcular();

    /* resumo do recorte */
    var valor = lista.reduce(function (a, o) { return a + An.valorCRM(o); }, 0);
    var com = lista.reduce(function (a, o) { return a + o.comissao; }, 0);
    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Oportunidades', raw: lista.length, icon: 'layers', tone: 'info' }),
      W.kpi({ label: 'Estorno solicitado', raw: valor, format: F.moneyShort, icon: 'coins', tone: 'brand' }),
      W.kpi({ label: 'Receita prevista', raw: com, format: F.moneyShort, icon: 'percent', tone: 'ok' }),
      W.kpi({ label: 'Estorno médio', raw: lista.length ? valor / lista.length : 0,
        format: F.moneyShort, icon: 'receipt', tone: 'plum' })
    ));

    if (soFrios) {
      node.appendChild(h('div.insight.insight--warn',
        h('div.insight__ico', icon('inbox')),
        h('div.grow',
          h('div.insight__title', { text: 'Mostrando só leads sem toque há 5+ dias' }),
          h('div.insight__text', { text: 'São ' + lista.length + ' oportunidades esfriando. Ligar hoje custa menos que abrir lead novo.' })
        ),
        h('button.btn.btn--sm.btn--outline', { style: { alignSelf: 'center' },
          text: 'Remover filtro', onClick: function () { AGIR.router.setQuery({ frios: null }); } })
      ));
    }

    node.appendChild(W.section({
      flush: true,
      body: W.dataTable({
        rows: lista,
        sort: { key: 'valor', dir: 'desc' },
        onRowClick: function (o) { AGIR.pages.oppDrawer(o.id); },
        empty: UI.empty({
          icon: 'search', title: 'Nada bate com esse filtro',
          text: 'Tente limpar a busca ou ampliar o período.',
          action: { label: 'Limpar filtros', icon: 'refresh',
            onClick: function () { AGIR.router.go('/crm/leads'); } }
        }),
        columns: [
          { key: 'cliente', label: 'Cliente', width: '22%',
            render: function (o) {
              return h('div',
                h('div.strong.truncate', { text: o.cliente }),
                h('div.t-tiny.t-dimmer', { text: F.cpfMask(o.cpf) + ' · ' + F.phone(o.telefone) })
              );
            } },
          { key: 'produto', label: 'Produto', width: '15%',
            value: function (o) { return (S().byId('produtos', o.produtoId) || {}).nome; },
            render: function (o) {
              var p = S().byId('produtos', o.produtoId) || {};
              var b = S().byId('bancos', o.bancoId) || {};
              return h('div',
                h('div.row.gap-2', h('i.dot', { style: { background: p.cor } }),
                  h('span.truncate', { text: p.nome })),
                h('div.t-tiny.t-dimmer', { text: b.nome })
              );
            } },
          { key: 'etapa', label: 'Etapa', width: '13%',
            value: function (o) { return (An.etapaById(o.etapaId) || {}).ordem; },
            render: function (o) {
              return h('div.col.gap-1',
                W.etapaBadge(o.etapaId),
                o.status === 'aberto' ? W.slaTag(o) : null
              );
            } },
          { key: 'valor', label: 'Estorno solicitado', align: 'right', width: '13%',
            value: function (o) { return An.valorCRM(o); },
            render: function (o) {
              return h('div',
                h('div.strong.t-num', { text: F.money0(An.valorCRM(o)) }),
                h('div.t-tiny.t-dimmer.t-num', { text: F.moneyShort(o.comissao) + ' receita' })
              );
            } },
          { key: 'owner', label: 'Responsável', width: '12%',
            value: function (o) { return (S().byId('usuarios', o.ownerId) || {}).nome; },
            render: function (o) { return W.ownerChip(o.ownerId, 'sm'); } },
          { key: 'origem', label: 'Origem', width: '10%',
            value: function (o) { return (S().byId('origens', o.origemId) || {}).nome; },
            render: function (o) {
              var org = S().byId('origens', o.origemId) || {};
              return h('span.badge', { text: org.nome || '—' });
            } },
          { key: 'data', label: 'Atualizado', align: 'right', width: '10%',
            value: function (o) { return new Date(o.atualizadoEm || o.criadoEm).getTime(); },
            render: function (o) {
              return h('div',
                h('div.t-small', { text: F.relative(o.atualizadoEm || o.criadoEm) }),
                h('div.t-tiny.t-dimmer', { text: F.date(o.criadoEm) })
              );
            } },
          { key: 'acao', label: '', width: '48px', sortable: false, align: 'right',
            render: function (o) {
              return h('button.btn.btn--icon.btn--sm.btn--ghost.no-ripple', {
                'aria-label': 'Ações',
                onClick: function (e) { e.stopPropagation(); linhaMenu(e.currentTarget, o); }
              }, icon('more'));
            } }
        ]
      })
    }));

    /* ------------------------------------------------------------------ */
    function calcular() {
      var base = An.opps(f);
      var r = f.periodo === 'todos' ? null : An.range(f.periodo);

      if (vista === 'abertas') base = base.filter(function (o) { return o.status === 'aberto'; });
      else if (vista === 'ganhas') base = base.filter(function (o) { return o.status === 'ganho' && (!r || An.inRange(o.fechadoEm, r)); });
      else if (vista === 'perdidas') base = base.filter(function (o) { return o.status === 'perdido' && (!r || An.inRange(o.fechadoEm, r)); });
      else base = base.filter(function (o) {
        return !r || An.inRange(o.criadoEm, r) || An.inRange(o.fechadoEm, r) || o.status === 'aberto';
      });

      if (soFrios) {
        var ids = {};
        An.semToque(f, 5).forEach(function (o) { ids[o.id] = true; });
        base = base.filter(function (o) { return ids[o.id]; });
      }

      if (termo) {
        var t = F.norm(termo), dig = termo.replace(/\D/g, '');
        base = base.filter(function (o) {
          return F.norm(o.cliente).indexOf(t) >= 0 ||
            (dig && (o.cpf || '').indexOf(dig) >= 0) ||
            (dig && (o.telefone || '').indexOf(dig) >= 0);
        });
      }
      return base;
    }

    function linhaMenu(anchor, o) {
      UI.popover(anchor, [
        { label: 'Abrir detalhes', icon: 'eye', onClick: function () { AGIR.pages.oppDrawer(o.id); } },
        { label: 'Registrar toque', icon: 'activity',
          onClick: function () { AGIR.pages.registrarAtividade(o.id, function () { AGIR.router.resolve(); }); } },
        { label: 'Copiar telefone', icon: 'copy', onClick: function () {
          copiar(F.phone(o.telefone), 'Telefone copiado');
        } },
        { sep: true },
        { label: 'Excluir', icon: 'trash', danger: true, onClick: function () { excluir(o); } }
      ], { align: 'right' });
    }

    function excluir(o) {
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        UI.confirm({
          title: 'Cancelar oportunidade?', danger: true, okLabel: 'Cancelar',
          text: 'A oportunidade sera preservada no historico para auditoria.'
        }).then(function (ok) {
          if (!ok) return;
          global.AGIR_BACKEND.cancelOpportunity({ opportunityId: o.id, expectedVersion: o.version || 1 })
            .then(function () {
              S().remove('oportunidades', o.id);
              UI.toast.warn('Oportunidade cancelada');
              AGIR.router.resolve();
            })
            .catch(function (error) { UI.toast.error(error.message || 'Falha ao cancelar oportunidade.'); });
        });
        return;
      }
      var idx = (S().get('oportunidades') || []).findIndex(function (x) { return x.id === o.id; });
      UI.confirm({
        title: 'Excluir oportunidade?', danger: true, okLabel: 'Excluir',
        text: o.cliente + ' · Estorno solicitado ' + F.money(An.valorCRM(o)) + '. Dá para desfazer logo depois.'
      }).then(function (ok) {
        if (!ok) return;
        S().remove('oportunidades', o.id);
        UI.toast({
          title: 'Oportunidade excluída', text: o.cliente, tone: 'warn',
          action: { label: 'Desfazer', onClick: function () {
            S().restore('oportunidades', o, idx);
            UI.toast.ok('Restaurada');
            AGIR.router.resolve();
          } }
        });
        AGIR.router.resolve();
      });
    }

    function exportarCSV() {
      var linhas = [['Cliente', 'CPF', 'Telefone', 'Produto', 'Parceiro de execução', 'Origem', 'Etapa',
        'Status', 'Estorno solicitado', 'Receita prevista', 'Responsável', 'Criado em', 'Fechado em']];
      calcular().forEach(function (o) {
        linhas.push([
          o.cliente, F.cpf(o.cpf), F.phone(o.telefone),
          (S().byId('produtos', o.produtoId) || {}).nome,
          (S().byId('bancos', o.bancoId) || {}).nome,
          (S().byId('origens', o.origemId) || {}).nome,
          (An.etapaById(o.etapaId) || {}).nome,
          o.status,
          String(An.valorCRM(o)).replace('.', ','),
          String(o.comissao).replace('.', ','),
          (S().byId('usuarios', o.ownerId) || {}).nome,
          F.date(o.criadoEm),
          o.fechadoEm ? F.date(o.fechadoEm) : ''
        ]);
      });
      baixarCSV(linhas, 'ascensao-leads-' + F.iso(new Date()) + '.csv');
    }
  };

  /* ==========================================================================
     CONTATOS — clientes deduplicados por CPF
     ========================================================================== */
  AGIR.pages.crmContatos = function (node, ctx) {
    var q = ctx.query || {};
    var termo = q.q || '';

    node.appendChild(W.pageHead({
      icon: 'contact',
      title: 'Contatos',
      sub: 'Base de clientes consolidada — um registro por CPF, com todo o histórico de operações.',
      actions: [
        h('div.search', { style: { width: 'min(320px,42vw)' } },
          icon('search'),
          h('input.input', {
            placeholder: 'Nome, CPF ou telefone…', value: termo,
            onInput: deb(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260)
          })
        ),
        h('button.btn.btn--primary', { onClick: function () { AGIR.pages.novaOportunidade(); } },
          icon('plus'), h('span', { text: 'Nova oportunidade' }))
      ]
    }));

    var contatos = consolidar();
    var recompra = contatos.filter(function (c) { return c.ganhos >= 2; }).length;

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Contatos na base', raw: contatos.length, icon: 'contact', tone: 'info' }),
      W.kpi({ label: 'Clientes ativos', raw: contatos.filter(function (c) { return c.ganhos > 0; }).length,
        icon: 'checkcircle', tone: 'ok', sub: 'já fecharam ao menos uma operação' }),
      W.kpi({ label: 'Recompra', raw: recompra, icon: 'refresh', tone: 'brand',
        sub: F.pct(F.rate(recompra, contatos.filter(function (c) { return c.ganhos > 0; }).length), 0) + ' dos clientes' }),
      W.kpi({ label: 'Estorno solicitado por cliente', raw: media(contatos), format: F.moneyShort,
        icon: 'coins', tone: 'plum', sub: 'somando todas as operações ganhas' })
    ));

    node.appendChild(W.section({
      flush: true,
      body: W.dataTable({
        rows: filtrar(contatos),
        sort: { key: 'valorGanho', dir: 'desc' },
        onRowClick: function (c) { contatoDrawer(c); },
        columns: [
          { key: 'nome', label: 'Cliente', width: '26%',
            render: function (c) {
              return h('div.row.gap-3',
                h('span.av.av--sm', {
                  style: { background: 'linear-gradient(135deg,hsl(' + F.hueOf(c.nome) + ' 55% 38%),hsl(' + ((F.hueOf(c.nome) + 40) % 360) + ' 50% 26%))', color: '#fff', borderColor: 'transparent' },
                  text: F.initials(c.nome)
                }),
                h('div', { style: { minWidth: 0 } },
                  h('div.strong.truncate', { text: c.nome }),
                  h('div.t-tiny.t-dimmer', { text: F.cpfMask(c.cpf) })
                )
              );
            } },
          { key: 'telefone', label: 'Telefone', width: '13%',
            render: function (c) { return h('span.t-num', { text: F.phone(c.telefone) }); } },
          { key: 'local', label: 'Cidade', width: '13%',
            render: function (c) { return h('span.t-dim', { text: c.cidade ? c.cidade + '/' + c.uf : '—' }); } },
          { key: 'ops', label: 'Operações', align: 'right', width: '10%',
            render: function (c) {
              return h('div.row.gap-1', { style: { justifyContent: 'flex-end' } },
                h('span.badge.badge--ok', { 'data-tip': 'Ganhas', text: c.ganhos }),
                c.abertos ? h('span.badge.badge--info', { 'data-tip': 'Em aberto', text: c.abertos }) : null,
                c.perdidos ? h('span.badge.badge--bad', { 'data-tip': 'Perdidas', text: c.perdidos }) : null
              );
            } },
          { key: 'valorGanho', label: 'Estorno solicitado', align: 'right', width: '14%',
            render: function (c) { return h('span.strong.t-num', { text: F.moneyShort(c.valorGanho) }); } },
          { key: 'produtos', label: 'Produtos', width: '14%', sortable: false,
            render: function (c) {
              return h('div.row.gap-1.wrap', c.produtos.slice(0, 2).map(function (p) {
                return h('span.badge', { text: p });
              }), c.produtos.length > 2 ? h('span.badge', { text: '+' + (c.produtos.length - 2) }) : null);
            } },
          { key: 'ultimo', label: 'Último contato', align: 'right', width: '12%',
            render: function (c) { return h('span.t-dim', { text: F.relative(c.ultimo) }); } }
        ]
      })
    }));

    function consolidar() {
      var mapa = Object.create(null);
      (S().get('contatos') || []).forEach(function (item) {
        var key = item.cpf || item.id;
        mapa[key] = {
          id: item.id, cpf: item.cpf || '', nome: item.nome,
          email: item.email || '', telefone: item.telefone || '',
          cidade: item.cidade || '', uf: item.uf || '',
          ownerId: item.ownerId, empresaId: item.empresaId,
          ganhos: 0, perdidos: 0, abertos: 0, valorGanho: 0,
          produtos: [], ops: [], ultimo: item.criadoEm
        };
      });
      (S().get('oportunidades') || []).forEach(function (o) {
        var k = o.cpf || o.contatoId || o.cliente;
        if (o.contatoId) {
          var existingKey = Object.keys(mapa).find(function (key) { return mapa[key].id === o.contatoId; });
          if (existingKey) k = existingKey;
        }
        if (!mapa[k]) {
          mapa[k] = {
            cpf: o.cpf, nome: o.cliente, telefone: o.telefone,
            cidade: o.cidade, uf: o.uf, ownerId: o.ownerId,
            ganhos: 0, perdidos: 0, abertos: 0, valorGanho: 0,
            produtos: [], ops: [], ultimo: o.criadoEm
          };
        }
        var c = mapa[k];
        c.ops.push(o);
        if (o.status === 'ganho') { c.ganhos++; c.valorGanho += An.valorCRM(o); }
        else if (o.status === 'perdido') c.perdidos++;
        else c.abertos++;
        var pn = (S().byId('produtos', o.produtoId) || {}).nome;
        if (pn && c.produtos.indexOf(pn) < 0) c.produtos.push(pn);
        var t = o.atualizadoEm || o.criadoEm;
        if (t > c.ultimo) c.ultimo = t;
      });
      return Object.keys(mapa).map(function (k) { return mapa[k]; });
    }

    function filtrar(lista) {
      if (!termo) return lista;
      var t = F.norm(termo), dig = termo.replace(/\D/g, '');
      return lista.filter(function (c) {
        return F.norm(c.nome).indexOf(t) >= 0 ||
          (dig && (c.cpf || '').indexOf(dig) >= 0) ||
          (dig && (c.telefone || '').indexOf(dig) >= 0);
      });
    }

    function media(lista) {
      var comGanho = lista.filter(function (c) { return c.ganhos > 0; });
      if (!comGanho.length) return 0;
      return comGanho.reduce(function (a, c) { return a + c.valorGanho; }, 0) / comGanho.length;
    }

    function contatoDrawer(c) {
      UI.drawer({
        eyebrow: F.cpfMask(c.cpf),
        title: c.nome,
        sub: F.phone(c.telefone) + (c.cidade ? ' · ' + c.cidade + '/' + c.uf : ''),
        wide: true,
        body: h('div.col.gap-5',
          h('div.grid.g-3',
            W.miniStat('Estorno solicitado', F.money(c.valorGanho), 'coins', F.plural(c.ganhos, 'operação', 'operações')),
            W.miniStat('Em aberto', F.num(c.abertos), 'layers', 'oportunidades vivas'),
            W.miniStat('Perdidas', F.num(c.perdidos), 'x', 'histórico de recusas')
          ),
          W.section({
            title: 'Operações',
            flush: true,
            body: W.dataTable({
              rows: c.ops.slice().sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; }),
              onRowClick: function (o) { AGIR.pages.oppDrawer(o.id); },
              columns: [
                { key: 'prod', label: 'Produto', sortable: false,
                  render: function (o) { return h('span', { text: (S().byId('produtos', o.produtoId) || {}).nome }); } },
                { key: 'status', label: 'Status', sortable: false,
                  render: function (o) { return W.statusBadge(o.status); } },
                { key: 'valor', label: 'Estorno solicitado', align: 'right', sortable: false,
                  render: function (o) { return h('span.strong.t-num', { text: F.money0(An.valorCRM(o)) }); } },
                { key: 'data', label: 'Data', align: 'right', sortable: false,
                  render: function (o) { return h('span.t-dim', { text: F.date(o.fechadoEm || o.criadoEm) }); } }
              ]
            })
          })
        ),
        footer: [
          h('button.btn', { onClick: function () { copiar(F.phone(c.telefone), 'Telefone copiado'); } },
            icon('copy'), h('span', { text: 'Copiar telefone' })),
          h('button.btn.btn--primary', {
            onClick: function () { AGIR.pages.novaOportunidade({ ownerId: c.ownerId }); }
          }, icon('plus'), h('span', { text: 'Nova operação' }))
        ]
      });
    }
  };

  /* ==========================================================================
     EMPRESAS — convênios, parceiros e correspondentes
     ========================================================================== */
  AGIR.pages.crmEmpresas = function (node, ctx) {
    var q = ctx.query || {};
    var termo = q.q || '';
    var tipo = q.tipo || '';

    node.appendChild(W.pageHead({
      icon: 'building',
      title: 'Empresas',
      sub: 'Clientes e parceiros que alimentam o funil comercial da agência.',
      actions: [
        h('div.search', { style: { width: 'min(300px,42vw)' } },
          icon('search'),
          h('input.input', {
            placeholder: 'Nome ou CNPJ…', value: termo,
            onInput: deb(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260)
          })
        ),
        h('button.btn.btn--primary', { onClick: novaEmpresa },
          icon('plus'), h('span', { text: 'Nova empresa' }))
      ]
    }));

    var todas = S().get('empresas') || [];
    var tipos = [];
    todas.forEach(function (e) { if (tipos.indexOf(e.tipo) < 0) tipos.push(e.tipo); });

    node.appendChild(h('div.filterbar',
      h('button.chip' + (!tipo ? '.is-active' : ''), {
        text: 'Todos', onClick: function () { AGIR.router.setQuery({ tipo: null }); }
      }),
      tipos.map(function (t) {
        return h('button.chip' + (tipo === t ? '.is-active' : ''), {
          text: t, onClick: function () { AGIR.router.setQuery({ tipo: t }); }
        });
      })
    ));

    var lista = todas.filter(function (e) {
      if (tipo && e.tipo !== tipo) return false;
      if (!termo) return true;
      var t = F.norm(termo);
      return F.norm(e.nome).indexOf(t) >= 0 || (e.cnpj || '').indexOf(termo.replace(/\D/g, '')) >= 0;
    }).map(function (e) {
      var ops = (S().get('oportunidades') || []).filter(function (o) { return o.empresaId === e.id; });
      var ganhas = ops.filter(function (o) { return o.status === 'ganho'; });
      return Object.assign({}, e, {
        ops: ops.length,
        ganhas: ganhas.length,
        volume: ganhas.reduce(function (a, o) { return a + An.valorCRM(o); }, 0),
        abertas: ops.filter(function (o) { return o.status === 'aberto'; }).length
      });
    });

    node.appendChild(h('div.grid.g-3',
      W.kpi({ label: 'Empresas cadastradas', raw: todas.length, icon: 'building', tone: 'info' }),
      W.kpi({ label: 'Leads originados', raw: lista.reduce(function (a, e) { return a + e.ops; }, 0),
        icon: 'users', tone: 'brand' }),
      W.kpi({ label: 'Estorno solicitado gerado', raw: lista.reduce(function (a, e) { return a + e.volume; }, 0),
        format: F.moneyShort, icon: 'coins', tone: 'ok' })
    ));

    node.appendChild(W.section({
      flush: true,
      body: W.dataTable({
        rows: lista,
        sort: { key: 'volume', dir: 'desc' },
        onRowClick: function (e) { empresaDrawer(e); },
        empty: UI.empty({ icon: 'building', title: 'Nenhuma empresa neste filtro' }),
        columns: [
          { key: 'nome', label: 'Empresa', width: '30%',
            render: function (e) {
              return h('div',
                h('div.strong.truncate', { text: e.nome }),
                h('div.t-tiny.t-dimmer', { text: F.cnpj(e.cnpj) })
              );
            } },
          { key: 'tipo', label: 'Tipo', width: '12%',
            render: function (e) {
              var cls = { 'Segmento de cliente': 'badge--brand', 'Parceiro': 'badge--info', 'Correspondente': 'badge--plum' }[e.tipo] || '';
              return h('span.badge.' + cls, { text: e.tipo });
            } },
          { key: 'contato', label: 'Contato', width: '16%',
            render: function (e) {
              return h('div',
                h('div.t-small', { text: e.contato }),
                h('div.t-tiny.t-dimmer.t-num', { text: F.phone(e.telefone) })
              );
            } },
          { key: 'local', label: 'Praça', width: '12%',
            value: function (e) { return e.cidade; },
            render: function (e) { return h('span.t-dim', { text: e.cidade + '/' + e.uf }); } },
          { key: 'ops', label: 'Leads', align: 'right', width: '9%',
            render: function (e) { return h('span.t-num', { text: F.num(e.ops) }); } },
          { key: 'volume', label: 'Estorno solicitado', align: 'right', width: '14%',
            render: function (e) { return h('span.strong.t-num', { text: F.moneyShort(e.volume) }); } },
          { key: 'ativo', label: 'Status', align: 'right', width: '8%',
            render: function (e) {
              return h('span.badge' + (e.ativo ? '.badge--ok' : ''), { text: e.ativo ? 'Ativa' : 'Inativa' });
            } }
        ]
      })
    }));

    function empresaDrawer(e) {
      var ops = (S().get('oportunidades') || []).filter(function (o) { return o.empresaId === e.id; })
        .sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; });
      var resp = S().byId('usuarios', e.responsavelId);
      UI.drawer({
        eyebrow: e.tipo,
        title: e.nome,
        sub: F.cnpj(e.cnpj) + ' · ' + e.cidade + '/' + e.uf,
        wide: true,
        body: h('div.col.gap-5',
          h('div.grid.g-3',
            W.miniStat('Leads originados', F.num(e.ops), 'users'),
            W.miniStat('Estorno solicitado ganho', F.moneyShort(e.volume), 'coins',
              F.plural(e.ganhas, 'operação fechada', 'operações fechadas')),
            W.miniStat('Taxa de ganho', F.pct(F.rate(e.ganhas, e.ops), 0), 'target')
          ),
          W.section({
            title: 'Ficha',
            body: h('div.grid.g-2.gap-4',
              W.campo('Contato', e.contato),
              W.campo('Telefone', F.phone(e.telefone)),
              W.campo('Responsável interno', resp ? resp.nome : '—'),
              W.campo('Cadastrada em', F.date(e.criadoEm))
            )
          }),
          W.section({
            title: 'Oportunidades vinculadas',
            flush: true,
            body: ops.length ? W.dataTable({
              rows: ops.slice(0, 40),
              onRowClick: function (o) { AGIR.pages.oppDrawer(o.id); },
              columns: [
                { key: 'cliente', label: 'Cliente', sortable: false,
                  render: function (o) { return h('span.strong', { text: o.cliente }); } },
                { key: 'status', label: 'Status', sortable: false,
                  render: function (o) { return W.statusBadge(o.status); } },
                { key: 'valor', label: 'Estorno solicitado', align: 'right', sortable: false,
                  render: function (o) { return h('span.t-num', { text: F.money0(An.valorCRM(o)) }); } }
              ]
            }) : UI.empty({ icon: 'inbox', title: 'Nenhuma oportunidade ainda' })
          })
        )
      });
    }

    function novaEmpresa() {
      var f = {};
      UI.modal({
        title: 'Nova empresa',
        body: h('div.col.gap-4',
          campo(f, 'nome', 'Nome', { placeholder: 'Prefeitura de…', autofocus: true, required: true }),
          h('div.grid.g-2',
            campo(f, 'cnpj', 'CNPJ', { placeholder: '00.000.000/0000-00' }),
            (function () {
              f.tipo = h('select.select',
                ['Segmento de cliente', 'Parceiro', 'Correspondente'].map(function (t) {
                  return h('option', { value: t, text: t });
                }));
              return h('div.field', h('label.field__label', { text: 'Tipo' }), f.tipo);
            })()
          ),
          h('div.grid.g-2',
            campo(f, 'contato', 'Pessoa de contato'),
            campo(f, 'telefone', 'Telefone', {
              placeholder: '(11) 99999-9999', inputmode: 'numeric', maxlength: 15,
              onInput: function () { this.value = maskPhone(this.value); }
            })
          ),
          h('div.grid.g-2',
            campo(f, 'cidade', 'Cidade'),
            campo(f, 'uf', 'UF', { maxlength: 2, style: { textTransform: 'uppercase' } })
          )
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { text: 'Salvar', onClick: async function () {
              if (!f.nome.value.trim()) return UI.toast.bad('Falta o nome');
              if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                this.disabled = true;
                try {
                  var current = S().currentUser() || {};
                  var saved = await global.AGIR_BACKEND.createCompany({
                    organizationId: S().get('session.organizationId'),
                    name: f.nome.value.trim(), cnpj: f.cnpj.value.replace(/\D/g, ''),
                    companyType: f.tipo.value, contactName: f.contato.value.trim(),
                    phone: f.telefone.value.replace(/\D/g, ''), city: f.cidade.value.trim(),
                    state: f.uf.value.toUpperCase(), ownerId: current.id
                  });
                  S().insert('empresas', {
                    id: saved.id, nome: saved.name, razao: saved.legal_name, cnpj: saved.cnpj,
                    tipo: saved.company_type, contato: saved.contact_name, telefone: saved.phone,
                    cidade: saved.city, uf: saved.state, responsavelId: saved.owner_id,
                    criadoEm: saved.created_at, ativo: saved.active
                  });
                  api.close(); UI.toast.ok('Empresa cadastrada'); AGIR.router.resolve();
                } catch (error) {
                  this.disabled = false;
                  UI.toast.bad('Nao foi possivel cadastrar', error.message || 'Revise os dados.');
                }
                return;
              }
              S().insert('empresas', {
                nome: f.nome.value.trim(), cnpj: f.cnpj.value.replace(/\D/g, ''),
                tipo: f.tipo.value, contato: f.contato.value.trim(),
                telefone: f.telefone.value.replace(/\D/g, ''),
                cidade: f.cidade.value.trim(), uf: f.uf.value.toUpperCase(),
                responsavelId: (S().currentUser() || {}).id,
                criadoEm: new Date().toISOString(), ativo: true, obs: ''
              });
              api.close();
              UI.toast.ok('Empresa cadastrada');
              AGIR.router.resolve();
            } })
          ];
        }
      });
    }
  };

  /* ==========================================================================
     Auxiliares compartilhados
     ========================================================================== */
    function novaContato() {
      var f = {};
      UI.modal({
        title: 'Novo contato',
        sub: 'Cadastre a pessoa mesmo que ainda nao exista uma oportunidade.',
        body: h('div.col.gap-4',
          campo(f, 'nome', 'Nome completo', { autofocus: true, required: true }),
          h('div.grid.g-2',
            campo(f, 'cpf', 'CPF', {
              placeholder: '000.000.000-00', inputmode: 'numeric', maxlength: 14, required: true,
              onInput: function () { this.value = maskCpf(this.value); }
            }),
            campo(f, 'telefone', 'Telefone', {
              placeholder: '(11) 99999-9999', inputmode: 'numeric', maxlength: 15, required: true,
              onInput: function () { this.value = maskPhone(this.value); }
            })
          ),
          campo(f, 'email', 'E-mail', { type: 'email' }),
          h('div.grid.g-2',
            campo(f, 'cidade', 'Cidade'),
            campo(f, 'uf', 'UF', { maxlength: 2, style: { textTransform: 'uppercase' } })
          )
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { text: 'Salvar contato', onClick: async function () {
              var name = f.nome.value.trim();
              if (!name) return UI.toast.bad('Informe o nome do contato');
              var cpfDigits = f.cpf.value.replace(/\D/g, '');
              var phoneDigits = f.telefone.value.replace(/\D/g, '');
              if (cpfDigits.length !== 11) return UI.toast.bad('CPF incompleto', 'Informe os 11 digitos do CPF.');
              if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
                return UI.toast.bad('Telefone incompleto', 'Informe DDD e numero do telefone.');
              }
              this.disabled = true;
              try {
                var current = S().currentUser() || {};
                var saved = await global.AGIR_BACKEND.createContact({
                  organizationId: S().get('session.organizationId'),
                  fullName: name, cpf: f.cpf.value, phone: f.telefone.value,
                  email: f.email.value.trim(), city: f.cidade.value.trim(),
                  state: f.uf.value.trim().toUpperCase(), companyId: null,
                  ownerId: current.id, consentStatus: 'unknown'
                });
                S().insert('contatos', {
                  id: saved.id, nome: saved.full_name, cpf: saved.cpf || '',
                  email: saved.email || '', telefone: saved.phone || '',
                  cidade: saved.city || '', uf: saved.state || '',
                  empresaId: saved.company_id, ownerId: saved.owner_id,
                  consentimento: saved.consent_status, ativo: saved.active,
                  criadoEm: saved.created_at
                });
                api.close(); UI.toast.ok('Contato cadastrado'); AGIR.router.resolve();
              } catch (error) {
                this.disabled = false;
                var duplicate = error && error.code === '23505';
                UI.toast.bad(duplicate ? 'Contato ja cadastrado' : 'Nao foi possivel cadastrar',
                  duplicate ? 'Ja existe um contato com este CPF.' : (error.message || 'Revise os dados.'));
              }
            } })
          ];
        }
      });
    }

  function campo(store, key, label, attrs) {
    var inp = h('input.input', Object.assign({ 'aria-label': label }, attrs || {}));
    store[key] = inp;
    return h('div.field', h('label.field__label', label,
      attrs && attrs.required ? h('span.field__required', { text: '*', 'aria-hidden': 'true' }) : null), inp);
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

  function deb(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function copiar(txt, msg) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(function () { UI.toast.ok(msg || 'Copiado'); });
    } else {
      var ta = h('textarea', { value: txt, style: { position: 'fixed', opacity: 0 } });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); UI.toast.ok(msg || 'Copiado'); } catch (e) {}
      ta.remove();
    }
  }

  function baixarCSV(linhas, nome) {
    var csv = linhas.map(function (l) {
      return l.map(function (c) {
        var s = String(c === null || c === undefined ? '' : c);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    UI.toast.ok('CSV gerado', linhas.length - 1 + ' linhas exportadas');
  }

  AGIR.util = AGIR.util || {};
  AGIR.util.copiar = copiar;
  AGIR.util.baixarCSV = baixarCSV;
  AGIR.util.deb = deb;
  AGIR.util.campo = campo;
})(window);
