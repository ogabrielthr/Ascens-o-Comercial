const { spawnSync } = require('node:child_process');
const path = require('node:path');

const executable = process.execPath;
const supabaseCli = path.join(__dirname, '..', 'node_modules', 'supabase', 'dist', 'supabase.js');
const checks = [
  ['Migrações', ['supabase', 'migration', 'list', '--linked']],
  ['Banco e cache', ['supabase', 'inspect', 'db', 'db-stats', '--linked']],
  ['Consultas acumuladas', ['supabase', 'inspect', 'db', 'calls', '--linked']],
  ['Tabelas', ['supabase', 'inspect', 'db', 'table-stats', '--linked']],
  ['Vacuum', ['supabase', 'inspect', 'db', 'vacuum-stats', '--linked']],
  ['Bloat', ['supabase', 'inspect', 'db', 'bloat', '--linked']],
  ['Conexões por papel', ['supabase', 'inspect', 'db', 'role-stats', '--linked']],
  ['Slots de replicação', ['supabase', 'inspect', 'db', 'replication-slots', '--linked']],
];

let failures = 0;
for (const [label, args] of checks) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(executable, [supabaseCli, ...args.slice(1)], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    failures += 1;
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.stderr.write(`Falha no diagnóstico "${label}" (código ${result.status ?? 'indefinido'}).\n`);
  }
}

if (failures) {
  process.stderr.write(`\n${failures} verificação(ões) não concluída(s). Nenhuma alteração foi feita no banco.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nAuditoria somente leitura concluída.\n');
}
