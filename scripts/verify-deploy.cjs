// Read-only publication check. No login, credentials or customer data.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
if (!process.env.APP_URL) throw new Error('Defina APP_URL com o endereço publicado da Ascensão Comercial.');
const base = new URL(process.env.APP_URL);
const dist = path.resolve(__dirname, '../dist');
const hash = value => createHash('sha256').update(value).digest('hex');
async function read(url) {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url).pathname}`);
  return Buffer.from(await response.arrayBuffer());
}
(async () => {
  const html = (await read(base)).toString('utf8');
  const entry = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  if (entry.length !== 1) throw new Error('Entrada de produção inesperada.');
  const entryUrl = new URL(entry[0], base);
  if (entryUrl.origin !== base.origin) throw new Error('Origem inesperada.');
  const published = (await read(entryUrl)).toString('utf8');
  if (!published.includes('assets/js/core-runtime.js')) throw new Error('Runtime otimizado ainda não publicado.');
  if (!published.includes('id,updated_at')) throw new Error('Reconciliação incremental ainda não publicada.');
  const worker = published.match(/\/assets\/import-worker-[A-Za-z0-9_-]+\.js/);
  if (!worker) throw new Error('Worker de importação ainda não publicado.');
  const files = ['assets/js/core-runtime.js', 'assets/js/app.js', 'assets/js/pages/crm/pipeline.js',
    'assets/js/pages/crm/atividades.js', 'assets/js/pages/crm/dashboard.js', 'assets/js/pages/performance/ranking.js', worker[0].slice(1)];
  for (const file of files) {
    const local = fs.readFileSync(path.join(dist, file));
    const url = new URL(file, base); url.searchParams.set('v', hash(local).slice(0, 16));
    const remote = await read(url);
    // Git/Windows may normalize source line endings; compare normalized text.
    const normalized = value => value.toString('utf8').replace(/\r\n/g, '\n');
    if (hash(normalized(local)) !== hash(normalized(remote))) throw new Error(`Versão diferente: ${file}`);
    console.log(`OK ${file}`);
  }
  console.log('Publicação conferida. Fluxos autenticados não são testados por este script.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
