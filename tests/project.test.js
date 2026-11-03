const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

function walk(dir, extension) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(target, extension);
    return !extension || target.endsWith(extension) ? [target] : [];
  });
}

test('all browser JavaScript files have valid syntax', () => {
  for (const file of walk(path.join(root, 'assets', 'js'), '.js').filter((item) => !item.endsWith('main.js'))) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});

test('CRM uses requested reversal as its primary commercial value', () => {
  const analytics = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'analytics.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'dashboard.js'), 'utf8');
  const motion = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'motion.js'), 'utf8');

  assert.match(analytics, /function valorCRM\(opportunity\)/);
  assert.match(analytics, /c\.vendasValor \+= valorCRM\(o\)/);
  assert.match(pipeline, /kcard__val[\s\S]*?An\.valorCRM\(op\)/);
  assert.doesNotMatch(pipeline, /kcard__val[^\n]*op\.valor/);
  assert.match(dashboard, /label: 'Estorno solicitado'/);
  assert.match(motion, /win-celebration__amount-label'[\s\S]*?ESTORNO SOLICITADO/);
});

test('only administrators can bypass the payment receipt requirement', () => {
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608270002_admin_payment_receipt_override.sql'),
    'utf8',
  );
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const widgets = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'widgets.js'), 'utf8');

  assert.match(migration, /app_private\.has_role\([\s\S]*?'admin'::public\.access_role/);
  assert.match(pipeline, /Marcar como ganho sem comprovante\?/);
  assert.match(widgets, /Confirmar sem comprovante/);
  assert.match(widgets, /payment-receipt-preview__frame/);
});

test('only administrators can delete payment receipts with audit coverage', () => {
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608280001_admin_delete_payment_receipts.sql'),
    'utf8',
  );
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const widgets = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'widgets.js'), 'utf8');

  assert.match(migration, /payment_receipts_delete_admin_only/);
  assert.match(migration, /only administrators can delete payment receipts/);
  assert.match(migration, /insert into public\.audit_logs/);
  assert.match(main, /async function deletePaymentReceipt/);
  assert.match(main, /rpc\('delete_payment_receipt'/);
  assert.match(widgets, /Excluir comprovante/);
  assert.match(widgets, /canViewAllLeads \? h\('button\.btn\.btn--danger'/);
});

test('opportunity conventions are optional, configurable, importable and filterable', () => {
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608280002_opportunity_conventions.sql'),
    'utf8',
  );
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const leadIo = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'lead-io.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'config', 'config.js'), 'utf8');

  assert.match(migration, /create table public\.conventions/);
  assert.match(migration, /add column convention_id uuid/);
  assert.match(migration, /p_convention_id uuid default null/);
  assert.match(migration, /conventions_admin_manage/);
  assert.match(config, /catalog: 'conventions'/);
  assert.match(leadIo, /key: 'convention', label: 'Segmento de cliente'/);
  assert.doesNotMatch(leadIo, /key: 'convention', label: 'Segmento de cliente', required: true/);
  assert.match(pipeline, /selectField\('convenio', 'Segmento de cliente'/);
  assert.match(pipeline, /kcard__convention/);
  assert.match(pipeline, /conventionId: base\.convenioId/);
});

test('lead registration number is optional and supported by spreadsheet import', () => {
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608280003_opportunity_registration.sql'),
    'utf8',
  );
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const leadIo = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'lead-io.js'), 'utf8');
  const widgets = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'widgets.js'), 'utf8');

  assert.match(migration, /add column registration_number text/);
  assert.match(migration, /p_registration_number text default null/);
  assert.match(main, /rpc\('create_opportunity_v3'/);
  assert.match(main, /opportunityMutations\.run\('update_opportunity_details_v4'/);
  assert.match(leadIo, /key: 'registration', label: 'Referência do projeto'/);
  assert.doesNotMatch(leadIo, /key: 'registration', label: 'Referência do projeto', required: true/);
  assert.match(pipeline, /'Referência do projeto'/);
  assert.match(pipeline, /registrationNumber: base\.matricula/);
  assert.match(widgets, /inputField\('matricula', 'Referência do projeto'/);
});

test('spreadsheet import accepts leads without a product', () => {
  const leadIo = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'lead-io.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202608280004_optional_import_product.sql'), 'utf8');
  assert.match(leadIo, /key: 'product', label: 'Produto', required: false/);
  assert.doesNotMatch(leadIo, /Produto obrigatorio/);
  assert.match(pipeline, /Somente nome e CPF são obrigatórios/);
  assert.match(pipeline, /produtoId: value\.product && value\.product\.id/);
  assert.match(migration, /if p_product_id is not null then/);
  assert.match(migration, /coalesce\(product_name, 'Lead'\)/);
});

