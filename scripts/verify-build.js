const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
assert.ok(scripts.length > 0, 'the generated page must load application scripts');
for (const source of scripts) {
  const file = path.join(root, 'dist', source.replace(/^\//, ''));
  assert.ok(fs.existsSync(file), `missing build asset: ${source}`);
}
assert.ok(fs.existsSync(path.join(root, 'dist', 'assets', 'brand', 'icon-orange.svg')));
assert.ok(fs.existsSync(path.join(root, 'dist', 'assets', 'js', 'app.js')), 'legacy runtime was not copied');
const core = fs.readFileSync(path.join(root, 'dist/assets/js/core-runtime.js'), 'utf8');
for (const symbol of ['oppDrawer', 'countUp', 'leadHistoryEntries']) {
  assert.ok(core.includes(symbol), `missing runtime symbol: ${symbol}`);
}
const vm = require('node:vm');
new vm.Script(core);
console.log(`Build verified: ${scripts.length} application scripts and brand assets are present.`);
