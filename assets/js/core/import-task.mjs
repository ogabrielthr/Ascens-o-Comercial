// One short-lived, read-only worker per preparation. Never submits CRM writes.
export function createImportTask(createWorker, timeoutMs = 15000) {
  let pending = null;
  return {
    run(method, args) {
      if (pending) return Promise.reject(new Error('Aguarde a preparação atual.'));
      return new Promise((resolve, reject) => {
        let worker;
        try { worker = createWorker(); } catch (error) { reject(error); return; }
        let settled = false;
        const finish = (error, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer); worker.terminate(); pending = null;
          if (error) reject(error); else resolve(result);
        };
        const timer = setTimeout(() => finish(new Error('A preparação demorou demais. Tente uma planilha menor.')), timeoutMs);
        pending = () => finish(new DOMException('Preparação cancelada.', 'AbortError'));
        worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.result);
        worker.onerror = () => finish(new Error('Não foi possível preparar a planilha. Atualize a página e tente novamente.'));
        worker.onmessageerror = worker.onerror;
        try { worker.postMessage({ method, args }); } catch (error) { finish(error); }
      });
    },
    cancel() { if (pending) pending(); }
  };
}