test('spreadsheet import maps custom columns and divergent catalog values', () => {
  const leadIo = require(path.join(root, 'assets', 'js', 'core', 'lead-io.js'));
  const parsed = leadIo.parseCsv('SERVIDOR;CADASTRO;LOTACAO\nMaria Silva;12345678901;PREFEITURA DE RECIFE');
  const mapped = leadIo.mapColumns(parsed, ['name', 'cpf', 'convention']);
  const context = {
    products: [], banks: [], sources: [], users: [], stages: [], existing: [],
    conventions: [{ id: 'conv-recife', nome: 'PREF DE RECIFE', ativo: true }],
    defaultSource: { id: 'source-active', nome: 'Prospecção Ativa', ativo: true },
    defaultOwner: { id: 'owner-1', nome: 'Vendedor', ativo: true },
    defaultStage: { id: 'stage-1', nome: 'Lead novo', tipo: 'aberto', ativo: true },
    catalogMappings: {},
  };
  const issues = leadIo.unmatchedCatalogValues(mapped.rows, context);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].key, 'convention');
  assert.equal(issues[0].suggestedId, 'conv-recife');
  context.catalogMappings.convention = { 'prefeitura de recife': 'conv-recife' };
  const validated = leadIo.validateRows(mapped.rows, context);
  assert.deepEqual(validated[0].errors, []);
  assert.equal(validated[0].value.convention.id, 'conv-recife');
  assert.equal(validated[0].value.source.id, 'source-active');
});

test('spreadsheet import maps, reconciles and applies lead tags', () => {
  const leadIo = require(path.join(root, 'assets', 'js', 'core', 'lead-io.js'));
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const parsed = leadIo.parseCsv('Nome do cliente;CPF;Etiquetas\nMaria Silva;12345678901;Servidor | Prioridade | Servidor');
  const context = {
    products: [], conventions: [], banks: [], sources: [], users: [], existing: [],
    tags: [{ id: 'tag-priority', nome: 'Prioridade alta', cor: '#EF4444', ativo: true }],
    stages: [{ id: 'stage-1', nome: 'Lead novo', tipo: 'aberto', ativo: true }],
    defaultSource: { id: 'source-active', nome: 'Prospecção Ativa', ativo: true },
    defaultOwner: { id: 'owner-1', nome: 'Vendedor', ativo: true },
    defaultStage: { id: 'stage-1', nome: 'Lead novo', tipo: 'aberto', ativo: true },
    catalogMappings: { tag: { servidor: '__ignore__', prioridade: 'tag-priority' } },
  };

  assert.equal(parsed.mapping[2], 'tag');
  assert.deepEqual(leadIo.splitTagValues('VIP | Retorno | VIP'), ['VIP', 'Retorno']);
  assert.equal(leadIo.unmatchedCatalogValues(parsed.rows, { ...context, catalogMappings: {} }).length, 2);
  assert.equal(leadIo.unmatchedCatalogValues(parsed.rows, { ...context, catalogMappings: {} })[0].creatable, true);

  const validated = leadIo.validateRows(parsed.rows, context);
  assert.deepEqual(validated[0].errors, []);
  assert.deepEqual(validated[0].value.tags.map((tag) => tag.id), ['tag-priority']);
  assert.match(pipeline, /saveTag\(\{/);
  assert.match(pipeline, /setOpportunityTags\(\{ opportunityId: saved\.id, tagIds: base\.tags \}\)/);
  assert.match(pipeline, /text: 'Criar nova'/);
  assert.match(pipeline, /'Etiqueta'/);
});

test('the same CPF can belong to different seller portfolios', () => {
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608310002_owner_scoped_contacts.sql'),
    'utf8',
  );
  const leadIo = require(path.join(root, 'assets', 'js', 'core', 'lead-io.js'));
  const parsed = leadIo.parseCsv('Nome do cliente;CPF;Responsável\nMaria;12345678901;Vendedor B');
  const context = {
    products: [], conventions: [], banks: [], sources: [], tags: [],
    users: [{ id: 'seller-b', nome: 'Vendedor B', ativo: true }],
    stages: [{ id: 'stage-1', nome: 'Lead novo', tipo: 'aberto', ativo: true }],
    existing: [{ cpf: '12345678901', ownerId: 'seller-a', telefone: '' }],
    defaultSource: { id: 'source-active', nome: 'Prospecção Ativa', ativo: true },
    defaultOwner: { id: 'seller-a', nome: 'Vendedor A', ativo: true },
    defaultStage: { id: 'stage-1', nome: 'Lead novo', tipo: 'aberto', ativo: true },
    catalogMappings: {},
  };
  const validated = leadIo.validateRows(parsed.rows, context);

  assert.equal(validated[0].duplicate, false);
  assert.match(migration, /contacts_org_owner_cpf_unique/);
  assert.match(migration, /c\.owner_id = p_owner_id/);
  assert.doesNotMatch(migration, /set[\s\S]{0,100}owner_id = p_owner_id/);
});

test('the same CPF is importable when the registration number changes', () => {
  const leadIo = require(path.join(root, 'assets', 'js', 'core', 'lead-io.js'));
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608310003_contact_import_concurrency.sql'),
    'utf8',
  );
  const parsed = leadIo.parseCsv(
    'Nome do cliente;CPF;Matrícula\nMaria;12345678901;MAT-002',
  );
  const context = {
    products: [], conventions: [], banks: [], sources: [], tags: [], users: [],
    stages: [{ id: 'stage-1', nome: 'Lead novo', tipo: 'aberto', ativo: true }],
    existing: [{ cpf: '12345678901', matricula: 'MAT-001', ownerId: 'seller-a', telefone: '81999999999' }],
    defaultSource: { id: 'source-active', nome: 'Prospecção Ativa', ativo: true },
    defaultOwner: { id: 'seller-a', nome: 'Vendedor A', ativo: true },
    defaultStage: { id: 'stage-1', nome: 'Lead novo', tipo: 'aberto', ativo: true },
    catalogMappings: {},
  };

  const validated = leadIo.validateRows(parsed.rows, context);
  assert.equal(validated[0].duplicate, false);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /c\.owner_id = p_owner_id/);
});

