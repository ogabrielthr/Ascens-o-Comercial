/* ========================================================================== 
   AGIR - Importacao, exportacao e deduplicacao de oportunidades
   CSV UTF-8 compativel com Excel e Google Planilhas, sem dependencias.
   ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.AGIR = root.AGIR || {};
    root.AGIR.leadIO = api;
  }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var COLUMNS = [
    { key: 'name', label: 'Nome do cliente', required: true, aliases: ['nome', 'cliente', 'nome cliente'] },
    { key: 'phone', label: 'Telefone', required: false, aliases: ['celular', 'whatsapp', 'telefone celular'] },
    { key: 'cpf', label: 'CPF', required: true, aliases: ['documento'] },
    { key: 'product', label: 'Produto', required: false, aliases: ['produto servico'] },
    { key: 'convention', label: 'Segmento de cliente', aliases: ['convenio', 'segmento', 'orgao', 'órgão', 'regime'] },
    { key: 'registration', label: 'Referência do projeto', aliases: ['matricula', 'numero da matricula', 'número da matrícula'] },
    { key: 'tag', label: 'Etiqueta', aliases: ['etiquetas', 'tag', 'tags', 'marcador'] },
    { key: 'bank', label: 'Parceiro de execução', aliases: ['banco', 'parceiro', 'instituicao financeira'] },
    { key: 'source', label: 'Origem', aliases: ['fonte', 'origem do lead', 'fonte do lead'] },
    { key: 'owner', label: 'Responsável', aliases: ['responsavel', 'vendedor', 'usuario responsavel', 'e-mail do responsavel'] },
    { key: 'stage', label: 'Etapa', aliases: ['etapa inicial', 'fase'] },
    { key: 'initialValue', label: 'Valor Inicial', aliases: ['valor', 'valor inicial r$'] },
    { key: 'totalValue', label: 'Valor Total', aliases: ['valor total proposta estorno', 'proposta estorno'] },
    { key: 'finalValue', label: 'Valor Final', aliases: ['valor final tabela gerencial', 'tabela gerencial'] },
    { key: 'requestedReversal', label: 'Estorno solicitado', aliases: ['estorno', 'valor estorno'] },
    { key: 'notes', label: 'Observações', aliases: ['observacoes', 'observacao', 'observação', 'notas'] }
  ];

  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9@.]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function digits(value, max) {
    var out = String(value == null ? '' : value).replace(/\D/g, '');
    return max ? out.slice(0, max) : out;
  }

  function parseMoney(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    var clean = raw.replace(/R\$/gi, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    if (!clean || clean === '-') return NaN;
    var comma = clean.lastIndexOf(',');
    var dot = clean.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      if (comma > dot) clean = clean.replace(/\./g, '').replace(',', '.');
      else clean = clean.replace(/,/g, '');
    } else if (comma >= 0) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (dot >= 0) {
      var decimals = clean.length - dot - 1;
      if (decimals > 2 || clean.indexOf('.') !== dot) clean = clean.replace(/\./g, '');
    }
    var number = Number(clean);
    return Number.isFinite(number) && number >= 0 ? number : NaN;
  }

  function countDelimiter(line, delimiter) {
    var quoted = false, count = 0;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (quoted && line[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && line[i] === delimiter) count++;
    }
    return count;
  }

  function detectDelimiter(text) {
    var first = String(text || '').split(/\r?\n/).find(function (line) { return line.trim(); }) || '';
    return [';', ',', '\t'].sort(function (a, b) {
      return countDelimiter(first, b) - countDelimiter(first, a);
    })[0];
  }

  function splitCsv(text, delimiter) {
    var rows = [], row = [], cell = '', quoted = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < text.length; i++) {
      var char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(cell); cell = ''; }
      else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += char;
    }
    row.push(cell.replace(/\r$/, ''));
    if (row.some(function (item) { return String(item).trim(); })) rows.push(row);
    return rows;
  }

  function aliasIndex() {
    var map = Object.create(null);
    COLUMNS.forEach(function (column) {
      [column.label].concat(column.aliases || []).forEach(function (alias) { map[normalize(alias)] = column.key; });
    });
    return map;
  }

  function mapColumns(parsed, mapping) {
    parsed = parsed || {};
    var keys = (mapping || parsed.mapping || []).slice();
    var present = Object.create(null);
    keys.forEach(function (key) { if (key) present[key] = true; });
    var missingHeaders = COLUMNS.filter(function (column) { return column.required && !present[column.key]; })
      .map(function (column) { return column.label; });
    var rows = (parsed.dataRows || []).map(function (cells, index) {
      var values = {};
      keys.forEach(function (key, cellIndex) {
        if (key) values[key] = String(cells[cellIndex] == null ? '' : cells[cellIndex]).trim();
      });
      return { line: index + 2, values: values };
    }).filter(function (row) {
      return Object.keys(row.values).some(function (key) { return row.values[key] !== ''; });
    });
    return {
      rows: rows, missingHeaders: missingHeaders, delimiter: parsed.delimiter,
      headers: parsed.headers || [], dataRows: parsed.dataRows || [], mapping: keys
    };
  }

  function parseCsv(text) {
    var delimiter = detectDelimiter(text);
    var matrix = splitCsv(text, delimiter);
    if (!matrix.length) return mapColumns({ headers: [], dataRows: [], delimiter: delimiter }, []);
    var aliases = aliasIndex();
    var headers = matrix[0].map(function (header) { return String(header == null ? '' : header).trim(); });
    var used = Object.create(null);
    var mapping = headers.map(function (header) {
      var key = aliases[normalize(header)] || null;
      if (key && used[key]) return null;
      if (key) used[key] = true;
      return key;
    });
    return mapColumns({ headers: headers, dataRows: matrix.slice(1), delimiter: delimiter }, mapping);
  }

  function catalogMap(items, includeEmail) {
    var map = Object.create(null);
    (items || []).forEach(function (item) {
      if (item.ativo === false) return;
      [item.nome, item.codigo, includeEmail && item.email].filter(Boolean).forEach(function (value) {
        map[normalize(value)] = item;
      });
    });
    return map;
  }

  function splitTagValues(value) {
    var seen = Object.create(null);
    return String(value == null ? '' : value).split('|').map(function (item) { return item.trim(); })
      .filter(function (item) {
        var key = normalize(item);
        if (!key || seen[key]) return false;
        seen[key] = true;
        return true;
      });
  }

  function activeCatalogItems(context, key) {
    var source = {
      product: context.products, convention: context.conventions, bank: context.banks,
      source: context.sources, owner: context.users, tag: context.tags,
      stage: (context.stages || []).filter(function (item) { return item.tipo === 'aberto'; })
    }[key] || [];
    return source.filter(function (item) { return item.ativo !== false; });
  }

  function tokenSimilarity(left, right) {
    var a = normalize(left).split(' ').filter(Boolean);
    var b = normalize(right).split(' ').filter(Boolean);
    if (!a.length || !b.length) return 0;
    var matches = 0, used = Object.create(null);
    a.forEach(function (word) {
      var index = b.findIndex(function (candidate, candidateIndex) {
        if (used[candidateIndex]) return false;
        return word === candidate || (Math.min(word.length, candidate.length) >= 4 &&
          (word.indexOf(candidate) === 0 || candidate.indexOf(word) === 0));
      });
      if (index >= 0) { used[index] = true; matches++; }
    });
    return (2 * matches) / (a.length + b.length);
  }

  function bestCatalogMatch(value, items, includeEmail) {
    var best = null, bestScore = 0;
    (items || []).forEach(function (item) {
      [item.nome, item.codigo, includeEmail && item.email].filter(Boolean).forEach(function (candidate) {
        var score = tokenSimilarity(value, candidate);
        if (score > bestScore) { best = item; bestScore = score; }
      });
    });
    return bestScore >= 0.55 ? best : null;
  }

  function mappingDecision(context, key, raw) {
    var mappings = (context.catalogMappings || {})[key] || {};
    return mappings[normalize(raw)];
  }

  function resolveCatalog(context, key, raw, includeEmail) {
    if (!raw) return null;
    var cacheKey = key + (includeEmail ? ':email' : '');
    var cache = context._catalogIndexes;
    var index = cache && cache[cacheKey];
    if (!index) {
      var items = activeCatalogItems(context, key);
      var byId = Object.create(null);
      items.forEach(function (item) { byId[item.id] = item; });
      index = { byId: byId, names: catalogMap(items, includeEmail) };
      if (cache) cache[cacheKey] = index;
    }
    var decision = mappingDecision(context, key, raw);
    if (decision === '__ignore__') return null;
    if (decision) return index.byId[decision] || null;
    return index.names[normalize(raw)] || null;
  }

  function unmatchedCatalogValues(rows, context) {
    context = Object.assign({}, context || {}, { _catalogIndexes: Object.create(null) });
    var fields = [
      { key: 'product', label: 'Produto' }, { key: 'convention', label: 'Segmento de cliente' },
      { key: 'bank', label: 'Parceiro de execução' }, { key: 'source', label: 'Origem' },
      { key: 'owner', label: 'Responsável', includeEmail: true }, { key: 'stage', label: 'Etapa' },
      { key: 'tag', label: 'Etiqueta', multiple: true }
    ];
    var seen = Object.create(null), issues = [];
    (rows || []).forEach(function (entry) {
      fields.forEach(function (field) {
        var cell = String((entry.values || {})[field.key] || '').trim();
        var values = field.multiple ? splitTagValues(cell) : [cell];
        values.forEach(function (raw) {
          var normalized = normalize(raw);
          var token = field.key + ':' + normalized;
          if (!raw || seen[token] || mappingDecision(context, field.key, raw) ||
              resolveCatalog(context, field.key, raw, field.includeEmail)) return;
          seen[token] = true;
          var options = activeCatalogItems(context, field.key);
          var suggestion = bestCatalogMatch(raw, options, field.includeEmail);
          issues.push({
            key: field.key, label: field.label, raw: raw, normalized: normalized,
            options: options, suggestedId: suggestion && suggestion.id, creatable: field.key === 'tag'
          });
        });
      });
    });
    return issues;
  }

  function duplicateKeys(opportunity) {
    var cpf = digits(opportunity.cpf, 11);
    var phone = digits(opportunity.telefone || opportunity.phone, 11);
    var owner = String(opportunity.ownerId || (opportunity.owner && opportunity.owner.id) || 'unassigned');
    var registration = normalize(opportunity.matricula || opportunity.registration || opportunity.registrationNumber || 'sem-matricula');
    return {
      cpf: cpf.length === 11 ? owner + ':' + cpf + ':' + registration : '',
      phone: phone.length >= 10 ? owner + ':' + phone : ''
    };
  }

  function validateRows(parsedRows, context) {
    context = Object.assign({}, context || {}, { _catalogIndexes: Object.create(null) });
    var existingCpf = Object.create(null), existingPhone = Object.create(null);
    (context.existing || []).forEach(function (item) {
      var keys = duplicateKeys(item);
      if (keys.cpf) existingCpf[keys.cpf] = true;
      if (keys.phone) existingPhone[keys.phone] = true;
    });
    var fileCpf = Object.create(null), filePhone = Object.create(null);

    return (parsedRows || []).map(function (entry) {
      var raw = entry.values || {};
      var errors = [], warnings = [];
      var cpf = digits(raw.cpf, 11), phone = digits(raw.phone, 11);
      var registration = String(raw.registration || '').trim();
      var productIgnored = mappingDecision(context, 'product', raw.product) === '__ignore__';
      var conventionIgnored = mappingDecision(context, 'convention', raw.convention) === '__ignore__';
      var bankIgnored = mappingDecision(context, 'bank', raw.bank) === '__ignore__';
      var product = productIgnored ? null : resolveCatalog(context, 'product', raw.product);
      var convention = conventionIgnored ? null : resolveCatalog(context, 'convention', raw.convention);
      var bank = bankIgnored ? null : resolveCatalog(context, 'bank', raw.bank);
      var sourceIgnored = mappingDecision(context, 'source', raw.source) === '__ignore__';
      var ownerIgnored = mappingDecision(context, 'owner', raw.owner) === '__ignore__';
      var stageIgnored = mappingDecision(context, 'stage', raw.stage) === '__ignore__';
      var tagValues = splitTagValues(raw.tag);
      var resolvedTagIds = Object.create(null);
      var tags = tagValues.map(function (tagValue) {
        return mappingDecision(context, 'tag', tagValue) === '__ignore__' ? null : resolveCatalog(context, 'tag', tagValue);
      }).filter(function (tag) {
        if (!tag || resolvedTagIds[tag.id]) return false;
        resolvedTagIds[tag.id] = true;
        return true;
      });
      var source = raw.source && !sourceIgnored ? resolveCatalog(context, 'source', raw.source) : context.defaultSource;
      var owner = raw.owner && !ownerIgnored ? resolveCatalog(context, 'owner', raw.owner, true) : context.defaultOwner;
      var stage = raw.stage && !stageIgnored ? resolveCatalog(context, 'stage', raw.stage) : context.defaultStage;
      if (!String(raw.name || '').trim()) errors.push('Nome do cliente obrigatorio');
      if (phone && phone.length !== 10 && phone.length !== 11) errors.push('Telefone deve ter DDD e 10 ou 11 digitos');
      if (cpf.length !== 11) errors.push('CPF deve ter 11 digitos');
      if (raw.product && !product && !productIgnored) errors.push('Produto nao encontrado: ' + raw.product);
      if (raw.convention && !convention && !conventionIgnored) errors.push('Segmento de cliente não encontrado: ' + raw.convention);
      if (registration.length > 60) errors.push('Referência do projeto deve ter no máximo 60 caracteres');
      if (raw.bank && !bank && !bankIgnored) errors.push('Parceiro de execução não encontrado: ' + raw.bank);
      if (raw.source && !source && !sourceIgnored) errors.push('Origem nao encontrada: ' + raw.source);
      tagValues.forEach(function (tagValue) {
        if (mappingDecision(context, 'tag', tagValue) !== '__ignore__' && !resolveCatalog(context, 'tag', tagValue)) {
          errors.push('Etiqueta não encontrada: ' + tagValue);
        }
      });
      if (!owner) errors.push(raw.owner ? 'Responsavel nao encontrado: ' + raw.owner : 'Responsavel padrao indisponivel');
      if (!stage) errors.push(raw.stage ? 'Etapa aberta nao encontrada: ' + raw.stage : 'Etapa inicial indisponivel');
      var money = {
        initialValue: parseMoney(raw.initialValue), totalValue: parseMoney(raw.totalValue),
        finalValue: parseMoney(raw.finalValue), requestedReversal: parseMoney(raw.requestedReversal)
      };
      Object.keys(money).forEach(function (key) { if (Number.isNaN(money[key])) errors.push('Valor invalido em ' + (COLUMNS.find(function (c) { return c.key === key; }) || {}).label); });
      var ownerKey = String(owner && owner.id || 'unassigned');
      var registrationKey = normalize(registration || 'sem-matricula');
      var cpfKey = cpf.length === 11 ? ownerKey + ':' + cpf + ':' + registrationKey : '';
      var phoneKey = phone.length >= 10 ? ownerKey + ':' + phone : '';
      var duplicate = false;
      if (cpfKey && (existingCpf[cpfKey] || fileCpf[cpfKey])) {
        duplicate = true; warnings.push('CPF e referência do projeto já encontrados para este responsável');
      }
      if (phoneKey && (existingPhone[phoneKey] || filePhone[phoneKey])) warnings.push('Telefone já encontrado para este responsável');
      if (cpfKey) fileCpf[cpfKey] = true;
      if (phoneKey) filePhone[phoneKey] = true;
      return {
        line: entry.line, raw: raw, errors: errors, warnings: warnings, duplicate: duplicate,
        value: {
          name: String(raw.name || '').trim(), phone: phone, cpf: cpf,
          product: product, convention: convention,
          registration: registration, tags: tags,
          bank: bank, source: source, owner: owner, stage: stage,
          initialValue: money.initialValue == null ? 0 : money.initialValue,
          totalValue: money.totalValue, finalValue: money.finalValue,
          requestedReversal: money.requestedReversal, notes: String(raw.notes || '').trim()
        }
      };
    });
  }

  function findDuplicates(opportunities) {
    var list = (opportunities || []).filter(function (item) { return item.status !== 'cancelado'; });
    var parent = list.map(function (_, index) { return index; });
    function find(index) { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; }
    function unite(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
    var seenCpf = Object.create(null), seenPhone = Object.create(null);
    list.forEach(function (item, index) {
      var keys = duplicateKeys(item);
      if (keys.cpf) { if (seenCpf[keys.cpf] !== undefined) unite(index, seenCpf[keys.cpf]); else seenCpf[keys.cpf] = index; }
      if (keys.phone) { if (seenPhone[keys.phone] !== undefined) unite(index, seenPhone[keys.phone]); else seenPhone[keys.phone] = index; }
    });
    var groups = Object.create(null);
    list.forEach(function (item, index) { var root = find(index); (groups[root] = groups[root] || []).push(item); });
    return Object.keys(groups).map(function (key) {
      var items = groups[key];
      if (items.length < 2) return null;
      var reasons = [];
      var cpfSet = Object.create(null), phoneSet = Object.create(null);
      items.forEach(function (item) {
        var keys = duplicateKeys(item);
        if (keys.cpf) cpfSet[keys.cpf] = (cpfSet[keys.cpf] || 0) + 1;
        if (keys.phone) phoneSet[keys.phone] = (phoneSet[keys.phone] || 0) + 1;
      });
      if (Object.keys(cpfSet).some(function (value) { return cpfSet[value] > 1; })) reasons.push('Mesmo CPF');
      if (Object.keys(phoneSet).some(function (value) { return phoneSet[value] > 1; })) reasons.push('Mesmo telefone');
      return { items: items, reasons: reasons };
    }).filter(Boolean).sort(function (a, b) { return b.items.length - a.items.length; });
  }

  function safeCell(value) {
    var text = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return /[";\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(rows) {
    return '\uFEFF' + (rows || []).map(function (row) { return row.map(safeCell).join(';'); }).join('\r\n');
  }

  function templateRows(example) {
    example = example || {};
    return [
      COLUMNS.map(function (column) { return column.label; }),
      [
        'Maria Aparecida Souza', '(11) 99999-9999', '000.000.000-00', example.product || 'Gestão de marketing mensal',
        example.convention || '', '123456', example.tag || '', example.bank || '', example.source || 'Prospeccao Ativa', example.owner || '', example.stage || '',
        'R$ 1.500,00', 'R$ 1.650,00', 'R$ 1.400,00', 'R$ 150,00', 'Exemplo - apague esta linha antes de importar'
      ]
    ];
  }

  return {
    COLUMNS: COLUMNS, normalize: normalize, digits: digits, parseMoney: parseMoney, splitTagValues: splitTagValues,
    parseCsv: parseCsv, mapColumns: mapColumns, validateRows: validateRows,
    unmatchedCatalogValues: unmatchedCatalogValues, bestCatalogMatch: bestCatalogMatch,
    findDuplicates: findDuplicates,
    toCsv: toCsv, templateRows: templateRows
  };
});
