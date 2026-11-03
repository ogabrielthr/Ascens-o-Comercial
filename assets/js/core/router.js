/* ==========================================================================
   AGIR — router.js
   Roteador por hash (#/modulo/pagina?param=valor). Funciona em file://,
   sem servidor, e preserva histórico do navegador.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};

  var routes = [];      // { pattern, keys, re, handler, meta }
  var notFound = null;
  var current = null;
  var before = [];      // guardas: fn(ctx) -> false|string cancela/redireciona

  /** '/crm/leads/:id' -> regex + nomes dos parâmetros */
  function compile(pattern) {
    var keys = [];
    var re = new RegExp('^' + pattern
      .replace(/\/+$/, '')
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\/:([\w]+)/g, function (_, k) { keys.push(k); return '/([^/]+)'; })
      .replace(/\*/g, '.*') + '/?$');
    return { re: re, keys: keys };
  }

  /** on('/crm/leads', handler, meta) */
  function on(pattern, handler, meta) {
    var c = compile(pattern);
    routes.push({ pattern: pattern, re: c.re, keys: c.keys, handler: handler, meta: meta || {} });
    return AGIR.router;
  }

  function fallback(handler) { notFound = handler; return AGIR.router; }
  function guard(fn) { before.push(fn); return AGIR.router; }

  function parseHash() {
    var raw = global.location.hash.replace(/^#/, '') || '/';
    var qi = raw.indexOf('?');
    var path = qi >= 0 ? raw.slice(0, qi) : raw;
    var qs = qi >= 0 ? raw.slice(qi + 1) : '';
    if (path.charAt(0) !== '/') path = '/' + path;
    var query = {};
    qs.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      var v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      query[k] = v;
    });
    return { path: path.replace(/\/+$/, '') || '/', query: query, raw: raw };
  }

  function match(path) {
    for (var i = 0; i < routes.length; i++) {
      var m = path.match(routes[i].re);
      if (!m) continue;
      var params = {};
      routes[i].keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
      return { route: routes[i], params: params };
    }
    return null;
  }

  function resolve() {
    var loc = parseHash();
    var found = match(loc.path);
    var ctx = {
      path: loc.path, query: loc.query, raw: loc.raw,
      params: found ? found.params : {},
      meta: found ? found.route.meta : {},
      pattern: found ? found.route.pattern : null,
      from: current
    };

    for (var i = 0; i < before.length; i++) {
      var r = before[i](ctx);
      if (r === false) return;
      if (typeof r === 'string') { go(r, true); return; }
    }

    current = ctx;
    if (found) found.route.handler(ctx);
    else if (notFound) notFound(ctx);
  }

  /** Navega. replace=true não empilha no histórico. */
  function go(to, replace) {
    var target = to.charAt(0) === '#' ? to : '#' + (to.charAt(0) === '/' ? to : '/' + to);
    if (global.location.hash === target) { resolve(); return; }
    if (replace) {
      var url = global.location.href.split('#')[0] + target;
      global.history.replaceState(null, '', url);
      resolve();
    } else {
      global.location.hash = target;
    }
  }

  /** Atualiza a query string sem recarregar tudo (filtros compartilháveis). */
  function setQuery(patch, replace) {
    var loc = parseHash();
    var q = Object.assign({}, loc.query, patch);
    Object.keys(q).forEach(function (k) {
      if (q[k] === null || q[k] === undefined || q[k] === '') delete q[k];
    });
    var qs = Object.keys(q).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
    }).join('&');
    go(loc.path + (qs ? '?' + qs : ''), replace !== false);
  }

  function href(path, query) {
    var qs = query ? Object.keys(query).filter(function (k) {
      return query[k] !== null && query[k] !== undefined && query[k] !== '';
    }).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
    }).join('&') : '';
    return '#' + path + (qs ? '?' + qs : '');
  }

  function start() {
    global.addEventListener('hashchange', resolve);
    if (!global.location.hash) go('/', true);
    else resolve();
  }

  AGIR.router = {
    on: on, fallback: fallback, guard: guard, start: start,
    go: go, setQuery: setQuery, href: href, resolve: resolve,
    get current() { return current; },
    parseHash: parseHash
  };
})(window);