test('opportunity creation and editing always send nullable product and default active prospecting source', () => {
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const widgets = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'widgets.js'), 'utf8');
  const migration = fs.readFileSync(path.join(migrationsDir, '202608280006_import_mapping_and_default_source.sql'), 'utf8');
  assert.equal((main.match(/p_product_id: payload\.productId \|\| null/g) || []).length, 2);
  assert.match(widgets, /item\.codigo === 'active_prospecting'/);
  assert.match(migration, /create trigger opportunities_default_source/);
  assert.match(migration, /source\.code = 'active_prospecting'/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});

test('ranking production sums only the total value field', () => {
  const analytics = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'analytics.js'), 'utf8');
  const ranking = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'performance', 'ranking.js'), 'utf8');

  assert.match(analytics, /var valorVendas = vendas\.reduce[\s\S]*?Number\(o\.valorTotal\)/);
  assert.doesNotMatch(analytics, /valorFinal == null \? \(o\.valorTotal/);
  assert.match(ranking, /Produção · Valor Total/);
});

test('activities prioritize urgency and require an explicit completion result', () => {
  const activities = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'atividades.js'), 'utf8');
  const components = fs.readFileSync(path.join(root, 'assets', 'css', 'components.css'), 'utf8');

  assert.match(activities, /summaryCard\('Atrasadas'/);
  assert.match(activities, /summaryCard\('Para hoje'/);
  assert.match(activities, /summaryCard\('Atividades amanhã'/);
  assert.match(activities, /summaryCard\('Futuras'/);
  assert.doesNotMatch(activities, /label: 'Ligações hoje'/);
  assert.doesNotMatch(activities, /label: 'Tempo em linha'/);
  assert.match(activities, /value: 'historico', label: 'Histórico'/);
  assert.match(activities, /placeholder: 'Buscar atividade ou lead\.\.\.'/);
  assert.match(activities, /activity-board__focus/);
  assert.match(activities, /activity-board__planning/);
  assert.match(activities, /function solicitarResultado\(a\)/);
  assert.match(activities, /Selecione o resultado da atividade/);
  assert.match(components, /\.activity-card--urgent/);
  assert.match(components, /\.activity-result-modal/);
});

test('activities keep every pending date visible beyond the next week', () => {
  const activities = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'atividades.js'), 'utf8');
  assert.match(activities, /week: \[\], future: \[\]/);
  assert.match(activities, /else grupos\.future\.push\(a\)/);
  assert.match(activities, /titulo: 'Mais adiante'/);
  assert.match(activities, /Todas as datas posteriores/);
  assert.match(activities, /grupos\.week\[0\] \|\| grupos\.future\[0\]/);
});

