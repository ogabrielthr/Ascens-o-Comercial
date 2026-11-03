/* ==========================================================================
   AGIR — Configurações
   Tudo que muda o comportamento da plataforma em um lugar só, com navegação
   em duas camadas: seção à esquerda, aba no topo.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  var SECOES = [
    { id: 'geral', nome: 'Geral', icone: 'settings', abas: [
      { id: 'perfil',  nome: 'Meu perfil' },
      { id: 'empresa', nome: 'Empresa' },
      { id: 'usuarios', nome: 'Usu\u00e1rios' },
      { id: 'cargos',  nome: 'Cargos e permissões' },
      { id: 'equipes', nome: 'Equipes' },
      { id: 'metas', nome: 'Metas' },
      { id: 'aparencia', nome: 'Aparência' },
      { id: 'dados',   nome: 'Dados' }
    ]},
    { id: 'crm', nome: 'CRM', icone: 'kanban', abas: [
      { id: 'pipelines', nome: 'Pipelines e etapas' },
      { id: 'produtos',  nome: 'Produtos' },
      { id: 'convenios', nome: 'Segmentos de clientes' },
      { id: 'bancos',    nome: 'Parceiros de execução' },
      { id: 'origens',   nome: 'Origens e perdas' }
    ]},
    { id: 'performance', nome: 'Performance', icone: 'trophy', abas: [
      { id: 'conteudos',   nome: 'Conteúdos' },
      { id: 'categorias',  nome: 'Categorias de arquivo' },
      { id: 'gamificacao', nome: 'Gamificação' },
      { id: 'clima',       nome: 'Check-in de humor' }
    ]},
    { id: 'financeiro', nome: 'Financeiro', icone: 'wallet', abas: [
      { id: 'contas',  nome: 'Plano de contas' },
      { id: 'centros', nome: 'Centros de custo' }
    ]}
  ];

  AGIR.pages.config = function (node, ctx) {
    var q = ctx.query || {};
    var current = S().currentUser() || {};
    var sessionRole = S().get('session.role');
    var isAdmin = current.role === 'admin' || sessionRole === 'admin' ||
      current.cargoId === 'cg_admin' || current.cargoId === 'role_admin';
    var sections = (isAdmin ? SECOES : [SECOES[0]]).map(function (section) {
      return Object.assign({}, section, { abas: section.abas.filter(function (tab) {
        return isAdmin || tab.id === 'perfil';
      }) });
    });
    var secId = isAdmin ? (q.sec || 'geral') : 'geral';
    var sec = sections.find(function (s) { return s.id === secId; }) || sections[0];
    var abaId = isAdmin ? (q.tab || sec.abas[0].id) : 'perfil';
    if (!sec.abas.some(function (a) { return a.id === abaId; })) abaId = sec.abas[0].id;

    node.appendChild(W.pageHead({
      icon: 'settings',
      title: 'Configurações',
      sub: 'Gerencie sua empresa, equipe e as regras da plataforma.'
    }));

    var conteudo = h('div.grow', { style: { minWidth: 0 } });

    node.appendChild(h('div.grid', { style: { gridTemplateColumns: 'minmax(0,220px) minmax(0,1fr)', alignItems: 'start' } },
      /* menu lateral de seções */
      h('nav.card.card--pad', { style: { position: 'sticky', top: 'calc(var(--topbar-h) + var(--sp-4))', padding: 'var(--sp-2)' } },
        sections.map(function (s) {
          return h('a.nav-item', {
            href: AGIR.router.href('/config', { sec: s.id }),
            class: s.id === secId ? 'is-active' : ''
          }, icon(s.icone), h('span', { text: s.nome }));
        })
      ),
      h('div.col.gap-5',
        UI.tabs(sec.abas.map(function (a) { return { value: a.id, label: a.nome }; }), abaId, function (v) {
          AGIR.router.setQuery({ sec: secId, tab: v });
        }),
        conteudo
      )
    ));

    var render = ({
      perfil: abaPerfil, empresa: abaEmpresa, usuarios: abaUsuarios,
      cargos: abaCargos, equipes: abaEquipes, metas: abaMetas,
      aparencia: abaAparencia, dados: abaDados,
      pipelines: abaPipelines, produtos: abaProdutos, convenios: abaConvenios,
      bancos: abaBancos, origens: abaOrigens,
      conteudos: abaConteudos, categorias: abaCategorias, gamificacao: abaGamificacao,
      clima: abaClima,
      contas: abaContas, centros: abaCentros
    })[abaId] || abaPerfil;

    D.mount(conteudo, render());

    function abaUsuarios() {
      var host = h('div');
      AGIR.pages.perfUsuarios(host, { query: q, embedded: true });
      return host;
    }

    function abaMetas() {
      var host = h('div');
      AGIR.pages.crmMetas(host, { query: q, embedded: true, readonly: false });
      return host;
    }

    /* ======================================================================
       GERAL
       ====================================================================== */
    function abaPerfil() {
      var u = S().currentUser();
      var f = {};
      var senha, confirmar;
      return h('div.col.gap-5',
        W.section({
          title: 'Foto de perfil',
          body: h('div.row.gap-4',
            AGIR.avatar(u, 'xl'),
            h('div.col.gap-2',
              h('button.btn', { onClick: escolherFoto }, icon('upload'), h('span', { text: 'Alterar foto' })),
              h('span.t-tiny.t-dimmer', { text: 'JPG ou PNG, até 5 MB.' })
            )
          )
        }),
        W.section({
          title: 'Informações pessoais',
          body: h('div.col.gap-4',
            campo(f, 'nome', 'Nome completo', { value: u.nome }),
            campo(f, 'email', 'E-mail', {
              value: u.email, type: 'email',
              readonly: Boolean(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase')
            }),
            campo(f, 'ramal', 'Ramal (telefonia)', { value: u.ramal }),
            h('div.field__hint', { text: 'Seu ramal é usado para vincular automaticamente as chamadas do discador ao seu usuário.' }),
            h('div', h('button.btn.btn--primary', { onClick: async function () {
              var dados = { nome: f.nome.value.trim(), email: f.email.value.trim(), ramal: f.ramal.value.trim() };
              if (!dados.nome) return UI.toast.bad('Preencha o nome completo');
              if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                this.disabled = true;
                try {
                  var saved = await global.AGIR_BACKEND.updateOwnProfile({
                    userId: u.id, fullName: dados.nome, phone: u.telefone || '', extension: dados.ramal
                  });
                  dados.nome = saved.full_name; dados.ramal = saved.extension || '';
                } catch (error) { this.disabled = false; UI.toast.bad('Nao foi possivel salvar o perfil', error.message || 'Tente novamente.'); return; }
              }
              S().update('usuarios', u.id, dados);
              UI.toast.ok('Perfil salvo');
              AGIR.router.resolve();
            } }, icon('check'), h('span', { text: 'Salvar perfil' })))
          )
        }),
        isAdmin ? W.section({
          title: 'Alterar senha',
          body: h('div.col.gap-4',
            h('div.field',
              h('label.field__label', { text: 'Nova senha' }),
              senha = h('input.input', { type: 'password', minlength: 8, autocomplete: 'new-password', placeholder: 'Minimo de 8 caracteres' })
            ),
            h('div.field',
              h('label.field__label', { text: 'Confirmar nova senha' }),
              confirmar = h('input.input', { type: 'password', minlength: 8, autocomplete: 'new-password', placeholder: 'Repita a nova senha' })
            ),
            h('div', h('button.btn', { onClick: async function () {
              if (!senha.value || senha.value.length < 8) return UI.toast.warn('Use uma senha com pelo menos 8 caracteres');
              if (senha.value !== confirmar.value) return UI.toast.warn('As senhas nao conferem');
              if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                this.disabled = true;
                try { await global.AGIR_BACKEND.changePassword(senha.value); }
                catch (error) { this.disabled = false; UI.toast.bad('Nao foi possivel alterar a senha', error.message || 'Tente novamente.'); return; }
              }
              senha.value = ''; confirmar.value = '';
              UI.toast.ok('Senha alterada com seguranca');
            } }, icon('lock'), h('span', { text: 'Alterar senha' })))
          )
        }) : W.section({
          title: 'Acesso ao escritorio',
          body: h('div.insight.insight--info',
            h('div.insight__ico', icon('key')),
            h('div',
              h('div.insight__title', { text: 'Sua conta nao utiliza senha' }),
              h('div.insight__text', { text: 'Seu acesso usa e-mail e senha com sessao segura e renovacao automatica. Voce pode alterar a propria senha nesta tela.' })
            )
          )
        })      );

      function escolherFoto() {
        var input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) return UI.toast.warn('Imagem muito grande', 'Escolha uma foto de ate 5 MB.');
          abrirRecorte(file);
        });
        document.body.appendChild(input);
        input.click();
        global.setTimeout(function () { input.remove(); }, 60000);
      }

      function abrirRecorte(file) {
        var image = new Image();
        var objectUrl = URL.createObjectURL(file);
        image.onload = function () {
          var zoom = h('input.avatar-crop__range', { type: 'range', min: 1, max: 3, step: .01, value: 1 });
          var panX = h('input.avatar-crop__range', { type: 'range', min: -100, max: 100, step: 1, value: 0 });
          var panY = h('input.avatar-crop__range', { type: 'range', min: -100, max: 100, step: 1, value: 0 });
          var canvas = h('canvas.avatar-crop__canvas', { width: 420, height: 420 });
          [zoom, panX, panY].forEach(function (control) { control.addEventListener('input', renderPreview); });
          renderPreview();
          var modal = UI.modal({
            title: 'Enquadrar foto',
            sub: 'Ajuste a imagem para ela ficar bem nos cards e no ranking.',
            body: h('div.avatar-crop',
              h('div.avatar-crop__viewport', canvas),
              cropControl('Zoom', zoom), cropControl('Horizontal', panX), cropControl('Vertical', panY)
            ),
            footer: function (api) { return [
              h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); cleanup(); } }),
              h('button.btn.btn--primary', { onClick: async function () {
                var button = this;
                button.disabled = true;
                button.textContent = 'Salvando...';
                try {
                  var output = document.createElement('canvas'); output.width = 512; output.height = 512;
                  drawCrop(output);
                  var blob = await new Promise(function (resolve) { output.toBlob(resolve, 'image/jpeg', .9); });
                  if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                    var saved = await global.AGIR_BACKEND.uploadOwnAvatar({ userId: u.id, blob: blob });
                    S().update('usuarios', u.id, { avatarPath: saved.path, avatarUrl: saved.url });
                  } else {
                    S().update('usuarios', u.id, { avatarUrl: output.toDataURL('image/jpeg', .88) });
                  }
                  api.close(); cleanup(); UI.toast.ok('Foto atualizada'); AGIR.router.resolve();
                } catch (error) {
                  button.disabled = false; button.textContent = 'Salvar foto';
                  UI.toast.bad('Nao foi possivel salvar a foto', error.message || 'Tente outra imagem.');
                }
              } }, icon('check'), h('span', { text: 'Salvar foto' }))
            ]; }
          });

          function cropControl(label, control) {
            return h('label.avatar-crop__control', h('span', { text: label }), control);
          }
          function renderPreview() { drawCrop(canvas); }
          function drawCrop(target) {
            var context = target.getContext('2d');
            var size = target.width;
            context.clearRect(0, 0, size, size);
            var scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * Number(zoom.value);
            var width = image.naturalWidth * scale, height = image.naturalHeight * scale;
            var x = (size - width) / 2 + (Number(panX.value) / 100) * Math.max(0, (width - size) / 2);
            var y = (size - height) / 2 + (Number(panY.value) / 100) * Math.max(0, (height - size) / 2);
            context.drawImage(image, x, y, width, height);
          }
          function cleanup() { URL.revokeObjectURL(objectUrl); }
          modal.el.addEventListener('close', cleanup, { once: true });
        };
        image.onerror = function () { URL.revokeObjectURL(objectUrl); UI.toast.bad('Imagem invalida'); };
        image.src = objectUrl;
      }
    }

    function abaEmpresa() {
      var e = S().get('empresa') || {};
      var f = {};
      return W.section({
        title: 'Dados da empresa',
        sub: 'Aparecem em propostas, relatórios impressos e no cabeçalho da plataforma.',
        body: h('div.col.gap-4',
          h('div.grid.g-2',
            campo(f, 'nome', 'Nome fantasia', { value: e.nome }),
            campo(f, 'razao', 'Razão social', { value: e.razao })
          ),
          h('div.grid.g-3',
            campo(f, 'cnpj', 'CNPJ', { value: F.cnpj(e.cnpj) }),
            campo(f, 'telefone', 'Telefone', { value: F.phone(e.telefone) }),
            campo(f, 'site', 'Site', { value: e.site })
          ),
          h('div.grid.g-3',
            campo(f, 'cidade', 'Cidade', { value: e.cidade }),
            campo(f, 'uf', 'UF', { value: e.uf, maxlength: 2 }),
            campo(f, 'fundacao', 'Fundação', { value: e.fundacao, type: 'date' })
          ),
          campo(f, 'segmento', 'Segmento', { value: e.segmento }),
          h('div', h('button.btn.btn--primary', { onClick: async function () {
            var dados = {};
            Object.keys(f).forEach(function (k) { dados[k] = f[k].value.trim(); });
            dados.cnpj = dados.cnpj.replace(/\D/g, '');
            dados.telefone = dados.telefone.replace(/\D/g, '');
            dados.uf = dados.uf.toUpperCase();
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              if (!dados.nome) return UI.toast.bad('Preencha o nome fantasia');
              this.disabled = true;
              try {
                var saved = await global.AGIR_BACKEND.updateOrganization({
                  organizationId: S().get('session.organizationId'), name: dados.nome,
                  legalName: dados.razao, cnpj: dados.cnpj, phone: dados.telefone,
                  site: dados.site, city: dados.cidade, state: dados.uf,
                  foundedOn: dados.fundacao, segment: dados.segmento
                });
                dados = {
                  id: saved.id, nome: saved.name, razao: saved.legal_name || '',
                  cnpj: saved.cnpj || '', telefone: saved.phone || '', site: saved.site || '',
                  cidade: saved.city || '', uf: saved.state || '',
                  fundacao: saved.founded_on || '', segmento: saved.segment || ''
                };
              } catch (error) { this.disabled = false; UI.toast.bad('Nao foi possivel salvar', error.message || 'Revise os dados.'); return; }
            }
            S().set('empresa', Object.assign({}, e, dados));
            UI.toast.ok('Dados da empresa salvos');
            AGIR.router.resolve();
          } }, icon('check'), h('span', { text: 'Salvar' })))
        )
      });
    }

    function abaCargos() {
      var cargos = S().get('cargos') || [];
      return W.section({
        title: 'Cargos e permissões',
        sub: 'O nível define o que cada pessoa enxerga. Quanto maior, mais acesso.',
        flush: true,
        body: W.dataTable({
          rows: cargos.slice().sort(function (a, b) { return b.nivel - a.nivel; }),
          sort: null,
          columns: [
            { key: 'nome', label: 'Cargo', sortable: false,
              render: function (c) {
                return h('span.row.gap-2', h('i.dot', { style: { background: c.cor || 'var(--ink-3)' } }),
                  h('b', { text: c.nome }));
              } },
            { key: 'nivel', label: 'Nível', align: 'right', sortable: false,
              render: function (c) { return h('span.badge', { text: c.nivel }); } },
            { key: 'usuarios', label: 'Pessoas', align: 'right', sortable: false,
              render: function (c) {
                var n = (S().get('usuarios') || []).filter(function (u) { return u.cargoId === c.id; }).length;
                return h('span.t-num', { text: F.num(n) });
              } },
            { key: 'perm', label: 'Permissões', sortable: false,
              render: function (c) {
                return h('div.row.gap-1.wrap', (c.permissoes || []).map(function (p) {
                  return h('span.badge', { text: p === '*' ? 'acesso total' : p });
                }), !c.permissoes || !c.permissoes.length
                  ? h('span.badge', { text: c.id === 'role_admin' ? 'acesso total' : 'definido pelo perfil' })
                  : null);
              } }
          ]
        })
      });
    }

    function abaEquipes() {
      var equipes = S().get('equipes') || [];
      return h('div.col.gap-5',
        W.section({
          title: 'Equipes',
          sub: 'Agrupamento usado nos filtros e nos relatórios comparativos.',
          actions: [h('button.btn.btn--sm.btn--primary', { onClick: novaEquipe },
            icon('plus'), h('span', { text: 'Nova equipe' }))],
          body: h('div.grid.g-2', equipes.map(function (e) {
            var membros = (S().get('usuarios') || []).filter(function (u) { return u.equipeId === e.id; });
            var k = An.kpis({ periodo: 'mes', equipeId: e.id }).atual;
            var gestor = S().byId('usuarios', e.gestorId);
            return h('div.card.card--pad.col.gap-3',
              h('div.row.gap-3',
                h('span.kpi__icon', { style: { '--kpi-icon-bg': 'var(--bg-elev-2)', '--kpi-icon-fg': e.cor } }, icon('users')),
                h('div.grow',
                  h('b.t-h4', { text: e.nome }),
                  h('div.t-tiny.t-dimmer', { text: gestor ? 'Gestor: ' + gestor.nome : 'Sem gestor definido' })
                ),
                h('button.btn.btn--icon.btn--sm.btn--ghost', {
                  'aria-label': 'Renomear',
                  onClick: function () {
                    UI.prompt({ title: 'Renomear equipe', label: 'Nome', value: e.nome })
                      .then(async function (v) {
                        if (!v) return;
                        if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                          try {
                            var saved = await global.AGIR_BACKEND.saveTeam({
                              organizationId: S().get('session.organizationId'), id: e.id,
                              name: v, color: e.cor, managerId: e.gestorId
                            });
                            v = saved.name;
                          } catch (error) { UI.toast.bad('Nao foi possivel renomear', error.message || 'Tente novamente.'); return; }
                        }
                        S().update('equipes', e.id, { nome: v });
                        UI.toast.ok('Equipe renomeada');
                        AGIR.router.resolve();
                      });
                  }
                }, icon('edit'))
              ),
              h('div.av-stack', membros.slice(0, 8).map(function (m) { return AGIR.avatar(m, 'sm'); })),
              h('div.row.gap-4',
                mini('Pessoas', F.num(membros.length)),
                mini('Estorno solicitado', F.moneyShort(k.vendasValor)),
                mini('Ligações', F.num(k.ligacoes))
              )
            );
          }))
        })
      );

      function novaEquipe() {
        UI.prompt({ title: 'Nova equipe', label: 'Nome da equipe', placeholder: 'Equipe Charlie' })
          .then(async function (v) {
            if (!v) return;
            var color = 'var(--series-' + (equipes.length % 8 + 1) + ')';
            var managerId = (S().currentUser() || {}).id;
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              try {
                var saved = await global.AGIR_BACKEND.saveTeam({
                  organizationId: S().get('session.organizationId'), name: v,
                  color: color, managerId: managerId
                });
                S().insert('equipes', { id: saved.id, nome: saved.name, cor: saved.color,
                  gestorId: saved.manager_id, ativo: saved.active });
              } catch (error) { UI.toast.bad('Nao foi possivel criar a equipe', error.message || 'Tente novamente.'); return; }
            } else {
              S().insert('equipes', { nome: v, cor: color, gestorId: managerId });
            }
            UI.toast.ok('Equipe criada', v);
            AGIR.router.resolve();
          });
      }
    }

    function abaAparencia() {
      var st = S().get('settings');
      return h('div.col.gap-5',
        W.section({
          title: 'Tema',
          sub: 'A escolha vale só para o seu usuário, neste navegador.',
          body: h('div.grid.g-2',
            temaCard('dark', 'Escuro', '#0C0E13', '#11141A', st.theme === 'dark'),
            temaCard('light', 'Claro', '#F6F7F9', '#FFFFFF', st.theme === 'light')
          )
        }),
        W.section({
          title: 'Densidade',
          sub: 'Compacto cabe mais linha na tela — bom para mesa de operação.',
          body: h('div.col.gap-4',
            h('label.switch',
              h('input', { type: 'checkbox', checked: st.density === 'compact',
                onChange: function () {
                  S().pref('density', this.checked ? 'compact' : 'normal');
                  AGIR.shell.applyPrefs();
                  AGIR.shell.persistPrefs();
                  UI.toast.info(this.checked ? 'Modo compacto' : 'Modo confortável');
                } }),
              h('span.switch__track'), h('span.switch__thumb'),
              h('span.t-small', { text: 'Modo compacto' })
            ),
            h('div.t-tiny.t-dimmer', { text: 'Atalho: abra as preferências na barra do topo ou use a paleta de comandos.' })
          )
        }),
        W.section({
          title: 'Atalhos de teclado',
          body: h('div', h('button.btn', { onClick: AGIR.shell.atalhos },
            icon('command'), h('span', { text: 'Ver lista de atalhos' })))
        })
      );

      function temaCard(id, nome, bg, card, ativo) {
        return h('button.card.card--pad.col.gap-3.no-ripple', {
          style: {
            textAlign: 'left',
            borderColor: ativo ? 'var(--brand-500)' : 'var(--line)',
            boxShadow: ativo ? 'var(--brand-glow)' : 'none'
          },
          onClick: function () {
            S().pref('theme', id);
            AGIR.shell.applyPrefs();
            AGIR.shell.persistPrefs();
            AGIR.router.resolve();
          }
        },
          h('div', { style: {
            height: '84px', borderRadius: 'var(--r-md)', background: bg,
            border: '1px solid var(--line)', padding: '10px', display: 'flex', gap: '6px', flexDirection: 'column'
          } },
            h('div', { style: { height: '10px', width: '55%', borderRadius: '3px', background: card } }),
            h('div', { style: { height: '10px', width: '78%', borderRadius: '3px', background: card, opacity: .7 } }),
            h('div', { style: { height: '10px', width: '40%', borderRadius: '3px', background: '#FF9500' } })
          ),
          h('div.row.between',
            h('b.t-small', { text: nome }),
            ativo ? h('span.badge.badge--brand', { text: 'Em uso' }) : null
          )
        );
      }
    }

    function abaDados() {
      var db = S().all();
      var real = Boolean(global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase');
      var contagens = [
        ['Oportunidades', (db.oportunidades || []).length],
        ['Atividades', (db.atividades || []).length],
        ['Usuários', (db.usuarios || []).length],
        ['Empresas', (db.empresas || []).length],
        ['Metas', (db.metas || []).length],
        ['Lançamentos financeiros', ((db.financeiro || {}).lancamentos || []).length],
        ['Aulas concluídas', (db.progresso || []).length]
      ];

      return h('div.col.gap-5',
        W.section({
          title: 'Onde os dados ficam',
          body: h('div.col.gap-3',
            h('p.t-body.t-dim', {
              text: real ? 'Os dados operacionais estao sincronizados com o Supabase e compartilhados conforme o perfil de acesso.' : 'Esta e uma versao de demonstracao com dados armazenados neste navegador.'
            }),
            h('p.t-small.t-dimmer', {
              text: real ? 'Todas as tabelas expostas usam Row Level Security; operacoes sensiveis passam por funcoes server-side.' : 'O modo demonstracao usa armazenamento local e nao deve ser usado em producao.'
            })
          )
        }),
        W.section({
          title: 'Base atual',
          body: h('div.grid.g-3', contagens.map(function (c) {
            return W.miniStat(c[0], F.num(c[1]), 'layers');
          }))
        }),
        W.section({
          title: 'Backup e restauração dos dados gerais',
          sub: 'Os dados e anexos financeiros têm cópia própria em Financeiro › Histórico e fechamento. A importação geral preserva o financeiro atual.',
          body: real ? h('div.col.gap-2', h('b.t-small', { text: 'Dados protegidos pelo Supabase' }), h('p.t-small.t-dim', { text: 'Backups e restauracoes devem ser executados pelo administrador na infraestrutura, com trilha de auditoria.' })) : h('div.row.gap-3.wrap',
            h('button.btn', { onClick: function () {
              var blob = new Blob([S().exportJSON()], { type: 'application/json' });
              var a = h('a', { href: URL.createObjectURL(blob),
                download: 'ascensao-base-' + F.iso(new Date()) + '.json' });
              document.body.appendChild(a); a.click(); a.remove();
              UI.toast.ok('Base exportada');
            } }, icon('download'), h('span', { text: 'Exportar JSON' })),
            h('button.btn', { onClick: function () {
              var inp = h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
              inp.addEventListener('change', function () {
                var file = inp.files[0];
                if (!file) return;
                var fr = new FileReader();
                fr.onload = function () {
                  try { S().importJSON(fr.result); UI.toast.ok('Base importada'); AGIR.router.resolve(); }
                  catch (err) { UI.toast.bad('Arquivo inválido', err.message); }
                };
                fr.readAsText(file);
              });
              document.body.appendChild(inp); inp.click(); inp.remove();
            } }, icon('upload'), h('span', { text: 'Importar JSON' })),
            h('button.btn.btn--danger', { onClick: AGIR.shell.recriarBase },
              icon('refresh'), h('span', { text: 'Recriar dados de exemplo' }))
          )
        })
      );
    }

    /* ======================================================================
       CRM
       ====================================================================== */
    function abaPipelines() {
      var pl = (S().get('pipelines') || [])[0];
      if (!pl) return UI.empty({ icon: 'kanban', title: 'Nenhum pipeline cadastrado' });

      return W.section({
        title: 'Etapas do pipeline "' + pl.nome + '"',
        sub: 'SLA é o prazo máximo que uma oportunidade pode ficar parada na etapa. A probabilidade alimenta o valor ponderado do funil.',
        actions: [h('button.btn.btn--sm', { onClick: novaEtapa },
          icon('plus'), h('span', { text: 'Nova etapa' }))],
        flush: true,
        body: h('div', pl.etapas.map(function (e, i) {
          return h('div.row.gap-3', {
            style: { padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--line)' }
          },
            h('div.col', { style: { gap: 0 } },
              h('button.btn.btn--icon.btn--sm.btn--ghost', {
                'aria-label': 'Subir', disabled: i === 0,
                onClick: function () { mover(i, -1); }
              }, icon('chevUp')),
              h('button.btn.btn--icon.btn--sm.btn--ghost', {
                'aria-label': 'Descer', disabled: i === pl.etapas.length - 1,
                onClick: function () { mover(i, 1); }
              }, icon('chevDown'))
            ),
            h('span', { style: { width: '4px', height: '38px', borderRadius: '2px', background: e.cor, flex: 'none' } }),
            h('div.grow', { style: { minWidth: 0 } },
              h('b.t-small', { text: e.nome }),
              h('div.row.gap-2.wrap', { style: { marginTop: '4px' } },
                h('span.badge' + (e.tipo === 'ganho' ? '.badge--ok' : e.tipo === 'perdido' ? '.badge--bad' : ''),
                  { text: e.tipo === 'aberto' ? 'Em aberto' : e.tipo === 'ganho' ? 'Ganho' : 'Perdido' }),
                e.tipo === 'aberto' ? h('span.t-tiny.t-dimmer', { text: 'SLA: ' + e.sla + 'd' }) : null,
                h('span.badge', { text: 'Prob. ' + e.prob + '%' })
              )
            ),
            h('span.t-tiny.t-dimmer', {
              text: F.plural((S().get('oportunidades') || []).filter(function (o) {
                return o.etapaId === e.id && o.status === 'aberto';
              }).length, 'oportunidade', 'oportunidades')
            }),
            h('button.btn.btn--icon.btn--sm', {
              'aria-label': 'Editar', onClick: function () { editarEtapa(e); }
            }, icon('edit')),
            h('button.btn.btn--icon.btn--sm.btn--ghost', {
              'aria-label': 'Excluir', disabled: e.tipo !== 'aberto' || pl.etapas.length <= 3,
              onClick: function () { excluirEtapa(e); }
            }, icon('trash'))
          );
        }))
      });

      function salvar() {
        S().set('pipelines', S().get('pipelines'));
        AGIR.router.resolve();
      }

      async function mover(i, delta) {
        var j = i + delta;
        if (j < 0 || j >= pl.etapas.length) return;
        var tmp = pl.etapas[i];
        pl.etapas[i] = pl.etapas[j];
        pl.etapas[j] = tmp;
        pl.etapas.forEach(function (e, k) { e.ordem = k + 1; });
        if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
          try {
            var ordered = await global.AGIR_BACKEND.reorderPipelineStages({
              pipelineId: pl.id, stageIds: pl.etapas.map(function (stage) { return stage.id; })
            });
            var byId = Object.create(null); pl.etapas.forEach(function (stage) { byId[stage.id] = stage; });
            pl.etapas = ordered.map(function (stage) {
              var local = byId[stage.id]; local.ordem = stage.position; return local;
            });
          } catch (error) {
            pl.etapas[j] = pl.etapas[i]; pl.etapas[i] = tmp;
            UI.toast.bad('Nao foi possivel reordenar', error.message || 'Tente novamente.'); return;
          }
        }
        salvar();
      }

      function editarEtapa(e) {
        var f = {};
        UI.modal({
          title: 'Editar etapa',
          body: h('div.col.gap-4',
            campo(f, 'nome', 'Nome', { value: e.nome, autofocus: true }),
            h('div.grid.g-3',
              campo(f, 'sla', 'SLA (dias)', { type: 'number', min: 0, value: e.sla }),
              campo(f, 'prob', 'Probabilidade (%)', { type: 'number', min: 0, max: 100, value: e.prob }),
              (function () {
                f.cor = h('input.input', { type: 'color', value: e.cor, style: { padding: '4px', height: 'var(--field-h)' } });
                return h('div.field', h('label.field__label', { text: 'Cor' }), f.cor);
              })()
            )
          ),
          footer: function (api) {
            return [
              h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
              h('button.btn.btn--primary', { text: 'Salvar', onClick: async function () {
                var dados = { nome: f.nome.value.trim() || e.nome, sla: Math.max(0, +f.sla.value || 0),
                  prob: Math.max(0, Math.min(100, +f.prob.value || 0)), cor: f.cor.value };
                if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  this.disabled = true;
                  try {
                    var saved = await global.AGIR_BACKEND.savePipelineStage({
                      pipelineId: pl.id, stageId: e.id, name: dados.nome,
                      slaDays: dados.sla, probability: dados.prob, color: dados.cor
                    });
                    dados.nome = saved.name; dados.sla = saved.sla_days;
                    dados.prob = Number(saved.probability); dados.cor = saved.color;
                  } catch (error) { this.disabled = false; UI.toast.bad('Nao foi possivel salvar', error.message || 'Tente novamente.'); return; }
                }
                Object.assign(e, dados);
                api.close();
                UI.toast.ok('Etapa atualizada', e.nome);
                salvar();
              } })
            ];
          }
        });
      }

      function novaEtapa() {
        UI.prompt({ title: 'Nova etapa', label: 'Nome da etapa', placeholder: 'Ex.: Análise de crédito' })
          .then(async function (v) {
            if (!v) return;
            var idx = pl.etapas.findIndex(function (e) { return e.tipo !== 'aberto'; });
            var nova = { id: S().uid('et'), nome: v, cor: '#5AB9F5', tipo: 'aberto',
              sla: 3, prob: 50, ordem: idx + 1 };
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              try {
                var saved = await global.AGIR_BACKEND.savePipelineStage({
                  pipelineId: pl.id, name: v, slaDays: 3, probability: 50, color: '#5AB9F5'
                });
                nova = { id: saved.id, nome: saved.name, cor: saved.color, tipo: 'aberto',
                  sla: saved.sla_days, prob: Number(saved.probability), ordem: saved.position };
              } catch (error) { UI.toast.bad('Nao foi possivel criar a etapa', error.message || 'Tente novamente.'); return; }
            }
            pl.etapas.splice(idx < 0 ? pl.etapas.length : idx, 0, nova);
            pl.etapas.forEach(function (e, k) { e.ordem = k + 1; });
            UI.toast.ok('Etapa criada', v);
            salvar();
          });
      }

      function excluirEtapa(e) {
        var n = (S().get('oportunidades') || []).filter(function (o) { return o.etapaId === e.id; }).length;
        UI.confirm({
          title: 'Excluir a etapa "' + e.nome + '"?', danger: true, okLabel: 'Excluir',
          text: n ? F.plural(n, 'oportunidade', 'oportunidades') + ' estão nesta etapa e serão movidas para "Lead Novo".'
            : 'Nenhuma oportunidade está nesta etapa.'
        }).then(async function (ok) {
          if (!ok) return;
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            try { await global.AGIR_BACKEND.archivePipelineStage(e.id); }
            catch (error) { UI.toast.bad('Nao foi possivel excluir a etapa', error.message || 'Remova ou mova as oportunidades primeiro.'); return; }
            pl.etapas = pl.etapas.filter(function (x) { return x.id !== e.id; });
            UI.toast.warn('Etapa excluida', e.nome); salvar(); return;
          }
          S().batch(function () {
            (S().get('oportunidades') || []).forEach(function (o) {
              if (o.etapaId === e.id) o.etapaId = 'et_novo';
            });
          });
          pl.etapas = pl.etapas.filter(function (x) { return x.id !== e.id; });
          UI.toast.warn('Etapa excluída', e.nome);
          salvar();
        });
      }
    }

    function abaProdutos() {
      return listaEditavel({
        titulo: 'Produtos de crédito',
        sub: 'O percentual padrão define a parcela do valor do projeto reconhecida como receita prevista.',
        path: 'produtos',
        catalog: 'products',
        colunas: [
          { key: 'nome', label: 'Produto', render: function (p) {
            return h('span.row.gap-2', h('i.dot', { style: { background: p.cor } }), h('b', { text: p.nome }));
          } },
          { key: 'comissaoPct', label: 'Receita prevista', align: 'right', render: function (p) {
            return h('span.badge.badge--brand', { text: F.pct(p.comissaoPct, 1) });
          } },
          { key: 'ops', label: 'Oportunidades', align: 'right', render: function (p) {
            return h('span.t-num', { text: F.num((S().get('oportunidades') || [])
              .filter(function (o) { return o.produtoId === p.id; }).length) });
          } },
          { key: 'volume', label: 'Estorno solicitado ganho', align: 'right', render: function (p) {
            var v = (S().get('oportunidades') || [])
              .filter(function (o) { return o.produtoId === p.id && o.status === 'ganho'; })
              .reduce(function (a, o) { return a + AGIR.an.valorCRM(o); }, 0);
            return h('span.strong.t-num', { text: F.moneyShort(v) });
          } }
        ],
        campos: [
          { key: 'nome', label: 'Nome do produto' },
          { key: 'comissaoPct', label: 'Receita prevista (%)', type: 'number', step: '0.1' }
        ]
      });
    }

    function abaBancos() {
      return listaEditavel({
        titulo: 'Parceiros de execução',
        sub: 'Parceiros e fornecedores vinculados aos projetos.',
        path: 'bancos',
        catalog: 'banks',
        colunas: [
          { key: 'nome', label: 'Parceiro de execução', render: function (b) { return h('b', { text: b.nome }); } },
          { key: 'ops', label: 'Operações', align: 'right', render: function (b) {
            return h('span.t-num', { text: F.num((S().get('oportunidades') || [])
              .filter(function (o) { return o.bancoId === b.id; }).length) });
          } },
          { key: 'ganhas', label: 'Taxa de ganho', align: 'right', render: function (b) {
            var ops = (S().get('oportunidades') || []).filter(function (o) { return o.bancoId === b.id; });
            var g = ops.filter(function (o) { return o.status === 'ganho'; }).length;
            var p = ops.filter(function (o) { return o.status === 'perdido'; }).length;
            var t = F.rate(g, g + p);
            return h('span.badge' + (t >= 40 ? '.badge--ok' : t >= 25 ? '.badge--warn' : '.badge--bad'),
              { text: F.pct(t, 0) });
          } }
        ],
        campos: [{ key: 'nome', label: 'Nome do parceiro' }]
      });
    }

    function abaConvenios() {
      return listaEditavel({
        titulo: 'Segmentos de clientes',
        sub: 'Áreas de atuação das empresas atendidas pela empresa. O preenchimento no lead é opcional.',
        path: 'convenios',
        catalog: 'conventions',
        colunas: [
          { key: 'nome', label: 'Segmento de cliente', render: function (item) {
            return h('b', { text: item.nome });
          } },
          { key: 'ops', label: 'Leads', align: 'right', render: function (item) {
            return h('span.t-num', { text: F.num((S().get('oportunidades') || [])
              .filter(function (opportunity) { return opportunity.convenioId === item.id; }).length) });
          } },
          { key: 'volume', label: 'Estorno solicitado', align: 'right', render: function (item) {
            var value = (S().get('oportunidades') || [])
              .filter(function (opportunity) { return opportunity.convenioId === item.id; })
              .reduce(function (total, opportunity) { return total + AGIR.an.valorCRM(opportunity); }, 0);
            return h('span.strong.t-num', { text: F.moneyShort(value) });
          } }
        ],
        campos: [{ key: 'nome', label: 'Nome do segmento' }]
      });
    }

    function abaOrigens() {
      return h('div.col.gap-5',
        listaEditavel({
          titulo: 'Origens de lead',
          sub: 'De onde o lead veio — a base do relatório de canais.',
          path: 'origens',
          catalog: 'sources',
          colunas: [
            { key: 'nome', label: 'Origem', render: function (o) {
              return h('span.row.gap-2', h('i.dot', { style: { background: o.cor } }), h('b', { text: o.nome }));
            } },
            { key: 'leads', label: 'Leads', align: 'right', render: function (o) {
              return h('span.t-num', { text: F.num((S().get('oportunidades') || [])
                .filter(function (x) { return x.origemId === o.id; }).length) });
            } }
          ],
          campos: [{ key: 'nome', label: 'Nome da origem' }]
        }),
        listaEditavel({
          titulo: 'Motivos de perda',
          sub: 'Quanto mais honesto o motivo, mais útil o relatório de perdas.',
          path: 'motivosPerda',
          catalog: 'lossReasons',
          colunas: [
            { key: 'nome', label: 'Motivo', render: function (m) { return h('b', { text: m.nome }); } },
            { key: 'qtd', label: 'Perdas', align: 'right', render: function (m) {
              return h('span.t-num', { text: F.num((S().get('oportunidades') || [])
                .filter(function (o) { return o.motivoPerdaId === m.id; }).length) });
            } }
          ],
          campos: [{ key: 'nome', label: 'Motivo' }]
        })
      );
    }

    /* ======================================================================
       PERFORMANCE
       ====================================================================== */
    function abaConteudos() {
      var trilhas = (S().get('trilhas') || []).sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });
      return W.section({
        title: 'Trilhas e aulas',
        sub: 'Publique uma trilha para ela aparecer em Conteúdos para o time.',
        actions: [h('button.btn.btn--sm.btn--primary', { onClick: novaTrilha },
          icon('plus'), h('span', { text: 'Nova trilha' }))],
        flush: true,
        body: h('div', trilhas.map(function (t) {
          var concluidas = (S().get('progresso') || []).filter(function (p) { return p.trilhaId === t.id; }).length;
          return h('div.row.gap-4', {
            style: { padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--line)' }
          },
            h('span.kpi__icon', { style: { width: '40px', height: '40px' } }, icon('book')),
            h('div.grow', { style: { minWidth: 0 } },
              h('div.row.gap-2',
                h('b.t-small', { text: t.titulo }),
                h('span.badge' + (t.publicado ? '.badge--brand' : ''),
                  { text: t.publicado ? 'Publicado' : 'Rascunho' })
              ),
              h('div.t-tiny.t-dimmer', { style: { marginTop: '2px' },
                text: t.aulas.length + ' aulas · ' + t.pontosAula + ' pts/aula · ' +
                  t.pontosConclusao + ' pts na conclusão' }),
              h('div.t-tiny.t-dimmer', { text: F.plural(concluidas, 'conclusão de aula', 'conclusões de aula') + ' registradas' })
            ),
            h('button.btn.btn--sm', { onClick: function () { gerirAulas(t); } },
              icon('rows'), h('span', { text: 'Aulas' })),
            h('label.switch', { 'data-tip': t.publicado ? 'Despublicar' : 'Publicar' },
              h('input', { type: 'checkbox', checked: t.publicado,
                onChange: async function () {
                  if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                    try {
                      var saved = await global.AGIR_BACKEND.saveLearningTrack({
                        organizationId: S().get('session.organizationId'), trackId: t.id,
                        title: t.titulo, published: this.checked
                      });
                      this.checked = saved.published;
                    } catch (error) { this.checked = !this.checked; UI.toast.bad('Nao foi possivel alterar a publicacao', error.message || 'Tente novamente.'); return; }
                  }
                  S().update('trilhas', t.id, { publicado: this.checked });
                  UI.toast.info(this.checked ? 'Trilha publicada' : 'Trilha despublicada', t.titulo);
                } }),
              h('span.switch__track'), h('span.switch__thumb')
            ),
            h('button.btn.btn--icon.btn--sm.btn--ghost', {
              'aria-label': 'Excluir', onClick: function () { excluirTrilha(t); }
            }, icon('trash'))
          );
        }))
      });

      function novaTrilha() {
        UI.prompt({ title: 'Nova trilha', label: 'Título', placeholder: 'Ex.: Negociação avançada' })
          .then(async function (v) {
            if (!v) return;
            var nova = {
              titulo: v, descricao: '', publicado: false, capa: 'bdr',
              pontosAula: 10, pontosConclusao: 50, ordem: trilhas.length + 1, aulas: []
            };
            if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
              try {
                var saved = await global.AGIR_BACKEND.saveLearningTrack({
                  organizationId: S().get('session.organizationId'), title: v, published: false
                });
                nova.id = saved.id; nova.titulo = saved.title; nova.ordem = saved.position;
              } catch (error) { UI.toast.bad('Nao foi possivel criar a trilha', error.message || 'Tente novamente.'); return; }
            }
            S().insert('trilhas', nova);
            UI.toast.ok('Trilha criada', 'Adicione as aulas e publique quando estiver pronta.');
            AGIR.router.resolve();
          });
      }

      function excluirTrilha(t) {
        UI.confirm({ title: 'Excluir trilha?', text: t.titulo + ' e suas ' + t.aulas.length + ' aulas.',
          danger: true, okLabel: 'Excluir' }).then(async function (ok) {
          if (!ok) return;
          if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
            try { await global.AGIR_BACKEND.archiveLearningTrack(t.id); }
            catch (error) { UI.toast.bad('Nao foi possivel excluir a trilha', error.message || 'Tente novamente.'); return; }
          }
          S().remove('trilhas', t.id);
          UI.toast.warn('Trilha excluída');
          AGIR.router.resolve();
        });
      }

      function gerirAulas(t) {
        var lista = h('div.col.gap-2');
        function render() {
          D.clear(lista);
          if (!t.aulas.length) {
            lista.appendChild(h('div.t-small.t-dimmer', { style: { padding: 'var(--sp-4) 0', textAlign: 'center' },
              text: 'Nenhuma aula nesta trilha ainda.' }));
          }
          t.aulas.forEach(function (a, i) {
            lista.appendChild(h('div.row.gap-3', {
              style: { padding: 'var(--sp-3)', background: 'var(--bg-elev-2)', borderRadius: 'var(--r-md)' }
            },
              h('span.t-tiny.t-dimmer', { style: { width: '18px' }, text: (i + 1) + '.' }),
              h('div.grow', { style: { minWidth: 0 } },
                h('div.t-small.truncate', { text: a.titulo }),
                h('div.t-tiny.t-dimmer', { text: a.duracaoMin + ' min' + (a.autor ? ' · ' + a.autor : '') +
                  (a.url ? ' · com vídeo' : ' · sem vídeo') })
              ),
              h('button.btn.btn--icon.btn--sm.btn--ghost', {
                'aria-label': 'Editar', onClick: function () { formAula(a); }
              }, icon('edit')),
              h('button.btn.btn--icon.btn--sm.btn--ghost', {
                'aria-label': 'Remover', onClick: async function () {
                  if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                    try { await global.AGIR_BACKEND.archiveLesson(a.id); }
                    catch (error) { UI.toast.bad('Nao foi possivel remover a aula', error.message || 'Tente novamente.'); return; }
                  }
                  t.aulas.splice(i, 1);
                  S().update('trilhas', t.id, { aulas: t.aulas });
                  render();
                }
              }, icon('trash'))
            ));
          });
        }
        render();

        UI.drawer({
          eyebrow: 'Trilha',
          title: t.titulo,
          sub: t.aulas.length + ' aulas',
          body: h('div.col.gap-4',
            h('button.btn.btn--primary.btn--block', { onClick: function () { formAula(null); } },
              icon('plus'), h('span', { text: 'Adicionar aula' })),
            lista
          ),
          onClose: function () { AGIR.router.resolve(); }
        });

        function formAula(a) {
          var f = {};
          UI.modal({
            title: a ? 'Editar aula' : 'Nova aula',
            body: h('div.col.gap-4',
              campo(f, 'titulo', 'Título', { value: a ? a.titulo : '', autofocus: true }),
              h('div.grid.g-2',
                campo(f, 'duracaoMin', 'Duração (min)', { type: 'number', min: 1, value: a ? a.duracaoMin : 10 }),
                campo(f, 'autor', 'Autor', { value: a ? a.autor : '' })
              ),
              campo(f, 'url', 'Link do vídeo (YouTube, Vimeo…)', { value: a ? a.url || '' : '',
                placeholder: 'https://…' })
            ),
            footer: function (api) {
              return [
                h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
                h('button.btn.btn--primary', { text: 'Salvar', onClick: async function () {
                  if (!f.titulo.value.trim()) return UI.toast.bad('Falta o título');
                  var dados = {
                    titulo: f.titulo.value.trim(),
                    duracaoMin: Math.max(1, +f.duracaoMin.value || 1),
                    autor: f.autor.value.trim(),
                    url: f.url.value.trim()
                  };
                  if (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                    this.disabled = true;
                    try {
                      var saved = await global.AGIR_BACKEND.saveLesson({
                        trackId: t.id, lessonId: a ? a.id : null, title: dados.titulo,
                        durationMinutes: dados.duracaoMin, contentUrl: dados.url,
                        description: dados.autor ? 'Autor: ' + dados.autor : null
                      });
                      dados = { id: saved.id, titulo: saved.title, duracaoMin: saved.duration_minutes,
                        autor: dados.autor, url: saved.content_url || '', ordem: saved.position,
                        publicado: saved.published };
                    } catch (error) { this.disabled = false; UI.toast.bad('Nao foi possivel salvar a aula', error.message || 'Tente novamente.'); return; }
                  }
                  if (a) Object.assign(a, dados);
                  else t.aulas.push(Object.assign({ id: dados.id || S().uid('au') }, dados));
                  S().update('trilhas', t.id, { aulas: t.aulas });
                  api.close();
                  UI.toast.ok(a ? 'Aula atualizada' : 'Aula adicionada');
                  render();
                } })
              ];
            }
          });
        }
      }
    }

    function abaCategorias() {
      return listaEditavel({
        titulo: 'Categorias de arquivo',
        sub: 'As abas que aparecem na tela de Arquivos.',
        path: 'categoriasArquivo',
        fileCategory: true,
        colunas: [
          { key: 'nome', label: 'Categoria', render: function (c) {
            return h('span.row.gap-2', c.restrito ? icon('lock', 'ico') : null, h('b', { text: c.nome }));
          } },
          { key: 'arquivos', label: 'Arquivos', align: 'right', render: function (c) {
            return h('span.t-num', { text: F.num((S().get('arquivos') || [])
              .filter(function (a) { return a.categoriaId === c.id; }).length) });
          } },
          { key: 'restrito', label: 'Acesso', align: 'right', render: function (c) {
            return h('span.badge' + (c.restrito ? '.badge--warn' : ''),
              { text: c.restrito ? 'Só gestão' : 'Todo o time' });
          } }
        ],
        campos: [{ key: 'nome', label: 'Nome da categoria' }]
      });
    }

    function abaGamificacao() {
      var g = S().get('gamificacao') || {};
      var f = {};
      var itens = [
        ['pontosVenda', 'Venda fechada', 'trophy'],
        ['pontosProposta', 'Proposta enviada', 'filetext'],
        ['pontosAgendamento', 'Agendamento', 'calendar'],
        ['pontosLigacao', 'Ligação registrada', 'phone'],
        ['pontosAula', 'Aula concluída', 'book'],
        ['pontosConclusaoTrilha', 'Trilha concluída (bônus)', 'star']
      ];

      return h('div.col.gap-5',
        W.section({
          title: 'Pontuação',
          sub: 'Define o ranking. Peso maior em venda favorece closer; peso maior em atividade favorece BDR.',
          body: h('div.col.gap-4',
            h('div.grid.g-3', itens.map(function (it) {
              f[it[0]] = h('input.input', { type: 'number', min: 0, value: g[it[0]] || 0 });
              return h('div.field',
                h('label.field__label', icon(it[2], 'ico'), h('span', { text: it[1] })),
                f[it[0]]
              );
            })),
            h('div', h('button.btn.btn--primary', { onClick: function () {
              var dados = {};
              itens.forEach(function (it) { dados[it[0]] = Math.max(0, +f[it[0]].value || 0); });
              S().set('gamificacao', Object.assign({}, g, dados));
              UI.toast.ok('Pontuação atualizada', 'O ranking já reflete os novos pesos.');
              AGIR.router.resolve();
            } }, icon('check'), h('span', { text: 'Salvar pontuação' })))
          )
        }),
        W.section({
          title: 'Prévia do ranking com estes pesos',
          flush: true,
          body: (function () {
            var rk = An.ranking({ periodo: 'mes' }).map(function (r) {
              return { u: r.usuario, pts: An.pontosDe(r.usuario.id) };
            }).sort(function (a, b) { return b.pts.total - a.pts.total; });
            return W.dataTable({
              rows: rk, sort: null,
              columns: [
                { key: 'pos', label: '#', width: '48px', sortable: false,
                  render: function (r, i) { return h('b.t-num', { text: i + 1 }); } },
                { key: 'nome', label: 'Vendedor', sortable: false,
                  render: function (r) {
                    return h('span.row.gap-2', AGIR.avatar(r.u, 'xs'), h('span', { text: r.u.nome }));
                  } },
                { key: 'pts', label: 'Pontos', align: 'right', sortable: false,
                  render: function (r) { return h('b.t-num.t-brand', { text: F.num(r.pts.total) }); } }
              ]
            });
          })()
        })
      );
    }

    function abaClima() {
      var st = S().get('settings') || {};
      var hoje = F.iso(new Date());
      var equipe = (S().get('usuarios') || []).filter(function (u) {
        return u.cargoId !== 'cg_admin' && u.ativo !== false;
      });

      return h('div.col.gap-5',
        W.section({
          title: 'Check-in diário de humor',
          sub: 'Aparece no primeiro acesso de cada dia, para todo usuário que não seja administrador.',
          body: h('div.col.gap-4',
            h('label.switch',
              h('input', { type: 'checkbox', checked: st.humorAtivo !== false,
                onChange: function () {
                  S().pref('humorAtivo', this.checked);
                  AGIR.shell.persistPrefs();
                  UI.toast.info(this.checked ? 'Check-in ativado' : 'Check-in desativado');
                } }),
              h('span.switch__track'), h('span.switch__thumb'),
              h('span.t-small', { text: 'Pedir o humor no primeiro acesso do dia' })
            ),
            h('div.insight.insight--info',
              h('div.insight__ico', icon('lightbulb')),
              h('div.grow',
                h('div.insight__title', { text: 'Por que a resposta é opcional' }),
                h('div.insight__text', {
                  text: 'O vendedor pode pular sem justificar. Check-in obrigatório vira clique automático no "Bom" — e aí o dado deixa de valer. É melhor ter 70% de resposta honesta do que 100% de resposta mecânica.'
                })
              )
            ),
            h('div.insight.insight--warn',
              h('div.insight__ico', icon('lock')),
              h('div.grow',
                h('div.insight__title', { text: 'Combine o uso com o time' }),
                h('div.insight__text', {
                  text: 'A tela avisa que o gestor enxerga a resposta e que ela não entra em avaliação nem em comissão. Se na prática for usada para cobrança, o time percebe e o dado morre em duas semanas.'
                })
              )
            )
          )
        }),

        W.section({
          title: 'Quem já respondeu hoje',
          sub: F.dateLong(new Date()),
          flush: true,
          body: W.dataTable({
            rows: equipe.map(function (u) {
              var r = An.humorDoDia(u.id, hoje);
              var adiou = (st.humorAdiado || {})[u.id] === hoje;
              return { usuario: u, registro: r, adiou: adiou };
            }),
            sort: null,
            columns: [
              { key: 'nome', label: 'Pessoa', sortable: false,
                render: function (r) {
                  return h('span.row.gap-3', AGIR.avatar(r.usuario, 'sm'),
                    h('div',
                      h('div.strong', { text: r.usuario.nome }),
                      h('div.t-tiny.t-dimmer', { text: (S().byId('cargos', r.usuario.cargoId) || {}).nome })
                    ));
                } },
              { key: 'status', label: 'Hoje', sortable: false,
                render: function (r) {
                  if (r.registro) {
                    return h('span.row.gap-2',
                      AGIR.humor.selo(r.registro.nota),
                      h('span.t-tiny.t-dimmer', { text: F.time(r.registro.criadoEm) }));
                  }
                  return r.adiou
                    ? h('span.badge.badge--warn', { text: 'pulou hoje' })
                    : h('span.badge', { text: 'ainda não respondeu' });
                } },
              { key: 'fatores', label: 'Fatores', sortable: false,
                render: function (r) {
                  if (!r.registro || !(r.registro.fatores || []).length) {
                    return h('span.t-dimmer', { text: '—' });
                  }
                  var cat = S().indexBy('fatoresHumor');
                  return h('div.row.gap-1.wrap', r.registro.fatores.map(function (id2) {
                    return h('span.badge', { text: (cat[id2] || {}).nome || id2 });
                  }));
                } },
              { key: 'obs', label: 'Comentário', sortable: false,
                render: function (r) {
                  return h('span.t-dimmer.truncate', {
                    text: (r.registro && r.registro.comentario) || '—' });
                } }
            ]
          })
        }),

        W.section({
          title: 'Fatores oferecidos no check-in',
          sub: 'São as opções que o vendedor marca depois de escolher a carinha.',
          flush: true,
          body: W.dataTable({
            rows: S().get('fatoresHumor') || [],
            sort: null,
            columns: [
              { key: 'nome', label: 'Fator', sortable: false,
                render: function (x) { return h('b', { text: x.nome }); } },
              { key: 'tom', label: 'Aparece quando', sortable: false,
                render: function (x) {
                  return h('span.badge' + (x.tom === 'bom' ? '.badge--ok' : '.badge--bad'),
                    { text: x.tom === 'bom' ? 'humor 4 ou 5' : 'humor 1 ou 2' });
                } },
              { key: 'uso', label: 'Vezes citado', align: 'right', sortable: false,
                render: function (x) {
                  var n = (S().get('humor') || []).filter(function (r) {
                    return (r.fatores || []).indexOf(x.id) >= 0;
                  }).length;
                  return h('span.t-num', { text: F.num(n) });
                } },
              { key: 'acao', label: '', width: '48px', sortable: false, align: 'right',
                render: function (x) {
                  return h('button.btn.btn--icon.btn--sm.btn--ghost.no-ripple', {
                    'aria-label': 'Excluir',
                    onClick: function () {
                      S().remove('fatoresHumor', x.id);
                      UI.toast.warn('Fator removido', x.nome);
                      AGIR.router.resolve();
                    }
                  }, icon('trash'));
                } }
            ]
          })
        })
      );
    }

    /* ======================================================================
       FINANCEIRO
       ====================================================================== */
    function abaContas() {
      return W.section({ title: 'Cadastros financeiros', sub: 'Gerencie categorias, centros de custo e contatos junto com os lançamentos.', body: h('a.btn.btn--primary', { href: '#/financeiro/cadastros' }, icon('wallet'), h('span', { text: 'Abrir cadastros financeiros' })) });
    }

    function abaCentros() {
      return W.section({ title: 'Cadastros financeiros', sub: 'Gerencie categorias, centros de custo e contatos junto com os lançamentos.', body: h('a.btn.btn--primary', { href: '#/financeiro/cadastros' }, icon('wallet'), h('span', { text: 'Abrir cadastros financeiros' })) });
    }

    /* ======================================================================
       Auxiliares
       ====================================================================== */
    function listaEditavel(cfg) {
      var lista = S().get(cfg.path) || [];
      return W.section({
        title: cfg.titulo,
        sub: cfg.sub,
        actions: [h('button.btn.btn--sm', { onClick: function () { form(null); } },
          icon('plus'), h('span', { text: 'Adicionar' }))],
        flush: true,
        body: W.dataTable({
          rows: lista,
          sort: null,
          onRowClick: function (r) { form(r); },
          columns: cfg.colunas.map(function (c) {
            return Object.assign({ sortable: false }, c);
          }).concat([
            { key: 'acao', label: '', width: '48px', sortable: false, align: 'right',
              render: function (r) {
                return h('button.btn.btn--icon.btn--sm.btn--ghost.no-ripple', {
                  'aria-label': 'Excluir',
                  onClick: function (e) {
                    e.stopPropagation();
                    UI.confirm({ title: 'Excluir?', text: r.nome, danger: true, okLabel: 'Excluir' })
                      .then(async function (ok) {
                        if (!ok) return;
                        if (cfg.catalog && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                          try {
                            await global.AGIR_BACKEND.archiveCatalog({
                              kind: cfg.catalog, organizationId: S().get('session.organizationId'), id: r.id
                            });
                          } catch (error) { UI.toast.bad('Nao foi possivel remover', error.message || 'Tente novamente.'); return; }
                        }
                        if (cfg.fileCategory && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                          try {
                            await global.AGIR_BACKEND.archiveFileCategory({
                              organizationId: S().get('session.organizationId'), id: r.id
                            });
                          } catch (error) { UI.toast.bad('Nao foi possivel remover', error.message || 'Tente novamente.'); return; }
                        }
                        S().remove(cfg.path, r.id);
                        UI.toast.warn('Removido', r.nome);
                        AGIR.router.resolve();
                      });
                  }
                }, icon('trash'));
              } }
          ])
        })
      });

      function form(r) {
        var f = {};
        UI.modal({
          title: r ? 'Editar' : 'Adicionar',
          body: h('div.col.gap-4', cfg.campos.map(function (c) {
            return campo(f, c.key, c.label, {
              type: c.type || 'text', step: c.step,
              value: r ? r[c.key] : '', autofocus: c === cfg.campos[0]
            });
          }), cfg.fileCategory ? (function () {
            f.accessLevel = h('select.select',
              h('option', { value: 'organization', text: 'Todo o time', selected: !r || r.accessLevel === 'organization' }),
              h('option', { value: 'management', text: 'Somente gestao', selected: r && r.accessLevel === 'management' }),
              h('option', { value: 'finance', text: 'Financeiro e administradores', selected: r && r.accessLevel === 'finance' })
            );
            return h('div.field', h('label.field__label', { text: 'Nivel de acesso' }), f.accessLevel);
          })() : null),
          footer: function (api) {
            return [
              h('button.btn', { text: 'Cancelar', onClick: function () { api.close(); } }),
              h('button.btn.btn--primary', { text: 'Salvar', onClick: async function () {
                var dados = {};
                cfg.campos.forEach(function (c) {
                  dados[c.key] = c.type === 'number' ? (+f[c.key].value || 0) : f[c.key].value.trim();
                });
                if (!dados[cfg.campos[0].key]) return UI.toast.bad('Preencha o nome');
                if (cfg.catalog && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  this.disabled = true;
                  try {
                    var saved = await global.AGIR_BACKEND.saveCatalog({
                      kind: cfg.catalog, organizationId: S().get('session.organizationId'),
                      id: r ? r.id : null, name: dados.nome,
                      commissionRate: dados.comissaoPct || 0
                    });
                    dados.id = saved.id;
                    dados.nome = saved.name;
                    if (cfg.catalog === 'products') dados.comissaoPct = Number(saved.default_commission_rate);
                    if (r) S().update(cfg.path, r.id, dados);
                    else S().insert(cfg.path, dados);
                    api.close(); UI.toast.ok(r ? 'Atualizado' : 'Adicionado'); AGIR.router.resolve();
                  } catch (error) {
                    this.disabled = false;
                    UI.toast.bad('Nao foi possivel salvar', error.message || 'Revise os dados.');
                  }
                  return;
                }
                if (cfg.fileCategory && global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase') {
                  this.disabled = true;
                  try {
                    var savedCategory = await global.AGIR_BACKEND.saveFileCategory({
                      organizationId: S().get('session.organizationId'), id: r ? r.id : null,
                      name: dados.nome, accessLevel: f.accessLevel.value
                    });
                    dados.id = savedCategory.id; dados.nome = savedCategory.name;
                    dados.accessLevel = savedCategory.access_level;
                    dados.restrito = savedCategory.access_level !== 'organization';
                    if (r) S().update(cfg.path, r.id, dados); else S().insert(cfg.path, dados);
                    api.close(); UI.toast.ok(r ? 'Atualizado' : 'Adicionado'); AGIR.router.resolve();
                  } catch (error) { this.disabled = false; UI.toast.bad('Nao foi possivel salvar', error.message || 'Revise os dados.'); }
                  return;
                }
                if (r) S().update(cfg.path, r.id, dados);
                else S().insert(cfg.path, dados);
                api.close();
                UI.toast.ok(r ? 'Atualizado' : 'Adicionado');
                AGIR.router.resolve();
              } })
            ];
          }
        });
      }
    }

    function campo(store, key, label, attrs) {
      var inp = h('input.input', Object.assign({ 'aria-label': label }, attrs || {}));
      store[key] = inp;
      return h('div.field',
        h('label.field__label', typeof label === 'string' ? h('span', { text: label }) : label),
        inp);
    }

    function mini(label, valor) {
      return h('div.col', { style: { gap: '1px' } },
        h('span.t-tiny.t-dimmer', { text: label }),
        h('b.t-small.t-num', { text: valor })
      );
    }
  };
})(window);
