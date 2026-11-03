// One mutation per lead, shared by the drawer, board and bulk actions.
// A failed write is NEVER queued or replayed, even after refreshing its version.
export function isBusinessConflict(error) {
  return error?.code === 'PT409' || (error?.code === '40001' &&
    /^(opportunity|financial entry) changed by another user$/i.test((error.message || '').trim()));
}

const failure = (code, message) => Object.assign(new Error(message), { code });
const conflictMessage = 'Este lead foi alterado por outra pessoa. Confira os dados atualizados e escolha novamente a ação desejada.';

export function createOpportunityMutations({ write, read, onReconciled = () => {}, timeoutMs = 20000 }) {
  const pending = new Set();
  const versions = new Map();
  const rejectedVersions = new Map();
  const uncertain = new Set();
  const consecutiveFailures = new Map();

  function remember(id, version) {
    if (!Number.isInteger(version)) return;
    const known = Math.max(version, versions.get(id) || 0);
    versions.delete(id);
    versions.set(id, known);
    // No persistent storage of CRM data and no unbounded per-session cache.
    if (versions.size > 1000) versions.delete(versions.keys().next().value);
  }

  async function bounded(task) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => task(controller.signal)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(failure('MUTATION_TIMEOUT', 'A conexão demorou. Não foi possível confirmar a alteração. Confira o estado do lead antes de tentar novamente.'));
            controller.abort();
          }, timeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async function reconcile(id) {
    try {
      const row = await bounded(signal => read(id, signal));
      if (row) remember(id, row.version);
      uncertain.delete(id);
      onReconciled({ opportunityId: id, row, reconciled: true });
      return true;
    } catch {
      onReconciled({ opportunityId: id, reconciled: false });
      return false;
    }
  }

  async function run(name, args) {
    const id = args.p_opportunity_id;
    const version = args.p_expected_version;
    if (!id || !Number.isInteger(version) || version < 1) {
      throw failure('INVALID_VERSION', 'A versão deste lead não está disponível. Reabra o lead antes de alterar.');
    }
    if (pending.has(id)) {
      throw failure('OPERATION_IN_PROGRESS', 'Já existe uma alteração em andamento neste lead. Aguarde a conclusão.');
    }
    if ((consecutiveFailures.get(id) || 0) >= 3) {
      throw failure('CIRCUIT_OPEN', 'Este registro teve três falhas consecutivas. Recarregue para ver a versão atual antes de tentar novamente.');
    }
    pending.add(id);
    try {
      // A timeout can mean the server committed but its response was lost.
      // A later explicit attempt only reads first; it does not resend the write.
      if (uncertain.has(id)) {
        const refreshed = await reconcile(id);
        throw failure('REVIEW_REQUIRED', refreshed
          ? 'Os dados foram consultados novamente. Confira o estado do lead antes de repetir a ação.'
          : 'Ainda não foi possível consultar este lead. Aguarde a conexão voltar. Nenhuma nova alteração foi enviada.');
      }
      if (version < (versions.get(id) || 0) || rejectedVersions.get(id) === version) {
        const refreshed = await reconcile(id);
        throw failure('PT409', refreshed ? conflictMessage : conflictMessage + ' A atualização dos dados está indisponível; reabra o lead quando a conexão voltar.');
      }
      try {
        const row = await bounded(signal => write(name, args, signal));
        remember(id, row?.opportunity?.version ?? row?.version);
        consecutiveFailures.delete(id);
        return row;
      } catch (error) {
        const business = isBusinessConflict(error);
        if (!business) uncertain.add(id);
        const refreshed = await reconcile(id);
        if (business) {
          // Remember the rejected version even if the refresh failed. Never
          // submit that stale version again in this browser session.
          rejectedVersions.set(id, version);
          if (rejectedVersions.size > 1000) rejectedVersions.delete(rejectedVersions.keys().next().value);
          throw Object.assign(failure('PT409', conflictMessage + (refreshed ? '' : ' Não foi possível atualizar os dados agora; reabra o lead quando a conexão voltar.')), { cause: error });
        }
        // Keep uncertain outcomes gated even if a read immediately after an
        // abort still showed the old version; abort is not server cancellation.
        if (!error?.code || ['MUTATION_TIMEOUT', '40001'].includes(error.code)) uncertain.add(id);
        if (uncertain.size > 1000) uncertain.delete(uncertain.values().next().value);
        if (error?.code === '40001') {
          throw Object.assign(failure('40001', 'O banco encontrou uma falha transitória de concorrência. A operação não foi repetida. Confira os dados e tente novamente mais tarde.'), { cause: error });
        }
        throw error;
      }
    } catch (error) {
      consecutiveFailures.set(id, (consecutiveFailures.get(id) || 0) + 1);
      if (consecutiveFailures.size > 1000) consecutiveFailures.delete(consecutiveFailures.keys().next().value);
      throw error;
    } finally { pending.delete(id); }
  }
  async function refresh(id) {
    if (pending.has(id)) throw failure('OPERATION_IN_PROGRESS', 'Aguarde a alteração em andamento.');
    pending.add(id);
    try {
      const refreshed = await reconcile(id);
      if (refreshed) consecutiveFailures.delete(id);
      return refreshed;
    } finally { pending.delete(id); }
  }
  return { run, refresh };
}