test('activities support Follow Up and Virada da Folha categories', () => {
  const widgets = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'widgets.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202608280005_activity_followup_and_payroll_turn.sql'), 'utf8');
  assert.match(widgets, /followup:.*label: 'Follow Up'/);
  assert.match(widgets, /virada_folha:.*label: 'Virada da Folha'/);
  assert.match(main, /virada_folha: 'payroll_turn'/);
  assert.match(app, /payroll_turn: 'virada_folha'/);
  assert.match(migration, /add value if not exists 'payroll_turn'/i);
});

test('login restores the native Supabase session without temporary office tokens', () => {
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
  const migration = fs.readFileSync(path.join(migrationsDir, '202609010002_password_session_access.sql'), 'utf8');

  assert.match(main, /function withTimeout\(task, milliseconds, message\)/);
  assert.match(main, /auth: \{ persistSession: true, autoRefreshToken: true/);
  assert.match(main, /restoreSession\(\), 45000/);
  assert.doesNotMatch(main, /signInWithOfficeCode|generateOfficeAccess|revokeOfficeAccess/);
  assert.doesNotMatch(app, /Codigo do escritorio|Codigo temporario/);
  assert.doesNotMatch(migration, /has_valid_office_session/);
  assert.match(migration, /member\.user_id = auth\.uid\(\)[\s\S]*member\.active/);
  assert.match(main, /O acesso demorou mais que o esperado/);
});

test('page modules are loaded on demand instead of blocking login', () => {
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
  const eagerBlock = main.slice(main.indexOf('const coreScripts = ['), main.indexOf('const pageScripts = {'));

  assert.match(main, /const pageScripts = \{/);
  assert.match(main, /crmPipeline: 'assets\/js\/pages\/crm\/pipeline\.js'/);
  assert.match(main, /window\.AGIR_LOAD_PAGE_SCRIPT/);
  assert.match(main, /'assets\/js\/pages\/performance\/equipe\.js'[\s\S]*?'assets\/js\/pages\/crm\/metas\.js'[\s\S]*?'assets\/js\/pages\/config\/config\.js'/);
  assert.doesNotMatch(eagerBlock, /pages\/crm\/pipeline\.js/);
  assert.doesNotMatch(eagerBlock, /pages\/crm\/dashboard\.js/);
  assert.doesNotMatch(eagerBlock, /pages\/performance\/ranking\.js/);
  assert.match(app, /Promise\.all\(\[global\.AGIR_LOAD_PAGE_SCRIPT\(key\), ensurePageData\(key, ctx\)\]\)\.then/);
});

test('pipeline indexes joins and pending activities once per render', () => {
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const analytics = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'analytics.js'), 'utf8');

  assert.match(pipeline, /function buildRenderCache\(\)/);
  assert.match(pipeline, /nextActivities\[key\]/);
  assert.match(pipeline, /S\(\)\.indexBy\('produtos'\)/);
  assert.match(pipeline, /var proxima = nextActivity \? nextActivity\.activity : null/);
  assert.doesNotMatch(pipeline, /S\(\)\.get\('atividades'\)[\s\S]{0,120}\.filter/);
  assert.match(analytics, /var groups = Object\.create\(null\)/);
  assert.match(analytics, /group\.itens\.push\(o\)/);
});

