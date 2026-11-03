/* ==========================================================================
   AGIR — dom.js
   Hiperscript minimalista + biblioteca de ícones.
   Nenhuma dependência. Carregado como script clássico (roda em file://).
   ========================================================================== */
(function (global) {
  'use strict';

  var AGIR = global.AGIR = global.AGIR || {};
  /* Registro de telas — criado aqui porque widgets e páginas carregam antes do app.js */
  AGIR.pages = AGIR.pages || {};
  AGIR.util = AGIR.util || {};

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* --------------------------------------------------------------------
     h(tag, props, ...children)
     - tag aceita atalho CSS: 'div.card.card--pad#id'
     - props: className, id, text, html, style (objeto), dataset (objeto),
              on{Event} (função), attrs arbitrários
     - children: nó, string, número, array, null/false (ignorados)
     -------------------------------------------------------------------- */
  /**
   * Só é "props" um objeto simples. Nó do DOM, array, texto, número e
   * null/false entram como filho — assim h('div', h('span')) funciona.
   */
  function isProps(v) {
    return v !== null && typeof v === 'object' &&
      !v.nodeType && !Array.isArray(v) &&
      (v.constructor === Object || v.constructor === undefined);
  }

  function h(tag, props) {
    var rest = Array.prototype.slice.call(arguments, 1);
    var m = String(tag).match(/^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/);
    var name = (m && m[1]) || 'div';
    var el = document.createElement(name);

    if (m && m[2]) {
      m[2].match(/[.#][\w-]+/g).forEach(function (t) {
        if (t[0] === '.') el.classList.add(t.slice(1));
        else el.id = t.slice(1);
      });
    }

    if (isProps(rest[0])) applyProps(el, rest.shift());
    append(el, rest);
    return el;
  }

  function applyProps(el, props) {
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;

      if (k === 'class' || k === 'className') {
        String(v).split(/\s+/).filter(Boolean).forEach(function (c) { el.classList.add(c); });
      } else if (k === 'text') {
        el.textContent = v;
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.keys(v).forEach(function (p) {
          if (p.indexOf('--') === 0) el.style.setProperty(p, v[p]);
          else el.style[p] = v[p];
        });
      } else if (k === 'dataset' && typeof v === 'object') {
        Object.keys(v).forEach(function (p) { el.dataset[p] = v[p]; });
      } else if (k.indexOf('on') === 0 && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'ref' && typeof v === 'function') {
        v(el);
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, v);
      }
    });
  }

  function append(el, children) {
    children.forEach(function (c) {
      if (c === null || c === undefined || c === false || c === '') return;
      if (Array.isArray(c)) return append(el, c);
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
  }

  /* ---------- SVG ------------------------------------------------------ */
  function s(tag, props) {
    var rest = Array.prototype.slice.call(arguments, 1);
    var el = document.createElementNS(SVG_NS, tag);
    if (isProps(rest[0])) {
      props = rest.shift();
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class' || k === 'className') el.setAttribute('class', v);
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (p) {
            if (p.indexOf('--') === 0) el.style.setProperty(p, v[p]);
            else el.style[p] = v[p];
          });
        } else if (k.indexOf('on') === 0 && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else el.setAttribute(k, v);
      });
    }
    append(el, rest);
    return el;
  }

  /* ---------- Utilitários de DOM --------------------------------------- */
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

  /**
   * Substitui o conteudo de `el`.
   *
   * Aceita no lugar de um unico no: array de nos, texto, numero ou null —
   * a mesma normalizacao que h() aplica aos filhos. Antes so aceitava um no,
   * e passar um array (padrao natural ao renderizar lista com .map) estourava
   * "appendChild: parameter 1 is not of type 'Node'" em tempo de execucao.
   */
  function mount(el, conteudo) {
    if (!el) return el;
    clear(el);
    append(el, Array.isArray(conteudo) ? conteudo : [conteudo]);
    return el;
  }
  function frag() {
    var f = document.createDocumentFragment();
    append(f, Array.prototype.slice.call(arguments));
    return f;
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* Utilitarios usados por telas carregadas sob demanda precisam nascer no
     nucleo. Antes eles eram registrados apenas quando a pagina de Leads era
     aberta; entrar direto em Configuracoes > Usuarios deixava `deb` e `campo`
     indefinidos e derrubava a tela inteira. */
  function deb(fn, ms) {
    var timer;
    return function () {
      var self = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function campo(store, key, label, attrs) {
    var input = h('input.input', Object.assign({ 'aria-label': label }, attrs || {}));
    store[key] = input;
    return h('div.field', h('label.field__label', label,
      attrs && attrs.required ? h('span.field__required', { text: '*', 'aria-hidden': 'true' }) : null), input);
  }

  function copiar(texto, mensagem) {
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(texto).then(function () {
        if (AGIR.ui) AGIR.ui.toast.ok(mensagem || 'Copiado');
      });
    }
    var area = h('textarea', { value: texto, style: { position: 'fixed', opacity: 0 } });
    document.body.appendChild(area); area.select();
    try { document.execCommand('copy'); if (AGIR.ui) AGIR.ui.toast.ok(mensagem || 'Copiado'); }
    finally { area.remove(); }
  }

  function baixarCSV(linhas, nome) {
    var csv = linhas.map(function (linha) {
      return linha.map(function (celula) {
        var valor = String(celula === null || celula === undefined ? '' : celula);
        return /[";\n]/.test(valor) ? '"' + valor.replace(/"/g, '""') + '"' : valor;
      }).join(';');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var link = h('a', { href: URL.createObjectURL(blob), download: nome });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
    if (AGIR.ui) AGIR.ui.toast.ok('CSV gerado', Math.max(0, linhas.length - 1) + ' linhas exportadas');
  }

  AGIR.util.deb = deb;
  AGIR.util.campo = campo;
  AGIR.util.copiar = copiar;
  AGIR.util.baixarCSV = baixarCSV;

  /* Aplica --i incremental nos filhos (para animação escalonada) */
  function stagger(el, step) {
    Array.prototype.forEach.call(el.children, function (c, i) {
      c.style.setProperty('--i', i);
      if (step) c.style.setProperty('animation-delay', (i * step) + 'ms');
    });
    return el;
  }

  /* ==========================================================================
     Ícones — traçado no estilo Lucide, 24x24, stroke currentColor
     ========================================================================== */
  var PATHS = {
    /* navegação e módulos */
    grid:        'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    kanban:      'M6 4v16M12 4v10M18 4v14',
    gauge:       'M12 14l4-4M21 12a9 9 0 1 0-18 0',
    trophy:      'M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3M9 20h6M12 13v7',
    wallet:      'M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 12h3',
    users:       'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
    user:        'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    building:    'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h2M8 11h2M8 15h2',
    contact:     'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0M8 18a4 4 0 0 1 10 0',
    activity:    'M22 12h-4l-3 9L9 3l-3 9H2',
    zap:         'M13 2 3 14h8l-1 8 10-12h-8z',
    mail:        'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM2 7l10 6 10-6',
    chart:       'M3 3v18h18M7 15l4-5 3 3 5-7',
    barchart:    'M3 21V9M9 21V4M15 21v-9M21 21V7',
    target:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
    settings:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.33-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    book:        'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    folder:      'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    phone:       'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    home:        'M3 10.5 12 3l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22v-8h6v8',
    layers:      'm12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
    filetext:    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
    receipt:     'M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5zM8 8h8M8 12h8M8 16h5',
    calc:        'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 6h8v3H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01',
    coins:       'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12M15.5 9.5a6 6 0 1 1-7 9',

    /* ações */
    plus:        'M12 5v14M5 12h14',
    minus:       'M5 12h14',
    x:           'M18 6 6 18M6 6l12 12',
    check:       'M20 6 9 17l-5-5',
    checkcircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
    search:      'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
    filter:      'M22 3H2l8 9.5V19l4 2v-8.5z',
    download:    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    upload:      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    edit:        'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
    trash:       'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
    tag:         'M20.6 13.4 12 22l-9-9V3h10zM7.5 7.5h.01',
    copy:        'M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2zM16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4',
    more:        'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2M12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
    refresh:     'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5',
    external:    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
    logout:      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    sidebar:     'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 3v18',
    sun:         'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon:        'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    rows:        'M3 5h18M3 12h18M3 19h18',
    sparkles:    'm12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
    lightbulb:   'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',

    /* setas e direção */
    arrowRight:  'M5 12h14M13 6l6 6-6 6',
    arrowLeft:   'M19 12H5M11 18l-6-6 6-6',
    arrowUp:     'M12 19V5M5 12l7-7 7 7',
    arrowDown:   'M12 5v14M19 12l-7 7-7-7',
    trendUp:     'M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6',
    trendDown:   'M22 17 13.5 8.5 8.5 13.5 2 7M16 17h6v-6',
    chevRight:   'm9 6 6 6-6 6',
    chevLeft:    'm15 6-6 6 6 6',
    chevDown:    'm6 9 6 6 6-6',
    chevUp:      'm18 15-6-6-6 6',
    chevUpDown:  'm7 15 5 5 5-5M7 9l5-5 5 5',

    /* estado e comunicação */
    clock:       'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
    calendar:    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
    alert:       'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    info:        'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16v-4M12 8h.01',
    flame:       'M12 22a7 7 0 0 0 7-7c0-4-3-6-4.5-9.5C13 2 12 2 12 2s-1 3-3 5.5S5 11 5 15a7 7 0 0 0 7 7z',
    whatsapp:    'M3 21l1.7-5A9 9 0 1 1 8 19.3zM8.5 8.5c-.3 1.5 1 3.6 2.4 4.9 1.4 1.3 3.3 2.3 4.6 2 .5-.1 1-.9 1.1-1.4l-2-1-.9 1c-.9-.4-2.4-1.8-2.8-2.8l1-.9-1-2c-.5.1-1.3.6-1.4 1.2z',
    play:        'M6 4l14 8-14 8z',
    pause:       'M8 4h3v16H8zM13 4h3v16h-3z',
    star:        'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L7 14.2l-5-4.9 6.9-1z',
    lock:        'M5 11h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM8 11V7a4 4 0 1 1 8 0v4',
    link:        'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    eye:         'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    pin:         'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
    bell:        'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    handshake:   'm11 17 2 2a1 1 0 0 0 3-3M13 15l3 3a1 1 0 0 0 3-3l-4-4M2 11l3.5-3.5a2 2 0 0 1 2.8 0L12 11l-2 2a2 2 0 1 1-3-3M22 11l-3.5-3.5a2 2 0 0 0-2.8 0L14 9',
    percent:     'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
    shield:      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    inbox:       'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13a2 2 0 0 1 1.8 1.1l3.7 6.9v5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-5l3.7-6.9A2 2 0 0 1 5.5 5z',
    command:     'M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z',
    bank:        'M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 10v8M10 10v8M14 10v8M18 10v8',
    creditcard:  'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM2 10h20M6 15h4'
  };

  /**
   * icon(name, extraClass) -> <svg class="ico ...">
   */
  function icon(name, cls) {
    var d = PATHS[name] || PATHS.info;
    var svg = s('svg', {
      class: 'ico' + (cls ? ' ' + cls : ''),
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    /* separa em subcaminhos (M ou m iniciam um novo traço) */
    d.split(/(?=[Mm])/).forEach(function (seg) {
      seg = seg.trim();
      if (seg) svg.appendChild(s('path', { d: seg }));
    });
    return svg;
  }

  /** append(el, [filhos]) — mesma normalização de filhos usada por h(). */
  function appendAll(el, children) {
    append(el, Array.isArray(children) ? children : [children]);
    return el;
  }

  AGIR.dom = {
    h: h, s: s, icon: icon, clear: clear, mount: mount, frag: frag,
    append: appendAll, qs: qs, qsa: qsa, stagger: stagger, ICONS: PATHS
  };
})(window);
