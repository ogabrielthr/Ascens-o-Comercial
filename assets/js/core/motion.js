/* ==========================================================================
   AGIR — motion.js
   Animações que carregam informação: contagem de números, revelação ao
   entrar na viewport, preenchimento de barras e transição entre páginas.
   Tudo respeita prefers-reduced-motion.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var D = AGIR.dom;

  function reduced() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* --------------------------------------------------------------------
     defer(fn) — adia trabalho pesado para depois do primeiro paint.

     Por que não usar requestAnimationFrame puro: em aba de segundo plano o
     navegador suspende o rAF, e a tela ficaria presa no skeleton até o
     usuário focar a aba. Aqui o rAF é só o caminho rápido; o setTimeout é a
     rede de segurança que garante que o conteúdo sempre monta.
     -------------------------------------------------------------------- */
  function defer(fn) {
    var feito = false;
    function run() {
      if (feito) return;
      feito = true;
      fn();
    }
    if (!document.hidden) {
      requestAnimationFrame(function () { requestAnimationFrame(run); });
    }
    setTimeout(run, document.hidden ? 0 : 120);
  }

  /* --------------------------------------------------------------------
     countUp(el, to, { from, ms, format }) -> cancelar()
     O número "sobe" até o valor final — dá a sensação de dado vivo e
     chama atenção para o que mudou.
     -------------------------------------------------------------------- */
  var counts = new Map();
  var countDisposeRegistered = false;

  function finishHiddenCounts() {
    if (document.hidden) counts.forEach(function (stop) { stop(true); });
  }

  function visibleNumber(el) {
    if (!el.isConnected || !el.getClientRects().length) return false;
    var visibility = global.getComputedStyle(el).visibility;
    if (visibility === 'hidden' || visibility === 'collapse') return false;
    var rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 &&
      rect.top < global.innerHeight && rect.left < global.innerWidth;
  }

  function animateNumber(el, to, opts, waitForMount) {
    opts = opts || {};
    var previous = counts.get(el);
    if (previous) previous();
    var fmt = opts.format || function (v) { return AGIR.fmt.num(Math.round(v)); };
    var from = opts.from || 0;
    var ms = opts.ms || 900;

    if (document.hidden || reduced() || !isFinite(to) || from === to ||
        (!waitForMount && !el.isConnected)) {
      el.textContent = fmt(to);
      return function () {};
    }

    var t0 = null, raf = null, stopped = false;
    function stop(complete) {
      if (stopped) return;
      stopped = true;
      if (raf !== null) cancelAnimationFrame(raf);
      counts.delete(el);
      if (!counts.size) document.removeEventListener('visibilitychange', finishHiddenCounts);
      if (complete) el.textContent = fmt(to);
    }
    function frame(ts) {
      raf = null;
      if (stopped) return;
      if (!el.isConnected || document.hidden || (t0 === null && !visibleNumber(el))) {
        stop(true);
        return;
      }
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / ms);
      if (p >= 1) { stop(true); return; }
      el.textContent = fmt(from + (to - from) * easeOut(p));
      raf = requestAnimationFrame(frame);
    }
    if (!counts.size) document.addEventListener('visibilitychange', finishHiddenCounts);
    counts.set(el, stop);
    if (!countDisposeRegistered && typeof AGIR.onPageDispose === 'function') {
      countDisposeRegistered = true;
      AGIR.onPageDispose(function () {
        countDisposeRegistered = false;
        counts.forEach(function (cancel) { cancel(); });
      });
    }
    raf = requestAnimationFrame(frame);
    return stop;
  }

  function countUp(el, to, opts) {
    return animateNumber(el, to, opts, false);
  }

  /** Cria um <span> que anima até o valor. */
  function num(to, opts) {
    var el = D.h('span.t-num', { text: (opts && opts.format ? opts.format(opts.from || 0) : '0') });
    /* espera entrar no DOM para animar; em aba oculta escreve o valor direto */
    if (document.hidden) {
      el.textContent = (opts && opts.format ? opts.format(to) : String(to));
    } else {
      animateNumber(el, to, opts, true);
    }
    return el;
  }

  /* --------------------------------------------------------------------
     bar(el, pct) — preenche uma .bar__fill depois de montada
     -------------------------------------------------------------------- */
  function fillBar(el, pct) {
    defer(function () { el.style.width = Math.max(0, Math.min(100, pct)) + '%'; });
    return el;
  }

  /** Constrói uma barra de progresso pronta, com marca opcional de pace. */
  function progress(pct, opts) {
    opts = opts || {};
    var fill = D.h('div.bar__fill', { style: { '--bar-color': opts.color || 'var(--brand-grad)' } });
    var bar = D.h('div.bar' + (opts.thin ? '.bar--thin' : '') + (opts.thick ? '.bar--thick' : ''),
      { role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      fill,
      opts.tick !== undefined
        ? D.h('span.bar__tick', {
            style: { left: Math.max(0, Math.min(100, opts.tick)) + '%' },
            'data-tip': opts.tickLabel || ('Ritmo ideal: ' + AGIR.fmt.pct(opts.tick, 0))
          })
        : null
    );
    fillBar(fill, pct);
    return bar;
  }

  /* --------------------------------------------------------------------
     reveal — anima elementos quando entram na viewport
     Uso: <div data-reveal> ou reveal.observe(el)
     -------------------------------------------------------------------- */
  var io = null;
  function initReveal(root) {
    if (reduced()) {
      D.qsa('[data-reveal]', root || document).forEach(function (el) { el.style.opacity = 1; });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('animate-in');
          e.target.style.opacity = '';
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    D.qsa('[data-reveal]', root || document).forEach(function (el) {
      el.style.opacity = 0;
      io.observe(el);
    });
  }

  /* --------------------------------------------------------------------
     Transição de página — fade + leve subida
     -------------------------------------------------------------------- */
  function pageIn(el) {
    if (reduced()) return el;
    el.style.animation = 'rise-in var(--dur-3) var(--ease-out) both';
    return el;
  }

  function pageOut(el, done) {
    if (reduced() || !el) { done(); return; }
    el.style.transition = 'opacity 120ms var(--ease-in-out), transform 120ms var(--ease-in-out)';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-4px)';
    setTimeout(done, 110);
  }

  /* --------------------------------------------------------------------
     Barra de carregamento no topo (feedback de navegação)
     -------------------------------------------------------------------- */
  var nprog = null, nTimer = null;
  function loadStart() {
    if (!nprog) {
      nprog = D.h('div', {
        style: {
          position: 'fixed', top: 0, left: 0, height: '2px', width: '0%',
          background: 'var(--brand-grad)', zIndex: 200,
          boxShadow: '0 0 10px rgba(255,149,0,.7)',
          transition: 'width 240ms var(--ease-out), opacity 200ms linear'
        }
      });
      document.body.appendChild(nprog);
    }
    clearTimeout(nTimer);
    nprog.style.opacity = 1;
    nprog.style.width = '0%';
    requestAnimationFrame(function () { nprog.style.width = '62%'; });
  }
  function loadEnd() {
    if (!nprog) return;
    nprog.style.width = '100%';
    nTimer = setTimeout(function () {
      nprog.style.opacity = 0;
      setTimeout(function () { if (nprog) nprog.style.width = '0%'; }, 220);
    }, 200);
  }

  /* --------------------------------------------------------------------
     Escalonamento manual (para listas geradas depois da montagem)
     -------------------------------------------------------------------- */
  function stagger(container, step) {
    if (reduced()) return container;
    Array.prototype.forEach.call(container.children, function (c, i) {
      c.style.animation = 'rise-in var(--dur-3) var(--ease-out) both';
      c.style.animationDelay = (i * (step || 45)) + 'ms';
    });
    return container;
  }

  function celebrateWin(opts) {
    opts = opts || {};
    var isReduced = reduced();
    var particles = [];
    if (!isReduced) {
      for (var i = 0; i < 72; i++) {
        var color = ['#FF9500', '#FFC34C', '#FFFFFF', '#2DD4BF', '#60A5FA'][i % 5];
        particles.push(D.h('i.win-celebration__particle', { style: {
          '--x': (Math.random() * 100) + 'vw', '--drift': ((Math.random() - .5) * 280) + 'px',
          '--delay': (Math.random() * .65) + 's', '--fall': (1.5 + Math.random() * 1.4) + 's',
          '--spin': (360 + Math.random() * 900) + 'deg', background: color
        } }));
      }
    }
    var amount = D.h('strong.win-celebration__amount', { text: AGIR.fmt.money(0) });
    var rays = [];
    for (var ray = 0; ray < 16; ray++) rays.push(D.h('i', { style: { '--ray': (ray * 22.5) + 'deg' } }));
    var overlay = D.h('div.win-celebration' + (isReduced ? '.is-reduced' : ''),
      D.h('div.win-celebration__curtain.win-celebration__curtain--left'),
      D.h('div.win-celebration__curtain.win-celebration__curtain--right'),
      D.h('div.win-celebration__flash'),
      D.h('div.win-celebration__glow'),
      D.h('div.win-celebration__rays', rays),
      D.h('div.win-celebration__rings', D.h('i'), D.h('i'), D.h('i')),
      D.h('div.win-celebration__particles', particles),
      D.h('div.win-celebration__content',
        D.h('div.win-celebration__trophy-wrap', D.h('div.win-celebration__trophy', D.icon('trophy'))),
        D.h('div.win-celebration__copy',
          D.h('span.win-celebration__eyebrow', { text: 'VENDA CONQUISTADA' }),
          D.h('h2.win-celebration__title', { text: 'É ganho!' }),
          D.h('p.win-celebration__client', { text: opts.client || 'Novo contrato' }),
          D.h('span.win-celebration__amount-label', { text: 'ESTORNO SOLICITADO' }),
          amount,
          D.h('div.win-celebration__result', D.icon('trendUp'), D.h('span', { text: 'Estorno solicitado contabilizado no resultado' })),
          D.h('button.win-celebration__skip', { text: 'Continuar', onClick: close })
        )
      )
    );
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      overlay.classList.add('is-leaving');
      setTimeout(function () { overlay.remove(); }, isReduced ? 120 : 700);
    }
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('is-opening'); });
    setTimeout(function () { if (!closed) overlay.classList.add('is-burst'); }, isReduced ? 0 : 520);
    setTimeout(function () {
      if (closed) return;
      overlay.classList.add('is-revealed');
      countUp(amount, Number(opts.amount) || 0, { ms: 1350, format: AGIR.fmt.money });
    }, isReduced ? 0 : 920);
    if (global.navigator && global.navigator.vibrate && !isReduced) global.navigator.vibrate([35, 35, 80]);
    setTimeout(function () { if (!closed) overlay.classList.add('is-settled'); }, isReduced ? 0 : 2700);
    setTimeout(close, isReduced ? 1700 : 4800);
    return { close: close, el: overlay };
  }

  AGIR.motion = {
    reduced: reduced, defer: defer, countUp: countUp, num: num,
    fillBar: fillBar, progress: progress,
    initReveal: initReveal, pageIn: pageIn, pageOut: pageOut,
    loadStart: loadStart, loadEnd: loadEnd, stagger: stagger,
    celebrateWin: celebrateWin
  };
})(window);
