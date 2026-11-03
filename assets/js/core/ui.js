/* ==========================================================================
   AGIR — ui.js
   Peças interativas compartilhadas: toast (com desfazer), modal, drawer,
   dropdown, tooltip, confirmação, tabs e segmented control.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var D = AGIR.dom, h = D.h, icon = D.icon;

  var layer = null;      // camada de overlays
  var toastHost = null;
  var openStack = [];    // pilha de overlays para o ESC fechar o topo

  function ensureLayer() {
    if (!layer) {
      layer = h('div#overlay-layer');
      document.body.appendChild(layer);
    }
    if (!toastHost) {
      toastHost = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastHost);
    }
  }

  /* ==========================================================================
     Toast
     ========================================================================== */
  var TOAST_ICON = { ok: 'checkcircle', bad: 'alert', warn: 'alert', info: 'info' };

  /**
   * toast({ title, text, tone:'ok|bad|warn|info', ms, action:{label,onClick} })
   */
  function toast(opts) {
    ensureLayer();
    if (typeof opts === 'string') opts = { title: opts };
    var tone = opts.tone || 'info';
    var ms = opts.ms === undefined ? (opts.action ? 7000 : 4200) : opts.ms;

    var bar = h('i.toast__bar');
    var el = h('div.toast.toast--' + tone, { role: 'alert' },
      icon(TOAST_ICON[tone] || 'info', 'toast__ico'),
      h('div.grow',
        h('div.toast__title', { text: opts.title || '' }),
        opts.text ? h('div.toast__text', { text: opts.text }) : null
      ),
      opts.action ? h('button.btn.btn--sm.btn--ghost', {
        text: opts.action.label,
        style: { color: 'var(--brand-500)' },
        onClick: function () { close(); opts.action.onClick(); }
      }) : null,
      h('button.btn.btn--icon.btn--sm.btn--ghost', {
        'aria-label': 'Fechar', onClick: function () { close(); }
      }, icon('x')),
      bar
    );

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 200);
    }

    toastHost.appendChild(el);

    if (ms > 0) {
      bar.style.transition = 'width ' + ms + 'ms linear';
      bar.style.width = '100%';
      requestAnimationFrame(function () { bar.style.width = '0%'; });
      var t = setTimeout(close, ms);
      el.addEventListener('mouseenter', function () {
        clearTimeout(t);
        bar.style.transition = 'none';
      });
      el.addEventListener('mouseleave', function () { t = setTimeout(close, 1600); });
    } else {
      bar.remove();
    }
    /* `el` fica exposto para quem precisa atualizar o texto enquanto o toast
       esta aberto — caso de progresso em operacoes longas. */
    return { close: close, el: el };
  }

  toast.ok   = function (t, x) { return toast({ title: t, text: x, tone: 'ok' }); };
  toast.bad  = function (t, x) { return toast({ title: t, text: x, tone: 'bad' }); };
  toast.warn = function (t, x) { return toast({ title: t, text: x, tone: 'warn' }); };
  toast.info = function (t, x) { return toast({ title: t, text: x, tone: 'info' }); };

  /* ==========================================================================
     Overlay base (modal / drawer)
     ========================================================================== */
  function pushOverlay(node, onClose) {
    ensureLayer();
    layer.appendChild(node);
    var entry = { node: node, close: onClose, opener: document.activeElement };
    openStack.push(entry);
    document.body.style.overflow = 'hidden';
    return entry;
  }

  function popOverlay(entry) {
    var i = openStack.indexOf(entry);
    if (i < 0) return;
    if (i >= 0) openStack.splice(i, 1);
    if (entry.node.parentNode) entry.node.remove();
    if (!openStack.length) document.body.style.overflow = '';
    if (entry.opener && entry.opener.isConnected && typeof entry.opener.focus === 'function') {
      entry.opener.focus({ preventScroll: true });
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !openStack.length) return;
    var top = openStack[openStack.length - 1];
    e.stopPropagation();
    if (top.close) top.close();
  });

  /** Prende o foco dentro do overlay (acessibilidade de teclado). */
  function trapFocus(root) {
    var sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    function onKey(e) {
      if (e.key !== 'Tab') return;
      var items = D.qsa(sel, root).filter(function (n) { return n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    root.addEventListener('keydown', onKey);
    setTimeout(function () {
      var auto = D.qs('[autofocus]', root) || D.qsa(sel, root)[0];
      if (auto) auto.focus();
    }, 60);
  }

  /* ==========================================================================
     Modal
     ========================================================================== */
  /**
   * modal({ title, sub, body:Node|fn(api), footer:Node|fn(api), wide, onClose })
   * Devolve { close, el }.
   */
  function modal(opts) {
    var api = {};
    var box = h('div.modal' + (opts.wide ? '.modal--wide' : ''), {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Diálogo'
    });
    var scrim = h('div.scrim', {
      onMousedown: function (e) { if (e.target === scrim && opts.dismissible !== false) api.close(); }
    }, box);

    var entry = pushOverlay(scrim, function () { if (opts.dismissible !== false) api.close(); });

    api.close = function (result) {
      popOverlay(entry);
      if (opts.onClose) opts.onClose(result);
    };

    box.appendChild(h('div.modal__head',
      h('div',
        h('div.t-h3', { text: opts.title || '' }),
        opts.sub ? h('div.t-small.t-dimmer', { style: { marginTop: '4px' }, text: opts.sub }) : null
      ),
      h('button.btn.btn--icon.btn--sm.btn--ghost', {
        'aria-label': 'Fechar', onClick: function () { api.close(); }
      }, icon('x'))
    ));

    var body = h('div.modal__body');
    var content = typeof opts.body === 'function' ? opts.body(api) : opts.body;
    if (content) body.appendChild(content);
    box.appendChild(body);

    var foot = typeof opts.footer === 'function' ? opts.footer(api) : opts.footer;
    if (foot) box.appendChild(h('div.modal__foot', foot));

    trapFocus(box);
    api.el = box;
    api.body = body;
    return api;
  }

  /** Confirmação — devolve Promise<boolean> */
  function confirm(opts) {
    if (typeof opts === 'string') opts = { title: opts };
    return new Promise(function (resolve) {
      var settled = false;
      var m = modal({
        title: opts.title || 'Confirmar',
        body: h('p.t-body.t-dim', { text: opts.text || 'Deseja continuar?' }),
        footer: function (api) {
          return [
            h('button.btn', {
              text: opts.cancelLabel || 'Cancelar',
              onClick: function () { settled = true; api.close(); resolve(false); }
            }),
            h('button.btn' + (opts.danger ? '.btn--danger' : '.btn--primary'), {
              text: opts.okLabel || 'Confirmar', autofocus: true,
              onClick: function () { settled = true; api.close(); resolve(true); }
            })
          ];
        },
        onClose: function () { if (!settled) resolve(false); }
      });
      return m;
    });
  }

  /** Prompt de texto — devolve Promise<string|null> */
  function prompt(opts) {
    return new Promise(function (resolve) {
      var input, api, settled = false;

      function done() {
        if (settled) return;
        settled = true;
        api.close();
        resolve(input.value.trim() || null);
      }
      function cancel() {
        if (settled) return;
        settled = true;
        api.close();
        resolve(null);
      }

      api = modal({
        title: opts.title || 'Informe',
        body: h('div.field',
          opts.label ? h('label.field__label', { text: opts.label }) : null,
          input = h('input.input', {
            value: opts.value || '', placeholder: opts.placeholder || '', autofocus: true,
            onKeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); done(); } }
          }),
          opts.hint ? h('div.field__hint', { text: opts.hint }) : null
        ),
        footer: [
          h('button.btn', { text: 'Cancelar', onClick: cancel }),
          h('button.btn.btn--primary', { text: opts.okLabel || 'Salvar', onClick: done })
        ],
        onClose: function () { if (!settled) { settled = true; resolve(null); } }
      });
    });
  }

  /* ==========================================================================
     Drawer lateral
     ========================================================================== */
  /**
   * drawer({ title, sub, badge, body, footer, wide, onClose })
   */
  function drawer(opts) {
    var api = {};
    var box = h('aside.drawer' + (opts.wide ? '.drawer--wide' : ''), {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Painel'
    });
    var scrim = h('div.drawer-scrim', { onMousedown: function () { api.close(); } });
    var wrap = h('div', scrim, box);

    var entry = pushOverlay(wrap, function () { api.close(); });
    var closing = false, closed = false;
    api.close = function (r) {
      if (closing || closed) return;
      function finish() { closed = true; popOverlay(entry); if (opts.onClose) opts.onClose(r); }
      if (!opts.beforeClose) { finish(); return; }
      closing = true;
      return Promise.resolve().then(function () { return opts.beforeClose(r); })
        .then(function (allowed) { if (allowed !== false) finish(); })
        .catch(function () { toast.bad('Não foi possível fechar', 'Finalize o salvamento e tente novamente.'); })
        .finally(function () { closing = false; });
    };

    box.appendChild(h('div.drawer__head',
      h('div.grow',
        opts.eyebrow ? h('div.t-eyebrow', { text: opts.eyebrow }) : null,
        h('div.t-h3', { style: { marginTop: opts.eyebrow ? '4px' : 0 }, text: opts.title || '' }),
        opts.sub ? h('div.t-small.t-dimmer', { style: { marginTop: '4px' }, text: opts.sub }) : null
      ),
      opts.headExtra || null,
      h('button.btn.btn--icon.btn--sm.btn--ghost', {
        'aria-label': 'Fechar', onClick: function () { api.close(); }
      }, icon('x'))
    ));

    var body = h('div.drawer__body');
    var content = typeof opts.body === 'function' ? opts.body(api) : opts.body;
    if (content) body.appendChild(content);
    box.appendChild(body);

    var foot = typeof opts.footer === 'function' ? opts.footer(api) : opts.footer;
    if (foot) box.appendChild(h('div.drawer__foot', foot));

    trapFocus(box);
    api.el = box;
    api.body = body;
    return api;
  }

  /* ==========================================================================
     Dropdown / popover ancorado
     ========================================================================== */
  var openPop = null;
  var popHandlers = null;

  /**
   * popover(anchorEl, items, opts)
   * items: [{ label, icon, onClick, danger, checked, sep:true, group:'Título' }]
   */
  function popover(anchor, items, opts) {
    closePopover();
    opts = opts || {};
    var pop = h('div.pop', { role: 'menu' });

    items.forEach(function (it) {
      if (!it) return;
      if (it.sep) return pop.appendChild(h('div.pop__sep'));
      if (it.group) return pop.appendChild(h('div.pop__label', { text: it.group }));
      var btn = h('button.pop__item' + (it.danger ? '.pop__item--danger' : ''), {
        role: 'menuitem',
        class: it.active ? 'is-active' : '',
        onClick: function (e) {
          e.stopPropagation();
          if (it.keepOpen !== true) closePopover();
          if (it.onClick) it.onClick(e);
        }
      },
        it.icon ? icon(it.icon) : null,
        h('span.grow', { text: it.label }),
        it.checked ? icon('check') : null,
        it.hint ? h('span.t-tiny.t-dimmer', { text: it.hint }) : null
      );
      pop.appendChild(btn);
    });

    document.body.appendChild(pop);

    function position() {
      if (!anchor.isConnected) return closePopover();
      var r = anchor.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var align = opts.align || 'left';
      var x = align === 'right' ? r.right - pw : r.left;
      var y = r.bottom + 6;
      if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 6);
      x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
      pop.style.left = x + 'px';
      pop.style.top = y + 'px';
      if (opts.minWidth) pop.style.minWidth = Math.max(opts.minWidth, r.width) + 'px';
    }
    position();

    openPop = pop;
    popHandlers = { down: onDocDown, key: onKey, viewport: onViewportChange };
    setTimeout(function () {
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', onViewportChange, true);
      window.addEventListener('resize', onViewportChange);
    }, 0);

    function onViewportChange() { window.requestAnimationFrame(position); }
    function onDocDown(e) {
      var root = document.documentElement;
      var onScrollbar = e.clientX >= root.clientWidth || e.clientY >= root.clientHeight;
      if (!onScrollbar && !pop.contains(e.target) && !anchor.contains(e.target)) closePopover();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); return closePopover(); }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var opts2 = D.qsa('.pop__item', pop);
      var cur = opts2.indexOf(document.activeElement);
      var next = e.key === 'ArrowDown' ? (cur + 1) % opts2.length
        : (cur - 1 + opts2.length) % opts2.length;
      if (opts2[next]) opts2[next].focus();
    }
    return pop;
  }

  function closePopover() {
    if (!openPop) return;
    openPop.remove();
    openPop = null;
    if (popHandlers) {
      document.removeEventListener('mousedown', popHandlers.down, true);
      document.removeEventListener('keydown', popHandlers.key, true);
      window.removeEventListener('scroll', popHandlers.viewport, true);
      window.removeEventListener('resize', popHandlers.viewport);
      popHandlers = null;
    }
  }

  /* ==========================================================================
     Tooltip declarativo — qualquer elemento com [data-tip]
     ========================================================================== */
  var tipEl = null, tipTimer = null;

  function initTooltips() {
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { showTip(t); }, 380);
      t.addEventListener('mouseleave', hideTip, { once: true });
      t.addEventListener('click', hideTip, { once: true });
    });
  }

  function showTip(t) {
    hideTip();
    tipEl = h('div.tip', { text: t.dataset.tip });
    document.body.appendChild(tipEl);
    var r = t.getBoundingClientRect();
    var w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    var x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    var y = r.top - hgt - 8;
    if (y < 8) y = r.bottom + 8;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }

  function hideTip() {
    clearTimeout(tipTimer);
    if (tipEl) { tipEl.remove(); tipEl = null; }
  }

  /* ==========================================================================
     Segmented control com glider animado
     ========================================================================== */
  /**
   * segmented([{value,label,icon}], value, onChange) -> Node
   */
  function segmented(items, value, onChange) {
    var glider = h('span.seg__glider');
    var root = h('div.seg', { role: 'tablist' }, glider);
    var btns = [];

    items.forEach(function (it) {
      var b = h('button.seg__item', {
        role: 'tab', type: 'button',
        'aria-selected': it.value === value ? 'true' : 'false',
        class: it.value === value ? 'is-active' : '',
        onClick: function () { select(it.value); if (onChange) onChange(it.value); }
      }, it.icon ? icon(it.icon, 'ico') : null, h('span', { text: it.label }));
      btns.push(b);
      root.appendChild(b);
    });

    function select(v) {
      value = v;
      btns.forEach(function (b, i) {
        var on = items[i].value === v;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      move();
    }

    function move() {
      var i = items.findIndex(function (x) { return x.value === value; });
      var b = btns[i];
      if (!b) { glider.style.opacity = 0; return; }
      glider.style.opacity = 1;
      glider.style.width = b.offsetWidth + 'px';
      glider.style.transform = 'translateX(' + b.offsetLeft + 'px)';
    }

    /* mede depois que entra no DOM (setTimeout também cobre aba em segundo plano) */
    requestAnimationFrame(function () { requestAnimationFrame(move); });
    setTimeout(move, 140);
    var ro = new ResizeObserver(move);
    ro.observe(root);
    if (typeof AGIR.onPageDispose === 'function') {
      AGIR.onPageDispose(function () { ro.disconnect(); });
    }
    root.setValue = select;
    return root;
  }

  /* ==========================================================================
     Tabs simples
     ========================================================================== */
  /**
   * tabs([{value,label,count}], value, onChange) -> Node
   */
  function tabs(items, value, onChange) {
    var root = h('div.tabs', { role: 'tablist' });
    items.forEach(function (it) {
      root.appendChild(h('button.tab', {
        role: 'tab', type: 'button',
        class: it.value === value ? 'is-active' : '',
        'aria-selected': it.value === value ? 'true' : 'false',
        onClick: function () {
          if (it.value === value) return;
          D.qsa('.tab', root).forEach(function (t) { t.classList.remove('is-active'); });
          this.classList.add('is-active');
          value = it.value;
          if (onChange) onChange(it.value);
        }
      },
        it.icon ? icon(it.icon) : null,
        h('span', { text: it.label }),
        it.count !== undefined ? h('span.nav-item__count', { text: it.count }) : null
      ));
    });
    return root;
  }

  /* ==========================================================================
     Skeletons prontos
     ========================================================================== */
  function skeletonCards(n, cls) {
    return h('div.grid.' + (cls || 'g-4'), Array.from({ length: n || 4 }, function () {
      return h('div.sk.sk--card');
    }));
  }
  function skeletonTable(rows) {
    return h('div.card.card--pad.col.gap-3',
      h('div.sk.sk--title'),
      Array.from({ length: rows || 6 }, function () {
        return h('div.row.gap-3',
          h('div.sk.sk--av'),
          h('div.sk.sk--line.grow'),
          h('div.sk.sk--line', { style: { width: '84px' } })
        );
      })
    );
  }
  function skeletonChart(hgt) {
    return h('div.sk.sk--chart', hgt ? { style: { height: hgt + 'px' } } : null);
  }

  /* ==========================================================================
     Estado vazio
     ========================================================================== */
  /** empty({ icon, title, text, action:{label,icon,onClick} }) */
  function empty(opts) {
    return h('div.empty',
      h('div.empty__art', icon(opts.icon || 'inbox')),
      h('div.empty__title', { text: opts.title || 'Nada por aqui ainda' }),
      opts.text ? h('div.empty__text', { text: opts.text }) : null,
      opts.action ? h('button.btn.btn--primary.mt-2', {
        onClick: opts.action.onClick
      }, icon(opts.action.icon || 'plus'), h('span', { text: opts.action.label })) : null,
      opts.secondary ? h('button.btn.btn--ghost.btn--sm', {
        text: opts.secondary.label, onClick: opts.secondary.onClick
      }) : null
    );
  }

  /* ==========================================================================
     Ripple nos botões
     ========================================================================== */
  function initRipple() {
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest && e.target.closest('.btn, .nav-item, .chip, .pop__item');
      if (!b || b.classList.contains('no-ripple')) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var r = b.getBoundingClientRect();
      var size = Math.max(r.width, r.height);
      var sp = h('span.ripple', {
        style: {
          width: size + 'px', height: size + 'px',
          left: (e.clientX - r.left - size / 2) + 'px',
          top: (e.clientY - r.top - size / 2) + 'px'
        }
      });
      if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
      b.appendChild(sp);
      setTimeout(function () { sp.remove(); }, 600);
    });
  }

  function init() {
    ensureLayer();
    initTooltips();
    initRipple();
  }

  AGIR.ui = {
    init: init, toast: toast, modal: modal, drawer: drawer, confirm: confirm, prompt: prompt,
    popover: popover, closePopover: closePopover,
    segmented: segmented, tabs: tabs,
    skeletonCards: skeletonCards, skeletonTable: skeletonTable, skeletonChart: skeletonChart,
    empty: empty, trapFocus: trapFocus, hideTip: hideTip
  };
})(window);
