// Read-only reconciliation: a complete access manifest, then changed payloads.
// A timestamp cursor alone cannot detect DELETE or loss of RLS visibility.
export async function readCollectionDelta({ read, known = [], signal, batchSize = 150 }) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 150) throw new Error('Lote de reconciliação inválido.');
  const check = () => { if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError'); };
  check();
  const manifest = await read('id,updated_at', null);
  check();
  const revisions = new Map(known.map(row => [row.id, row.updated_at]));
  const ids = new Set();
  const changed = [];
  for (const row of manifest) {
    if (!row.id || ids.has(row.id)) throw new Error('Manifesto de sincronização inválido.');
    ids.add(row.id);
    if (!row.updated_at || !revisions.get(row.id) || revisions.get(row.id) !== row.updated_at) changed.push(row.id);
  }
  const rows = [];
  for (let start = 0; start < changed.length; start += batchSize) {
    check();
    const batch = changed.slice(start, start + batchSize), requested = new Set(batch);
    const current = await read('*', batch);
    check();
    const returned = new Set();
    for (const row of current) {
      if (!requested.has(row.id) || returned.has(row.id)) throw new Error('Resposta de sincronização inválida.');
      returned.add(row.id); rows.push(row);
    }
    // A changed row may have been deleted/transferred since the manifest.
    for (const id of batch) if (!returned.has(id)) ids.delete(id);
  }
  return { ids: [...ids], rows };
}
