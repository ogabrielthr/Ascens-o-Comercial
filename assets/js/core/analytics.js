/* ==========================================================================
   AGIR — analytics.js
   Motor de métricas. Tudo que o Dashboard, os Relatórios e o Cockpit
   mostram é derivado aqui — as telas só desenham.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var S = function () { return AGIR.store; };
  var F = AGIR.fmt;

  /* ==========================================================================
     Períodos
     ========================================================================== */
  var PRESETS = [
    { value: 'hoje',     label: 'Hoje' },
    { value: '7d',       label: 'Últimos 7 dias' },
    { value: '30d',      label: 'Últimos 30 dias' },
    { value: 'mes',      label: 'Este mês' },
    { value: 'mesant',   label: 'Mês passado' },
    { value: 'trim',     label: 'Últimos 3 meses' },
    { value: '6m',       label: 'Últimos 6 meses' },
    { value: 'ano',      label: 'Este ano' }
  ];

  /** range(preset) -> { from, to, prevFrom, prevTo, label, dias } */
  function range(preset) {
    var hoje = new Date(); hoje.setHours(23, 59, 59, 999);
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var from, to = hoje;

    switch (preset) {
      case 'hoje':   from = d0; break;
      case '7d':     from = F.addDays(d0, -6); break;
      case '30d':    from = F.addDays(d0, -29); break;
      case 'mesant':
        from = new Date(d0.getFullYear(), d0.getMonth() - 1, 1);
        to = new Date(d0.getFullYear(), d0.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'trim':   from = F.addDays(d0, -89); break;
      case '6m':     from = F.addDays(d0, -179); break;
      case 'ano':    from = new Date(d0.getFullYear(), 0, 1); break;
      case 'mes':
      default:       from = F.startOfMonth(d0); preset = 'mes'; break;
    }
    from.setHours(0, 0, 0, 0);

    /* Período de comparação.
       Para recortes de mês/ano, comparar com a MESMA fatia do período
       anterior (1–23/ago × 1–23/jul), não com a janela imediatamente
       anterior. Deslocar por dias corridos pega um número diferente de dias
       úteis e faz o mês em curso parecer sempre pior do que é. */
    var prevFrom, prevTo, comparacao;

    if (preset === 'mes' || preset === 'mesant') {
      var diaFim = to.getDate();
      prevFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1, 0, 0, 0, 0);
      var ultimoDiaPrev = new Date(from.getFullYear(), from.getMonth(), 0).getDate();
      if (preset === 'mesant') diaFim = ultimoDiaPrev;
      prevTo = new Date(from.getFullYear(), from.getMonth() - 1,
        Math.min(diaFim, ultimoDiaPrev), 23, 59, 59, 999);
      comparacao = 'mesmo período do mês anterior';
    } else if (preset === 'ano') {
      prevFrom = new Date(from.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      prevTo = new Date(to.getFullYear() - 1, to.getMonth(), Math.min(to.getDate(), new Date(to.getFullYear() - 1, to.getMonth() + 1, 0).getDate()), 23, 59, 59, 999);
      comparacao = 'mesmo período do ano anterior';
    } else {
      /* Janelas móveis (7d, 30d, trimestre…): a janela imediatamente anterior
         tem o mesmo tamanho, então a comparação é justa. */
      var span = to - from;
      prevTo = new Date(from.getTime() - 1);
      prevFrom = new Date(from.getTime() - span - 1);
      comparacao = 'período anterior';
    }

    var lbl = (PRESETS.find(function (p) { return p.value === preset; }) || {}).label || 'Período';
    return {
      preset: preset, from: from, to: to,
      prevFrom: prevFrom, prevTo: prevTo,
      label: lbl, comparacao: comparacao,
      dias: Math.max(1, Math.round((to - from) / 864e5) + 1),
      /* Dias úteis de cada janela — permite normalizar quando não baterem. */
      uteis: F.businessDays(from, to),
      uteisPrev: F.businessDays(prevFrom, prevTo)
    };
  }

  function inRange(dateLike, r) {
    if (!dateLike) return false;
    var t = F.toDate(dateLike).getTime();
    return t >= r.from.getTime() && t <= r.to.getTime();
  }

  /** Valor comercial principal do CRM: sempre o Estorno Solicitado. */
  function valorCRM(opportunity) {
    var value = Number(opportunity && opportunity.estornoSolicitado);
    return Number.isFinite(value) ? value : 0;
  }
  function inPrev(dateLike, r) {
    if (!dateLike) return false;
    var t = F.toDate(dateLike).getTime();
    return t >= r.prevFrom.getTime() && t <= r.prevTo.getTime();
  }

  /* ==========================================================================
     Filtros
     f = { periodo, ownerId, equipeId, produtoId, origemId, bancoId, pipelineId }
     ========================================================================== */
  function usuariosDoFiltro(f) {
    var us = S().get('usuarios') || [];
    return us.filter(function (u) { return (!f.ownerId || u.id === f.ownerId) && (!f.equipeId || u.equipeId === f.equipeId); });
  }

  function ownerSet(f) {
    if (!f.ownerId && !f.equipeId) return null;   // null = todos
    var set = Object.create(null);
    usuariosDoFiltro(f).forEach(function (u) { set[u.id] = true; });
    return set;
  }

  function matchOpp(o, f, owners) {
    if (owners && !owners[o.ownerId]) return false;
    if (f.produtoId && o.produtoId !== f.produtoId) return false;
    if (f.convenioId && o.convenioId !== f.convenioId) return false;
    if (f.origemId && o.origemId !== f.origemId) return false;
    if (f.bancoId && o.bancoId !== f.bancoId) return false;
    if (f.pipelineId && o.pipelineId !== f.pipelineId) return false;
    if (f.etapaId && o.etapaId !== f.etapaId) return false;
    if (f.etiquetaId && (o.tags || []).indexOf(f.etiquetaId) < 0) return false;
    return true;
  }

  /** Oportunidades do escopo (sem recorte de data) */
  function opps(f) {
    var owners = ownerSet(f || {});
    return (S().get('oportunidades') || []).filter(function (o) {
      return !o.deleted_at && !o.excluidoEm && o.status !== 'cancelado' && o.status !== 'cancelled' && matchOpp(o, f || {}, owners);
    });
  }

  /** Atividades do escopo (sem recorte de data) */
  function acts(f) {
    f = f || {};
    var owners = ownerSet(f);
    var oppById = S().indexBy('oportunidades');
    return (S().get('atividades') || []).filter(function (a) {
      if (owners && !owners[a.ownerId]) return false;
      if (f.produtoId || f.convenioId || f.origemId || f.bancoId || f.pipelineId || f.etapaId || f.etiquetaId) {
        var o = a.oportunidadeId && oppById[a.oportunidadeId];
        if (!o || !matchOpp(o, f, null)) return false;
      }
      return true;
    });
  }

  /* ==========================================================================
     Contadores base de um intervalo
     ========================================================================== */
  function activityCompleted(a) {
    return !a.deleted_at && !a.excluidoEm && a.resultado !== 'pendente' && (!a.status || a.status === 'completed');
  }

  function contar(listaOpps, listaActs, from, to) {
    var fT = from.getTime(), tT = to.getTime();
    function dentro(d) { if (!d) return false; var x = F.toDate(d).getTime(); return x >= fT && x <= tT; }

    var c = {
      ligacoes: 0, ligacoesAtendidas: 0, tempoFalaSeg: 0,
      whatsapp: 0, agendamentos: 0, reunioes: 0, propostas: 0,
      leadsNovos: 0, vendasQtd: 0, vendasValor: 0, estornoSolicitado: 0, comissao: 0,
      perdidasQtd: 0, perdidasValor: 0, cicloSoma: 0, cicloN: 0
    };

    var appointments = Object.create(null), meetings = Object.create(null), proposals = Object.create(null);
    function remember(map, a) {
      if (!a.oportunidadeId) return;
      var t = F.toDate(a.data).getTime();
      var entry = map[a.oportunidadeId];
      map[a.oportunidadeId] = { first: entry ? Math.min(entry.first, t) : t, last: entry ? Math.max(entry.last, t) : t };
    }
    c.agendamentosLigacao = 0;
    listaActs.forEach(function (a) {
      if (!activityCompleted(a)) return;             // agenda futura não conta
      if (!dentro(a.data)) return;
      if (a.resultado === 'agendou') { c.agendamentos++; remember(appointments, a); if (a.tipo === 'ligacao') c.agendamentosLigacao++; }
      if (a.tipo === 'reuniao' && a.resultado === 'realizada') remember(meetings, a);
      if (a.tipo === 'proposta') remember(proposals, a);
      if (a.tipo === 'ligacao') {
        c.ligacoes++;
        if (a.resultado === 'atendeu' || a.resultado === 'agendou') {
          c.ligacoesAtendidas++;
          c.tempoFalaSeg += Number(a.duracaoSeg) || 0;
        }
      } else if (a.tipo === 'whatsapp') c.whatsapp++;
      else if (a.tipo === 'reuniao') {
        if (a.resultado === 'realizada') c.reunioes++;
      } else if (a.tipo === 'proposta') c.propostas++;
    });

    listaOpps.forEach(function (o) {
      if (dentro(o.criadoEm)) c.leadsNovos++;
      if (o.status === 'ganho' && dentro(o.fechadoEm)) {
        c.vendasQtd++;
        c.vendasValor += valorCRM(o);
        c.estornoSolicitado += valorCRM(o);
        c.comissao += Number(o.comissao) || 0;
        var ciclo = F.daysBetween(o.criadoEm, o.fechadoEm);
        if (ciclo >= 0) { c.cicloSoma += ciclo; c.cicloN++; }
      }
      if (o.status === 'perdido' && dentro(o.fechadoEm)) {
        c.perdidasQtd++;
        c.perdidasValor += valorCRM(o);
      }
    });

    ['vendasValor', 'estornoSolicitado', 'comissao', 'perdidasValor'].forEach(function (key) { c[key] = Math.round(c[key] * 100) / 100; });
    c.ticket = c.vendasQtd ? c.vendasValor / c.vendasQtd : 0;
    c.ciclo = c.cicloN ? c.cicloSoma / c.cicloN : 0;
    c.tma = c.ligacoesAtendidas ? c.tempoFalaSeg / c.ligacoesAtendidas : 0;
    function converted(source, destination) {
      return Object.keys(source).filter(function (id) { return destination[id] && destination[id].last >= source[id].first; }).length;
    }
    var won = Object.create(null);
    listaOpps.forEach(function (o) { if (o.status === 'ganho' && dentro(o.fechadoEm)) won[o.id] = { last: F.toDate(o.fechadoEm).getTime() }; });
    c.propostasLeads = Object.keys(proposals).length;
    c.agendamentosLeads = Object.keys(appointments).length;
    c.reunioesLeads = Object.keys(meetings).length;
    c.vendasDePropostas = converted(proposals, won);
    c.convLigAgend = F.rate(c.agendamentosLigacao, c.ligacoes);
    c.convAgendReuni = F.rate(converted(appointments, meetings), c.agendamentosLeads);
    c.convReuniProp = F.rate(converted(meetings, proposals), c.reunioesLeads);
    c.convPropVenda = F.rate(c.vendasDePropostas, c.propostasLeads);
    c.convGeral = F.rate(listaOpps.filter(function (o) { return dentro(o.criadoEm) && o.status === 'ganho' && o.fechadoEm && F.toDate(o.fechadoEm).getTime() <= tT; }).length, c.leadsNovos);
    c.taxaAtendimento = F.rate(c.ligacoesAtendidas, c.ligacoes);
    c.winRate = F.rate(c.vendasQtd, c.vendasQtd + c.perdidasQtd);
    return c;
  }

  /** Delta percentual entre atual e anterior */
  function delta(atual, anterior) {
    if (!anterior) return atual ? 100 : 0;
    return ((atual - anterior) / Math.abs(anterior)) * 100;
  }

  /* Métricas de fluxo: acumulam ao longo do período, então precisam ser
     normalizadas por dia útil antes de comparar duas janelas de tamanhos
     diferentes. As demais (médias e taxas) já são independentes do tamanho
     da janela e não devem ser normalizadas. */
  var FLUXO = ['ligacoes', 'ligacoesAtendidas', 'tempoFalaSeg', 'whatsapp',
    'agendamentos', 'reunioes', 'propostas', 'leadsNovos', 'vendasQtd',
    'vendasValor', 'estornoSolicitado', 'comissao', 'perdidasQtd', 'perdidasValor'];

  /**
   * kpis(f) -> { atual, anterior, d: {campo: variação%} }
   * A variação de métricas de fluxo compara a média por dia útil, não o
   * total bruto — senão um mês em curso sempre pareceria em queda.
   */
  function kpis(f) {
    f = f || {};
    var r = range(f.periodo);
    var O = opps(f), A = acts(f);
    var atual = contar(O, A, r.from, r.to);
    var anterior = contar(O, A, r.prevFrom, r.prevTo);

    var uA = Math.max(1, r.uteis), uP = Math.max(1, r.uteisPrev);
    var d = {};
    Object.keys(atual).forEach(function (k) {
      if (typeof atual[k] !== 'number') return;
      if (FLUXO.indexOf(k) >= 0 && uA !== uP) {
        d[k] = delta(atual[k] / uA, anterior[k] / uP);
      } else {
        d[k] = delta(atual[k], anterior[k]);
      }
    });
    return { atual: atual, anterior: anterior, d: d, range: r };
  }

  /* ==========================================================================
     Séries temporais
     ========================================================================== */
  /**
   * serie(f, metricas[]) -> { labels, byMetric:{nome:[valores]}, datas:[] }
   * Agrupa por dia se o período <= 62 dias, senão por mês.
   */
  function serie(f, metricas) {
    f = f || {};
    var r = range(f.periodo);
    var porMes = r.dias > 62;
    var O = opps(f), A = acts(f);

    var buckets = [], keyOf, labelOf;
    if (porMes) {
      keyOf = function (d) { var x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
      labelOf = function (d) { return F.monthYear(d); };
      var cur = new Date(r.from.getFullYear(), r.from.getMonth(), 1);
      while (cur <= r.to) {
        buckets.push({ key: keyOf(cur), label: labelOf(cur), date: new Date(cur) });
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
    } else {
      keyOf = function (d) { return F.iso(d); };
      labelOf = function (d) { return F.dayMonth(d); };
      var c = new Date(r.from);
      while (c <= r.to) {
        buckets.push({ key: keyOf(c), label: labelOf(c), date: new Date(c) });
        c = F.addDays(c, 1);
      }
    }

    var idx = Object.create(null);
    buckets.forEach(function (b, i) { idx[b.key] = i; });

    var out = {};
    (metricas || []).forEach(function (m) { out[m] = buckets.map(function () { return 0; }); });

    function bump(metric, d, v) {
      if (!out[metric]) return;
      var i = idx[keyOf(d)];
      if (i === undefined) return;
      out[metric][i] += (v === undefined ? 1 : Number(v) || 0);
      if (['vendasValor', 'estornoSolicitado', 'comissao', 'perdidasValor'].indexOf(metric) >= 0) out[metric][i] = Math.round(out[metric][i] * 100) / 100;
    }

    A.forEach(function (a) {
      if (!activityCompleted(a)) return;
      var d = F.toDate(a.data);
      if (!Number.isFinite(d.getTime()) || d < r.from || d > r.to) return;
      if (a.resultado === 'agendou') bump('agendamentos', d);
      if (a.tipo === 'ligacao') {
        bump('ligacoes', d);
        if (a.resultado === 'atendeu' || a.resultado === 'agendou') bump('atendidas', d);
      } else if (a.tipo === 'reuniao') {
        if (a.resultado === 'realizada') bump('reunioes', d);
      } else if (a.tipo === 'proposta') bump('propostas', d);
      else if (a.tipo === 'whatsapp') bump('whatsapp', d);
    });

    O.forEach(function (o) {
      var cri = F.toDate(o.criadoEm);
      if (cri >= r.from && cri <= r.to) bump('leads', cri);
      if (o.fechadoEm) {
        var fim = F.toDate(o.fechadoEm);
        if (fim >= r.from && fim <= r.to) {
          if (o.status === 'ganho') {
            bump('vendasQtd', fim);
            bump('vendasValor', fim, valorCRM(o));
            bump('estornoSolicitado', fim, valorCRM(o));
            bump('comissao', fim, o.comissao || 0);
          } else if (o.status === 'perdido') {
            bump('perdidas', fim);
            bump('perdidasValor', fim, valorCRM(o));
          }
        }
      }
    });

    return {
      labels: buckets.map(function (b) { return b.label; }),
      datas: buckets.map(function (b) { return b.date; }),
      porMes: porMes,
      s: out,
      range: r
    };
  }

  /** Série acumulada (para meta x realizado) */
  function acumular(arr) {
    var t = 0;
    return arr.map(function (v) { t += v; return t; });
  }

  /* ==========================================================================
     Funil
     ========================================================================== */
  function funil(f) {
    var k = kpis(f).atual;
    return [
      { label: 'Ligações',            value: k.ligacoes,    color: 'var(--series-2)' },
      { label: 'Contatos efetivos',   value: k.ligacoesAtendidas, color: 'var(--series-7)' },
      { label: 'Agendamentos',        value: k.agendamentos, color: 'var(--series-4)' },
      { label: 'Reuniões realizadas', value: k.reunioes,     color: 'var(--series-1)' },
      { label: 'Propostas enviadas',  value: k.propostas,    color: 'var(--series-6)' },
      { label: 'Vendas fechadas',     value: k.vendasQtd,    color: 'var(--series-3)' }
    ];
  }

  /* ==========================================================================
     Metas
     ========================================================================== */
  /** metaDoMes(usuarioId, date) -> registro de meta ou null */
  function pipelineFunnel(f) {
    f = f || {};
    var r = range(f.periodo || 'mes');
    var allPipelines = S().get('pipelines') || [];
    var selectedPipeline = f.pipelineId
      ? allPipelines.find(function (item) { return item.id === f.pipelineId; })
      : allPipelines.find(function (item) { return item.padrao; }) || allPipelines[0];
    if (!selectedPipeline) return [];

    var stages = (selectedPipeline.etapas || []).filter(function (stage) {
      return stage.ativo !== false && stage.tipo !== 'perdido';
    }).sort(function (a, b) { return a.ordem - b.ordem; });
    var stageIndex = Object.create(null);
    stages.forEach(function (stage, index) { stageIndex[stage.id] = index; });

    var histories = Object.create(null);
    (S().get('historicoEtapas') || []).forEach(function (entry) {
      (histories[entry.oportunidadeId] = histories[entry.oportunidadeId] || []).push(entry);
    });

    var cohort = opps(f).filter(function (opportunity) {
      return opportunity.pipelineId === selectedPipeline.id && inRange(opportunity.criadoEm, r);
    });
    var reached = stages.map(function () { return []; });

    cohort.forEach(function (opportunity) {
      var furthest = 0;
      (histories[opportunity.id] || []).forEach(function (entry) {
        if (!entry.alteradoEm || F.toDate(entry.alteradoEm) > r.to) return;
        [entry.deEtapaId, entry.paraEtapaId].forEach(function (stageId) {
          if (stageIndex[stageId] !== undefined) furthest = Math.max(furthest, stageIndex[stageId]);
        });
      });
      if (stageIndex[opportunity.etapaId] !== undefined && F.toDate(opportunity.entrouEtapaEm || opportunity.atualizadoEm || opportunity.criadoEm) <= r.to) {
        furthest = Math.max(furthest, stageIndex[opportunity.etapaId]);
      }
      if (opportunity.status === 'ganho' && inRange(opportunity.fechadoEm, { from: r.from, to: r.to })) furthest = stages.length - 1;
      for (var index = 0; index <= furthest && index < stages.length; index++) reached[index].push(opportunity);
    });

    return stages.map(function (stage, index) {
      var items = reached[index];
      var previous = index ? reached[index - 1].length : cohort.length;
      var value = items.length;
      return {
        id: stage.id, label: stage.nome, value: value, color: stage.cor || 'var(--series-1)',
        amount: items.reduce(function (sum, item) { return sum + valorCRM(item); }, 0),
        conversion: index ? F.rate(value, previous) : 100,
        advanced: index < stages.length - 1 ? reached[index + 1].length : value,
        losses: Math.max(0, previous - value)
      };
    });
  }

  function metaDoMes(usuarioId, ref) {
    var d = ref ? F.toDate(ref) : new Date();
    return (S().get('metas') || []).find(function (m) {
      return m.usuarioId === usuarioId && m.ano === d.getFullYear() && m.mes === d.getMonth() + 1;
    }) || null;
  }

  /** Soma das metas do escopo no mês de referência */
  function metaEscopo(f, ref) {
    var us = usuariosDoFiltro(f || {});
    var acc = { ligacoes: 0, agendamentos: 0, reunioes: 0, propostas: 0, vendasQtd: 0, vendasValor: 0 };
    us.forEach(function (u) {
      var m = metaDoMes(u.id, ref);
      if (!m) return;
      Object.keys(acc).forEach(function (k) { acc[k] += Number(m[k]) || 0; });
    });
    return acc;
  }

  /**
   * paceMes(f) — onde o time deveria estar hoje e onde está.
   * Considera dias úteis decorridos no mês.
   */
  function goalPeriod(f) {
    f = f || {};
    var r = range(f.periodo), today = new Date();
    var start = new Date(r.from), end = new Date(r.to);
    var ongoing = r.preset === 'mes' || r.preset === 'ano';
    if (r.preset === 'mes') end = F.endOfMonth(r.from);
    if (r.preset === 'ano') end = new Date(r.from.getFullYear(), 11, 31);
    end.setHours(23, 59, 59, 999);
    var compatible = !['produtoId', 'origemId', 'bancoId', 'convenioId', 'pipelineId', 'etapaId', 'etiquetaId'].some(function (key) { return !!f[key]; });
    var meta = { ligacoes: 0, agendamentos: 0, reunioes: 0, propostas: 0, vendasQtd: 0, vendasValor: 0 };
    var cursor = F.startOfMonth(start);
    var expectedMeta = Object.assign({}, meta), months = [];
    while (cursor <= end) {
      var monthEnd = F.endOfMonth(cursor); monthEnd.setHours(23, 59, 59, 999);
      var left = new Date(Math.max(start.getTime(), cursor.getTime()));
      var right = new Date(Math.min(end.getTime(), monthEnd.getTime()));
      var total = F.businessDays(cursor, monthEnd);
      var weight = total ? F.businessDays(left, right) / total : 0;
      var elapsedEnd = new Date(Math.min(right.getTime(), r.to.getTime(), today.getTime()));
      var elapsed = elapsedEnd >= left && total ? F.businessDays(left, elapsedEnd) / total : 0;
      var m = metaEscopo(f, cursor);
      months.push({ inicio: left, fim: right, valorPorDia: compatible && total ? (Number(m.vendasValor) || 0) / total : 0 });
      Object.keys(meta).forEach(function (key) { if (compatible) { meta[key] += (Number(m[key]) || 0) * weight; expectedMeta[key] += (Number(m[key]) || 0) * elapsed; } });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    Object.keys(meta).forEach(function (key) { meta[key] = Math.round(meta[key] * 100) / 100; });
    var totalDays = F.businessDays(start, end), elapsedDays = F.businessDays(start, new Date(Math.min(r.to.getTime(), end.getTime())));
    return { range: r, inicio: start, fim: end, emAndamento: ongoing,
      metaCompativel: compatible, label: r.preset === 'mes' || r.preset === 'mesant' ? F.monthYear(r.from) : r.label,
      meta: meta, metaEsperada: expectedMeta, meses: months, uteisTotal: totalDays, uteisAte: elapsedDays,
      uteisRestantes: ongoing ? Math.max(0, totalDays - elapsedDays) : 0,
      fracao: ongoing && totalDays ? Math.min(1, elapsedDays / totalDays) : 1 };
  }

  function paceMes(f) {
    f = f || {};
    var period = goalPeriod(f), meta = period.meta, fracao = period.fracao;
    var real = contar(opps(f), acts(f), period.range.from, period.range.to);
    function bloco(chave, realizado, alvo) {
      var esperado = period.emAndamento ? Math.round((period.metaEsperada[chave] || 0) * 100) / 100 : alvo;
      return { chave: chave, realizado: realizado, meta: alvo, esperado: esperado,
        pct: alvo ? realizado / alvo * 100 : 0, pace: alvo ? esperado / alvo * 100 : 0,
        gap: realizado - esperado, projecao: fracao ? realizado / fracao : realizado,
        emRisco: alvo > 0 && realizado < esperado * 0.9 };
    }
    return Object.assign({}, period, {
      vendasValor: bloco('vendasValor', real.estornoSolicitado, meta.vendasValor),
      vendasQtd: bloco('vendasQtd', real.vendasQtd, meta.vendasQtd),
      propostas: bloco('propostas', real.propostas, meta.propostas),
      agendamentos: bloco('agendamentos', real.agendamentos, meta.agendamentos),
      ligacoes: bloco('ligacoes', real.ligacoes, meta.ligacoes),
      reunioes: bloco('reunioes', real.reunioes, meta.reunioes), real: real
    });
  }

  /* ==========================================================================
     Ranking de vendedores
     ========================================================================== */
  /**
   * ranking(f) -> [{ usuario, ...contadores, metaValor, pctMeta, tendencia:[] }]
   */
  function ranking(f) {
    f = f || {};
    var r = range(f.periodo);
    var us = usuariosDoFiltro(f);
    var todasOpps = opps(f);
    var todasActs = acts(f);

    return us.map(function (u) {
      var O = todasOpps.filter(function (o) { return o.ownerId === u.id; });
      var A = todasActs.filter(function (a) { return a.ownerId === u.id; });
      var c = contar(O, A, r.from, r.to);
      var p = contar(O, A, r.prevFrom, r.prevTo);
      var m = goalPeriod(Object.assign({}, f, { ownerId: u.id })).meta;

      /* tendência: últimos 8 blocos do período para sparkline */
      var tend = [];
      var passos = Math.min(8, r.dias), largura = Math.max(1, Math.ceil(r.dias / passos));
      for (var i = passos - 1; i >= 0; i--) {
        var to = F.addDays(r.to, -i * largura);
        var from = new Date(Math.max(r.from.getTime(), F.addDays(to, -largura + 1).getTime()));
        from.setHours(0, 0, 0, 0); to.setHours(23, 59, 59, 999);
        tend.push(contar(O, A, from, to).vendasValor);
      }

      return {
        usuario: u,
        c: c, prev: p,
        dVendas: delta(c.vendasValor, p.vendasValor),
        metaValor: m ? m.vendasValor : 0,
        metaRealizado: c.estornoSolicitado,
        pctMeta: m && m.vendasValor ? (c.estornoSolicitado / m.vendasValor) * 100 : 0,
        tendencia: tend,
        pontos: pontosDe(u.id)
      };
    }).filter(function (row) { return row.usuario.ativo !== false || !!f.ownerId || row.c.leadsNovos > 0 || row.c.vendasQtd > 0 || row.c.perdidasQtd > 0 || row.c.ligacoes > 0 || row.c.propostas > 0 || row.c.whatsapp > 0 || row.c.reunioes > 0 || row.prev.vendasQtd > 0; }).sort(function (a, b) { return b.c.vendasValor - a.c.vendasValor; });
  }

  /**
   * rankingVendasEstornadas(f)
   *
   * Placar comercial específico da Ascensão Comercial. O critério é a soma do campo
   * "Estorno solicitado" das oportunidades ganhas e fechadas no período.
   * A tela apresenta esse indicador ao usuário como "Valor Estornado".
   */
  function rankingVendasEstornadas(f) {
    f = f || {};
    var r = range(f.periodo);
    var compartilhadas = S().get('rankingVendas') || [];
    var shared = compartilhadas.length || (global.AGIR_BACKEND && global.AGIR_BACKEND.mode === 'supabase');
    var todasOpps = shared ? compartilhadas.filter(function (o) {
      if (f.produtoId && o.produtoId !== f.produtoId) return false;
      if (f.origemId && o.origemId !== f.origemId) return false;
      if (f.equipeId && o.equipeId !== f.equipeId) return false;
      return true;
    }) : opps(f);
    var usuarios = usuariosDoFiltro(f).filter(function (u) {
      var cargo = S().byId('cargos', u.cargoId) || {};
      var adminPuro = u.role === 'admin' || u.cargoId === 'cg_admin' || cargo.codigo === 'admin';
      var vendeuNoPeriodo = todasOpps.some(function (o) {
        if (o.ownerId !== u.id || o.status !== 'ganho' || !o.fechadoEm) return false;
        var data = F.toDate(o.fechadoEm).getTime();
        return data >= r.from.getTime() && data <= r.to.getTime();
      });
      /* A classificacao lista somente pessoas com venda no periodo. */
      return vendeuNoPeriodo && (!adminPuro || vendeuNoPeriodo);
    });

    function valorEstornado(o) {
      var n = Number(o.estornoSolicitado);
      return isFinite(n) && n > 0 ? n : 0;
    }

    function resumo(lista, from, to) {
      var vendas = lista.filter(function (o) {
        if (o.status !== 'ganho' || !o.fechadoEm) return false;
        var d = F.toDate(o.fechadoEm).getTime();
        return d >= from.getTime() && d <= to.getTime();
      });
      var quantidade = function (o) {
        var n = Number(o.quantidadeVendas);
        return isFinite(n) && n > 0 ? n : 1;
      };
      var estornoTotal = vendas.reduce(function (s, o) { return s + valorEstornado(o); }, 0);
      var vendasQtd = vendas.reduce(function (s, o) { return s + quantidade(o); }, 0);
      var vendasComEstorno = vendas.reduce(function (s, o) {
        return s + (valorEstornado(o) > 0 ? quantidade(o) : 0);
      }, 0);
      var valorVendas = vendas.reduce(function (s, o) {
        var n = Number(o.valorTotal);
        return s + (isFinite(n) ? n : 0);
      }, 0);
      return {
        estornoTotal: estornoTotal,
        vendasQtd: vendasQtd,
        vendasComEstorno: vendasComEstorno,
        valorVendas: valorVendas,
        ticketEstorno: vendasQtd ? estornoTotal / vendasQtd : 0
      };
    }

    var linhas = usuarios.map(function (u) {
      var doUsuario = todasOpps.filter(function (o) { return o.ownerId === u.id; });
      var atual = resumo(doUsuario, r.from, r.to);
      var anterior = resumo(doUsuario, r.prevFrom, r.prevTo);
      var tendencia = [];
      var passos = 8, largura = Math.max(1, Math.round(r.dias / passos));
      for (var i = passos - 1; i >= 0; i--) {
        var fim = F.addDays(r.to, -i * largura);
        var inicio = F.addDays(fim, -largura + 1);
        inicio.setHours(0, 0, 0, 0); fim.setHours(23, 59, 59, 999);
        tendencia.push(resumo(doUsuario, inicio, fim).estornoTotal);
      }
      return {
        usuario: u,
        estornoTotal: atual.estornoTotal,
        vendasQtd: atual.vendasQtd,
        vendasComEstorno: atual.vendasComEstorno,
        valorVendas: atual.valorVendas,
        ticketEstorno: atual.ticketEstorno,
        estornoAnterior: anterior.estornoTotal,
        deltaEstorno: delta(atual.estornoTotal, anterior.estornoTotal),
        tendencia: tendencia,
        participacao: 0,
        posicaoAnterior: null,
        movimento: null
      };
    });

    var anteriores = linhas.slice().sort(function (a, b) {
      if (b.estornoAnterior !== a.estornoAnterior) return b.estornoAnterior - a.estornoAnterior;
      return String(a.usuario.nome || '').localeCompare(String(b.usuario.nome || ''), 'pt-BR');
    });
    var posAnterior = Object.create(null);
    anteriores.forEach(function (l, i) { posAnterior[l.usuario.id] = i + 1; });

    linhas.sort(function (a, b) {
      if (b.estornoTotal !== a.estornoTotal) return b.estornoTotal - a.estornoTotal;
      if (b.vendasQtd !== a.vendasQtd) return b.vendasQtd - a.vendasQtd;
      return String(a.usuario.nome || '').localeCompare(String(b.usuario.nome || ''), 'pt-BR');
    });

    var total = linhas.reduce(function (s, l) { return s + l.estornoTotal; }, 0);
    linhas.forEach(function (l, i) {
      l.posicao = i + 1;
      l.posicaoAnterior = posAnterior[l.usuario.id] || null;
      l.movimento = l.posicaoAnterior ? l.posicaoAnterior - l.posicao : null;
      l.participacao = total ? (l.estornoTotal / total) * 100 : 0;
    });
    linhas.totalEstornado = total;
    linhas.range = r;
    return linhas;
  }

  /* ==========================================================================
     Gamificação — pontos
     ========================================================================== */
  function pontosDe(usuarioId) {
    var g = S().get('gamificacao') || {};
    var prog = (S().get('progresso') || []).filter(function (p) { return p.usuarioId === usuarioId; });
    var trilhas = S().get('trilhas') || [];

    var pAulas = prog.length * (g.pontosAula || 10);

    var pTrilhas = 0;
    trilhas.forEach(function (t) {
      var feitas = prog.filter(function (p) { return p.trilhaId === t.id; }).length;
      if (t.aulas.length && feitas >= t.aulas.length) pTrilhas += (g.pontosConclusaoTrilha || 50);
    });

    var A = (S().get('atividades') || []).filter(function (a) {
      return a.ownerId === usuarioId && a.resultado !== 'pendente';
    });
    var pAtiv = 0;
    A.forEach(function (a) {
      if (a.tipo === 'ligacao') pAtiv += (g.pontosLigacao || 1);
      else if (a.tipo === 'reuniao' && a.resultado === 'agendou') pAtiv += (g.pontosAgendamento || 15);
      else if (a.tipo === 'proposta') pAtiv += (g.pontosProposta || 25);
    });
    var vendas = (S().get('oportunidades') || []).filter(function (o) {
      return o.ownerId === usuarioId && o.status === 'ganho';
    }).length;
    var pVendas = vendas * (g.pontosVenda || 100);

    return {
      total: pAulas + pTrilhas + pAtiv + pVendas,
      aulas: prog.length,
      trilhasConcluidas: trilhas.filter(function (t) {
        return t.aulas.length && prog.filter(function (p) { return p.trilhaId === t.id; }).length >= t.aulas.length;
      }).length,
      detalhe: { aulas: pAulas, trilhas: pTrilhas, atividades: pAtiv, vendas: pVendas }
    };
  }

  /** Sequência de dias úteis consecutivos com atividade */
  function streak(usuarioId) {
    var dias = Object.create(null);
    (S().get('atividades') || []).forEach(function (a) {
      if (a.ownerId !== usuarioId || a.resultado === 'pendente') return;
      dias[F.iso(a.data)] = true;
    });
    var n = 0, d = new Date();
    for (var i = 0; i < 400; i++) {
      if (F.isWeekend(d)) { d = F.addDays(d, -1); continue; }
      if (dias[F.iso(d)]) { n++; d = F.addDays(d, -1); }
      else if (i === 0) { d = F.addDays(d, -1); }   // hoje ainda pode não ter registro
      else break;
    }
    return n;
  }

  /* ==========================================================================
     Recortes por dimensão
     ========================================================================== */
  function porDimensao(f, dim, medida) {
    var r = range((f || {}).periodo);
    var O = opps(f).filter(function (o) {
      if (dim === 'motivoPerdaId') return o.status === 'perdido' && inRange(o.fechadoEm, r);
      if (medida === 'valor' || medida === 'comissao') return o.status === 'ganho' && inRange(o.fechadoEm, r);
      return inRange(o.criadoEm, r);
    });

    var cat = {
      produtoId: { lista: S().get('produtos'), campo: 'produtoId' },
      origemId:  { lista: S().get('origens'),  campo: 'origemId' },
      bancoId:   { lista: S().get('bancos'),   campo: 'bancoId' },
      motivoPerdaId: { lista: S().get('motivosPerda'), campo: 'motivoPerdaId' }
    }[dim];
    if (!cat) return [];

    var acc = Object.create(null);
    O.forEach(function (o) {
      var k = o[cat.campo];
      if (!k) k = '__sem_cadastro__';
      if (dim === 'motivoPerdaId' && o.status !== 'perdido') return;
      if (!acc[k]) acc[k] = { qtd: 0, valor: 0, comissao: 0, ganhos: 0, perdidos: 0 };
      acc[k].qtd++;
      acc[k].valor += valorCRM(o);
      acc[k].comissao += Number(o.comissao) || 0;
      if (o.status === 'ganho' && F.toDate(o.fechadoEm) <= r.to) acc[k].ganhos++;
      if (o.status === 'perdido' && F.toDate(o.fechadoEm) <= r.to) acc[k].perdidos++;
    });

    var catalog = (cat.lista || []).slice();
    Object.keys(acc).forEach(function (key) { if (!catalog.some(function (item) { return item.id === key; })) catalog.push({ id: key, nome: 'Sem cadastro' }); });
    return catalog.map(function (c) {
      var a = acc[c.id] || { qtd: 0, valor: 0, comissao: 0, ganhos: 0, perdidos: 0 };
      return {
        id: c.id, label: c.nome, color: c.cor || null,
        qtd: a.qtd, valor: a.valor, comissao: a.comissao,
        ganhos: a.ganhos, perdidos: a.perdidos,
        winRate: F.rate(a.ganhos, a.ganhos + a.perdidos),
        value: medida === 'qtd' ? a.qtd : (medida === 'comissao' ? a.comissao : a.valor)
      };
    }).filter(function (x) { return x.qtd > 0; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  /* ==========================================================================
     Heatmap de atividade — dia da semana × faixa de hora
     ========================================================================== */
  function heatAtividade(f) {
    var r = range((f || {}).periodo);
    var horas = [];
    for (var hI = 0; hI <= 23; hI++) horas.push(String(hI).padStart(2, '0') + 'h');
    var dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
    var data = dias.map(function () { return horas.map(function () { return 0; }); });

    acts(f).forEach(function (a) {
      if (!activityCompleted(a)) return;
      if (a.tipo !== 'ligacao' && a.tipo !== 'whatsapp') return;
      var d = F.toDate(a.data);
      if (!Number.isFinite(d.getTime()) || d < r.from || d > r.to) return;
      var dow = d.getDay();            // 0 dom .. 6 sáb
      var li = (dow + 6) % 7;          // Monday first, including Sunday
      var col = d.getHours();
      if (col < 0 || col >= horas.length || li >= dias.length) return;
      data[li][col]++;
    });
    return { rows: dias, cols: horas, data: data };
  }

  /* ==========================================================================
     Saúde do pipeline e SLA
     ========================================================================== */
  function etapas(pipelineId) {
    var pipelines = S().get('pipelines') || [];
    var pl = pipelineId
      ? pipelines.find(function (item) { return item.id === pipelineId; })
      : pipelines.find(function (item) { return item.padrao; }) || pipelines[0];
    return pl ? pl.etapas : [];
  }
  function etapaById(id) {
    var found = null;
    (S().get('pipelines') || []).some(function (pipeline) {
      found = (pipeline.etapas || []).find(function (stage) { return stage.id === id; }) || null;
      return Boolean(found);
    });
    return found;
  }

  // Datas manuais substituem o preset de criação; limites ausentes são abertos.
  // "todos" é exclusivo do pipeline: não cria séries/comparações sem limite.
  function pipelineDates(f) {
    f = f || {};
    function bounds(start, end) {
      return { from: start ? new Date(start + 'T00:00:00') : null,
        to: end ? new Date(end + 'T23:59:59.999') : null };
    }
    var manual = !!(f.dataInicio || f.dataFim);
    return {
      creation: manual ? bounds(f.dataInicio, f.dataFim) :
        f.periodo === 'todos' ? bounds() : range(f.periodo || 'mes'),
      modification: bounds(f.modificacaoInicio, f.modificacaoFim),
      manual: manual
    };
  }

  function matchesPipelineSearch(o, search) {
    var term = F.norm(search || '').trim();
    if (!term) return true;
    if (F.norm([o.cliente, o.email].join(' ')).indexOf(term) >= 0) return true;
    var digits = term.replace(/\D/g, '');
    // Um termo nominal nunca vira busca numérica vazia (que casaria com tudo).
    return !!digits && /^[\d\s()+.\-/]+$/.test(term) && [o.cpf, o.telefone].some(function (value) {
      return String(value || '').replace(/\D/g, '').indexOf(digits) >= 0;
    });
  }

  function withinPipelineDates(value, bounds) {
    if (!bounds.from && !bounds.to) return true;
    var time = new Date(value).getTime();
    return isFinite(time) && (!bounds.from || time >= bounds.from.getTime()) &&
      (!bounds.to || time <= bounds.to.getTime());
  }

  /** Oportunidades agrupadas por etapa conforme os filtros do pipeline. */
  function pipeline(f) {
    f = f || {};
    var dates = pipelineDates(f);
    var current = S().currentUser();
    var restricted = S().get('session.role') !== 'admin' && (!current || current.role !== 'admin');
    var status = (f && f.status) || 'aberto';
    var etapasVisiveis = etapas(f && f.pipelineId).filter(function (e) {
      if (f && f.etapaId) return e.id === f.etapaId;
      if (status === 'ganho') return e.tipo === 'ganho';
      if (status === 'perdido') return e.tipo === 'perdido';
      if (status === 'todos') return true;
      return e.tipo === 'aberto';
    });
    var groups = Object.create(null);
    etapasVisiveis.forEach(function (e) {
      groups[e.id] = { etapa: e, itens: [], qtd: 0, valor: 0, ponderado: 0, estourados: 0 };
    });
    opps(f).forEach(function (o) {
      var group = groups[o.etapaId];
      if (restricted && (!current || o.ownerId !== current.id)) return;
      if (!group || (status !== 'todos' && o.status !== status) || !withinPipelineDates(o.criadoEm, dates.creation)) return;
      if (!withinPipelineDates(o.atualizadoEm || o.criadoEm, dates.modification)) return;
      if (!matchesPipelineSearch(o, f.busca)) return;
      if (f.soSLA && diasNaEtapa(o) <= group.etapa.sla) return;
      group.itens.push(o);
      group.qtd += 1;
      group.valor += valorCRM(o);
      if (diasNaEtapa(o) > group.etapa.sla) group.estourados += 1;
    });
    return etapasVisiveis.map(function (e) {
      var group = groups[e.id];
      group.ponderado = group.valor * (e.prob / 100);
      return group;
    });
  }

  function diasNaEtapa(o) {
    return F.daysBetween(o.entrouEtapaEm || o.criadoEm, new Date());
  }

  /** Oportunidades com SLA estourado, mais críticas primeiro */
  function slaEstourado(f) {
    return opps(f)
      .filter(function (o) { return o.status === 'aberto'; })
      .map(function (o) {
        var e = etapaById(o.etapaId);
        var dias = diasNaEtapa(o);
        return { op: o, etapa: e, dias: dias, excesso: e ? dias - e.sla : 0 };
      })
      .filter(function (x) { return x.excesso > 0; })
      .sort(function (a, b) {
        return (b.excesso * valorCRM(b.op)) - (a.excesso * valorCRM(a.op));
      });
  }

  /** Oportunidades sem nenhuma atividade nos últimos N dias */
  function semToque(f, dias) {
    dias = dias || 5;
    var ultimo = Object.create(null);
    (S().get('atividades') || []).forEach(function (a) {
      if (!a.oportunidadeId || !activityCompleted(a)) return;
      var t = F.toDate(a.data).getTime();
      if (!ultimo[a.oportunidadeId] || t > ultimo[a.oportunidadeId]) ultimo[a.oportunidadeId] = t;
    });
    var agora = Date.now();
    return opps(f).filter(function (o) {
      if (o.status !== 'aberto') return false;
      var t = ultimo[o.id] || F.toDate(o.criadoEm).getTime();
      return (agora - t) / 864e5 >= dias;
    }).sort(function (a, b) { return valorCRM(b) - valorCRM(a); });
  }

  /** Cobertura: Estorno Solicitado aberto ponderado ÷ gap restante da meta */
  function cobertura(f) {
    var p = paceMes(f);
    var gap = Math.max(0, p.vendasValor.meta - p.vendasValor.realizado);
    var abertas = opps(f || {}).filter(function (o) { return o.status === 'aberto'; });
    var pond = abertas.reduce(function (sum, o) {
      var stage = etapaById(o.etapaId) || {};
      return sum + (Number(o.estornoSolicitado) || 0) * ((Number(stage.prob) || 0) / 100);
    }, 0);
    var bruto = abertas.reduce(function (sum, o) { return sum + (Number(o.estornoSolicitado) || 0); }, 0);
    return {
      gap: gap, ponderado: pond, bruto: bruto,
      x: gap ? pond / gap : (pond ? 99 : 0),
      saudavel: gap ? (pond / gap) >= 3 : true
    };
  }

  /* ==========================================================================
     Agenda de hoje
     ========================================================================== */
  function agenda(f, quando) {
    var alvo = quando ? F.iso(quando) : F.iso(new Date());
    return acts(f)
      .filter(function (a) { return a.resultado === 'pendente' && F.iso(a.agendadoPara || a.data) === alvo; })
      .sort(function (a, b) { return (a.agendadoPara || a.data) < (b.agendadoPara || b.data) ? -1 : 1; });
  }

  function atrasadas(f) {
    var hoje = F.iso(new Date());
    return acts(f)
      .filter(function (a) { return a.resultado === 'pendente' && F.iso(a.agendadoPara || a.data) < hoje; })
      .sort(function (a, b) { return (a.agendadoPara || a.data) < (b.agendadoPara || b.data) ? -1 : 1; });
  }

  /* ==========================================================================
     Insights — a narrativa que o gestor lê antes dos números
     ========================================================================== */
  /**
   * insights(f) -> [{ tone, icon, title, text, action:{label, href} }]
   * Ordenado por severidade: o que exige ação hoje vem primeiro.
   */
  function insights(f) {
    f = f || {};
    var out = [];
    var K = kpis(f);
    var a = K.atual, d = K.d;
    var p = paceMes(f);
    var cob = cobertura(f);
    var usById = S().indexBy('usuarios');

    /* 1. Meta em risco */
    if (p.vendasValor.meta > 0 && !p.emAndamento) {
      out.push({ tone: p.vendasValor.pct >= 100 ? 'ok' : 'warn', icon: 'target', sev: 4,
        title: 'Resultado da meta no período',
        text: F.moneyShort(p.vendasValor.realizado) + ' realizados de ' + F.moneyShort(p.vendasValor.meta) + ' previstos (' + F.pct(p.vendasValor.pct, 1) + ').' });
    } else if (p.vendasValor.meta > 0) {
      if (p.vendasValor.pct >= 100) {
        out.push({ tone: 'ok', icon: 'trophy', sev: 1,
          title: 'Meta de Estorno Solicitado batida',
          text: 'O time já registrou ' + F.moneyShort(p.vendasValor.realizado) + ' de Estorno Solicitado, sobre uma meta de ' +
            F.moneyShort(p.vendasValor.meta) + ' com ' + p.uteisRestantes +
            ' dia(s) útil(eis) sobrando. Hora de puxar o stretch.' });
      } else if (p.vendasValor.gap < 0) {
        var faltaDia = p.uteisRestantes
          ? (p.vendasValor.meta - p.vendasValor.realizado) / p.uteisRestantes : 0;
        out.push({ tone: 'bad', icon: 'alert', sev: 9,
          title: 'Estorno Solicitado abaixo do ritmo',
          text: 'Deveria estar em ' + F.moneyShort(p.vendasValor.esperado) + ' e está em ' +
            F.moneyShort(p.vendasValor.realizado) + '. Faltam ' +
            F.moneyShort(Math.max(0, p.vendasValor.meta - p.vendasValor.realizado)) + ' em ' +
            p.uteisRestantes + ' dia(s) útil(eis) — ' + F.moneyShort(faltaDia) + '/dia.',
          action: { label: 'Ver metas', href: '#/crm/dashboard?view=metas' } });
      } else {
        out.push({ tone: 'ok', icon: 'trendUp', sev: 2,
          title: 'Ritmo em dia',
          text: 'Projeção de fechamento em ' + F.moneyShort(p.vendasValor.projecao) +
            ' (' + F.pct(p.vendasValor.meta ? p.vendasValor.projecao / p.vendasValor.meta * 100 : 0, 0) + ' da meta).' });
      }
    }

    /* 2. Cobertura de pipeline */
    if (p.emAndamento && cob.gap > 0) {
      if (!cob.saudavel) {
        out.push({ tone: 'warn', icon: 'layers', sev: 8,
          title: 'Pipeline curto para o que falta',
          text: 'Cobertura de ' + F.num(cob.x, 1) + 'x o gap (' + F.moneyShort(cob.gap) +
            '). Saudável é 3x. Sem entrada de lead novo, o mês não fecha.',
          action: { label: 'Abrir pipeline', href: '#/crm/pipeline' } });
      } else {
        out.push({ tone: 'info', icon: 'layers', sev: 3,
          title: 'Cobertura de pipeline saudável',
          text: F.num(cob.x, 1) + 'x o gap restante — ' + F.moneyShort(cob.ponderado) +
            ' ponderado contra ' + F.moneyShort(cob.gap) + ' a fechar.' });
      }
    }

    /* 3. SLA estourado */
    var sla = p.emAndamento ? slaEstourado(f) : [];
    if (sla.length) {
      var valorParado = sla.reduce(function (s2, x) { return s2 + valorCRM(x.op); }, 0);
      out.push({ tone: sla.length > 12 ? 'bad' : 'warn', icon: 'clock', sev: sla.length > 12 ? 8.5 : 6,
        title: F.plural(sla.length, 'oportunidade', 'oportunidades') + ' fora do prazo',
        text: F.moneyShort(valorParado) + ' parados além do SLA da etapa. A mais crítica: ' +
          sla[0].op.cliente + ' (' + sla[0].etapa.nome + ', ' + sla[0].excesso + ' dia(s) de atraso).',
        action: { label: 'Ver no pipeline', href: '#/crm/pipeline?sla=1' } });
    }

    /* 4. Gargalo do funil */
    var etapasFunil = [
      { nome: 'ligação → agendamento', v: a.convLigAgend, bom: 6, base: a.ligacoes },
      { nome: 'agendamento → reunião', v: a.convAgendReuni, bom: 65, base: a.agendamentosLeads },
      { nome: 'reunião → proposta', v: a.convReuniProp, bom: 55, base: a.reunioesLeads },
      { nome: 'proposta → venda', v: a.convPropVenda, bom: 30, base: a.propostasLeads }
    ].filter(function (x) { return x.base > 0; });
    var pior = etapasFunil.filter(function (x) { return x.v < x.bom; })
      .sort(function (x, y) { return (x.v / x.bom) - (y.v / y.bom); })[0];
    if (pior) {
      out.push({ tone: 'warn', icon: 'filter', sev: 7,
        title: 'Gargalo em ' + pior.nome,
        text: 'Taxa de ' + F.pct(pior.v, 1) + ' contra referência de ' + F.pct(pior.bom, 0) +
          '. É onde o time mais perde dinheiro agora.',
        action: { label: 'Abrir relatórios', href: '#/crm/relatorios' } });
    }

    /* 5. No-show */
    if (a.agendamentosLeads >= 5 && a.convAgendReuni < 60) {
      out.push({ tone: 'warn', icon: 'calendar', sev: 5.5,
        title: 'Poucos agendamentos convertidos em reunião',
        text: 'Só ' + F.pct(a.convAgendReuni, 0) + ' dos agendamentos viraram reunião. ' +
          'Confirmação D-1 automática resolve boa parte disso.',
        action: { label: 'Ver automações', href: '#/crm/automacoes' } });
    }

    /* 6. Quem caiu / quem subiu */
    var rk = ranking(f);
    var caiu = rk.filter(function (x) { return x.prev.vendasValor > 0 && x.dVendas <= -30; })
      .sort(function (x, y) { return x.dVendas - y.dVendas; })[0];
    if (caiu) {
      out.push({ tone: 'bad', icon: 'trendDown', sev: 6.5,
        title: F.firstName(caiu.usuario.nome) + ' caiu ' + F.pct(Math.abs(caiu.dVendas), 0),
        text: 'De ' + F.moneyShort(caiu.prev.vendasValor) + ' para ' + F.moneyShort(caiu.c.vendasValor) +
          ' entre os dois períodos. Vale um 1:1 esta semana.',
        action: { label: 'Ver vendedor', href: '#/performance/ranking' } });
    }
    var subiu = rk.filter(function (x) { return x.dVendas >= 40 && x.c.vendasValor > 0; })
      .sort(function (x, y) { return y.dVendas - x.dVendas; })[0];
    if (subiu && !caiu) {
      out.push({ tone: 'ok', icon: 'flame', sev: 2.5,
        title: F.firstName(subiu.usuario.nome) + ' cresceu ' + F.pct(subiu.dVendas, 0),
        text: 'Melhor evolução do período, com ' + F.moneyShort(subiu.c.vendasValor) +
          ' produzidos. Vale mapear o que mudou e replicar.' });
    }

    /* 7. Leads sem toque */
    var frios = p.emAndamento ? semToque(f, 5) : [];
    if (frios.length >= 3) {
      out.push({ tone: 'warn', icon: 'inbox', sev: 6,
        title: F.plural(frios.length, 'lead', 'leads') + ' sem toque há 5+ dias',
        text: F.moneyShort(frios.reduce(function (s2, o) { return s2 + valorCRM(o); }, 0)) +
          ' em Estorno Solicitado esfriando na base. O maior é ' + frios[0].cliente +
          ' (' + F.moneyShort(valorCRM(frios[0])) + ').',
        action: { label: 'Ver leads', href: '#/crm/leads?frios=1' } });
    }

    /* 8. Motivo de perda dominante */
    var perdas = porDimensao(f, 'motivoPerdaId', 'qtd');
    var totalPerdas = perdas.reduce(function (s2, x) { return s2 + x.qtd; }, 0);
    if (totalPerdas >= 8 && perdas[0] && perdas[0].qtd / totalPerdas >= 0.28) {
      out.push({ tone: 'info', icon: 'info', sev: 4,
        title: 'Principal motivo de perda: ' + perdas[0].label.toLowerCase(),
        text: F.pct(perdas[0].qtd / totalPerdas * 100, 0) + ' das perdas do período (' +
          perdas[0].qtd + ' de ' + totalPerdas + '). Atacar isso muda a taxa geral.' });
    }

    /* 9. Estorno solicitado médio por venda */
    if (a.vendasQtd >= 3 && Math.abs(d.ticket) >= 12) {
      out.push({ tone: d.ticket > 0 ? 'ok' : 'warn', icon: d.ticket > 0 ? 'trendUp' : 'trendDown', sev: 3.5,
        title: 'Estorno médio ' + (d.ticket > 0 ? 'subiu' : 'caiu') + ' ' + F.pct(Math.abs(d.ticket), 0),
        text: 'Agora em ' + F.moneyShort(a.ticket) + ' de Estorno Solicitado por venda, contra ' + F.moneyShort(K.anterior.ticket) +
          ' no período anterior.' });
    }

    /* 10. Produtividade de ligação */
    if (a.ligacoes >= 50 && a.taxaAtendimento < 30) {
      out.push({ tone: 'warn', icon: 'phone', sev: 5,
        title: 'Taxa de atendimento baixa',
        text: 'Só ' + F.pct(a.taxaAtendimento, 0) + ' das ' + F.num(a.ligacoes) +
          ' ligações foram atendidas. Vale revisar horário de discagem e qualidade do mailing.',
        action: { label: 'Ver análise de ligações', href: '#/performance/ligacoes' } });
    }

    /* Nada crítico? Diz isso explicitamente — silêncio não é informação. */
    if (!out.length) {
      out.push({ tone: 'ok', icon: 'checkcircle', sev: 0,
        title: 'Operação sob controle',
        text: 'Nenhum alerta relevante no período. Aproveite para dar feedback individual ou planejar a próxima semana.' });
    }

    return out.sort(function (x, y) { return y.sev - x.sev; });
  }

  /* ==========================================================================
     Humor / clima do time
     ========================================================================== */

  function precisaCheckin(usuarioId) {
    var st = S().get('settings') || {};
    if (st.humorAtivo === false) return false;
    var u = usuarioId ? S().byId('usuarios', usuarioId) : S().currentUser();
    if (!u) return false;
    if (u.cargoId === 'cg_admin' || u.role === 'admin') return false;          // admin não responde

    var hoje = F.iso(new Date());
    if ((st.humorAdiado || {})[u.id] === hoje) return false;   // pulou hoje
    return !humorDoDia(u.id, hoje);
  }

  function humorDoDia(usuarioId, dia) {
    var d = dia || F.iso(new Date());
    return (S().get('humor') || []).find(function (r) {
      return r.usuarioId === usuarioId && r.data === d;
    }) || null;
  }

  function escalaHumor() { return S().get('escalaHumor') || []; }
  function fatoresHumor() { return S().get('fatoresHumor') || []; }
  function escalaDe(nota) {
    return escalaHumor().find(function (e) { return e.nota === nota; }) ||
      { nota: nota, label: '—', cor: 'var(--ink-3)' };
  }

  /** Registros de humor no escopo e período do filtro. */
  function humores(f) {
    f = f || {};
    var r = range(f.periodo);
    var owners = ownerSet(f);
    return (S().get('humor') || []).filter(function (x) {
      if (owners && !owners[x.usuarioId]) return false;
      var d = F.toDate(x.data);
      return d >= r.from && d <= r.to;
    });
  }

  /** Média, adesão e distribuição do período. */
  function climaResumo(f) {
    var r = range((f || {}).periodo);
    var regs = humores(f);
    var equipe = usuariosDoFiltro(f || {}).filter(function (u) {
      return u.cargoId !== 'cg_admin' && u.ativo !== false;
    });
    var uteis = F.businessDays(r.from, r.to);
    var esperado = equipe.length * uteis;

    var soma = regs.reduce(function (a, x) { return a + x.nota; }, 0);
    var dist = [0, 0, 0, 0, 0];
    regs.forEach(function (x) { dist[x.nota - 1]++; });

    /* período anterior, para a variação */
    var ownersP = ownerSet(f || {});
    var regsPrev = (S().get('humor') || []).filter(function (x) {
      if (ownersP && !ownersP[x.usuarioId]) return false;
      var d = F.toDate(x.data);
      return d >= r.prevFrom && d <= r.prevTo;
    });
    var mediaPrev = regsPrev.length
      ? regsPrev.reduce(function (a, x) { return a + x.nota; }, 0) / regsPrev.length : 0;

    var media = regs.length ? soma / regs.length : 0;
    return {
      media: media,
      mediaPrev: mediaPrev,
      delta: mediaPrev ? delta(media, mediaPrev) : 0,
      respostas: regs.length,
      esperado: esperado,
      adesao: F.rate(regs.length, esperado),
      distribuicao: dist,
      /* % de respostas 1 ou 2 — é o número que exige ação */
      pctBaixo: F.rate(dist[0] + dist[1], regs.length),
      pctAlto: F.rate(dist[3] + dist[4], regs.length),
      equipe: equipe.length, uteis: uteis, range: r
    };
  }

  /** Série diária de humor médio (para cruzar com a série de resultado). */
  function serieHumor(f) {
    var r = range((f || {}).periodo);
    var regs = humores(f);
    var porDia = Object.create(null);
    regs.forEach(function (x) {
      (porDia[x.data] = porDia[x.data] || []).push(x.nota);
    });

    var labels = [], valores = [], respostas = [], datas = [];
    var d = new Date(r.from);
    while (d <= r.to) {
      if (!F.isWeekend(d)) {
        var k = F.iso(d), lista = porDia[k] || [];
        labels.push(F.dayMonth(d));
        datas.push(new Date(d));
        respostas.push(lista.length);
        valores.push(lista.length
          ? lista.reduce(function (a, n) { return a + n; }, 0) / lista.length : null);
      }
      d = F.addDays(d, 1);
    }
    /* interpola buracos para a linha não quebrar visualmente */
    var ultimo = null;
    var suave = valores.map(function (v) {
      if (v !== null) { ultimo = v; return v; }
      return ultimo === null ? 0 : ultimo;
    });
    return { labels: labels, datas: datas, valores: suave, brutos: valores, respostas: respostas };
  }

  /** Correlação de Pearson entre dois vetores de mesmo tamanho. */
  function correlacao(xs, ys) {
    var pares = [];
    for (var i = 0; i < Math.min(xs.length, ys.length); i++) {
      if (xs[i] === null || ys[i] === null || !isFinite(xs[i]) || !isFinite(ys[i])) continue;
      pares.push([xs[i], ys[i]]);
    }
    var n = pares.length;
    if (n < 4) return null;
    var mx = pares.reduce(function (a, p) { return a + p[0]; }, 0) / n;
    var my = pares.reduce(function (a, p) { return a + p[1]; }, 0) / n;
    var num = 0, dx = 0, dy = 0;
    pares.forEach(function (p) {
      var a = p[0] - mx, b = p[1] - my;
      num += a * b; dx += a * a; dy += b * b;
    });
    if (!dx || !dy) return null;
    return { r: num / Math.sqrt(dx * dy), n: n };
  }

  /**
   * humorVsResultado(f) — o cruzamento que interessa ao gestor.
   * Para cada vendedor: humor médio, adesão, tendência e — o mais acionável —
   * quanto ele produz em dia de humor alto contra dia de humor baixo.
   */
  function humorVsResultado(f) {
    f = f || {};
    var r = range(f.periodo);
    var equipe = usuariosDoFiltro(f).filter(function (u) {
      return u.cargoId !== 'cg_admin' && u.ativo !== false;
    });
    var todasOpps = S().get('oportunidades') || [];
    var todasActs = S().get('atividades') || [];

    return equipe.map(function (u) {
      var regs = (S().get('humor') || []).filter(function (x) {
        if (x.usuarioId !== u.id) return false;
        var d = F.toDate(x.data);
        return d >= r.from && d <= r.to;
      });

      /* Resultado do dia. O indicador que importa muda com a função: closer é
         medido por contrato fechado, BDR por reunião marcada. Comparar BDR por
         volume vendido daria zero sempre e a coluna não diria nada. */
      var fechaContrato = ['cg_closer', 'cg_gestor'].indexOf(u.cargoId) >= 0;
      var vendaDia = Object.create(null), ligDia = Object.create(null),
          agendaDia = Object.create(null);

      todasOpps.forEach(function (o) {
        if (o.ownerId !== u.id || o.status !== 'ganho' || !o.fechadoEm) return;
        var k = F.iso(o.fechadoEm);
        vendaDia[k] = (vendaDia[k] || 0) + valorCRM(o);
      });
      todasActs.forEach(function (a) {
        if (a.ownerId !== u.id || a.resultado === 'pendente') return;
        var k = F.iso(a.data);
        if (a.tipo === 'ligacao') ligDia[k] = (ligDia[k] || 0) + 1;
        if (a.resultado === 'agendou') agendaDia[k] = (agendaDia[k] || 0) + 1;
      });

      var alto = { dias: 0, valor: 0, lig: 0, ag: 0 };
      var baixo = { dias: 0, valor: 0, lig: 0, ag: 0 };
      var xs = [], ysValor = [], ysLig = [], ysPrincipal = [];

      regs.forEach(function (x) {
        var v = vendaDia[x.data] || 0;
        var l = ligDia[x.data] || 0;
        var g = agendaDia[x.data] || 0;
        xs.push(x.nota); ysValor.push(v); ysLig.push(l);
        ysPrincipal.push(fechaContrato ? v : g);
        if (x.nota >= 4) { alto.dias++; alto.valor += v; alto.lig += l; alto.ag += g; }
        else if (x.nota <= 2) { baixo.dias++; baixo.valor += v; baixo.lig += l; baixo.ag += g; }
      });

      var mediaAlto = alto.dias ? alto.valor / alto.dias : 0;
      var mediaBaixo = baixo.dias ? baixo.valor / baixo.dias : 0;
      var ligAlto = alto.dias ? alto.lig / alto.dias : 0;
      var ligBaixo = baixo.dias ? baixo.lig / baixo.dias : 0;
      var agAlto = alto.dias ? alto.ag / alto.dias : 0;
      var agBaixo = baixo.dias ? baixo.ag / baixo.dias : 0;

      /* métrica principal da pessoa, já formatada para a tela decidir */
      var principalAlto = fechaContrato ? mediaAlto : agAlto;
      var principalBaixo = fechaContrato ? mediaBaixo : agBaixo;

      var media = regs.length
        ? regs.reduce(function (a, x) { return a + x.nota; }, 0) / regs.length : 0;

      /* tendência: metade recente contra metade anterior do período */
      var ordenados = regs.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
      var meio = Math.floor(ordenados.length / 2);
      var mA = meio ? ordenados.slice(0, meio).reduce(function (a, x) { return a + x.nota; }, 0) / meio : 0;
      var mB = (ordenados.length - meio)
        ? ordenados.slice(meio).reduce(function (a, x) { return a + x.nota; }, 0) / (ordenados.length - meio) : 0;

      /* fatores mais citados quando o humor está baixo */
      var contagem = Object.create(null);
      regs.filter(function (x) { return x.nota <= 2; }).forEach(function (x) {
        (x.fatores || []).forEach(function (id2) { contagem[id2] = (contagem[id2] || 0) + 1; });
      });
      var topFatores = Object.keys(contagem)
        .sort(function (a, b) { return contagem[b] - contagem[a]; })
        .slice(0, 3)
        .map(function (id2) {
          var fx = (S().get('fatoresHumor') || []).find(function (y) { return y.id === id2; });
          return { id: id2, nome: fx ? fx.nome : id2, n: contagem[id2] };
        });

      var uteis = F.businessDays(r.from, r.to);

      return {
        usuario: u,
        media: media,
        respostas: regs.length,
        adesao: F.rate(regs.length, uteis),
        tendencia: mB - mA,
        serie: ordenados.map(function (x) { return x.nota; }),
        ultimo: ordenados.length ? ordenados[ordenados.length - 1] : null,
        diasBaixos: baixo.dias,
        diasAltos: alto.dias,
        fechaContrato: fechaContrato,
        mediaAlto: mediaAlto,
        mediaBaixo: mediaBaixo,
        ligAlto: ligAlto,
        ligBaixo: ligBaixo,
        agAlto: agAlto,
        agBaixo: agBaixo,
        /* Métrica principal conforme a função, e como formatá-la na tela. */
        principalAlto: principalAlto,
        principalBaixo: principalBaixo,
        principalRotulo: fechaContrato ? 'volume vendido' : 'reuniões marcadas',
        principalFormato: fechaContrato ? 'moeda' : 'numero',
        /* Quanto o resultado cai em dia de humor ruim. Só é confiável com
           dias suficientes dos dois lados — senão é ruído virando conclusão. */
        impactoPct: (principalAlto && alto.dias >= 2 && baixo.dias >= 2)
          ? ((principalBaixo - principalAlto) / principalAlto) * 100 : null,
        impactoConfiavel: alto.dias >= 3 && baixo.dias >= 3,
        correlacaoValor: correlacao(xs, ysValor),
        correlacaoLigacoes: correlacao(xs, ysLig),
        correlacaoPrincipal: correlacao(xs, ysPrincipal),
        topFatores: topFatores,
        /* Dois sinais diferentes, que pedem conversas diferentes:
           - "baixo": está mal há tempo, precisa de apoio
           - "queda": estava bem e despencou, precisa entender o que mudou
           Misturar os dois num alerta só faria o gestor tratar igual quem
           está em situações opostas. */
        nivel: media <= 0 ? null
          : media < 3.0 ? 'baixo'
          : ((mB - mA) <= -0.8 && media < 4.0) ? 'queda'
          : null,
        alerta: media > 0 && (media < 3.0 || ((mB - mA) <= -0.8 && media < 4.0))
      };
    }).sort(function (a, b) { return a.media - b.media; });
  }

  /** Fatores mais citados no período, separados por tom. */
  function fatoresMaisCitados(f, tom) {
    var regs = humores(f);
    var cat = S().get('fatoresHumor') || [];
    var contagem = Object.create(null);
    regs.forEach(function (x) {
      if (tom === 'ruim' && x.nota > 2) return;
      if (tom === 'bom' && x.nota < 4) return;
      (x.fatores || []).forEach(function (id2) { contagem[id2] = (contagem[id2] || 0) + 1; });
    });
    return cat.filter(function (c) { return !tom || c.tom === tom; })
      .map(function (c) { return { id: c.id, label: c.nome, tom: c.tom, value: contagem[c.id] || 0 }; })
      .filter(function (x) { return x.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  /* ==========================================================================
     Financeiro
     ========================================================================== */
  function competenciaAtual() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function competencias(n) {
    var out = [], d = new Date();
    for (var i = 0; i < (n || 12); i++) {
      var x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push({
        value: x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'),
        label: F.MES_LONGO[x.getMonth()] + ' de ' + x.getFullYear(),
        curto: F.monthYear(x),
        date: x
      });
    }
    return out;
  }

  /**
   * dre(competencia) -> estrutura de demonstração de resultado
   */
  function dre(comp, opts) {
    opts = opts || {};
    var lanc = (S().get('financeiro.lancamentos') || []).filter(function (l) {
      if (l.competencia !== comp) return false;
      if (opts.somenteRealizado && l.status !== 'realizado') return false;
      return true;
    });
    var contas = S().indexBy('financeiro.planoContas');

    function somaGrupo(grupo, tipo) {
      return lanc.filter(function (l) {
        var c = contas[l.contaId];
        return c && c.grupo === grupo && c.tipo === tipo;
      }).reduce(function (a, l) { return a + l.valor; }, 0);
    }
    function detalhe(grupo, tipo) {
      var acc = Object.create(null);
      lanc.forEach(function (l) {
        var c = contas[l.contaId];
        if (!c || c.grupo !== grupo || c.tipo !== tipo) return;
        acc[l.contaId] = (acc[l.contaId] || 0) + l.valor;
      });
      return Object.keys(acc).map(function (k) {
        return { id: k, label: contas[k].nome, valor: acc[k] };
      }).sort(function (a, b) { return b.valor - a.valor; });
    }

    var receitaBruta = somaGrupo('Receita operacional', 'receita') + somaGrupo('Receita não operacional', 'receita');
    var deducoes = somaGrupo('Deduções', 'despesa');
    var receitaLiquida = receitaBruta - deducoes;
    var custoVar = somaGrupo('Custo variável', 'despesa');
    var margemContribuicao = receitaLiquida - custoVar;
    var custoFixo = somaGrupo('Custo fixo', 'despesa');
    var resultado = margemContribuicao - custoFixo;

    return {
      competencia: comp,
      linhas: [
        { label: 'Receita bruta',          valor: receitaBruta,   tipo: 'receita', destaque: true,
          itens: detalhe('Receita operacional', 'receita').concat(detalhe('Receita não operacional', 'receita')) },
        { label: '(−) Deduções e estornos', valor: -deducoes,     tipo: 'despesa',
          itens: detalhe('Deduções', 'despesa') },
        { label: '(=) Receita líquida',    valor: receitaLiquida, tipo: 'subtotal', destaque: true },
        { label: '(−) Custo variável',     valor: -custoVar,      tipo: 'despesa',
          itens: detalhe('Custo variável', 'despesa') },
        { label: '(=) Margem de contribuição', valor: margemContribuicao, tipo: 'subtotal', destaque: true,
          pct: F.rate(margemContribuicao, receitaLiquida) },
        { label: '(−) Custo fixo',         valor: -custoFixo,     tipo: 'despesa',
          itens: detalhe('Custo fixo', 'despesa') },
        { label: '(=) Resultado do período', valor: resultado,    tipo: 'resultado', destaque: true,
          pct: F.rate(resultado, receitaLiquida) }
      ],
      receitaBruta: receitaBruta, receitaLiquida: receitaLiquida,
      custoVariavel: custoVar, custoFixo: custoFixo,
      margemContribuicao: margemContribuicao, resultado: resultado,
      margemPct: F.rate(resultado, receitaLiquida),
      pontoEquilibrio: margemContribuicao > 0
        ? custoFixo / (margemContribuicao / receitaLiquida) : 0
    };
  }

  /**
   * Série de resultado por competência (últimos N meses).
   * Descarta meses sem nenhum movimento — plotar zeros de um período que a
   * base nem cobre faz o gráfico mentir sobre a operação.
   */
  function serieDRE(n) {
    return competencias(n || 6).reverse().map(function (c) {
      var r = dre(c.value);
      return {
        label: c.curto, competencia: c.value,
        receita: r.receitaBruta,
        custo: r.custoVariavel + r.custoFixo + (r.receitaBruta - r.receitaLiquida),
        resultado: r.resultado, margem: r.margemPct
      };
    }).filter(function (x) { return x.receita || x.custo; });
  }

  /** Fluxo de caixa por dia, com saldo acumulado */
  function fluxoCaixa(dias) {
    dias = dias || 60;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var ini = F.addDays(hoje, -Math.floor(dias * 0.6));
    var fim = F.addDays(hoje, Math.ceil(dias * 0.4));

    var lanc = S().get('financeiro.lancamentos') || [];
    var mapa = Object.create(null);
    lanc.forEach(function (l) {
      var d = F.toDate(l.data);
      if (d < ini || d > fim) return;
      var k = F.iso(d);
      if (!mapa[k]) mapa[k] = { entrada: 0, saida: 0, previstoEntrada: 0, previstoSaida: 0 };
      var real = l.status === 'realizado';
      if (l.tipo === 'receita') mapa[k][real ? 'entrada' : 'previstoEntrada'] += l.valor;
      else mapa[k][real ? 'saida' : 'previstoSaida'] += l.valor;
    });

    var out = [], saldo = 0, d = new Date(ini);
    while (d <= fim) {
      var k = F.iso(d);
      var m = mapa[k] || { entrada: 0, saida: 0, previstoEntrada: 0, previstoSaida: 0 };
      saldo += (m.entrada + m.previstoEntrada) - (m.saida + m.previstoSaida);
      out.push({
        date: new Date(d), label: F.dayMonth(d),
        entrada: m.entrada + m.previstoEntrada,
        saida: m.saida + m.previstoSaida,
        previsto: d > hoje,
        saldo: saldo
      });
      d = F.addDays(d, 1);
    }
    return out;
  }

  /** Orçado x realizado por conta na competência */
  function orcadoRealizado(comp) {
    var contas = S().get('financeiro.planoContas') || [];
    var lanc = (S().get('financeiro.lancamentos') || []).filter(function (l) { return l.competencia === comp; });
    var orc = (S().get('financeiro.orcamento') || []).filter(function (o) { return o.competencia === comp; });
    var orcMap = Object.create(null);
    orc.forEach(function (o) { orcMap[o.contaId] = o.valor; });

    var realMap = Object.create(null);
    lanc.forEach(function (l) { realMap[l.contaId] = (realMap[l.contaId] || 0) + l.valor; });

    return contas.map(function (c) {
      var real = realMap[c.id] || 0, prev = orcMap[c.id] || 0;
      var desvio = prev ? ((real - prev) / prev) * 100 : (real ? 100 : 0);
      /* em despesa, gastar menos é bom; em receita, é ruim */
      var bom = c.tipo === 'receita' ? desvio >= 0 : desvio <= 0;
      return {
        conta: c, realizado: real, orcado: prev,
        desvioValor: real - prev, desvioPct: desvio, bom: bom
      };
    }).filter(function (x) { return x.orcado || x.realizado; });
  }

  /** CAC e ROI de marketing na competência */
  function marketing(comp) {
    var lanc = (S().get('financeiro.lancamentos') || []).filter(function (l) {
      return l.competencia === comp && (l.contaId === 'pc_mkt' || l.contaId === 'pc_lead');
    });
    var invest = lanc.reduce(function (a, l) { return a + l.valor; }, 0);

    var ini = F.toDate(comp + '-01');
    var fim = F.endOfMonth(ini); fim.setHours(23, 59, 59, 999);
    var pagos = ['org_meta', 'org_google'];
    var O = (S().get('oportunidades') || []);

    var leadsPagos = O.filter(function (o) {
      return pagos.indexOf(o.origemId) >= 0 && F.toDate(o.criadoEm) >= ini && F.toDate(o.criadoEm) <= fim;
    });
    var vendasPagas = O.filter(function (o) {
      return pagos.indexOf(o.origemId) >= 0 && o.status === 'ganho' &&
        F.toDate(o.fechadoEm) >= ini && F.toDate(o.fechadoEm) <= fim;
    });
    var receita = vendasPagas.reduce(function (a, o) { return a + o.comissao; }, 0);

    return {
      investimento: invest,
      leads: leadsPagos.length,
      vendas: vendasPagas.length,
      receita: receita,
      cpl: leadsPagos.length ? invest / leadsPagos.length : 0,
      cac: vendasPagas.length ? invest / vendasPagas.length : 0,
      roi: invest ? ((receita - invest) / invest) * 100 : 0,
      conversao: F.rate(vendasPagas.length, leadsPagos.length)
    };
  }

  AGIR.an = {
    PRESETS: PRESETS, range: range, inRange: inRange, inPrev: inPrev, delta: delta,
    valorCRM: valorCRM,
    opps: opps, acts: acts, contar: contar, kpis: kpis,
    serie: serie, acumular: acumular, funil: pipelineFunnel,
    metaDoMes: metaDoMes, metaEscopo: metaEscopo, paceMes: paceMes, goalPeriod: goalPeriod,
    ranking: ranking, rankingVendasEstornadas: rankingVendasEstornadas,
    pontosDe: pontosDe, streak: streak,
    porDimensao: porDimensao, heatAtividade: heatAtividade,
    etapas: etapas, etapaById: etapaById, pipeline: pipeline,
    pipelineDates: pipelineDates, matchesPipelineSearch: matchesPipelineSearch,
    diasNaEtapa: diasNaEtapa, slaEstourado: slaEstourado, semToque: semToque,
    cobertura: cobertura, agenda: agenda, atrasadas: atrasadas, insights: insights,
    precisaCheckin: precisaCheckin, humorDoDia: humorDoDia,
    escalaHumor: escalaHumor, fatoresHumor: fatoresHumor, escalaDe: escalaDe,
    humores: humores, climaResumo: climaResumo, serieHumor: serieHumor,
    humorVsResultado: humorVsResultado, fatoresMaisCitados: fatoresMaisCitados,
    correlacao: correlacao,
    competenciaAtual: competenciaAtual, competencias: competencias,
    dre: dre, serieDRE: serieDRE, fluxoCaixa: fluxoCaixa,
    orcadoRealizado: orcadoRealizado, marketing: marketing,
    usuariosDoFiltro: usuariosDoFiltro
  };
})(window);
