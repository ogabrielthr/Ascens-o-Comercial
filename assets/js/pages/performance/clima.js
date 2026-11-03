/* ==========================================================================
   AGIR — Humor do dia
   Duas peças:
   1. checkinHumor()  — a tela que o vendedor preenche no primeiro login do dia
   2. perfClima()     — a leitura do gestor, cruzando humor com resultado

   Princípio da coleta: um clique já registra. Tudo depois é opcional. Se o
   preenchimento custar caro, o vendedor mente ou pula — e o dado não serve
   para nada.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR;
  var D = AGIR.dom, h = D.h, s = D.s, icon = D.icon;
  var F = AGIR.fmt, W = AGIR.w, UI = AGIR.ui, M = AGIR.motion, An = AGIR.an, C = AGIR.charts;
  var S = function () { return AGIR.store; };

  /* ==========================================================================
     Carinha em SVG — desenhada, não emoji: acompanha o tema e a cor da escala
     ========================================================================== */
  function carinha(nota, tamanho) {
    var boca = {
      1: 'M30 70 Q50 52 70 70',      // triste
      2: 'M30 66 Q50 57 70 66',      // levemente triste
      3: 'M32 64 L68 64',            // neutra
      4: 'M30 60 Q50 71 70 60',      // levemente feliz
      5: 'M28 56 Q50 78 72 56'       // feliz
    }[nota] || 'M32 64 L68 64';

    var svg = s('svg', {
      viewBox: '0 0 100 100', 'aria-hidden': 'true',
      style: tamanho ? { width: tamanho + 'px', height: tamanho + 'px' } : null
    });
    svg.appendChild(s('circle', { class: 'humor-face__c', cx: 50, cy: 50, r: 42 }));
    /* olhos: mais fechados nas pontas da escala, dá personalidade */
    if (nota === 1) {
      svg.appendChild(s('path', { class: 'humor-face__c', d: 'M30 34 L44 40', 'stroke-linecap': 'round' }));
      svg.appendChild(s('path', { class: 'humor-face__c', d: 'M70 34 L56 40', 'stroke-linecap': 'round' }));
    } else if (nota === 5) {
      svg.appendChild(s('path', { class: 'humor-face__c', d: 'M30 40 Q37 32 44 40', 'stroke-linecap': 'round' }));
      svg.appendChild(s('path', { class: 'humor-face__c', d: 'M56 40 Q63 32 70 40', 'stroke-linecap': 'round' }));
    } else {
      svg.appendChild(s('circle', { class: 'humor-face__f', cx: 36, cy: 39, r: 5 }));
      svg.appendChild(s('circle', { class: 'humor-face__f', cx: 64, cy: 39, r: 5 }));
    }
    svg.appendChild(s('path', {
      class: 'humor-face__c', d: boca, 'stroke-linecap': 'round'
    }));
    return svg;
  }

  /** Selo compacto: carinha + rótulo, para tabelas e painéis. */
  function selo(nota, comLabel) {
    var e = An.escalaDe(nota);
    return h('span.humor-pill', { style: { '--tom': e.cor } },
      carinha(nota, 14),
      comLabel === false ? null : h('span', { text: e.label })
    );
  }

  /* ==========================================================================
     1. Tela de check-in
     ========================================================================== */
  function checkinHumor(opts) {
    opts = opts || {};
    var u = S().currentUser();
    if (!u) return;

    var escala = An.escalaHumor();
    var fatores = An.fatoresHumor();
    var comentario;

    if (!escala.length) {
      UI.toast.bad('Check-in indisponivel', 'Atualize a pagina para carregar as opcoes de humor.');
      return;
    }

    /* Se já existe resposta de hoje, isto vira edição — nunca um segundo
       registro. Duplicar o dia distorceria a média e a adesão. */
    var registro = An.humorDoDia(u.id) || null;
    var notaEscolhida = registro ? registro.nota : null;
    var selecionados = registro ? (registro.fatores || []).slice() : [];
    var editando = !!registro;
    var pendingSave = Promise.resolve();

    var caixa = h('div.humor', { role: 'dialog', 'aria-modal': 'true',
      'aria-label': 'Check-in de humor do dia' });
    var scrim = h('div.humor-scrim', caixa);

    var hora = new Date().getHours();
    var saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

    var escalaEl = h('div.humor__escala', { role: 'radiogroup', 'aria-label': 'Como você está hoje' });
    var botoes = [];

    escala.forEach(function (e) {
      var b = h('button.humor-face', {
        type: 'button', role: 'radio', 'aria-checked': 'false',
        'aria-label': e.label + ' (' + e.nota + ' de 5)',
        style: { '--tom': e.cor },
        onClick: function () { escolher(e.nota); }
      },
        carinha(e.nota),
        h('span.humor-face__lbl', { text: e.label }),
        h('span.humor-face__key', { text: e.nota })
      );
      botoes.push(b);
      escalaEl.appendChild(b);
    });

    var passo2 = h('div.humor__passo2.hidden');
    var chipsEl = h('div.humor__chips');
    var tituloFatores = h('div.t-small', { style: { fontWeight: 650 } });

    passo2.appendChild(tituloFatores);
    passo2.appendChild(h('div.t-tiny.t-dimmer', { style: { marginTop: '2px' },
      text: 'Opcional — ajuda a entender o que mudar na operação.' }));
    passo2.appendChild(chipsEl);
    passo2.appendChild(h('div.field', { style: { marginTop: 'var(--sp-4)' } },
      h('label.field__label', { for: 'humor-obs', text: 'Quer contar mais alguma coisa?' }),
      comentario = h('textarea.textarea#humor-obs', {
        rows: 2, placeholder: 'Só se quiser. Uma linha já ajuda.',
        style: { minHeight: '64px' }
      })
    ));

    /* Escondido até haver escolha: um botão de confirmar sem nada selecionado
       só serviria para o usuário fechar a tela sem registrar nem pular. */
    var btnConcluir = h('button.btn.btn--primary.btn--lg.hidden', {
      onClick: concluir
    }, icon('check'), h('span', { text: 'Pronto, bora trabalhar' }));

    var avisoSalvo = h('span.t-tiny.t-dimmer.hidden');
    var rodape = h('div.humor__rodape',
      h('button.btn.btn--ghost.btn--sm', {
        text: editando ? 'Fechar' : 'Pular hoje',
        onClick: editando ? concluir : pular,
        'data-tip': editando ? null : 'Você pode responder amanhã. Nada fica pendente.'
      }),
      h('div.row.gap-3', avisoSalvo, btnConcluir)
    );

    D.append(caixa, [
      h('div.humor__eyebrow', { text: F.weekdayLong(new Date()) }),
      h('h1.humor__title', {
        text: editando
          ? 'Quer mudar sua resposta de hoje, ' + F.firstName(u.nome) + '?'
          : saudacao + ', ' + F.firstName(u.nome) + '. Como voce esta se sentindo hoje?'
      }),
      h('p.humor__lead', {
        text: editando
          ? 'Voce ja respondeu hoje. Pode ajustar a vontade - a gente guarda so a ultima.'
          : 'Queremos saber como voce esta se sentindo neste inicio de dia. Escolha a opcao que mais combina com voce.'
      }),
      escalaEl,
      passo2,
      rodape
    ]);

    document.body.appendChild(scrim);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);

    /* Reabertura: reconstitui o que a pessoa já tinha respondido. */
    if (editando) {
      pintarEscolha(registro.nota);
      montarChips(registro.nota);
      passo2.classList.remove('hidden');
      btnConcluir.classList.remove('hidden');
      comentario.value = registro.comentario || '';
    }
    setTimeout(function () {
      (editando ? btnConcluir : botoes[3]).focus();
    }, 120);

    /* ---------------------------------------------------------------- */
    function onKey(ev) {
      if (ev.key >= '1' && ev.key <= '5') {
        ev.preventDefault();
        escolher(+ev.key);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (registro) concluir(); else pular();
      } else if (ev.key === 'Enter' && registro) {
        ev.preventDefault();
        concluir();
      }
    }

    function pintarEscolha(nota) {
      botoes.forEach(function (b, i) {
        var on = escala[i].nota === nota;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }

    function realMode() {
      return global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase';
    }

    function salvarReal() {
      if (!realMode() || !registro) return Promise.resolve(registro);
      var organizationId = S().get('session.organizationId');
      pendingSave = pendingSave.catch(function () {}).then(function () {
        return global.AGIR_BACKEND.saveMood({
          organizationId: organizationId,
          userId: u.id,
          score: registro.nota,
          comment: registro.comentario || '',
          factorIds: registro.fatores || []
        });
      }).then(function (saved) {
        var oldId = registro.id;
        S().update('humor', oldId, { id: saved.id, criadoEm: saved.submitted_at });
        registro.id = saved.id;
        avisoSalvo.classList.remove('hidden');
        avisoSalvo.textContent = 'Resposta salva';
        return saved;
      });
      return pendingSave;
    }
    /** Grava já na primeira escolha: se a pessoa fechar agora, o dado está salvo. */
    function escolher(nota) {
      notaEscolhida = nota;
      pintarEscolha(nota);

      if (registro) {
        S().update('humor', registro.id, { nota: nota });
      } else {
        registro = S().insert('humor', {
          usuarioId: u.id, data: F.iso(new Date()), nota: nota,
          fatores: [], comentario: '', criadoEm: new Date().toISOString()
        });
      }

      montarChips(nota);
      passo2.classList.remove('hidden');
      btnConcluir.classList.remove('hidden');
      avisoSalvo.classList.remove('hidden');
      if (realMode()) {
        avisoSalvo.textContent = 'Salvando...';
        salvarReal().catch(function (error) {
          console.error('[humor] Falha ao salvar resposta.', error);
          avisoSalvo.textContent = 'Nao foi possivel salvar';
          UI.toast.bad('Resposta nao salva', 'Confira sua conexao e tente novamente.');
        });
      } else {
        avisoSalvo.textContent = 'Resposta salva';
      }
    }

    function montarChips(nota) {
      var tom = nota >= 4 ? 'bom' : nota <= 2 ? 'ruim' : null;
      tituloFatores.textContent = nota >= 4
        ? 'O que fez o dia render?'
        : nota <= 2 ? 'O que mais pesou hoje?' : 'Alguma coisa influenciou?';

      var lista = tom ? fatores.filter(function (fx) { return fx.tom === tom; }) : fatores;

      /* Ao trocar a nota, o conjunto de fatores muda. Descarta o que saiu de
         cena: salvar um fator que a pessoa não está mais vendo seria mentira. */
      var visiveis = lista.map(function (fx) { return fx.id; });
      selecionados = selecionados.filter(function (id2) { return visiveis.indexOf(id2) >= 0; });

      D.clear(chipsEl);
      lista.forEach(function (fx) {
        chipsEl.appendChild(h('button.chip', {
          type: 'button',
          class: selecionados.indexOf(fx.id) >= 0 ? 'is-active' : '',
          text: fx.nome,
          onClick: function () {
            var i = selecionados.indexOf(fx.id);
            if (i >= 0) selecionados.splice(i, 1); else selecionados.push(fx.id);
            this.classList.toggle('is-active');
          }
        }));
      });
    }

    async function concluir() {
      if (!registro) return pular();

      S().update('humor', registro.id, {
        fatores: selecionados.slice(),
        comentario: comentario.value.trim()
      });
      if (realMode()) {
        btnConcluir.disabled = true;
        avisoSalvo.classList.remove('hidden');
        avisoSalvo.textContent = 'Salvando...';
        try {
          await salvarReal();
        } catch (error) {
          console.error('[humor] Falha ao concluir resposta.', error);
          avisoSalvo.textContent = 'Nao foi possivel salvar';
          UI.toast.bad('Resposta nao salva', 'Confira sua conexao e tente novamente.');
          btnConcluir.disabled = false;
          return;
        }
      }

      fechar();
      if (notaEscolhida) {
        UI.toast({
          title: 'Obrigado, ' + F.firstName(u.nome),
          text: notaEscolhida <= 2
            ? 'Registramos. Cuide-se e siga no seu ritmo - dias dificeis acontecem.'
            : 'Bom dia de trabalho para voce.',
          tone: notaEscolhida <= 2 ? 'info' : 'ok'
        });
      }
      if (opts.onDone) opts.onDone(registro);
    }

    async function pular() {
      if (realMode()) {
        try {
          await global.AGIR_BACKEND.skipMood({
            organizationId: S().get('session.organizationId'),
            userId: u.id
          });
        } catch (error) {
          console.error('[humor] Falha ao pular resposta.', error);
          UI.toast.bad('Nao foi possivel pular', 'Confira sua conexao e tente novamente.');
          return;
        }
      }
      var adiado = Object.assign({}, S().get('settings.humorAdiado') || {});
      adiado[u.id] = F.iso(new Date());
      S().set('settings.humorAdiado', adiado);
      fechar();
      UI.toast.info('Tudo bem', 'A gente pergunta de novo amanha.');
      if (opts.onDone) opts.onDone(null);
    }
    function fechar() {
      document.removeEventListener('keydown', onKey, true);
      scrim.style.transition = 'opacity 180ms var(--ease-out)';
      scrim.style.opacity = '0';
      setTimeout(function () {
        scrim.remove();
        document.body.style.overflow = '';
      }, 180);
    }
  }

  /* ==========================================================================
     2. Clima do time — a leitura do gestor
     ========================================================================== */
  AGIR.pages.perfClima = function (node, ctx) {
    var f = W.readFilters(ctx.query || {});

    node.appendChild(W.pageHead({
      icon: 'sparkles',
      title: 'Clima do time',
      sub: 'Como o time está se sentindo e o quanto isso aparece no resultado.',
      actions: [
        h('button.btn.btn--sm', { onClick: function () { checkinHumor(); } },
          icon('edit'), h('span', { text: 'Responder o meu' })),
        h('button.btn.btn--sm', { onClick: exportar },
          icon('download'), h('span', { text: 'Exportar CSV' })),
        h('a.btn.btn--sm', { href: '#/config?sec=performance&tab=clima' },
          icon('settings'), h('span', { text: 'Configurar' }))
      ]
    }));

    node.appendChild(W.filterBar(ctx, ['periodo', 'owner', 'equipe']));

    var host = h('div');
    node.appendChild(host);
    D.mount(host, UI.skeletonCards(4));
    M.defer(function () { D.mount(host, montar()); M.initReveal(host); });

    /* ==================================================================== */
    function montar() {
      var resumo = An.climaResumo(f);
      var cruzamento = An.humorVsResultado(f);
      var sh = An.serieHumor(f);

      if (!resumo.respostas) {
        return W.section({
          body: UI.empty({
            icon: 'sparkles', title: 'Nenhuma resposta no período',
            text: 'O check-in aparece para o vendedor no primeiro acesso de cada dia. Assim que o time começar a responder, o cruzamento com resultado aparece aqui.',
            action: { label: 'Responder o meu agora', icon: 'edit',
              onClick: function () { checkinHumor(); } }
          })
        });
      }

      /* série de resultado no mesmo eixo de dias, para sobrepor */
      var srRes = An.serie(f, ['vendasValor', 'ligacoes']);
      var mapaRes = Object.create(null);
      srRes.datas.forEach(function (d, i) {
        mapaRes[F.iso(d)] = srRes.s.vendasValor[i];
      });
      var resultadoAlinhado = sh.datas.map(function (d) { return mapaRes[F.iso(d)] || 0; });
      var corr = An.correlacao(sh.brutos, resultadoAlinhado);

      return h('div.col.gap-6',
        /* ---------- KPIs ------------------------------------------------ */
        h('div.grid.g-4',
          W.kpi({
            label: 'Humor médio', raw: resumo.media,
            format: function (v) { return F.num(v, 2); }, unit: ' / 5',
            icon: 'sparkles',
            tone: resumo.media >= 3.8 ? 'ok' : resumo.media >= 3.2 ? 'brand' : 'bad',
            delta: resumo.delta,
            sub: 'de ' + F.plural(resumo.respostas, 'resposta')
          }),
          W.kpi({
            label: 'Adesão ao check-in', raw: resumo.adesao,
            format: function (v) { return F.pct(v, 0); }, icon: 'checkcircle',
            tone: resumo.adesao >= 75 ? 'ok' : resumo.adesao >= 50 ? 'warn' : 'bad',
            progress: Math.min(100, resumo.adesao),
            sub: resumo.respostas + ' de ' + resumo.esperado + ' possíveis'
          }),
          W.kpi({
            label: 'Dias ruins', raw: resumo.pctBaixo,
            format: function (v) { return F.pct(v, 0); }, icon: 'alert',
            tone: resumo.pctBaixo <= 12 ? 'ok' : resumo.pctBaixo <= 25 ? 'warn' : 'bad',
            sub: 'respostas "Ruim" ou "Péssimo"'
          }),
          W.kpi({
            label: 'Pessoas em alerta',
            raw: cruzamento.filter(function (x) { return x.alerta; }).length,
            icon: 'users',
            tone: cruzamento.some(function (x) { return x.alerta; }) ? 'bad' : 'ok',
            sub: 'humor baixo ou em queda'
          })
        ),

        /* ---------- Leitura automática ---------------------------------- */
        W.section({
          title: 'O que os dados dizem',
          sub: 'Leitura automática do período',
          body: W.insightList(insightsClima(resumo, cruzamento, corr), 5)
        }),

        /* ---------- Humor × resultado ----------------------------------- */
        W.section({
          title: 'Humor do time × volume vendido',
          sub: corr && Math.abs(corr.r) >= 0.3
            ? 'Correlação de ' + F.num(corr.r, 2) + ' em ' + corr.n + ' dias — ' +
              (corr.r > 0 ? 'dias de humor melhor tendem a vender mais.' : 'relação inversa, vale investigar.')
            : 'Sem correlação forte no período — o humor não está explicando o resultado sozinho.',
          body: box(300, function (el) {
            C.area(el, {
              uid: 'clima-cruz', height: 280, labels: sh.labels,
              series: [
                { name: 'Volume vendido', values: resultadoAlinhado, kind: 'bar', color: 'var(--series-1)' },
                { name: 'Humor médio (1–5)', values: sh.valores, kind: 'line', color: 'var(--series-3)', axis: 'y2' }
              ],
              yFormat: F.moneyShort,
              y2Format: function (v) { return F.num(v, 1); }
            });
          })
        }),

        /* ---------- Distribuição + fatores ------------------------------ */
        h('div.grid.g-3',
          W.section({
            title: 'Distribuição das respostas',
            body: h('div.col.gap-3',
              An.escalaHumor().slice().reverse().map(function (e) {
                var n = resumo.distribuicao[e.nota - 1];
                var pct = F.rate(n, resumo.respostas);
                return h('div.col.gap-2',
                  h('div.row.between.gap-2',
                    h('span.row.gap-2', carinha(e.nota, 20),
                      h('span.t-small', { text: e.label })),
                    h('span.row.gap-3',
                      h('span.t-tiny.t-dimmer', { text: F.pct(pct, 0) }),
                      h('b.t-small.t-num', { text: F.num(n) })
                    )
                  ),
                  M.progress(pct, { thin: true, color: e.cor })
                );
              })
            )
          }),
          W.section({
            title: 'O que mais pesa nos dias ruins',
            sub: 'Fatores citados em respostas 1 e 2',
            body: (function () {
              var itens = An.fatoresMaisCitados(f, 'ruim');
              if (!itens.length) return vazio('Nenhum fator negativo citado no período.');
              return box(itens.length * 32 + 16, function (el) {
                C.ranking(el, {
                  items: itens.slice(0, 7).map(function (x) {
                    return { label: x.label, value: x.value, color: 'var(--bad-500)' };
                  }),
                  format: F.num, rowH: 32, labelW: 130
                });
              });
            })()
          }),
          W.section({
            title: 'O que faz o dia render',
            sub: 'Fatores citados em respostas 4 e 5',
            body: (function () {
              var itens = An.fatoresMaisCitados(f, 'bom');
              if (!itens.length) return vazio('Nenhum fator positivo citado no período.');
              return box(itens.length * 32 + 16, function (el) {
                C.ranking(el, {
                  items: itens.slice(0, 7).map(function (x) {
                    return { label: x.label, value: x.value, color: 'var(--ok-500)' };
                  }),
                  format: F.num, rowH: 32, labelW: 130
                });
              });
            })()
          })
        ),

        /* ---------- Tabela individual ------------------------------------ */
        W.section({
          title: 'Humor e resultado por vendedor',
          sub: 'A coluna de impacto compara o que a pessoa produz em dia de humor alto contra dia de humor baixo',
          flush: true,
          body: tabela(cruzamento)
        })
      );
    }

    /* ==================================================================== */
    function tabela(linhas) {
      return W.dataTable({
        rows: linhas,
        sort: { key: 'media', dir: 'asc' },
        onRowClick: function (r) { AGIR.pages.vendedorDrawer(r.usuario.id); },
        columns: [
          { key: 'nome', label: 'Vendedor', width: '20%',
            value: function (r) { return r.usuario.nome; },
            render: function (r) {
              var c = S().byId('cargos', r.usuario.cargoId) || {};
              return h('div.row.gap-3', AGIR.avatar(r.usuario, 'sm'),
                h('div', { style: { minWidth: 0 } },
                  h('div.strong.truncate', { text: r.usuario.nome }),
                  h('div.t-tiny.t-dimmer', { text: c.nome })
                ),
                r.nivel === 'baixo'
                  ? h('span.badge.badge--bad', { 'data-tip': 'Humor médio abaixo de 3 no período', text: 'humor baixo' })
                  : r.nivel === 'queda'
                    ? h('span.badge.badge--warn', { 'data-tip': 'Estava bem e caiu de forma relevante', text: 'em queda' })
                    : null
              );
            } },
          { key: 'media', label: 'Humor médio', align: 'right', width: '14%',
            render: function (r) {
              var arred = Math.round(r.media);
              return h('div.row.gap-2', { style: { justifyContent: 'flex-end' } },
                h('b.t-num', { text: F.num(r.media, 2) }),
                selo(arred, false)
              );
            } },
          { key: 'tendencia', label: 'Tendência', align: 'right', width: '11%',
            render: function (r) {
              if (!r.respostas) return h('span.t-dimmer', { text: '—' });
              var t = r.tendencia;
              if (Math.abs(t) < 0.15) return h('span.badge', { text: 'estável' });
              return h('span.badge' + (t > 0 ? '.badge--ok' : '.badge--bad'),
                icon(t > 0 ? 'arrowUp' : 'arrowDown'),
                h('span', { text: F.num(Math.abs(t), 2) }));
            } },
          { key: 'serie', label: 'Últimos dias', width: '11%', sortable: false,
            render: function (r) {
              if (r.serie.length < 2) return h('span.t-dimmer', { text: '—' });
              return C.sparkline(r.serie.slice(-14), {
                width: 80, height: 24,
                color: r.media >= 3.5 ? 'var(--ok-500)' : r.media >= 3 ? 'var(--warn-500)' : 'var(--bad-500)'
              });
            } },
          { key: 'adesao', label: 'Adesão', align: 'right', width: '11%',
            render: function (r) {
              return h('div.col.gap-1',
                h('b.t-tiny.t-num', {
                  style: { color: r.adesao >= 75 ? 'var(--ok-500)' : r.adesao >= 50 ? 'var(--warn-500)' : 'var(--bad-500)' },
                  text: F.pct(r.adesao, 0)
                }),
                M.progress(Math.min(100, r.adesao), { thin: true,
                  color: r.adesao >= 75 ? 'var(--ok-500)' : 'var(--warn-500)' })
              );
            } },
          { key: 'impacto', label: 'Impacto no resultado', align: 'right', width: '19%',
            value: function (r) { return r.impactoPct === null ? 0 : r.impactoPct; },
            render: function (r) {
              if (r.impactoPct === null) {
                return h('span.t-dimmer', {
                  'data-tip': 'Precisa de pelo menos 2 dias de humor alto e 2 de humor baixo no período para comparar.',
                  text: 'dados insuficientes'
                });
              }
              var fmt = r.principalFormato === 'moeda'
                ? F.moneyShort
                : function (v) { return F.num(v, 1); };
              return h('div.col', { style: { gap: '2px', alignItems: 'flex-end' } },
                h('div.row.gap-2',
                  !r.impactoConfiavel
                    ? h('span.badge', { 'data-tip': 'Poucos dias comparáveis — trate como indício, não como conclusão.', text: 'indício' })
                    : null,
                  h('b.t-num', {
                    style: { color: r.impactoPct < -20 ? 'var(--bad-500)' : r.impactoPct > 20 ? 'var(--ok-500)' : 'var(--ink)' },
                    text: r.impactoPct < 0
                      ? F.pct(Math.abs(r.impactoPct), 0) + ' a menos'
                      : F.pct(r.impactoPct, 0) + ' a mais'
                  })
                ),
                h('span.t-tiny.t-dimmer', {
                  text: fmt(r.principalAlto) + ' · dia bom  |  ' + fmt(r.principalBaixo) + ' · dia ruim'
                }),
                h('span.t-tiny.t-dimmer', { style: { opacity: .7 }, text: r.principalRotulo })
              );
            } },
          { key: 'fatores', label: 'Principais queixas', width: '14%', sortable: false,
            render: function (r) {
              if (!r.topFatores.length) return h('span.t-dimmer', { text: '—' });
              return h('div.col', { style: { gap: '2px' } }, r.topFatores.map(function (x) {
                return h('span.t-tiny.t-dimmer.truncate', { text: x.nome + ' (' + x.n + ')' });
              }));
            } }
        ]
      });
    }

    /* ==================================================================== */
    function insightsClima(resumo, cruzamento, corr) {
      var out = [];

      cruzamento.filter(function (x) { return x.nivel && x.respostas >= 3; })
        .slice(0, 3).forEach(function (x) {
          var queixa = x.topFatores[0];
          var caiu = x.nivel === 'queda';
          out.push({
            tone: caiu ? 'warn' : 'bad',
            icon: caiu ? 'trendDown' : 'alert',
            title: caiu
              ? F.firstName(x.usuario.nome) + ' vinha bem e caiu'
              : F.firstName(x.usuario.nome) + ' está num período difícil',
            text: (caiu
                ? 'Humor caiu ' + F.num(Math.abs(x.tendencia), 2) + ' ponto na segunda metade do período, agora em ' + F.num(x.media, 2) + '/5.'
                : 'Humor médio de ' + F.num(x.media, 2) + '/5 ao longo do período.') +
              (queixa ? ' Cita "' + queixa.nome.toLowerCase() + '" com frequência.' : '') +
              (x.impactoPct !== null && x.impactoPct < -20
                ? ' Em dia ruim entrega ' + F.pct(Math.abs(x.impactoPct), 0) + ' a menos em ' +
                  x.principalRotulo + '.' : ''),
            action: { label: 'Abrir painel', href: '#/performance/clima?owner=' + x.usuario.id }
          });
        });

      if (resumo.adesao < 55) {
        out.push({
          tone: 'warn', icon: 'inbox',
          title: 'Adesão baixa ao check-in',
          text: 'Só ' + F.pct(resumo.adesao, 0) + ' dos dias foram respondidos. Com essa taxa, a média não representa o time. Vale reforçar em reunião que a resposta não entra em avaliação.'
        });
      }

      if (corr && corr.r >= 0.35) {
        out.push({
          tone: 'info', icon: 'trendUp',
          title: 'Humor e resultado andam juntos',
          text: 'Correlação de ' + F.num(corr.r, 2) + ' em ' + corr.n +
            ' dias. Não prova causa, mas indica que mexer no clima tende a mexer no número.'
        });
      }

      var pior = An.fatoresMaisCitados(f, 'ruim')[0];
      if (pior && resumo.respostas >= 10) {
        out.push({
          tone: 'warn', icon: 'lightbulb',
          title: 'Principal travamento: ' + pior.label.toLowerCase(),
          text: 'Citado ' + F.plural(pior.value, 'vez', 'vezes') + ' nos dias ruins. É o item com melhor relação entre esforço de correção e retorno no clima.'
        });
      }

      var melhor = cruzamento.slice().sort(function (a, b) { return b.media - a.media; })[0];
      if (melhor && melhor.media >= 4 && melhor.respostas >= 5) {
        out.push({
          tone: 'ok', icon: 'flame',
          title: F.firstName(melhor.usuario.nome) + ' é o termômetro positivo',
          text: 'Humor médio de ' + F.num(melhor.media, 2) + '/5 com ' +
            F.pct(melhor.adesao, 0) + ' de adesão. Vale entender o que sustenta esse ritmo e replicar.'
        });
      }

      if (!out.length) {
        out.push({
          tone: 'ok', icon: 'checkcircle',
          title: 'Clima estável',
          text: 'Humor médio de ' + F.num(resumo.media, 2) + '/5 sem ninguém em alerta no período.'
        });
      }
      return out;
    }

    /* ==================================================================== */
    function exportar() {
      var linhas = [['Data', 'Vendedor', 'Cargo', 'Nota', 'Humor', 'Fatores', 'Comentário',
        'Volume vendido no dia', 'Ligações no dia']];
      var regs = An.humores(f).slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; });
      var cat = S().indexBy('fatoresHumor');
      var opps = S().get('oportunidades') || [];
      var acts = S().get('atividades') || [];

      regs.forEach(function (x) {
        var u = S().byId('usuarios', x.usuarioId) || {};
        var venda = opps.filter(function (o) {
          return o.ownerId === x.usuarioId && o.status === 'ganho' &&
            o.fechadoEm && F.iso(o.fechadoEm) === x.data;
        }).reduce(function (a, o) { return a + o.valor; }, 0);
        var lig = acts.filter(function (a) {
          return a.ownerId === x.usuarioId && a.tipo === 'ligacao' &&
            a.resultado !== 'pendente' && F.iso(a.data) === x.data;
        }).length;

        linhas.push([
          F.date(x.data), u.nome, (S().byId('cargos', u.cargoId) || {}).nome,
          x.nota, An.escalaDe(x.nota).label,
          (x.fatores || []).map(function (id2) { return (cat[id2] || {}).nome || id2; }).join(' | '),
          x.comentario || '',
          String(venda).replace('.', ','), lig
        ]);
      });
      AGIR.util.baixarCSV(linhas, 'ascensao-clima-' + F.iso(new Date()) + '.csv');
    }

    function box(minH, draw) {
      var el = h('div', { style: { minHeight: minH + 'px' } });
      M.defer(function () { draw(el); });
      return el;
    }

    function vazio(txt) {
      return h('div.empty', { style: { padding: 'var(--sp-6) 0' } },
        h('div.empty__text', { text: txt }));
    }
  };

  /* ==========================================================================
     Exports
     ========================================================================== */
  AGIR.pages.checkinHumor = checkinHumor;
  AGIR.humor = { carinha: carinha, selo: selo };
})(window);
