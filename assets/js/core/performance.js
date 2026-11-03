/* Opt-in, local-only diagnostics. Never collect text, IDs, URLs or credentials. */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var enabled = !!(global.location && new URLSearchParams(global.location.search).get('perf') === '1');
  var allowed = new Set(['boot.ready', 'query.page', 'lead.load', 'pipeline.update', 'pipeline.mount', 'activity.update', 'dashboard.mount', 'ranking.render', 'longtask']);
  var stats = new Map(), observer = null;
  function record(name, duration) {
    if (!enabled || !allowed.has(name) || !Number.isFinite(duration) || duration < 0) return;
    var entry = stats.get(name) || { count: 0, totalMs: 0, maxMs: 0, recent: [] };
    entry.count++; entry.totalMs += duration; entry.maxMs = Math.max(entry.maxMs, duration);
    entry.recent.push(duration); if (entry.recent.length > 200) entry.recent.shift();
    stats.set(name, entry);
  }
  function start(name) {
    if (!enabled) return function () {};
    var at = global.performance.now(), finished = false;
    return function () { if (!finished) { finished = true; record(name, global.performance.now() - at); } };
  }
  function snapshot() {
    var output = {};
    stats.forEach(function (entry, key) {
      var samples = entry.recent.slice().sort(function (a, b) { return a - b; });
      output[key] = { count: entry.count, totalMs: Math.round(entry.totalMs), maxMs: Math.round(entry.maxMs),
        p95RecentMs: Math.round(samples[Math.max(0, Math.ceil(samples.length * .95) - 1)]) };
    });
    return { enabled: enabled, metrics: output, sampleLimit: 200 };
  }
  function observe() {
    if (!enabled || !global.PerformanceObserver || observer) return;
    try {
      observer = new global.PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) { record('longtask', entry.duration); });
      });
      observer.observe({ type: 'longtask' });
    } catch (_) { observer = null; }
  }
  function stop() { enabled = false; if (observer) observer.disconnect(); observer = null; }
  AGIR.perf = { record: record, start: start, snapshot: snapshot, stop: stop };
  observe();
  if (enabled && global.document) global.document.addEventListener('DOMContentLoaded', function () {
    var button = global.document.createElement('button');
    button.textContent = 'Diagnóstico local'; button.className = 'btn btn--sm';
    button.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:9999';
    button.addEventListener('click', function () {
      if (!AGIR.ui) return;
      var data = snapshot();
      data.domElements = global.document.querySelectorAll('*').length;
      AGIR.ui.modal({ title: 'Desempenho local', sub: 'Durações em ms. Sem dados de clientes e sem envio ao servidor.',
        body: AGIR.dom.h('pre', { text: JSON.stringify(data, null, 2), style: { whiteSpace: 'pre-wrap' } }) });
    });
    global.document.body.appendChild(button);
  }, { once: true });
})(window);