test('notifications are private, persistent and generated from CRM events', () => {
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608310001_notifications_and_realtime.sql'),
    'utf8',
  );
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'notifications.js'), 'utf8');

  assert.match(migration, /create table public\.notifications/);
  assert.match(migration, /recipient_id = auth\.uid\(\)/);
  assert.match(migration, /grant update \(read_at\) on public\.notifications to authenticated/);
  assert.match(migration, /opportunity_messages_notify_people/);
  assert.match(migration, /opportunity_history_notify_owner/);
  assert.match(migration, /activities_notify_opportunity_owner/);
  assert.match(migration, /payment_receipts_notify_opportunity_owner/);
  assert.match(main, /async function markAllNotificationsRead/);
  assert.match(app, /path: '\/notifications', label: 'Notificações'/);
  assert.match(page, /Marcar todas como lidas/);
  assert.match(page, /\/crm\/pipeline\?lead=/);
});

test('pipeline applies realtime deltas and keeps full snapshots as a throttled recovery', () => {
  const migration = fs.readFileSync(
    path.join(migrationsDir, '202608310001_notifications_and_realtime.sql'),
    'utf8',
  );
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');

  assert.match(migration, /alter publication supabase_realtime add table/);
  assert.match(main, /client\.channel\(`ascensao-workspace:/);
  assert.match(main, /loadCrmRealtimeSnapshot/);
  assert.match(main, /emit\('opportunities'\)/);
  assert.match(app, /function applyCrmRealtimeDelta/);
  assert.match(app, /lastCrmFullSyncAt < 300000/);
  assert.match(app, /realtimeStatus === 'SUBSCRIBED'/);
  assert.match(app, /function scheduleCrmRefresh/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /CustomEvent\('ascensao:crm-refreshed', \{ detail:/);
  assert.match(pipeline, /addEventListener\('ascensao:crm-refreshed'/);
  assert.match(pipeline, /function reconcileBoard\(/);
});

test('page navigation disposes charts, observers and ranking timers', () => {
  const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
  const charts = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'charts.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'ui.js'), 'utf8');
  const ranking = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'performance', 'ranking.js'), 'utf8');

  assert.match(app, /AGIR\.onPageDispose = function/);
  assert.match(app, /function disposeCurrentPage\(\)/);
  assert.match(charts, /AGIR\.onPageDispose\(controller\.destroy\)/);
  assert.match(ui, /AGIR\.onPageDispose\(function \(\) \{ ro\.disconnect\(\); \}\)/);
  assert.match(ranking, /global\.clearInterval\(refreshTimer\)/);
  assert.match(ranking, /disposed \|\| !node\.isConnected/);
});

test('migrations are ordered and transactionally closed', () => {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(files.length >= 14, 'expected the complete migration set');
  assert.equal(new Set(files.map((name) => name.slice(0, 12))).size, files.length);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    assert.match(sql, /^begin;/i, `${file} must start a transaction`);
    assert.match(sql, /commit;\s*$/i, `${file} must commit its transaction`);
  }
});

test('every public table is covered by RLS', () => {
  const sql = walk(migrationsDir, '.sql').map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const tables = [...sql.matchAll(/create table public\.([a-z_]+)/gi)].map((match) => match[1]);
  const rls = new Set([
    ...[...sql.matchAll(/alter table public\.([a-z_]+)\s+(?:enable|force) row level security/gi)].map((match) => match[1]),
    ...[...sql.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]),
  ]);
  assert.deepEqual(tables.filter((table) => !rls.has(table)), []);
});

test('service role is isolated from browser code', () => {
  const browserSource = walk(path.join(root, 'assets'), '.js')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  assert.doesNotMatch(browserSource, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i);

  const functionFiles = walk(path.join(root, 'supabase', 'functions'), '.ts');
  const serviceRoleUsers = functionFiles.filter((file) =>
    /SUPABASE_SERVICE_ROLE_KEY/.test(fs.readFileSync(file, 'utf8')),
  );
  assert.deepEqual(serviceRoleUsers.map((file) => path.relative(root, file).replaceAll('\\', '/')), [
    'supabase/functions/_shared/auth.ts',
  ]);
});

test('each Edge Function has JWT verification configured', () => {
  const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
  for (const name of ['invite-user', 'manage-user']) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\][\\s\\S]*?verify_jwt\\s*=\\s*true`));
  }
  assert.doesNotMatch(config, /office-access/);
  assert.equal(fs.existsSync(path.join(root, 'supabase', 'functions', 'office-access', 'index.ts')), false);
});

