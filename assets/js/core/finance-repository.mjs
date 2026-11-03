/** Remote finance persistence. Authentication and organization permissions are enforced by PostgreSQL. */
export class FinanceRepositoryError extends Error {
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = 'FinanceRepositoryError';
    this.code = code;
  }
}

function remoteError(error) {
  if (error instanceof FinanceRepositoryError) return error;
  const code = String(error?.code || '');
  const message = String(error?.message || 'Falha de comunicação com o banco financeiro.');
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) {
    return new FinanceRepositoryError('O banco conectado ainda não possui a atualização do Financeiro. Aplique a migração 202610280001_finance_workspace.sql antes de continuar.', 'FINANCE_MIGRATION_REQUIRED', error);
  }
  if (['PT409', '40001'].includes(code)) {
    return new FinanceRepositoryError('O Financeiro foi alterado em outra sessão. Recarregue os dados e refaça esta operação.', 'FINANCE_CONFLICT', error);
  }
  if (['42501', 'PGRST301', 'PGRST302'].includes(code)) {
    return new FinanceRepositoryError('Seu acesso ao Financeiro não foi autorizado. Entre com um usuário administrador ou financeiro ativo desta empresa.', 'FINANCE_ACCESS_DENIED', error);
  }
  return new FinanceRepositoryError(message, code || 'FINANCE_REMOTE_ERROR', error);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new FinanceRepositoryError('O navegador precisa oferecer geração segura de identificadores.', 'FINANCE_CRYPTO_REQUIRED');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireClient(client, organizationId) {
  if (!client || typeof client.rpc !== 'function' || !uuidPattern.test(String(organizationId || ''))) {
    throw new FinanceRepositoryError('A conexão financeira exige um cliente autenticado e uma empresa válida.', 'FINANCE_CONFIGURATION_REQUIRED');
  }
}

async function readTable(client, organizationId, table) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    let query = client.from(table).select('*').eq('organization_id', organizationId);
    if (table !== 'budgets') query = query.is('deleted_at', null);
    const result = await query.order('id', { ascending: true }).range(start, start + 999);
    if (result.error) throw remoteError(result.error);
    if (!Array.isArray(result.data)) throw new FinanceRepositoryError('O banco retornou dados financeiros inválidos.', 'FINANCE_INVALID_RESPONSE');
    rows.push(...result.data);
    if (rows.length > 50000) throw new FinanceRepositoryError('A importação inicial excede 50 mil registros por cadastro. Faça a migração administrativa dos dados.', 'FINANCE_IMPORT_LIMIT');
    if (result.data.length < 1000) return rows;
  }
}

/** Converts remote legacy tables to the previous application format, which the v2 engine migrates. */
export async function loadLegacyFinanceData({ client, organizationId }) {
  requireClient(client, organizationId);
  const results = await Promise.allSettled(['chart_of_accounts', 'cost_centers', 'financial_entries', 'budgets'].map(table => readTable(client, organizationId, table)));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  const [accounts, centers, entries, budgets] = results.map(result => result.value);
  const type = value => value === 'revenue' ? 'receita' : 'despesa';
  const status = { draft: 'rascunho', scheduled: 'previsto', pending_approval: 'pendente', realized: 'realizado', cancelled: 'cancelado', reversed: 'estornado' };
  return {
    planoContas: accounts.map(row => ({ id: row.id, codigo: row.code, nome: row.name, tipo: type(row.entry_type), grupo: row.group_name, ativo: row.active })),
    centrosCusto: centers.map(row => ({ id: row.id, codigo: row.code, nome: row.name, ativo: row.active })),
    lancamentos: entries.map(row => ({ id: row.id, tipo: type(row.entry_type), contaId: row.account_id, centroId: row.cost_center_id, descricao: row.description, valor: Number(row.amount), data: row.entry_date, vencimento: row.entry_date, competencia: String(row.competence).slice(0, 7), status: status[row.status] || row.status, oportunidadeId: row.opportunity_id, usuarioId: row.beneficiary_user_id, referenciaExterna: row.external_reference, origem: 'migracao-legado' })),
    orcamento: budgets.map(row => ({ id: row.id, contaId: row.account_id, centroId: row.cost_center_id, competencia: String(row.competence).slice(0, 7), valor: Number(row.amount) }))
  };
}

export function createFinanceRepository({ client, organizationId, userId } = {}) {
  requireClient(client, organizationId);
  // userId is descriptive context only; it is never sent as the authoritative audit actor.
  if (userId != null && !uuidPattern.test(String(userId))) throw new FinanceRepositoryError('A sessão financeira não possui um usuário válido.', 'FINANCE_CONFIGURATION_REQUIRED');
  async function rpc(name, args) {
    try {
      const result = await client.rpc(name, args);
      if (result.error) throw result.error;
      if (result.data !== null && (typeof result.data !== 'object' || Array.isArray(result.data) || result.data.schemaVersion !== 2 || !Number.isSafeInteger(result.data.revision))) {
        throw new FinanceRepositoryError('O banco retornou uma versão financeira inválida. Recarregue a aplicação.', 'FINANCE_INVALID_RESPONSE');
      }
      return result.data;
    } catch (error) { throw remoteError(error); }
  }
  return Object.freeze({
    mode: 'supabase',
    organizationId,
    load: () => rpc('finance_workspace_load', { p_organization_id: organizationId }),
    loadLegacy: () => loadLegacyFinanceData({ client, organizationId }),
    async save(state, { expectedRevision, requestId: suppliedRequestId } = {}) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new FinanceRepositoryError('A revisão financeira é obrigatória para salvar com segurança.', 'FINANCE_REVISION_REQUIRED');
      const id = suppliedRequestId || requestId();
      if (!uuidPattern.test(id)) throw new FinanceRepositoryError('Identificador de operação inválido.', 'FINANCE_INVALID_REQUEST');
      // Do not optimistically mutate local data; the engine commits only this confirmed result.
      const payload = { ...state, auditoria: [] };
      const saved = await rpc('finance_workspace_save', { p_organization_id: organizationId, p_state: payload, p_expected_revision: expectedRevision, p_request_id: id });
      if (!saved) throw new FinanceRepositoryError('O banco não confirmou o salvamento financeiro.', 'FINANCE_INVALID_RESPONSE');
      return saved;
    }
  });
}
