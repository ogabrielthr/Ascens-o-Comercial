const LEASE_MS = 12000;
const HEARTBEAT_MS = 4000;

function safeParse(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

export function createWorkspaceLeader({
  scope,
  storage = globalThis.localStorage,
  BroadcastChannelCtor = globalThis.BroadcastChannel,
  eventTarget = globalThis,
  documentRef = globalThis.document,
  now = () => Date.now(),
  setIntervalFn = globalThis.setInterval.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval.bind(globalThis),
  randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  leaseMs = LEASE_MS,
  heartbeatMs = HEARTBEAT_MS,
} = {}) {
  if (!scope) throw new TypeError('Escopo de coordenacao obrigatorio.');
  const id = randomId();
  const leaseKey = `ascensao:workspace-leader:${scope}`;
  const listeners = new Set();
  const leadershipListeners = new Set();
  let leader = false;
  let disposed = false;
  let channel = null;

  try { if (BroadcastChannelCtor) channel = new BroadcastChannelCtor(`ascensao:workspace:${scope}`); }
  catch { channel = null; }

  function readLease() {
    try { return safeParse(storage?.getItem(leaseKey)); } catch { return null; }
  }

  function writeLease() {
    try {
      storage?.setItem(leaseKey, JSON.stringify({ id, expiresAt: now() + leaseMs }));
      return readLease()?.id === id;
    } catch {
      // Sem localStorage nao existe coordenacao confiavel: esta aba trabalha
      // isoladamente e preserva a funcionalidade existente.
      return true;
    }
  }

  function setLeader(next) {
    if (leader === next || disposed) return;
    leader = next;
    leadershipListeners.forEach((listener) => listener(leader));
  }

  function release() {
    if (!leader) return;
    try {
      if (readLease()?.id === id) storage?.removeItem(leaseKey);
    } catch { /* best effort */ }
    setLeader(false);
    try { channel?.postMessage({ source: id, type: 'leader-released' }); } catch { /* best effort */ }
  }

  function evaluate() {
    if (disposed) return;
    if (!channel) {
      setLeader(true);
      return;
    }
    if (documentRef?.hidden) {
      release();
      return;
    }
    const lease = readLease();
    if (!lease || lease.id === id || Number(lease.expiresAt) <= now()) setLeader(writeLease());
    else setLeader(false);
  }

  function onStorage(event) {
    if (event?.key === leaseKey) evaluate();
  }
  function onVisibility() { evaluate(); }
  function onMessage(event) {
    const message = event?.data;
    if (!message || message.source === id || typeof message.type !== 'string') return;
    if (message.type === 'leader-released') evaluate();
    listeners.forEach((listener) => listener(message));
  }

  if (channel) channel.addEventListener('message', onMessage);
  eventTarget?.addEventListener?.('storage', onStorage);
  documentRef?.addEventListener?.('visibilitychange', onVisibility);
  evaluate();
  const timer = setIntervalFn(evaluate, heartbeatMs);

  return {
    id,
    isLeader: () => leader,
    onLeadership(listener) {
      if (typeof listener !== 'function') return () => {};
      leadershipListeners.add(listener);
      listener(leader);
      return () => leadershipListeners.delete(listener);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    broadcast(type, payload) {
      if (!leader || disposed || !channel) return false;
      channel.postMessage({ source: id, type, payload });
      return true;
    },
    dispose() {
      if (disposed) return;
      release();
      disposed = true;
      clearIntervalFn(timer);
      eventTarget?.removeEventListener?.('storage', onStorage);
      documentRef?.removeEventListener?.('visibilitychange', onVisibility);
      if (channel) {
        channel.removeEventListener('message', onMessage);
        channel.close();
      }
      listeners.clear();
      leadershipListeners.clear();
    },
  };
}