test('legacy temporary office access is removed from the production schema', () => {
  const cleanup = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202609010003_remove_office_access.sql'), 'utf8');
  assert.match(cleanup, /drop table if exists public\.office_access_sessions/i);
  assert.match(cleanup, /drop table if exists public\.office_access_codes/i);
  assert.match(cleanup, /drop function if exists app_private\.has_valid_office_session/i);
});

test('user provisioning uses an administrator-defined password without browser callbacks', () => {
  const invite = fs.readFileSync(path.join(root, 'supabase', 'functions', 'invite-user', 'index.ts'), 'utf8');
  const http = fs.readFileSync(path.join(root, 'supabase', 'functions', '_shared', 'http.ts'), 'utf8');
  const userUi = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'performance', 'equipe.js'), 'utf8');

  assert.match(invite, /createUser\(\{/);
  assert.match(invite, /initialPassword = password\(payload\.initialPassword\)/);
  assert.match(invite, /deliveryMode\s*=\s*"password"/);
  assert.doesNotMatch(invite, /\/auth\/callback/);
  assert.match(http, /new URL\(value\)\.origin/);
  assert.match(userUi, /initialPassword: dados\.senhaInicial/);
  assert.match(userUi, /Redefinir senha/);
  assert.doesNotMatch(userUi, /generateOfficeAccess|officeCodeModal/);
});

test('users configuration recognizes every production admin representation', () => {
  const config = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'config', 'config.js'), 'utf8');
  assert.match(config, /S\(\)\.get\('session\.role'\)/);
  assert.match(config, /current\.cargoId === 'role_admin'/);
});

test('lazy pages receive shared form and debounce utilities from the core bundle', () => {
  const dom = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'dom.js'), 'utf8');
  assert.match(dom, /AGIR\.util\.deb = deb/);
  assert.match(dom, /AGIR\.util\.campo = campo/);
  assert.match(dom, /AGIR\.util\.baixarCSV = baixarCSV/);
});

test('administrators can transfer selected leads in one database operation', () => {
  const userUi = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  const migration = fs.readFileSync(path.join(migrationsDir, '202609010001_crm_bulk_operations_and_realtime.sql'), 'utf8');
  assert.match(userUi, /Atribuir responsavel em massa/);
  assert.match(userUi, /Mudar funil em massa/);
  assert.match(userUi, /bulkUpdateOpportunities/);
  assert.match(main, /client\.rpc\('bulk_update_opportunities'/);
  assert.match(migration, /create or replace function public\.bulk_update_opportunities/);
  assert.match(migration, /Somente administradores podem alterar leads em massa/);
});

test('CRM money remains exact and modification dates are filterable', () => {
  const format = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'format.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'pipeline.js'), 'utf8');
  const analytics = fs.readFileSync(path.join(root, 'assets', 'js', 'core', 'analytics.js'), 'utf8');
  const goals = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'crm', 'metas.js'), 'utf8');
  assert.match(format, /function moneyShort\(v\) \{\s*return money\(v\)/);
  assert.match(pipeline, /Modificado a partir de/);
  assert.match(pipeline, /modinicio: fields\.modinicio\.value/);
  assert.match(analytics, /o\.atualizadoEm \|\| o\.criadoEm/);
  assert.match(goals, /var totalCentavos = Math\.round\(total \* 100\)/);
  assert.doesNotMatch(goals, /\/ 1000\) \* 1000/);
});

test('realtime avoids full reload polling and backs off after Supabase failures', () => {
  const app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
  assert.match(app, /realtimeStatus === 'SUBSCRIBED'/);
  assert.match(app, /nextSnapshotAllowedAt/);
  assert.match(app, /Math\.min\(300000, 15000 \* Math\.pow\(2, snapshotFailures - 1\)\)/);
  assert.match(main, /async function queryCommercialKeys[\s\S]*?runQueryBatches\(keys\.map/);
  assert.match(main, /async function loadCrmRealtimeSnapshot[\s\S]*?queryCommercialKeys\(organizationId/);
});

test('ranking celebrates newly received sales', () => {
  const ranking = fs.readFileSync(path.join(root, 'assets', 'js', 'pages', 'performance', 'ranking.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets', 'css', 'components.css'), 'utf8');
  assert.match(ranking, /function celebrateSale/);
  assert.match(ranking, /NOVA VENDA NO PLACAR/);
  assert.match(ranking, /Estorno Solicitado/);
  assert.match(css, /\.ranking-sale-celebration/);
});
