/* ==========================================================================
   AGIR — Performance / Usuários e Arquivos
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  /* ==========================================================================
     USUÁRIOS
     ========================================================================== */
  AGIR.pages.perfUsuarios = function (node, ctx) {
    var q = ctx.query || {};
    var termo = q.q || '';
    var equipeId = q.equipe || '';

    var usuarios = (S().get('usuarios') || []).filter(function (u) {
      if (equipeId && u.equipeId !== equipeId) return false;
      if (!termo) return true;
      var t = F.norm(termo);
      return F.norm(u.nome).indexOf(t) >= 0 || F.norm(u.email).indexOf(t) >= 0;
    });

    if (ctx.embedded) node.appendChild(h('div.config-users-head',
      h('div',
        h('div.t-eyebrow', { text: 'Acesso e organizacao' }),
        h('h2.t-h3', { text: 'Usuarios' }),
        h('p.t-small.t-dimmer', { text: 'Cadastre a pessoa, escolha a equipe e atribua o cargo que define suas permissoes.' })
      ),
      h('div.row.gap-2.wrap',
        h('div.search', { style: { width: 'min(280px,42vw)' } },
          icon('search'),
          h('input.input', { placeholder: 'Nome ou e-mail', value: termo,
            onInput: AGIR.util.deb(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260) })
        ),
        h('button.btn.btn--primary', { onClick: novoUsuario }, icon('plus'), h('span', { text: 'Novo usuario' }))
      )
    ));

    if (!ctx.embedded) node.appendChild(W.pageHead({
      icon: 'users',
      title: 'Usuários',
      sub: 'Quem está na operação, com que cargo, em que equipe e como vem performando.',
      actions: [
        h('div.search', { style: { width: 'min(280px,42vw)' } },
          icon('search'),
          h('input.input', {
            placeholder: 'Nome ou e-mail…', value: termo,
            onInput: AGIR.util.deb(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260)
          })
        ),
        h('button.btn.btn--primary', { onClick: novoUsuario },
          icon('plus'), h('span', { text: 'Novo usuário' }))
      ]
    }));

    var equipes = S().get('equipes') || [];
    node.appendChild(h('div.filterbar',
      h('button.chip' + (!equipeId ? '.is-active' : ''), {
        text: 'Todas as equipes', onClick: function () { AGIR.router.setQuery({ equipe: null }); }
      }),
      equipes.map(function (e) {
        return h('button.chip' + (equipeId === e.id ? '.is-active' : ''), {
          onClick: function () { AGIR.router.setQuery({ equipe: e.id }); }
        }, h('i.dot', { style: { background: e.cor } }), h('span', { text: e.nome }));
      })
    ));

    if (ctx.embedded) {
      node.appendChild(managementTable());
      return;
    }

    var ativos = usuarios.filter(function (u) { return u.ativo !== false; });
    var K = An.kpis({ periodo: 'mes', equipeId: equipeId || undefined }).atual;

    node.appendChild(h('div.grid.g-4',
      W.kpi({ label: 'Usuários ativos', raw: ativos.length, icon: 'users', tone: 'info',
        sub: 'de ' + usuarios.length + ' cadastrados' }),
      W.kpi({ label: 'Produção do mês', raw: K.vendasValor, format: F.moneyShort,
        icon: 'coins', tone: 'brand' }),
      W.kpi({ label: 'Produção por cabeça', raw: ativos.length ? K.vendasValor / ativos.length : 0,
        format: F.moneyShort, icon: 'user', tone: 'ok' }),
      W.kpi({ label: 'Ligações por cabeça', raw: ativos.length ? K.ligacoes / ativos.length : 0,
        format: function (v) { return F.num(v, 0); }, icon: 'phone', tone: 'plum' })
    ));

    node.appendChild(h('div.grid.g-3.stagger', usuarios.map(function (u, i) {
      var cargo = S().byId('cargos', u.cargoId) || {};
      var eq = S().byId('equipes', u.equipeId) || {};
      var k = An.kpis({ periodo: 'mes', ownerId: u.id }).atual;
      var pace = An.paceMes({ ownerId: u.id });
      var pts = An.pontosDe(u.id);
      var st = An.streak(u.id);

      return h('button.card.card--pad.card--hover.col.gap-4.no-ripple', {
        style: { '--i': i, textAlign: 'left', opacity: u.ativo === false ? .55 : 1 },
        onClick: function () { AGIR.pages.vendedorDrawer(u.id); }
      },
        h('div.row.gap-3',
          AGIR.avatar(u, 'lg'),
          h('div.grow', { style: { minWidth: 0 } },
            h('div.strong.truncate', { text: u.nome }),
            h('div.t-tiny.t-dimmer.truncate', { text: u.email })
          ),
          h('button.btn.btn--icon.btn--sm.btn--ghost.no-ripple', {
            'aria-label': 'Ações',
            onClick: function (e) { e.stopPropagation(); menuUsuario(e.currentTarget, u); }
          }, icon('more'))
        ),
        h('div.row.gap-2.wrap',
          h('span.badge', { style: { background: 'var(--bg-elev-2)', color: cargo.cor || 'var(--ink-2)' } },
            h('i.dot'), h('span', { text: cargo.nome || '—' })),
          eq.nome ? h('span.badge', { text: eq.nome }) : null,
          u.ativo === false ? h('span.badge.badge--bad', { text: 'Inativo' }) : null
        ),
        pace.vendasValor.meta ? h('div.col.gap-1',
          h('div.row.between',
            h('span.t-tiny.t-dimmer', { text: 'Meta de estorno solicitado' }),
            h('b.t-tiny.t-num', {
              style: { color: pace.vendasValor.pct >= 100 ? 'var(--ok-500)' : pace.vendasValor.pct >= 70 ? 'var(--brand-500)' : 'var(--bad-500)' },
              text: F.pct(pace.vendasValor.pct, 0)
            })
          ),
          M.progress(Math.min(100, pace.vendasValor.pct), {
            thin: true, tick: pace.fracao * 100,
            color: pace.vendasValor.pct >= 100 ? 'var(--ok-500)' : pace.vendasValor.pct >= 70 ? 'var(--brand-500)' : 'var(--bad-500)'
          })
        ) : h('div.t-tiny.t-dimmer', { text: 'Sem meta definida para este mês' }),
        h('div.row.between.gap-3',
          stat('Estorno', F.moneyShort(k.estornoSolicitado)),
          stat('Ligações', F.num(k.ligacoes)),
          stat('Pontos', F.num(pts.total)),
          stat('Sequência', st + 'd')
        )
      );
    })));

    function stat(label, valor) {
      return h('div.col', { style: { gap: '1px' } },
        h('span.t-tiny.t-dimmer', { text: label }),
        h('b.t-small.t-num', { text: valor })
      );
    }

    function goalFor(userId) {
      return userId ? (An.metaDoMes(userId, new Date()) || null) : null;
    }

    function parseMoney(value) {
      var clean = String(value || '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.');
      var number = Number(clean);
      return Number.isFinite(number) ? Math.max(0, number) : 0;
    }

    function moneyMask(value) {
      var digits = String(value || '').replace(/\D/g, '');
      return digits ? (Number(digits) / 100).toLocaleString('pt-BR', {
        style: 'currency', currency: 'BRL'
      }) : '';
    }

    async function saveIndividualGoal(userId, meta) {
      if (!meta || !meta.defined) return null;
      var local = {
        usuarioId: userId, ano: meta.year, mes: meta.month,
        vendasValor: meta.salesAmount, vendasQtd: meta.salesCount,
        propostas: meta.proposals, reunioes: meta.meetings,
        agendamentos: meta.appointments, ligacoes: meta.calls
      };
      if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
        var savedRows = await global.AGIR_BACKEND.upsertGoals({
          organizationId: S().get('session.organizationId'), goals: [{
            userId: userId, year: meta.year, month: meta.month,
            requestedReversalAmount: meta.salesAmount, salesCount: meta.salesCount,
            proposals: meta.proposals, meetings: meta.meetings,
            appointments: meta.appointments, calls: meta.calls
          }]
        });
        var saved = savedRows[0];
        if (!saved) return null;
        local.id = saved.id;
        local.vendasValor = Number(saved.requested_reversal_amount == null
          ? saved.sales_amount : saved.requested_reversal_amount);
        local.vendasQtd = saved.sales_count;
        local.propostas = saved.proposals;
        local.reunioes = saved.meetings;
        local.agendamentos = saved.appointments;
        local.ligacoes = saved.calls;
      }
      var existing = (S().get('metas') || []).find(function (item) {
        return item.usuarioId === userId && item.ano === meta.year && item.mes === meta.month;
      });
      if (existing) S().update('metas', existing.id, local);
      else S().insert('metas', local);
      return local;
    }

    function managementTable() {
      return W.section({
        title: 'Pessoas e acessos',
        sub: 'O usuario herda automaticamente as permissoes do cargo selecionado.',
        flush: true,
        body: W.dataTable({
          rows: usuarios,
          sort: { key: 'nome', dir: 'asc' },
          onRowClick: function (user) { editarUsuario(user); },
          columns: [
            { key: 'nome', label: 'Usuario', width: '25%', value: function (user) { return user.nome; },
              render: function (user) { return h('div.row.gap-3', AGIR.avatar(user, 'sm'),
                h('div', { style: { minWidth: 0 } }, h('div.strong.truncate', { text: user.nome }),
                  h('div.t-tiny.t-dimmer.truncate', { text: user.email })) ); } },
            { key: 'equipe', label: 'Equipe', width: '16%', sortable: false,
              render: function (user) { var team = S().byId('equipes', user.equipeId) || {};
                return h('span.badge', h('i.dot', { style: { background: team.cor || 'var(--ink-4)' } }),
                  h('span', { text: team.nome || 'Sem equipe' })); } },
            { key: 'cargo', label: 'Cargo', width: '16%', sortable: false,
              render: function (user) { var role = S().byId('cargos', user.cargoId) || {};
                return h('span.strong', { style: { color: role.cor || 'var(--ink-2)' }, text: role.nome || '-' }); } },
            { key: 'permissoes', label: 'Permissoes herdadas', sortable: false,
              render: function (user) { var role = S().byId('cargos', user.cargoId) || {};
                return h('div.row.gap-1.wrap', (role.permissoes || ['Acesso definido pelo perfil']).slice(0, 3)
                  .map(function (permission) { return h('span.badge', { text: permission }); })); } },
            { key: 'meta', label: 'Meta do mes', width: '12%', align: 'right', sortable: false,
              render: function (user) { var goal = goalFor(user.id);
                return h('span.t-num' + (goal && goal.vendasValor ? '.strong' : '.t-dimmer'), {
                  text: goal && goal.vendasValor ? F.moneyShort(goal.vendasValor) : 'Nao definida'
                }); } },
            { key: 'carteira', label: 'Leads na carteira', sortable: false, align: 'right',
              render: function (user) {
                var total = An.opps({ ownerId: user.id }).length;
                return h('a', { href: '#/crm/leads?v=todas&periodo=todos&owner=' + user.id,
                  text: F.num(total), onClick: function (event) { event.stopPropagation(); } });
              } },
            { key: 'status', label: 'Status', width: '10%', align: 'right', sortable: false,
              render: function (user) { return h('span.badge' + (user.ativo === false ? '.badge--bad' : '.badge--ok'),
                { text: user.ativo === false ? 'Inativo' : 'Ativo' }); } },
            { key: 'acoes', label: '', width: '6%', align: 'right', sortable: false,
              render: function (user) { return h('button.btn.btn--icon.btn--sm.btn--ghost', {
                'aria-label': 'Acoes do usuario', onClick: function (event) {
                  event.stopPropagation(); menuUsuario(event.currentTarget, user);
                }
              }, icon('more')); } }
          ]
        })
      });
    }

    function desativarUsuario(u) {
      var recipients = (S().get('usuarios') || []).filter(function (item) {
        return item.id !== u.id && item.ativo !== false;
      });
      var busy = false;
      var choice = h('select.select', { 'aria-label': 'Destino da carteira' },
        h('option', { value: 'transfer', text: 'Transferir para outro usuário ativo' }),
        h('option', { value: 'keep', text: 'Manter os dados vinculados ao usuário inativo' }));
      var destination = h('select.select', { 'aria-label': 'Usuário que receberá a carteira' },
        h('option', { value: '', text: 'Selecione o usuário ativo' }),
        recipients.map(function (item) { return h('option', { value: item.id, text: item.nome }); }));
      var destinationField = h('div.field',
        h('label.field__label', { text: 'Quem receberá a carteira?' }), destination,
        !recipients.length ? h('p.t-small', { text: 'Nenhum outro usuário ativo disponível. Ative um usuário para transferir a carteira.' }) : null);
      var submit;
      var modal = UI.modal({
        title: 'Desativar ' + u.nome + '?',
        sub: 'Escolha o destino dos dados antes de confirmar a desativação.',
        body: h('div.col.gap-4',
          h('p.t-small', { text: 'A transferência inclui leads de todos os status, contatos, empresas e atividades. Histórico, documentos e comprovantes acompanham os leads, com os autores originais preservados.' }),
          h('div.field', h('label.field__label', { text: 'O que fazer com a carteira?' }), choice),
          destinationField,
          h('p.t-small.t-dimmer', { text: 'Contatos com o mesmo CPF na carteira de destino serão consolidados, preservando os registros anteriores. Perfil pessoal, metas e comissões permanecem no usuário original.' })),
        footer: function (api) {
          submit = h('button.btn.btn--danger', { text: 'Transferir e desativar', onClick: async function () {
            if (busy) return;
            var transfer = choice.value === 'transfer';
            var recipientId = transfer ? destination.value : null;
            if (transfer && !recipientId) return UI.toast.warn('Selecione quem receberá a carteira');
            busy = true; submit.disabled = true; choice.disabled = true; destination.disabled = true;
            submit.textContent = transfer ? 'Transferindo e desativando…' : 'Desativando…';
            var remote = global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase';
            try {
              if (remote) {
                await global.AGIR_BACKEND.manageUser({
                  organizationId: S().get('session.organizationId'), userId: u.id,
                  action: 'set_active', active: false, transferData: transfer, destinationUserId: recipientId
                });
              } else if (transfer) {
                ['oportunidades', 'contatos', 'empresas', 'atividades'].forEach(function (path) {
                  (S().get(path) || []).slice().forEach(function (item) {
                    var key = path === 'empresas' ? 'responsavelId' : 'ownerId';
                    if (item[key] === u.id) { var patch = {}; patch[key] = recipientId; S().update(path, item.id, patch); }
                  });
                });
              }
            } catch (error) {
              busy = false; submit.disabled = false; choice.disabled = false; destination.disabled = false;
              submit.textContent = transfer ? 'Transferir e desativar' : 'Desativar mantendo os dados';
              UI.toast.bad('Não foi possível concluir', error.message || 'Atualize a página para conferir a situação antes de tentar novamente.');
              return;
            }
            S().update('usuarios', u.id, { ativo: false });
            busy = false; api.close();
            UI.toast.ok(transfer ? 'Carteira transferida e usuário desativado' : 'Usuário desativado com os dados preservados');
            // Rebuild from the server, including CPF consolidations and version
            // changes, instead of leaving stale owners in the administrator UI.
            if (remote && transfer) global.location.reload();
            else AGIR.router.resolve();
          } });
          return [h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }), submit];
        }
      });
      var close = modal.close;
      modal.close = function () { if (!busy) close(); };
      choice.addEventListener('change', function () {
        var transfer = choice.value === 'transfer';
        destinationField.hidden = !transfer;
        submit.textContent = transfer ? 'Transferir e desativar' : 'Desativar mantendo os dados';
      });
      return modal;
    }

    function menuUsuario(anchor, u) {
      var targetIsAdmin = u.role === 'admin' || String(u.cargoId || '').indexOf('admin') >= 0;
      var items = [
        { label: 'Ver painel', icon: 'eye', onClick: function () { AGIR.pages.vendedorDrawer(u.id); } },
        { label: 'Ver carteira', icon: 'users', onClick: function () { AGIR.router.go('/crm/leads?v=todas&periodo=todos&owner=' + u.id); } },
        { label: 'Definir metas', icon: 'target', onClick: function () {
          AGIR.router.go('/config?sec=geral&tab=metas&owner=' + u.id);
        } },
        { sep: true },
        { label: 'Editar cadastro', icon: 'edit', onClick: function () { editarUsuario(u); } },
      ];
      items.push({ label: targetIsAdmin ? 'Alterar senha administrativa' : 'Redefinir senha',
        icon: 'lock', onClick: function () { alterarSenha(u); } });
      items.push(
        { label: u.ativo === false ? 'Reativar' : 'Desativar',
          icon: u.ativo === false ? 'checkcircle' : 'lock',
          danger: u.ativo !== false,
          onClick: async function () {
            var reactivating = u.ativo === false;
            if (!reactivating) return desativarUsuario(u);
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              try {
                await global.AGIR_BACKEND.manageUser({
                  organizationId: S().get('session.organizationId'), userId: u.id,
                  action: 'set_active', active: reactivating
                });
              } catch (error) { UI.toast.bad('Nao foi possivel alterar o acesso', error.message || 'Tente novamente.'); return; }
            }
            S().update('usuarios', u.id, { ativo: reactivating });
            UI.toast.info(reactivating ? 'Usuário reativado' : 'Usuário desativado', u.nome);
            AGIR.router.resolve();
          } }
      );
      UI.popover(anchor, items, { align: 'right' });
    }

    /* ======================================================================
       Troca de senha pelo administrador

       O administrador define uma senha temporaria forte. Quem executa e a
       Edge Function: a credencial administrativa jamais chega ao navegador e
       a senha nao e gravada nos dados da aplicacao nem na auditoria.
       ====================================================================== */
    function alterarSenha(u) {
      var real = Boolean(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase');
      var eu = S().currentUser() || {};

      if (u.id === eu.id) {
        UI.toast.info('Use Meu perfil',
          'A sua propria senha se troca em Configuracoes > Geral > Meu perfil.');
        return;
      }

      if (!real) {
        UI.modal({
          title: 'Senha de ' + u.nome,
          body: h('div.insight.insight--info',
            h('div.insight__ico', icon('lock')),
            h('div',
              h('div.insight__title', { text: 'Este ambiente nao esta conectado ao Supabase' }),
              h('div.insight__text', {
                text: 'As senhas ficam no Supabase Auth, nunca nesta base local de demonstracao. Conecte o backend para gerenciar acessos de verdade.'
              })
            )
          ),
          footer: function (api) { return [
            h('button.btn.btn--primary', { text: 'Entendi', onClick: api.close })
          ]; }
        });
        return;
      }

      var alvoEhAdmin = String(u.cargoId || '').indexOf('admin') >= 0 || u.role === 'admin';
      /* --- campos da nova senha ------------------------------------------ */
      var senha = h('input.input', {
        type: 'password', autocomplete: 'new-password', placeholder: 'Minimo 8 caracteres',
        onInput: function () { avaliar(); }
      });
      var confirma = h('input.input', {
        type: 'password', autocomplete: 'new-password', placeholder: 'Repita a senha',
        onInput: function () { avaliar(); }
      });
      var forca = h('div.t-tiny.t-dimmer');
      var barra = M.progress(0, { thin: true });

      function avaliar() {
        var v = senha.value;
        var pontos = 0;
        if (v.length >= 8) pontos += 30;
        if (v.length >= 12) pontos += 20;
        if (/[a-z]/.test(v) && /[A-Z]/.test(v)) pontos += 20;
        if (/[0-9]/.test(v)) pontos += 15;
        if (/[^a-zA-Z0-9]/.test(v)) pontos += 15;
        var fill = barra.querySelector('.bar__fill');
        if (fill) {
          fill.style.width = Math.min(100, pontos) + '%';
          fill.style.setProperty('--bar-color',
            pontos >= 70 ? 'var(--ok-500)' : pontos >= 45 ? 'var(--warn-500)' : 'var(--bad-500)');
        }
        var faltas = [];
        if (v.length < 8) faltas.push('8 caracteres');
        if (!/[a-zA-Z]/.test(v)) faltas.push('uma letra');
        if (!/[0-9]/.test(v)) faltas.push('um numero');
        if (faltas.length) forca.textContent = 'Falta: ' + faltas.join(', ') + '.';
        else if (confirma.value && confirma.value !== v) forca.textContent = 'As senhas nao conferem.';
        else forca.textContent = pontos >= 70 ? 'Senha forte.' : 'Senha aceitavel — o ideal e passar de 12 caracteres.';
      }

      function gerarSenha() {
        var letras = 'abcdefghijkmnopqrstuvwxyz';
        var maiusc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        var nums = '23456789';
        var simb = '!@#$%&*?';
        var todos = letras + maiusc + nums + simb;
        var buf = new Uint32Array(16);
        (global.crypto || global.msCrypto).getRandomValues(buf);
        var out = [
          maiusc[buf[0] % maiusc.length],
          letras[buf[1] % letras.length],
          nums[buf[2] % nums.length],
          simb[buf[3] % simb.length]
        ];
        for (var i = 4; i < 14; i++) out.push(todos[buf[i] % todos.length]);
        /* embaralha para os tipos obrigatorios nao ficarem sempre no inicio */
        for (var j = out.length - 1; j > 0; j--) {
          var k = buf[j % buf.length] % (j + 1);
          var tmp = out[j]; out[j] = out[k]; out[k] = tmp;
        }
        senha.value = confirma.value = out.join('');
        senha.type = confirma.type = 'text';
        avaliar();
      }

      var painelDireto = h('div.col.gap-4',
        h('div.field',
          h('label.field__label', { text: 'Nova senha' }),
          senha,
          h('div', { style: { marginTop: '6px' } }, barra),
          forca
        ),
        h('div.field',
          h('label.field__label', { text: 'Confirmar nova senha' }),
          confirma
        ),
        h('div.row.gap-2.wrap',
          h('button.btn.btn--sm', { type: 'button', onClick: gerarSenha },
            icon('sparkles'), h('span', { text: 'Gerar senha forte' })),
          h('button.btn.btn--sm.btn--ghost', {
            type: 'button',
            onClick: function () {
              var mostrar = senha.type === 'password';
              senha.type = confirma.type = mostrar ? 'text' : 'password';
              this.querySelector('span').textContent = mostrar ? 'Ocultar' : 'Mostrar';
            }
          }, icon('eye'), h('span', { text: 'Mostrar' }))
        ),
        h('div.insight.insight--warn',
          h('div.insight__ico', icon('alert')),
          h('div',
            h('div.insight__title', { text: 'Voce vai conhecer a senha desta pessoa' }),
            h('div.insight__text', {
              text: 'Esta e uma senha temporaria. Oriente a pessoa a troca-la em Meu perfil depois de entrar. A acao fica registrada na auditoria, mas a senha nunca e registrada.'
            })
          )
        )
      );

      UI.modal({
        title: 'Alterar senha de ' + F.firstName(u.nome),
        sub: u.email,
        body: h('div.col.gap-5',
          alvoEhAdmin ? h('div.insight.insight--bad',
            h('div.insight__ico', icon('shield')),
            h('div',
              h('div.insight__title', { text: 'Esta pessoa e administradora' }),
              h('div.insight__text', {
                text: 'Trocar a senha de outro administrador da acesso total a conta dela. So faca isso se voce for responsavel por essa conta.'
              })
            )
          ) : null,
          painelDireto
        ),
        footer: function (a) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { a.close(); } }),
            h('button.btn.btn--primary', { onClick: function () { confirmar(a, this); } },
              icon('check'), h('span', { text: 'Confirmar' }))
          ];
        }
      });
      setTimeout(function () { senha.focus(); }, 60);

      async function confirmar(a, botao) {
        var organizationId = S().get('session.organizationId');
        botao.disabled = true;

        try {
          if (senha.value !== confirma.value) {
            UI.toast.bad('As senhas nao conferem');
            return;
          }
          await global.AGIR_BACKEND.setUserPassword({
            organizationId: organizationId, userId: u.id, newPassword: senha.value
          });
          a.close();
          UI.toast.ok('Senha alterada',
            F.firstName(u.nome) + ' precisa entrar de novo com a nova senha.');
        } catch (erro) {
          UI.toast.bad('Nao foi possivel alterar a senha',
            erro.message || 'Tente novamente.');
        } finally {
          botao.disabled = false;
        }
      }

    }

    function editarUsuario(u) {
      formUsuario(u, 'Editar usuario', async function (dados) {
        if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
          await global.AGIR_BACKEND.updateManagedUser({
            organizationId: S().get('session.organizationId'), userId: u.id,
            fullName: dados.nome, phone: dados.telefone, extension: dados.ramal,
            role: String(dados.cargoId).replace(/^role_/, ''), currentRole: u.role,
            teamId: dados.equipeId || null, currentTeamId: u.equipeId || null
          });
          dados.role = String(dados.cargoId).replace(/^role_/, '');
        }
        var userPatch = Object.assign({}, dados); delete userPatch.meta; delete userPatch.senhaInicial;
        S().update('usuarios', u.id, userPatch);
        try {
          await saveIndividualGoal(u.id, dados.meta);
        } catch (goalError) {
          UI.toast.warn('Cadastro salvo, mas a meta nao', goalError.message || 'Tente novamente na aba Metas.');
        }
        UI.toast.ok('Cadastro atualizado', dados.nome);
        AGIR.router.resolve();
      });
    }

    function novoUsuario() {
      formUsuario(null, 'Novo usuario', async function (dados) {
        if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
          var result = await global.AGIR_BACKEND.inviteUser({
            organizationId: S().get('session.organizationId'), email: dados.email,
            fullName: dados.nome, role: String(dados.cargoId).replace(/^role_/, ''),
            teamId: dados.equipeId || null, initialPassword: dados.senhaInicial
          });
          var invited = result.user;
          if (invited.teamId && !S().byId('equipes', invited.teamId)) {
            S().insert('equipes', {
              id: invited.teamId, nome: invited.teamName || 'Equipe Comercial',
              cor: '#FF9800', gestorId: null, ativo: true
            });
          }
          var newUser = Object.assign({}, dados); delete newUser.meta; delete newUser.senhaInicial;
          S().insert('usuarios', Object.assign({}, newUser, {
            id: invited.id, role: invited.role, ativo: true,
            equipeId: invited.teamId || dados.equipeId || null,
            hue: F.hueOf(dados.nome), admissao: F.iso(new Date())
          }));
          try {
            await saveIndividualGoal(invited.id, dados.meta);
          } catch (goalError) {
            UI.toast.warn('Usuario criado, mas a meta nao', goalError.message || 'Defina a meta depois.');
          }
          UI.toast.ok('Usuario criado', dados.nome + ' ja faz parte da equipe.');
          AGIR.router.resolve();
          return function () {
            UI.toast.info('Acesso preparado', 'O usuario entra com o e-mail cadastrado e a senha inicial definida.');
          };
        }
        var localData = Object.assign({}, dados); delete localData.meta; delete localData.senhaInicial;
        localData.ativo = true;
        localData.hue = F.hueOf(dados.nome);
        localData.admissao = F.iso(new Date());
        S().insert('usuarios', localData);
        var localUser = (S().get('usuarios') || []).slice(-1)[0];
        if (localUser) await saveIndividualGoal(localUser.id, dados.meta);
        UI.toast.ok('Usuário criado', dados.nome + ' já pode acessar a plataforma.');
        AGIR.router.resolve();
      });
    }

    function formUsuario(u, titulo, onSave) {
      var f = {};
      var today = new Date();
      var currentGoal = goalFor(u && u.id) || {};
      var goalLabel = F.MES_LONGO[today.getMonth()] + ' de ' + today.getFullYear();
      var permissionHost = h('div.user-role-preview');
      var availableTeams = (S().get('equipes') || []).filter(function (team) { return team.ativo !== false; });
      var provisionsFirstTeam = !u && !availableTeams.length
        && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase';

      function goalField(key, label, value, currency) {
        var attrs = currency ? {
          value: value ? F.money(value) : '', inputmode: 'numeric', placeholder: 'R$ 0,00',
          onInput: function () { this.value = moneyMask(this.value); }
        } : { type: 'number', min: 0, step: 1, value: value || '', placeholder: '0' };
        f[key] = h('input.input', attrs);
        return h('div.field', h('label.field__label', { text: label }), f[key]);
      }

      UI.modal({
        title: titulo,
        body: h('div.col.gap-4',
          AGIR.util.campo(f, 'nome', 'Nome completo', { value: u ? u.nome : '', autofocus: true, required: true }),
          AGIR.util.campo(f, 'email', 'E-mail', {
            type: 'email', value: u ? u.email : '', required: true,
            readonly: Boolean(u && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')
          }),
          !u ? AGIR.util.campo(f, 'senhaInicial', 'Senha inicial', {
            type: 'password', autocomplete: 'new-password', required: true,
            placeholder: 'Minimo 8 caracteres, com letra e numero'
          }) : null,
          h('div.grid.g-2',
            (function () {
              var cargosDisponiveis = (S().get('cargos') || []).filter(function (c) {
                var realRole = /^role_/.test(c.id);
                var canInvite = Boolean(u) || (c.id !== 'role_admin' && c.id !== 'cg_admin');
                return (!(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') || realRole) && canInvite;
              });
              f.cargoId = h('select.select', { onChange: renderPermissions },
                !u ? h('option', { value: '', text: 'Selecione um cargo', selected: true }) : null,
                cargosDisponiveis.map(function (c) {
                  return h('option', { value: c.id, text: c.nome, selected: u && u.cargoId === c.id });
                }));
              return h('div.field', h('label.field__label', h('span', { text: 'Cargo' }), h('span.required-mark', { text: '*' })), f.cargoId);
            })(),
            (function () {
              f.equipeId = h('select.select',
                provisionsFirstTeam
                  ? h('option', { value: '__auto__', text: 'Equipe Comercial (criada automaticamente)', selected: true })
                  : h('option', { value: '', text: 'Selecione uma equipe', selected: !u || !u.equipeId }),
                availableTeams.map(function (e) {
                return h('option', { value: e.id, text: e.nome, selected: u && u.equipeId === e.id });
              }));
              return h('div.field',
                h('label.field__label', h('span', { text: 'Equipe' }), h('span.required-mark', { text: '*' })),
                f.equipeId,
                provisionsFirstTeam ? h('div.field__hint', { text: 'A primeira equipe sera preparada junto com este usuario.' }) : null
              );
            })()
          ),
          permissionHost,
          h('div.grid.g-2',
            AGIR.util.campo(f, 'ramal', 'Ramal (telefonia)', { value: u ? u.ramal : '' }),
            AGIR.util.campo(f, 'telefone', 'Telefone', { value: u ? u.telefone : '' })
          ),
          h('details.card.card--pad.user-goal-editor', { open: true },
            h('summary.row.between.gap-3',
              h('div', h('b.t-small', { text: 'Meta individual' }),
                h('div.t-tiny.t-dimmer', { text: goalLabel + ' · campos opcionais' })),
              icon('chevDown')
            ),
            h('div.grid.g-3.mt-4',
              goalField('goalSalesAmount', 'Meta de Estorno Solicitado', currentGoal.vendasValor, true),
              goalField('goalSalesCount', 'Quantidade de vendas', currentGoal.vendasQtd),
              goalField('goalProposals', 'Propostas', currentGoal.propostas),
              goalField('goalMeetings', 'Reunioes', currentGoal.reunioes),
              goalField('goalAppointments', 'Agendamentos', currentGoal.agendamentos),
              goalField('goalCalls', 'Ligacoes', currentGoal.ligacoes)
            )
          )
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { text: 'Salvar', onClick: async function () {
              if (!f.nome.value.trim()) return UI.toast.bad('Falta o nome');
              if (!f.email.value.trim()) return UI.toast.bad('Falta o e-mail');
              if (!u && (f.senhaInicial.value.length < 8 || !/[a-zA-Z]/.test(f.senhaInicial.value) || !/[0-9]/.test(f.senhaInicial.value))) {
                return UI.toast.bad('Senha inicial invalida', 'Use ao menos 8 caracteres, uma letra e um numero.');
              }
              if (!f.cargoId.value) return UI.toast.bad('Selecione o cargo');
              if (!f.equipeId.value) return UI.toast.bad('Selecione a equipe');
              this.disabled = true;
              try {
                var rawGoalValues = [f.goalSalesAmount.value, f.goalSalesCount.value, f.goalProposals.value,
                  f.goalMeetings.value, f.goalAppointments.value, f.goalCalls.value];
                var afterSave = await onSave({
                  nome: f.nome.value.trim(), email: f.email.value.trim().toLowerCase(),
                  senhaInicial: !u ? f.senhaInicial.value : null,
                  cargoId: f.cargoId.value,
                  equipeId: f.equipeId.value === '__auto__' ? '' : f.equipeId.value,
                  ramal: f.ramal.value.trim(), telefone: f.telefone.value.replace(/\D/g, ''),
                  meta: {
                    defined: Boolean(currentGoal.id || rawGoalValues.some(function (value) { return String(value || '').trim(); })),
                    year: today.getFullYear(), month: today.getMonth() + 1,
                    salesAmount: parseMoney(f.goalSalesAmount.value),
                    salesCount: Math.max(0, Number(f.goalSalesCount.value) || 0),
                    proposals: Math.max(0, Number(f.goalProposals.value) || 0),
                    meetings: Math.max(0, Number(f.goalMeetings.value) || 0),
                    appointments: Math.max(0, Number(f.goalAppointments.value) || 0),
                    calls: Math.max(0, Number(f.goalCalls.value) || 0)
                  }
                });
                api.close();
                if (typeof afterSave === 'function') global.setTimeout(afterSave, 80);
              } catch (error) {
                this.disabled = false;
                UI.toast.bad('Nao foi possivel salvar o usuario', error.message || 'Revise os dados.');
              }
            } })
          ];
        }
      });
      renderPermissions();

      function renderPermissions() {
        var role = f.cargoId && S().byId('cargos', f.cargoId.value) || {};
        D.mount(permissionHost,
          h('div.row.gap-3',
            h('span.kpi__icon', { style: { '--kpi-icon-bg': 'var(--bg-elev-2)', '--kpi-icon-fg': role.cor || 'var(--brand-500)' } }, icon('lock')),
            h('div.grow',
              h('b.t-small', { text: 'Permissoes herdadas de ' + (role.nome || 'cargo') }),
              h('div.row.gap-1.wrap.mt-2', (role.permissoes || ['Acesso definido pelo perfil']).map(function (permission) {
                return h('span.badge', { text: permission });
              }))
            )
          )
        );
      }
    }
  };

  /* ==========================================================================
     ARQUIVOS
     ========================================================================== */
  var TIPO_ICO = { pdf: 'filetext', doc: 'filetext', xls: 'calc', ppt: 'layers', img: 'eye' };
  var TIPO_COR = {
    pdf: 'var(--bad-500)', doc: 'var(--series-2)',
    xls: 'var(--ok-500)', ppt: 'var(--warn-500)', img: 'var(--plum-500)'
  };

  AGIR.pages.perfArquivos = function (node, ctx) {
    var q = ctx.query || {};
    var categorias = S().get('categoriasArquivo') || [];
    var catId = q.cat || (categorias[0] || {}).id;
    var termo = q.q || '';

    node.appendChild(W.pageHead({
      icon: 'folder',
      title: 'Arquivos',
      sub: 'Playbooks, scripts e materiais de apoio comercial — a fonte única de verdade do time.',
      actions: [
        h('div.search', { style: { width: 'min(280px,42vw)' } },
          icon('search'),
          h('input.input', {
            placeholder: 'Buscar arquivo…', value: termo,
            onInput: AGIR.util.deb(function () { AGIR.router.setQuery({ q: this.value || null }); }, 260)
          })
        ),
        h('button.btn.btn--primary', { onClick: novoArquivo },
          icon('upload'), h('span', { text: 'Adicionar arquivo' }))
      ]
    }));

    node.appendChild(h('div.filterbar',
      categorias.map(function (c) {
        var n = (S().get('arquivos') || []).filter(function (a) { return a.categoriaId === c.id; }).length;
        return h('button.chip' + (catId === c.id ? '.is-active' : ''), {
          onClick: function () { AGIR.router.setQuery({ cat: c.id }); }
        },
          c.restrito ? icon('lock') : null,
          h('span', { text: c.nome }),
          n ? h('span.t-tiny', { style: { opacity: .6 }, text: n } ) : null
        );
      })
    ));

    var lista = (S().get('arquivos') || []).filter(function (a) {
      if (a.categoriaId !== catId) return false;
      if (!termo) return true;
      return F.norm(a.nome).indexOf(F.norm(termo)) >= 0;
    });

    var cat = S().byId('categoriasArquivo', catId) || {};

    if (cat.restrito) {
      node.appendChild(h('div.insight.insight--warn',
        h('div.insight__ico', icon('lock')),
        h('div.grow',
          h('div.insight__title', { text: 'Categoria restrita' }),
          h('div.insight__text', { text: 'Apenas gestores e administradores enxergam os arquivos desta pasta.' })
        )
      ));
    }

    if (!lista.length) {
      node.appendChild(UI.empty({
        icon: 'folder', title: 'Nenhum arquivo nesta categoria',
        text: 'Suba o primeiro material para o time parar de pedir por WhatsApp.',
        action: { label: 'Adicionar arquivo', icon: 'upload', onClick: novoArquivo }
      }));
    } else {
      node.appendChild(h('div.grid.g-3.stagger', lista.map(function (a, i) {
        var autor = S().byId('usuarios', a.autorId);
        return h('div.card.card--pad.card--hover.col.gap-3', { style: { '--i': i } },
          h('div.row.gap-3',
            h('span.kpi__icon', {
              style: { width: '40px', height: '40px', '--kpi-icon-bg': 'var(--bg-elev-2)',
                '--kpi-icon-fg': TIPO_COR[a.tipo] || 'var(--ink-2)' }
            }, icon(TIPO_ICO[a.tipo] || 'filetext')),
            h('div.grow', { style: { minWidth: 0 } },
              h('div.strong.clamp-2', { style: { fontSize: 'var(--fs-sm)' }, text: a.nome }),
              h('div.t-tiny.t-dimmer', { text: tamanho(a.tamanho) + ' · ' + a.tipo.toUpperCase() })
            )
          ),
          h('div.row.between.gap-2',
            h('span.t-tiny.t-dimmer', { text: (autor ? F.firstName(autor.nome) + ' · ' : '') + F.relative(a.criadoEm) }),
            h('span.badge', { 'data-tip': 'Downloads', text: F.num(a.downloads) + '↓' })
          ),
          h('div.row.gap-2',
            h('button.btn.btn--sm.grow', {
              onClick: async function () {
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  try {
                    var url = await global.AGIR_BACKEND.createFileDownload({
                      organizationId: S().get('session.organizationId'), fileId: a.id,
                      storagePath: a.storagePath, userId: (S().currentUser() || {}).id
                    });
                    S().update('arquivos', a.id, { downloads: a.downloads + 1 });
                    global.open(url, '_blank', 'noopener');
                  } catch (error) { UI.toast.bad('Nao foi possivel baixar', error.message || 'Tente novamente.'); }
                  return;
                }
                S().update('arquivos', a.id, { downloads: a.downloads + 1 });
                UI.toast.info('Demonstracao', 'Arquivo sem anexo no modo local.');
              }
            }, icon('download'), h('span', { text: 'Baixar' })),
            h('button.btn.btn--icon.btn--sm', {
              'aria-label': 'Excluir',
              onClick: function () { excluir(a); }
            }, icon('trash'))
          )
        );
      })));
    }

    function excluir(a) {
      UI.confirm({ title: 'Excluir arquivo?', text: a.nome, danger: true, okLabel: 'Excluir' })
        .then(async function (ok) {
          if (!ok) return;
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            try {
              await global.AGIR_BACKEND.archiveFile({
                organizationId: S().get('session.organizationId'), fileId: a.id, storagePath: a.storagePath
              });
            } catch (error) { UI.toast.bad('Nao foi possivel excluir', error.message || 'Tente novamente.'); return; }
          }
          S().remove('arquivos', a.id);
          UI.toast.warn('Arquivo excluido');
          AGIR.router.resolve();
        });
    }
    function novoArquivo() {
      var f = {};
      UI.modal({
        title: 'Adicionar arquivo',
        sub: global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase' ? 'Envie um arquivo privado de ate 25 MB.' : 'No modo demonstracao, apenas os metadados sao salvos.',
        body: h('div.col.gap-4',
          (function () {
            f.arquivo = h('input.input', {
              type: 'file', accept: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg',
              onChange: function () { if (this.files[0] && !f.nome.value) f.nome.value = this.files[0].name; }
            });
            return h('div.field', h('label.field__label', { text: 'Arquivo (max. 25 MB)' }), f.arquivo);
          })(),
          AGIR.util.campo(f, 'nome', 'Nome do arquivo', { placeholder: 'Playbook Comercial v4.pdf', autofocus: true }),
          h('div.grid.g-2',
            (function () {
              f.categoriaId = h('select.select', categorias.map(function (c) {
                return h('option', { value: c.id, text: c.nome, selected: c.id === catId });
              }));
              return h('div.field', h('label.field__label', { text: 'Categoria' }), f.categoriaId);
            })(),
            (function () {
              f.tipo = h('select.select', ['pdf', 'doc', 'xls', 'ppt', 'img'].map(function (t) {
                return h('option', { value: t, text: t.toUpperCase() });
              }));
              return h('div.field', h('label.field__label', { text: 'Tipo' }), f.tipo);
            })()
          )
        ),
        footer: function (api) {
          return [
            h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
            h('button.btn.btn--primary', { text: 'Adicionar', onClick: async function () {
              if (!f.nome.value.trim()) return UI.toast.bad('Falta o nome do arquivo');
              if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                if (!f.arquivo.files[0]) return UI.toast.bad('Selecione um arquivo');
                this.disabled = true;
                try {
                  var category = S().byId('categoriasArquivo', f.categoriaId.value) || {};
                  var saved = await global.AGIR_BACKEND.uploadFile({
                    organizationId: S().get('session.organizationId'), categoryId: f.categoriaId.value,
                    userId: (S().currentUser() || {}).id, file: f.arquivo.files[0],
                    name: f.nome.value.trim(), accessLevel: category.accessLevel || 'organization'
                  });
                  S().insert('arquivos', {
                    id: saved.id, nome: saved.name, categoriaId: saved.category_id,
                    tipo: f.tipo.value, tamanho: Number(saved.size_bytes), downloads: 0,
                    autorId: saved.uploaded_by, criadoEm: saved.created_at,
                    storagePath: saved.storage_path, accessLevel: saved.access_level
                  });
                  api.close(); UI.toast.ok('Arquivo enviado com seguranca'); AGIR.router.resolve();
                } catch (error) { this.disabled = false; UI.toast.bad('Nao foi possivel enviar', error.message || 'Tente novamente.'); }
                return;
              }
              S().insert('arquivos', {
                nome: f.nome.value.trim(), categoriaId: f.categoriaId.value,
                tipo: f.tipo.value, tamanho: 0, downloads: 0,
                autorId: (S().currentUser() || {}).id, criadoEm: new Date().toISOString()
              });
              api.close();
              UI.toast.ok('Arquivo catalogado');
              AGIR.router.resolve();
            } })
          ];
        }
      });
    }

    function tamanho(bytes) {
      if (!bytes) return '—';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return F.num(bytes / 1024, 0) + ' KB';
      return F.num(bytes / 1048576, 1) + ' MB';
    }
  };
})(window);
