const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../assets/js/core/performance.js'), 'utf8');
function harness(search = '') {
  let observed = 0, disconnected = 0, clock = 0;
  const window = { location: { search }, performance: { now: () => clock++ },
    PerformanceObserver: class { constructor(fn) { this.fn = fn; } observe() { observed++; } disconnect() { disconnected++; } } };
  vm.runInNewContext(code, { window, URLSearchParams });
  return { perf: window.AGIR.perf, observed: () => observed, disconnected: () => disconnected };
}
test('diagnostics are disabled by default without observers, retention or requests', () => {
  const h = harness();
  h.perf.record('query.page', 100); h.perf.start('pipeline.mount')();
  assert.equal(h.observed(), 0);
  assert.equal(Object.keys(h.perf.snapshot().metrics).length, 0);
});
test('diagnostics accept only fixed labels, keep 200 recent samples and stop cleanly', () => {
  const h = harness('?perf=1');
  assert.equal(h.observed(), 1);
  for (let i = 0; i < 1000; i++) h.perf.record('query.page', i);
  h.perf.record('user-private-text', 100);
  h.perf.record('query.page', NaN); h.perf.record('query.page', -1);
  const finish = h.perf.start('pipeline.mount'); finish(); finish();
  const s = h.perf.snapshot();
  assert.equal(s.metrics['query.page'].count, 1000);
  assert.equal(s.metrics['query.page'].p95RecentMs, 989);
  assert.equal(s.metrics['pipeline.mount'].count, 1);
  assert.equal(s.metrics['user-private-text'], undefined);
  h.perf.stop();
  assert.equal(h.disconnected(), 1);
  h.perf.record('query.page', 9999);
  assert.equal(h.perf.snapshot().metrics['query.page'].count, 1000);
});
