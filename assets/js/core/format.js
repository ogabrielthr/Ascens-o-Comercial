/* ==========================================================================
   AGIR — format.js
   Formatação pt-BR: moeda, número, percentual, datas, máscaras.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};

  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var NUM = new Intl.NumberFormat('pt-BR');
  var NUM1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  var MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado'];
  var DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  /* ---------- Moeda ---------------------------------------------------- */
  function money(v) { return BRL.format(Number(v) || 0); }
  function money0(v) { return BRL0.format(Number(v) || 0); }

  /**
   * Moeda usada em KPIs e cartões. Mantém centavos e o valor integral:
   * abreviações como "R$ 15 mil" escondiam diferenças relevantes em metas,
   * produção e estorno solicitado.
   */
  function moneyShort(v) {
    return money(v);
  }

  /** Só o número compacto, sem símbolo (para eixos de gráfico) */
  function numShort(v) {
    var n = Number(v) || 0;
    var neg = n < 0; n = Math.abs(n);
    var out;
    if (n >= 1e6) out = NUM1.format(n / 1e6) + 'M';
    else if (n >= 1e3) out = (n % 1e3 === 0 ? NUM.format(n / 1e3) : NUM1.format(n / 1e3)) + 'k';
    else out = NUM.format(Math.round(n * 10) / 10);
    return (neg ? '-' : '') + out;
  }

  function num(v, d) {
    if (d === undefined) return NUM.format(Number(v) || 0);
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: d, maximumFractionDigits: d
    }).format(Number(v) || 0);
  }

  function pct(v, d) {
    var n = Number(v) || 0;
    return num(n, d === undefined ? (Math.abs(n) < 10 && n % 1 !== 0 ? 1 : 0) : d) + '%';
  }

  /** Percentual com sinal explícito: +12% / -8% */
  function pctSigned(v, d) {
    var n = Number(v) || 0;
    return (n > 0 ? '+' : '') + pct(n, d);
  }

  /** Divisão segura que devolve percentual */
  function rate(a, b) {
    var d = Number(b) || 0;
    if (!d) return 0;
    return ((Number(a) || 0) / d) * 100;
  }

  /* ---------- Datas ---------------------------------------------------- */
  /**
   * Sempre devolve uma Date NOVA. Devolver a mesma referência faria
   * addDays() mutar a data de quem chamou — bug silencioso e caro.
   */
  function toDate(v) {
    if (v instanceof Date) return new Date(v.getTime());
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      // 'YYYY-MM-DD' é interpretado como local, não UTC
      var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      return new Date(v);
    }
    return new Date();
  }

  function iso(v) {
    var d = toDate(v);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  /** 14/08 */
  function dayMonth(v) { var d = toDate(v); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
  /** 14/08/2026 */
  function date(v) { var d = toDate(v); return dayMonth(d) + '/' + d.getFullYear(); }
  /** 14 ago */
  function dayMon(v) { var d = toDate(v); return d.getDate() + ' ' + MES[d.getMonth()]; }
  /** 14 de agosto de 2026 */
  function dateLong(v) { var d = toDate(v); return d.getDate() + ' de ' + MES_LONGO[d.getMonth()] + ' de ' + d.getFullYear(); }
  /** quinta-feira, 20 de agosto */
  function weekdayLong(v) { var d = toDate(v); return DIA[d.getDay()] + ', ' + d.getDate() + ' de ' + MES_LONGO[d.getMonth()]; }
  /** ago/26 */
  function monthYear(v) { var d = toDate(v); return MES[d.getMonth()] + '/' + String(d.getFullYear()).slice(2); }
  /** 14:35 */
  function time(v) { var d = toDate(v); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  /** 14/08 14:35 */
  function dateTime(v) { return dayMonth(v) + ' ' + time(v); }

  /** "há 3 dias", "em 2 h", "agora" */
  function relative(v, ref) {
    var d = toDate(v).getTime();
    var now = (ref ? toDate(ref) : new Date()).getTime();
    var diff = d - now;
    var abs = Math.abs(diff);
    var fut = diff > 0;
    var MIN = 6e4, HR = 36e5, DAY = 864e5;
    var out;
    if (abs < MIN) return 'agora';
    if (abs < HR) out = Math.round(abs / MIN) + ' min';
    else if (abs < DAY) out = Math.round(abs / HR) + ' h';
    else if (abs < DAY * 30) out = Math.round(abs / DAY) + (Math.round(abs / DAY) === 1 ? ' dia' : ' dias');
    else if (abs < DAY * 365) out = Math.round(abs / (DAY * 30)) + ' mês(es)';
    else out = Math.round(abs / (DAY * 365)) + ' ano(s)';
    return (fut ? 'em ' : 'há ') + out;
  }

  /** Diferença inteira em dias (b - a), ignorando horas */
  function daysBetween(a, b) {
    var x = toDate(a), y = toDate(b || new Date());
    x = new Date(x.getFullYear(), x.getMonth(), x.getDate());
    y = new Date(y.getFullYear(), y.getMonth(), y.getDate());
    return Math.round((y - x) / 864e5);
  }

  function addDays(v, n) { var d = toDate(v); d.setDate(d.getDate() + n); return d; }
  function startOfMonth(v) { var d = toDate(v); return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(v) { var d = toDate(v); return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function isWeekend(v) { var g = toDate(v).getDay(); return g === 0 || g === 6; }

  /** Dias úteis (seg–sex) entre duas datas, inclusive */
  function businessDays(a, b) {
    var d = toDate(a), end = toDate(b), n = 0;
    d.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
    while (d <= end) { if (!isWeekend(d)) n++; d = addDays(d, 1); }
    return n;
  }

  /* ---------- Máscaras e texto ----------------------------------------- */
  function cpf(v) {
    var s = String(v || '').replace(/\D/g, '').padStart(11, '0').slice(0, 11);
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  /** CPF com o miolo oculto — LGPD-friendly em listas */
  function cpfMask(v) {
    var s = String(v || '').replace(/\D/g, '').padStart(11, '0').slice(0, 11);
    return s.slice(0, 3) + '.***.***-' + s.slice(9);
  }
  function phone(v) {
    var s = String(v || '').replace(/\D/g, '');
    if (s.length === 11) return s.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return v;
  }
  function cnpj(v) {
    var s = String(v || '').replace(/\D/g, '').padStart(14, '0').slice(0, 14);
    return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }

  /** Remove acentos e baixa a caixa — para busca */
  function norm(str) {
    return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** Plural simples: plural(3,'lead','leads') -> '3 leads' */
  function plural(n, sing, plur) {
    return num(n) + ' ' + (Math.abs(n) === 1 ? sing : (plur || sing + 's'));
  }

  /** Cor estável derivada do texto — avatares e séries por nome */
  function hueOf(str) {
    var s = String(str || ''), hash = 0;
    for (var i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
  }

  AGIR.fmt = {
    money: money, money0: money0, moneyShort: moneyShort, numShort: numShort,
    num: num, pct: pct, pctSigned: pctSigned, rate: rate,
    toDate: toDate, iso: iso, date: date, dayMonth: dayMonth, dayMon: dayMon,
    dateLong: dateLong, weekdayLong: weekdayLong, monthYear: monthYear,
    time: time, dateTime: dateTime, relative: relative,
    daysBetween: daysBetween, addDays: addDays,
    startOfMonth: startOfMonth, endOfMonth: endOfMonth,
    isWeekend: isWeekend, businessDays: businessDays,
    cpf: cpf, cpfMask: cpfMask, phone: phone, cnpj: cnpj,
    initials: initials, firstName: firstName, norm: norm, plural: plural, hueOf: hueOf,
    MES: MES, MES_LONGO: MES_LONGO, DIA: DIA, DIA_CURTO: DIA_CURTO
  };
})(window);
