import './lead-io.js';

self.onmessage = ({ data }) => {
  try {
    if (!['parseCsv', 'unmatchedCatalogValues', 'validateRows'].includes(data.method)) throw new Error('Operação de preparação inválida.');
    self.postMessage({ result: self.AGIR.leadIO[data.method](...data.args) });
  } catch (error) {
    self.postMessage({ error: error.message || 'Falha ao preparar a planilha.' });
  }
};
