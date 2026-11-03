const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('vite');
const { createHash } = require('node:crypto');
const { transform } = require('esbuild');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(m?js)$/.test(file) ? [file] : [];
  }).sort();
}
const assetVersion = createHash('sha256');
let outputDirectory = path.resolve(__dirname, 'dist');
for (const file of sourceFiles(path.resolve(__dirname, 'assets/js'))) assetVersion.update(fs.readFileSync(file));

module.exports = defineConfig({
  server: { watch: { ignored: ['**/work/**', '**/outputs/**'] } },
  define: { __AGIR_ASSET_VERSION__: JSON.stringify(assetVersion.digest('hex').slice(0, 16)) },
  plugins: [{
    name: 'copy-legacy-runtime-assets',
    configResolved(config) { outputDirectory = path.resolve(config.root, config.build.outDir); },
    async closeBundle() {
      for (const directory of ['js', 'brand']) {
        fs.cpSync(
          path.resolve(__dirname, 'assets', directory),
          path.resolve(outputDirectory, 'assets', directory),
          { recursive: true },
        );
      }
      const main = fs.readFileSync(path.resolve(__dirname, 'assets/js/main.js'), 'utf8');
      const coreList = main.slice(main.indexOf('const coreScripts = ['), main.indexOf('const pageScripts ='));
      const sources = [...coreList.matchAll(/'(assets\/js\/[^']+\.js)'/g)].map(match => match[1]);
      if (sources.length < 8) throw new Error('Lista de runtime inválida.');
      const bundled = sources.map(file => fs.readFileSync(path.resolve(__dirname, file), 'utf8')).join('\n;\n');
      const result = await transform(bundled, { minify: true, target: 'es2020', legalComments: 'none' });
      fs.writeFileSync(path.resolve(outputDirectory, 'assets/js/core-runtime.js'), result.code);
    },
  }],
});
