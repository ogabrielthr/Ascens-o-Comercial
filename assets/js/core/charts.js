/* ==========================================================================
   AGIR — charts.js
   Gráficos em SVG puro, medidos pelo container (texto sempre nítido).
   Todos aceitam um elemento host e devolvem uma API { update, destroy }.
   ========================================================================== */
(function (global) {
  'use strict';
  var AGIR = global.AGIR = global.AGIR || {};
  var D = AGIR.dom, h = D.h, s = D.s;
  var F = AGIR.fmt;
  var chartSequence = 0;

  var PALETTE = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
    'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

  /* ---------- Utilitários ------------------------------------------------ */
  function niceMax(v, steps) {
    if (!isFinite(v) || v <= 0) return steps || 4;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var norm = v / mag;
    var mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    var top = mult * mag;
    while (top < v) top += mag / 2;
    return top;
  }

  /** Curva suave (Catmull-Rom → Bézier) — mais legível que linha reta em série densa */
  function smoothPath(pts, tension) {
    if (pts.length < 2) return pts.length ? 'M' + pts[0][0] + ' ' + pts[0][1] : '';
    var t = tension === undefined ? 0.22 : tension;
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
      var c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
      d += ' C' + c1x + ' ' + c1y + ',' + c2x + ' ' + c2y + ',' + p2[0] + ' ' + p2[1];
    }
    return d;
  }

  function linePath(pts) {
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
  }

  /* Monotone interpolation: smooth joins without inventing peaks or crossing zero. */
  function monotonePath(pts) {
    if (pts.length < 2) return linePath(pts);
    var slopes = [], tangents = [], n = pts.length;
    for (var i = 0; i < n - 1; i++) slopes.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
    tangents[0] = slopes[0]; tangents[n - 1] = slopes[n - 2];
    for (var j = 1; j < n - 1; j++) tangents[j] = slopes[j - 1] * slopes[j] <= 0 ? 0 : (slopes[j - 1] + slopes[j]) / 2;
    for (var k = 0; k < n - 1; k++) {
      if (!slopes[k]) { tangents[k] = tangents[k + 1] = 0; continue; }
      var a = tangents[k] / slopes[k], b = tangents[k + 1] / slopes[k], length = a * a + b * b;
      if (length > 9) { var scale = 3 / Math.sqrt(length); tangents[k] = scale * a * slopes[k]; tangents[k + 1] = scale * b * slopes[k]; }
    }
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var p = 0; p < n - 1; p++) {
      var dx = (pts[p + 1][0] - pts[p][0]) / 3;
      d += ' C' + (pts[p][0] + dx) + ' ' + (pts[p][1] + tangents[p] * dx) + ',' + (pts[p + 1][0] - dx) + ' ' + (pts[p + 1][1] - tangents[p + 1] * dx) + ',' + pts[p + 1][0] + ' ' + pts[p + 1][1];
    }
    return d;
  }

  function pathLen(d) {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    try { return p.getTotalLength() || 1000; } catch (e) { return 1000; }
  }

  /** Observa a largura do host e redesenha (debounced) */
  function responsive(host, draw) {
    var w = 0, timer = null;
    function run() {
      var nw = host.clientWidth;
      if (nw === w || nw < 40) return;
      w = nw;
      draw(nw);
    }
    /* setTimeout em vez de rAF: em aba de segundo plano o rAF fica suspenso
       e o gráfico nunca chegaria a desenhar. */
    function agendar() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 40);
    }
    var ro = new ResizeObserver(agendar);
    ro.observe(host);
    agendar();

    /* Se o host estava com largura 0 (aba oculta, aba de conteúdo fechada),
       redesenha quando voltar a ficar visível. */
    function aoVoltar() { if (!document.hidden) agendar(); }
    document.addEventListener('visibilitychange', aoVoltar);

    var destroyed = false;
    var controller = {
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        ro.disconnect();
        document.removeEventListener('visibilitychange', aoVoltar);
        if (timer) clearTimeout(timer);
      },
      redraw: function () { w = 0; run(); }
    };
    if (typeof AGIR.onPageDispose === 'function') AGIR.onPageDispose(controller.destroy);
    return controller;
  }

  /* ---------- Tooltip flutuante ----------------------------------------- */
  function makeTip(host) {
    var el = h('div.ch-tip', { style: { opacity: 0 } });
    host.appendChild(el);
    return {
      show: function (x, y, title, rows) {
        D.clear(el);
        el.appendChild(h('div.ch-tip__t', { text: title }));
        rows.forEach(function (r) {
          el.appendChild(h('div.ch-tip__r', { style: { '--c': r.color || 'var(--ink-3)' } },
            r.color ? h('i') : null,
            h('span', { text: r.label }),
            h('b', { text: r.value })
          ));
        });
        el.style.opacity = 1;
        var half = (el.offsetWidth || 160) / 2;
        el.style.left = Math.max(half + 8, Math.min(host.clientWidth - half - 8, x)) + 'px';
        el.style.top = Math.max((el.offsetHeight || 80) + 16, y) + 'px';
      },
      hide: function () { el.style.opacity = 0; },
      el: el
    };
  }

  /* ==========================================================================
     area() — linha/área multi-série com grade, eixos, cursor e projeção
     opts: {
       labels: [],
       series: [{ name, values:[], color, kind:'area'|'line'|'dash'|'bar', axis:'y'|'y2' }],
       height, yFormat, y2Format, xEvery, target:{value,label},
       legend:true, yZero:true, showDots:true
     }
     ========================================================================== */
  function area(host, opts) {
    host.classList.add('chart');
    host.style.position = 'relative';
    var tip = makeTip(host);
    var hidden = {};
    var chartId = 'ag_' + (++chartSequence);

    var ctrl = responsive(host, draw);

    function draw(W) {
      D.qsa('svg,.ch-legend', host).forEach(function (n) { n.remove(); });

      var H = opts.height || 260;
      var labels = opts.labels || [];
      var series = (opts.series || []).filter(function (sr) { return !hidden[sr.name]; });
      var padL = opts.padL || 46, padR = opts.padR || (hasAxis2() ? 46 : 12);
      var padT = 14, padB = 26;
      var iw = Math.max(10, W - padL - padR);
      var ih = Math.max(10, H - padT - padB);

      function hasAxis2() { return (opts.series || []).some(function (x) { return x.axis === 'y2'; }); }

      /* escalas */
      var maxA = 0, maxB = 0, minA = 0, minB = 0;
      series.forEach(function (sr) {
        var m = Math.max.apply(null, sr.values.concat([0]));
        var low = Math.min.apply(null, sr.values.concat([0]));
        if (sr.axis === 'y2') { maxB = Math.max(maxB, m); minB = Math.min(minB, low); }
        else { maxA = Math.max(maxA, m); minA = Math.min(minA, low); }
      });
      if (opts.target) { maxA = Math.max(maxA, opts.target.value); minA = Math.min(minA, opts.target.value); }
      var lowA = minA < 0 ? -niceMax(-minA * 1.08) : 0;
      var lowB = minB < 0 ? -niceMax(-minB * 1.08) : 0;
      var topA = maxA > 0 ? niceMax(maxA * 1.08) : minA < 0 ? 0 : 1;
      var topB = maxB > 0 ? niceMax(maxB * 1.08) : minB < 0 ? 0 : 1;

      var n = labels.length;
      var usesBars = series.some(function (sr) { return sr.kind === 'bar'; });
      var stepX = usesBars ? iw / Math.max(1, n) : n > 1 ? iw / (n - 1) : iw;
      function X(i) { return padL + (usesBars ? (i + .5) * stepX : n > 1 ? i * stepX : iw / 2); }
      function Y(v, ax) { var low = ax === 'y2' ? lowB : lowA, top = ax === 'y2' ? topB : topA; return padT + ih - ((v - low) / (top - low)) * ih; }

      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });

      /* defs: gradientes de área */
      var defs = s('defs');
      series.forEach(function (sr, i) {
        var gid = chartId + '_' + i;
        sr._gid = gid;
        var c = sr.color || PALETTE[i % PALETTE.length];
        var negativeArea = sr.values.some(function(v){return v < 0;}) && sr.values.every(function(v){return v <= 0;});
        defs.appendChild(s('linearGradient', { id: gid, x1: 0, y1: opts.glass && negativeArea ? 1 : 0, x2: 0, y2: opts.glass && negativeArea ? 0 : 1 },
          s('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': opts.glass ? '.32' : '.30' }),
          s('stop', { offset: '55%', 'stop-color': c, 'stop-opacity': opts.glass ? '.10' : '.14' }),
          s('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': '0' })
        ));
        if (opts.glass) {
          defs.appendChild(s('linearGradient', { id: gid + '_bar', x1: 0, y1: 0, x2: 0, y2: 1 },
            s('stop', { offset: '0%', 'stop-color': 'color-mix(in srgb,' + c + ' 70%,white)' }),
            s('stop', { offset: '30%', 'stop-color': c }),
            s('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': '.35' })
          ));
          defs.appendChild(s('linearGradient', { id: gid + '_line', x1: 0, y1: 0, x2: 1, y2: 0 },
            s('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': '.65' }),
            s('stop', { offset: '65%', 'stop-color': c }),
            s('stop', { offset: '100%', 'stop-color': 'color-mix(in srgb,' + c + ' 76%,white)' })
          ));
        }
      });
      svg.appendChild(defs);

      /* grade horizontal + eixo Y */
      var gGrid = s('g', { class: 'ch-grid' });
      var gAxis = s('g', { class: 'ch-axis' });
      var TICKS = 4;
      for (var t = 0; t <= TICKS; t++) {
        var yv = lowA + ((topA - lowA) / TICKS) * t;
        var y = Y(yv);
        gGrid.appendChild(s('line', { x1: padL, x2: padL + iw, y1: y, y2: y }));
        gAxis.appendChild(s('text', {
          x: padL - 8, y: y + 3.5, 'text-anchor': 'end',
          text: (opts.yFormat || F.numShort)(yv)
        }));
        if (hasAxis2()) {
          gAxis.appendChild(s('text', {
            x: padL + iw + 8, y: y + 3.5, 'text-anchor': 'start',
            style: { opacity: .72 },
            text: (opts.y2Format || F.numShort)(lowB + ((topB - lowB) / TICKS) * t)
          }));
        }
      }
      svg.appendChild(gGrid);
      if (lowA < 0) svg.appendChild(s('line', { x1: padL, x2: padL + iw, y1: Y(0), y2: Y(0), stroke: 'var(--line-strong)', 'stroke-width': 1 }));

      /* eixo X */
      var every = opts.xEvery || Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 62))));
      labels.forEach(function (lb, i) {
        if (i % every !== 0 && i !== n - 1) return;
        gAxis.appendChild(s('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', text: lb }));
      });
      svg.appendChild(gAxis);

      /* linha de meta */
      if (opts.target) {
        var ty = Y(opts.target.value);
        svg.appendChild(s('line', {
          x1: padL, x2: padL + iw, y1: ty, y2: ty,
          stroke: 'var(--ink-3)', 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .6
        }));
        svg.appendChild(s('text', {
          x: padL + iw, y: ty - 6, 'text-anchor': 'end',
          class: 'ch-val ch-val--dim',
          text: opts.target.label || 'meta'
        }));
      }

      /* barras primeiro (ficam atrás das linhas) */
      var barSeries = series.filter(function (sr) { return sr.kind === 'bar'; });
      if (barSeries.length) {
        var bw = Math.max(2, Math.min(26, (stepX * 0.62) / barSeries.length));
        barSeries.forEach(function (sr, bi) {
          var c = sr.color || PALETTE[series.indexOf(sr) % PALETTE.length];
          var g = s('g');
          sr.values.forEach(function (v, i) {
            if (!v) return;
            var y = Y(v, sr.axis);
            var x = X(i) - (bw * barSeries.length) / 2 + bi * bw;
            g.appendChild(s('rect', {
              class: 'ch-bar', x: x, y: Math.min(y, Y(0, sr.axis)), width: Math.max(1, bw - 1.5),
              height: Math.max(0.5, Math.abs(Y(0, sr.axis) - y)), rx: Math.min(3, bw / 3),
              fill: opts.glass ? 'url(#' + sr._gid + '_bar)' : c, 'fill-opacity': sr.projected ? .12 : 1,
              stroke: sr.projected ? c : opts.glass ? c : 'none', 'stroke-width': sr.projected ? 1.25 : opts.glass ? .5 : 0,
              'stroke-dasharray': sr.projected ? '3 2' : null,
              opacity: sr.projected || opts.glass ? 1 : .8, style: { '--i': i }
            }));
          });
          svg.appendChild(g);
        });
      }

      /* áreas e linhas */
      series.filter(function (sr) { return sr.kind !== 'bar'; }).forEach(function (sr) {
        var idx = series.indexOf(sr);
        var c = sr.color || PALETTE[idx % PALETTE.length];
        var pts = sr.values.map(function (v, i) { return [X(i), Y(v, sr.axis)]; });
        if (!pts.length) return;
        var d = opts.smooth === false ? linePath(pts) : opts.smooth === 'monotone' ? monotonePath(pts) : smoothPath(pts);

        if (sr.kind === 'area') {
          var dArea = d + ' L' + pts[pts.length - 1][0] + ' ' + Y(0, sr.axis) +
            ' L' + pts[0][0] + ' ' + Y(0, sr.axis) + ' Z';
          svg.appendChild(s('path', { class: 'ch-area', d: dArea, fill: 'url(#' + sr._gid + ')' }));
        }
        var len = pathLen(d);
        svg.appendChild(s('path', {
          class: 'ch-line' + (sr.kind === 'dash' ? ' ch-line--dash' : ''),
          d: d, stroke: opts.glass ? 'url(#' + sr._gid + '_line)' : c, style: { '--len': len }
        }));
        if (opts.glass && sr.kind !== 'dash') {
          var last = pts[pts.length - 1];
          svg.appendChild(s('circle', { class: 'ch-endpoint-halo', cx: last[0], cy: last[1], r: 6, fill: c, 'fill-opacity': '.1' }));
          svg.appendChild(s('circle', { class: 'ch-endpoint', cx: last[0], cy: last[1], r: 2.5, fill: c, stroke: 'var(--bg-elev-1)', 'stroke-width': 1.5 }));
        }
      });

      /* pontos interativos */
      var gDots = s('g');
      series.filter(function (sr) { return sr.kind !== 'bar'; }).forEach(function (sr) {
        var idx = series.indexOf(sr);
        var c = sr.color || PALETTE[idx % PALETTE.length];
        sr._dots = sr.values.map(function (v, i) {
          var dot = s('circle', { class: 'ch-pt', cx: X(i), cy: Y(v, sr.axis), fill: c, r: 0 });
          gDots.appendChild(dot);
          return dot;
        });
      });
      svg.appendChild(gDots);

      /* cursor + zona de hover */
      var cursor = s('line', { class: 'ch-cursor', y1: padT, y2: padT + ih, opacity: 0 });
      svg.appendChild(cursor);
      var hit = s('rect', { class: 'ch-hit', x: padL, y: padT, width: iw, height: ih });
      svg.appendChild(hit);

      hit.addEventListener('mousemove', function (e) {
        var r = svg.getBoundingClientRect();
        var i = Math.round(((e.clientX - r.left) - padL) / (stepX || 1) - (usesBars ? .5 : 0));
        i = Math.max(0, Math.min(n - 1, i));
        cursor.setAttribute('x1', X(i));
        cursor.setAttribute('x2', X(i));
        cursor.setAttribute('opacity', 1);
        series.forEach(function (sr) {
          if (!sr._dots) return;
          sr._dots.forEach(function (dt, j) { dt.classList.toggle('is-on', j === i); });
        });
        tip.show(X(i), Y(Math.max.apply(null, series.map(function (sr) {
          return sr.axis === 'y2' ? 0 : (sr.values[i] || 0);
        }))), labels[i], series.map(function (sr, k) {
          var f = sr.axis === 'y2' ? (opts.y2Format || F.numShort) : (opts.tooltipFormat || opts.yFormat || F.numShort);
          return {
            label: sr.name, color: sr.color || PALETTE[k % PALETTE.length],
            value: f(sr.values[i] || 0)
          };
        }));
      });
      hit.addEventListener('mouseleave', function () {
        cursor.setAttribute('opacity', 0);
        tip.hide();
        series.forEach(function (sr) {
          if (sr._dots) sr._dots.forEach(function (dt) { dt.classList.remove('is-on'); });
        });
      });

      host.appendChild(svg);

      /* legenda com toggle */
      if (opts.legend !== false && (opts.series || []).length > 1) {
        var leg = h('div.ch-legend');
        (opts.series || []).forEach(function (sr, i) {
          var c = sr.color || PALETTE[i % PALETTE.length];
          leg.appendChild(h('button', {
            type: 'button',
            class: hidden[sr.name] ? 'is-off' : '',
            'aria-pressed': String(!hidden[sr.name]),
            style: { '--c': c },
            onClick: function () {
              hidden[sr.name] = !hidden[sr.name];
              ctrl.redraw();
            }
          }, h('i', { class: sr.projected ? 'projected' : sr.kind === 'bar' ? '' : 'line' }), h('span', { text: sr.name })));
        });
        host.appendChild(leg);
      }
    }

    return {
      update: function (next) { Object.assign(opts, next); ctrl.redraw(); },
      destroy: ctrl.destroy, redraw: ctrl.redraw
    };
  }

  /* ==========================================================================
     bars() — barras verticais (simples, agrupadas ou empilhadas)
     ========================================================================== */
  function bars(host, opts) {
    host.classList.add('chart');
    host.style.position = 'relative';
    var tip = makeTip(host);
    var ctrl = responsive(host, draw);

    function draw(W) {
      D.qsa('svg,.ch-legend', host).forEach(function (n) { n.remove(); });
      var H = opts.height || 240;
      var labels = opts.labels || [];
      var series = opts.series || [];
      var stacked = !!opts.stacked;
      var padL = opts.padL || 44, padR = 12, padT = 18, padB = 30;
      var iw = Math.max(10, W - padL - padR);
      var ih = Math.max(10, H - padT - padB);
      var n = labels.length;

      var maxV = 0;
      if (stacked) {
        labels.forEach(function (_, i) {
          maxV = Math.max(maxV, series.reduce(function (a, sr) { return a + (sr.values[i] || 0); }, 0));
        });
      } else {
        series.forEach(function (sr) { maxV = Math.max(maxV, Math.max.apply(null, sr.values.concat([0]))); });
      }
      if (opts.target) maxV = Math.max(maxV, opts.target.value);
      var top = niceMax(maxV * 1.1) || 1;

      var slot = iw / Math.max(1, n);
      var gap = Math.min(14, slot * 0.28);
      var groupW = slot - gap;
      var bw = stacked ? groupW : groupW / Math.max(1, series.length);
      function Y(v) { return padT + ih - (v / top) * ih; }

      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });

      var gGrid = s('g', { class: 'ch-grid' }), gAxis = s('g', { class: 'ch-axis' });
      for (var t = 0; t <= 4; t++) {
        var yv = (top / 4) * t, y = Y(yv);
        gGrid.appendChild(s('line', { x1: padL, x2: padL + iw, y1: y, y2: y }));
        gAxis.appendChild(s('text', { x: padL - 8, y: y + 3.5, 'text-anchor': 'end', text: (opts.yFormat || F.numShort)(yv) }));
      }
      svg.appendChild(gGrid);

      var every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 64))));
      labels.forEach(function (lb, i) {
        if (n > 14 && i % every !== 0) return;
        gAxis.appendChild(s('text', { x: padL + slot * i + slot / 2, y: H - 10, 'text-anchor': 'middle', text: lb }));
      });
      svg.appendChild(gAxis);

      if (opts.target) {
        var ty = Y(opts.target.value);
        svg.appendChild(s('line', { x1: padL, x2: padL + iw, y1: ty, y2: ty, stroke: 'var(--ink-3)', 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .65 }));
        svg.appendChild(s('text', { x: padL + iw, y: ty - 6, 'text-anchor': 'end', class: 'ch-val ch-val--dim', text: opts.target.label || 'meta' }));
      }

      labels.forEach(function (lb, i) {
        var baseY = padT + ih;
        series.forEach(function (sr, si) {
          var v = sr.values[i] || 0;
          if (!v) return;
          var c = sr.color || PALETTE[si % PALETTE.length];
          var hgt = (v / top) * ih;
          var x = padL + slot * i + gap / 2 + (stacked ? 0 : si * bw);
          var y = stacked ? (baseY - hgt) : Y(v);
          if (stacked) baseY -= hgt;
          var rect = s('rect', {
            class: 'ch-bar', x: x, y: y, width: Math.max(1, bw - (stacked ? 0 : 2)),
            height: Math.max(0.5, hgt), rx: Math.min(4, bw / 3), fill: c, style: { '--i': i }
          });
          rect.addEventListener('mouseenter', function () {
            host.classList.add('is-hovering');
            rect.classList.add('is-on');
            tip.show(x + bw / 2, y, lb, [{ label: sr.name, color: c, value: (opts.yFormat || F.numShort)(v) }]);
          });
          rect.addEventListener('mouseleave', function () {
            host.classList.remove('is-hovering');
            rect.classList.remove('is-on');
            tip.hide();
          });
          svg.appendChild(rect);
        });

        /* rótulo de valor no topo quando cabe */
        if (opts.showValues && n <= 14) {
          var totalV = stacked
            ? series.reduce(function (a, sr) { return a + (sr.values[i] || 0); }, 0)
            : (series[0].values[i] || 0);
          if (totalV) {
            svg.appendChild(s('text', {
              class: 'ch-val', x: padL + slot * i + slot / 2, y: Y(totalV) - 7,
              text: (opts.valueFormat || opts.yFormat || F.numShort)(totalV)
            }));
          }
        }
      });

      host.appendChild(svg);

      if (opts.legend !== false && series.length > 1) {
        var leg = h('div.ch-legend');
        series.forEach(function (sr, i) {
          leg.appendChild(h('button', { type: 'button', style: { '--c': sr.color || PALETTE[i % PALETTE.length] } },
            h('i'), h('span', { text: sr.name })));
        });
        host.appendChild(leg);
      }
    }

    return { update: function (nx) { Object.assign(opts, nx); ctrl.redraw(); }, destroy: ctrl.destroy, redraw: ctrl.redraw };
  }

  /* ==========================================================================
     ranking() — barras horizontais com rótulo, valor e destaque
     items: [{ label, value, color, sub, meta }]
     ========================================================================== */
  function ranking(host, opts) {
    host.classList.add('chart');
    var ctrl = responsive(host, draw);

    function draw(W) {
      D.clear(host);
      var items = opts.items || [];
      if (!items.length) return;
      var rowH = opts.rowH || 34;
      var labelW = opts.labelW || Math.min(170, Math.max(96, W * 0.3));
      var valW = opts.valueW || 84;
      var max = Math.max.apply(null, items.map(function (it) { return it.value; }).concat([1]));
      var H = items.length * rowH + 6;
      var barX = labelW + 10;
      var barW = Math.max(20, W - barX - valW - 8);

      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });

      items.forEach(function (it, i) {
        var y = i * rowH + 6;
        var w = Math.max(2, (it.value / max) * barW);
        var c = it.color || PALETTE[i % PALETTE.length];

        svg.appendChild(s('text', {
          x: 0, y: y + 13, class: 'ch-axis',
          style: { fill: 'var(--ink-2)', fontSize: '12px', fontWeight: 600 },
          text: it.label.length > 22 ? it.label.slice(0, 21) + '…' : it.label
        }));
        /* trilho */
        svg.appendChild(s('rect', {
          x: barX, y: y + 3, width: barW, height: 14, rx: 7,
          fill: 'var(--bg-elev-2)'
        }));
        svg.appendChild(s('rect', {
          class: 'ch-bar-h', x: barX, y: y + 3, width: w, height: 14, rx: 7,
          fill: c, style: { '--i': i }
        }));
        svg.appendChild(s('text', {
          x: W, y: y + 14, 'text-anchor': 'end',
          style: { fill: 'var(--ink)', fontSize: '12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
          text: (opts.format || F.numShort)(it.value)
        }));
        if (it.sub) {
          svg.appendChild(s('text', {
            x: barX + w + 8, y: y + 14,
            style: { fill: 'var(--ink-4)', fontSize: '10.5px', fontWeight: 600 },
            text: it.sub
          }));
        }
      });
      host.appendChild(svg);
    }
    return { update: function (nx) { Object.assign(opts, nx); ctrl.redraw(); }, destroy: ctrl.destroy, redraw: ctrl.redraw };
  }

  /* ==========================================================================
     donut() — rosca com rótulo central e legenda lateral
     items: [{ label, value, color }]
     ========================================================================== */
  function donut(host, opts) {
    host.classList.add('chart');
    host.style.position = 'relative';
    var tip = makeTip(host);
    var ctrl = responsive(host, draw);

    function draw(W) {
      D.qsa('svg', host).forEach(function (n) { n.remove(); });
      var items = (opts.items || []).filter(function (i) { return i.value > 0; });
      var size = Math.min(opts.height || 200, W);
      var total = items.reduce(function (a, i) { return a + i.value; }, 0) || 1;
      var cx = size / 2, cy = size / 2;
      var rOut = size / 2 - 4, rIn = rOut * (opts.thickness || 0.62);

      var svg = s('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, style: { margin: '0 auto' }, role: 'img' });

      var ang = -Math.PI / 2;
      items.forEach(function (it, i) {
        var frac = it.value / total;
        var sweep = frac * Math.PI * 2;
        var c = it.color || PALETTE[i % PALETTE.length];
        var path = s('path', {
          class: 'ch-arc', d: arc(cx, cy, rIn, rOut, ang, ang + sweep), fill: c,
          style: { animation: 'fade-in var(--dur-3) var(--ease-out) both', animationDelay: (i * 60) + 'ms' }
        });
        var mid = ang + sweep / 2;
        path.addEventListener('mouseenter', function () {
          host.classList.add('is-hovering');
          path.classList.add('is-on');
          tip.show(cx + Math.cos(mid) * rOut * 0.8, cy + Math.sin(mid) * rOut * 0.8, it.label,
            [{ label: (opts.unitLabel || 'Total'), color: c, value: (opts.format || F.numShort)(it.value) + ' · ' + F.pct(frac * 100, 1) }]);
        });
        path.addEventListener('mouseleave', function () {
          host.classList.remove('is-hovering');
          path.classList.remove('is-on');
          tip.hide();
        });
        svg.appendChild(path);
        ang += sweep;
      });

      if (opts.center) {
        svg.appendChild(s('g', { class: 'ch-donut-center' },
          s('text', { class: 'v', x: cx, y: cy + 2, text: opts.center.value }),
          s('text', { class: 'l', x: cx, y: cy + 20, text: opts.center.label })
        ));
      }
      host.appendChild(svg);
    }

    function arc(cx, cy, r1, r2, a0, a1) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var x0 = cx + Math.cos(a0) * r2, y0 = cy + Math.sin(a0) * r2;
      var x1 = cx + Math.cos(a1) * r2, y1 = cy + Math.sin(a1) * r2;
      var x2 = cx + Math.cos(a1) * r1, y2 = cy + Math.sin(a1) * r1;
      var x3 = cx + Math.cos(a0) * r1, y3 = cy + Math.sin(a0) * r1;
      return 'M' + x0 + ' ' + y0 +
        ' A' + r2 + ' ' + r2 + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
        ' L' + x2 + ' ' + y2 +
        ' A' + r1 + ' ' + r1 + ' 0 ' + large + ' 0 ' + x3 + ' ' + y3 + ' Z';
    }

    return { update: function (nx) { Object.assign(opts, nx); ctrl.redraw(); }, destroy: ctrl.destroy, redraw: ctrl.redraw };
  }

  /* ==========================================================================
     funnel() — funil de conversão com perda entre etapas
     steps: [{ label, value, color }]
     ========================================================================== */
  function funnel(host, opts) {
    host.classList.add('chart');
    host.style.position = 'relative';
    var ctrl = responsive(host, draw);

    function draw(W) {
      D.clear(host);
      var steps = opts.steps || [];
      if (!steps.length) return;
      var rowH = opts.rowH || 54;
      var gap = 14;
      var H = steps.length * (rowH + gap);
      var max = steps[0].value || 1;

      /* Calha fixa para os rótulos. Escrever o nome da etapa dentro da barra
         não funciona: os últimos degraus do funil são estreitos demais e o
         texto vaza. */
      var gutter = Math.min(168, Math.max(96, W * 0.3));
      var area = Math.max(60, W - gutter - 8);
      var minW = Math.max(48, area * 0.14);
      var cxFunil = gutter + 8 + area / 2;

      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });

      steps.forEach(function (st, i) {
        var frac = max ? st.value / max : 0;
        var w = Math.max(minW, frac * area);
        var x = cxFunil - w / 2;
        var y = i * (rowH + gap);
        var c = st.color || PALETTE[i % PALETTE.length];

        /* rótulo e valor na calha, fora da barra */
        svg.appendChild(s('text', {
          x: gutter, y: y + rowH / 2 - 3, 'text-anchor': 'end',
          style: { fill: 'var(--ink-2)', fontSize: '11.5px', fontWeight: 650 },
          text: st.label
        }));
        svg.appendChild(s('text', {
          x: gutter, y: y + rowH / 2 + 16, 'text-anchor': 'end',
          style: {
            fill: 'var(--ink)', fontSize: '12px', fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em'
          },
          text: (opts.format || F.num)(st.value) + ' leads' +
            (st.amount !== undefined ? ' - ' + F.moneyShort(st.amount) : '')
        }));

        svg.appendChild(s('rect', {
          class: 'ch-funnel-seg', x: x, y: y, width: w, height: rowH, rx: 10,
          fill: c, opacity: .2, style: { '--i': i }
        }));
        svg.appendChild(s('rect', {
          class: 'ch-funnel-seg', x: x, y: y, width: w, height: rowH, rx: 10,
          fill: 'none', stroke: c, 'stroke-width': 1.2, opacity: .55, style: { '--i': i }
        }));

        /* percentual em relação ao topo, centrado na barra */
        svg.appendChild(s('text', {
          x: cxFunil, y: y + rowH / 2 + 5, 'text-anchor': 'middle',
          style: { fill: c, fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
          text: F.pct(frac * 100, frac * 100 < 10 ? 1 : 0)
        }));

        /* queda para a próxima etapa */
        if (i < steps.length - 1) {
          var next = steps[i + 1].value;
          var conv = st.value ? (next / st.value) * 100 : 0;
          var ok = conv >= (opts.goodRate || 50);
          svg.appendChild(s('text', {
            x: cxFunil, y: y + rowH + gap - 3, 'text-anchor': 'middle',
            style: {
              fill: ok ? 'var(--ok-500)' : (conv >= (opts.warnRate || 30) ? 'var(--warn-500)' : 'var(--bad-500)'),
              fontSize: '10.5px', fontWeight: 700, fontVariantNumeric: 'tabular-nums'
            },
            text: '↓ ' + F.pct(conv, 1) + '  ·  perde ' + F.pct(100 - conv, 0)
          }));
        }
      });
      host.appendChild(svg);
    }
    return { update: function (nx) { Object.assign(opts, nx); ctrl.redraw(); }, destroy: ctrl.destroy, redraw: ctrl.redraw };
  }

  /* ==========================================================================
     heatmap() — dia da semana × faixa de hora
     data: matriz [linha][coluna] de números
     ========================================================================== */
  function heatmap(host, opts) {
    host.classList.add('chart');
    host.style.position = 'relative';
    var tip = makeTip(host);
    var ctrl = responsive(host, draw);

    function draw(W) {
      D.qsa('svg', host).forEach(function (n) { n.remove(); });
      var rows = opts.rows || [], cols = opts.cols || [], data = opts.data || [];
      var padL = 34, padT = 18;
      var cw = Math.max(6, (W - padL) / Math.max(1, cols.length));
      var chh = opts.cellH || 24;
      var H = padT + rows.length * chh + 4;
      var max = 0;
      data.forEach(function (r) { r.forEach(function (v) { max = Math.max(max, v); }); });
      max = max || 1;

      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });

      cols.forEach(function (c, j) {
        if (cols.length > 12 && j % 2) return;
        svg.appendChild(s('text', {
          x: padL + cw * j + cw / 2, y: 11, 'text-anchor': 'middle', class: 'ch-axis',
          style: { fill: 'var(--ink-4)', fontSize: '9.5px', fontWeight: 650 }, text: c
        }));
      });

      rows.forEach(function (r, i) {
        svg.appendChild(s('text', {
          x: padL - 8, y: padT + i * chh + chh / 2 + 3.5, 'text-anchor': 'end',
          style: { fill: 'var(--ink-3)', fontSize: '10.5px', fontWeight: 650 }, text: r
        }));
        cols.forEach(function (c, j) {
          var v = (data[i] && data[i][j]) || 0;
          var t = v / max;
          /* Célula vazia mantém um tom mínimo da mesma cor: sem isso ela some
             no fundo e o mapa parece furado em vez de mostrar "sem atividade". */
          var cell = s('rect', {
            class: 'ch-cell',
            x: padL + cw * j + 1.5, y: padT + i * chh + 1.5,
            width: Math.max(2, cw - 3), height: chh - 3,
            fill: opts.color || 'var(--brand-500)',
            opacity: v ? (0.16 + t * 0.84) : 0.07,
            style: { '--i': i * cols.length + j }
          });
          cell.addEventListener('mouseenter', function () {
            tip.show(padL + cw * j + cw / 2, padT + i * chh, r + ' · ' + c,
              [{ label: opts.unit || 'Registros', color: opts.color || 'var(--brand-500)', value: F.num(v) }]);
          });
          cell.addEventListener('mouseleave', tip.hide);
          svg.appendChild(cell);
        });
      });
      host.appendChild(svg);
    }
    return { update: function (nx) { Object.assign(opts, nx); ctrl.redraw(); }, destroy: ctrl.destroy, redraw: ctrl.redraw };
  }

  /* ==========================================================================
     gauge() — medidor radial de meta
     ========================================================================== */
  function gauge(host, opts) {
    host.classList.add('chart');
    var ctrl = responsive(host, draw);

    function draw(W) {
      D.clear(host);
      var size = Math.min(opts.size || 168, W);
      var pctv = Math.max(0, Math.min(opts.max || 150, opts.value || 0));
      var cx = size / 2, cy = size / 2;
      var r = size / 2 - 12;
      var sw = opts.stroke || 12;
      var START = Math.PI * 0.75, SPAN = Math.PI * 1.5;
      var frac = Math.min(1, pctv / 100);

      var svg = s('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, style: { margin: '0 auto' }, role: 'img' });
      var trackD = arcPath(cx, cy, r, START, START + SPAN);
      svg.appendChild(s('path', { class: 'ch-gauge-track', d: trackD, 'stroke-width': sw }));

      var fillD = arcPath(cx, cy, r, START, START + SPAN * frac);
      var len = pathLen(fillD);
      var color = opts.color || (pctv >= 100 ? 'var(--ok-500)' : pctv >= 70 ? 'var(--brand-500)' : pctv >= 40 ? 'var(--warn-500)' : 'var(--bad-500)');
      svg.appendChild(s('path', {
        class: 'ch-gauge-fill', d: fillD, stroke: color,
        'stroke-width': sw, style: { '--len': len }
      }));

      /* marca de pace ideal */
      if (opts.pace !== undefined && opts.pace > 0 && opts.pace <= 100) {
        var a = START + SPAN * (opts.pace / 100);
        svg.appendChild(s('line', {
          x1: cx + Math.cos(a) * (r - sw / 2 - 3), y1: cy + Math.sin(a) * (r - sw / 2 - 3),
          x2: cx + Math.cos(a) * (r + sw / 2 + 3), y2: cy + Math.sin(a) * (r + sw / 2 + 3),
          stroke: 'var(--ink-2)', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .8
        }));
      }

      svg.appendChild(s('g', { class: 'ch-donut-center' },
        s('text', { class: 'v', x: cx, y: cy + 2, style: { fontSize: (size / 6) + 'px' }, text: F.pct(pctv, pctv % 1 ? 1 : 0) }),
        s('text', { class: 'l', x: cx, y: cy + 22, text: opts.label || 'da meta' })
      ));
      host.appendChild(svg);
    }

    function arcPath(cx, cy, r, a0, a1) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      return 'M' + (cx + Math.cos(a0) * r) + ' ' + (cy + Math.sin(a0) * r) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + (cx + Math.cos(a1) * r) + ' ' + (cy + Math.sin(a1) * r);
    }
    return { update: function (nx) { Object.assign(opts, nx); ctrl.redraw(); }, destroy: ctrl.destroy, redraw: ctrl.redraw };
  }

  /* ==========================================================================
     sparkline() — miniatura para KPI e célula de tabela
     ========================================================================== */
  function sparkline(values, opts) {
    opts = opts || {};
    var W = opts.width || 76, H = opts.height || 24;
    var vals = (values && values.length) ? values : [0, 0];
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var stepX = vals.length > 1 ? W / (vals.length - 1) : W;
    var pts = vals.map(function (v, i) {
      return [i * stepX, H - 2 - ((v - min) / span) * (H - 4)];
    });
    var d = smoothPath(pts, 0.2);
    var c = opts.color || 'var(--brand-500)';

    var svg = s('svg', {
      class: 'spark', viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'none', style: { width: W + 'px', height: H + 'px' }
    });
    if (opts.fill !== false) {
      svg.appendChild(s('path', {
        class: 'fill', d: d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z', fill: c
      }));
    }
    svg.appendChild(s('path', { d: d, stroke: c }));
    if (opts.dot !== false) {
      var last = pts[pts.length - 1];
      svg.appendChild(s('circle', { cx: last[0], cy: last[1], r: 2.2, fill: c, stroke: 'none' }));
    }
    return svg;
  }

  /* ==========================================================================
     stackbar() — composição 100% em barra horizontal
     items: [{ label, value, color }]
     ========================================================================== */
  function stackbar(items, opts) {
    opts = opts || {};
    var total = items.reduce(function (a, i) { return a + i.value; }, 0) || 1;
    var bar = h('div.stackbar');
    items.forEach(function (it, i) {
      if (!it.value) return;
      bar.appendChild(h('i', {
        style: { '--c': it.color || PALETTE[i % PALETTE.length], '--i': i, width: (it.value / total * 100) + '%' },
        'data-tip': it.label + ': ' + (opts.format || F.num)(it.value) + ' (' + F.pct(it.value / total * 100, 1) + ')'
      }));
    });
    if (opts.legend === false) return bar;
    var leg = h('div.ch-legend');
    items.forEach(function (it, i) {
      if (!it.value) return;
      leg.appendChild(h('button', { type: 'button', style: { '--c': it.color || PALETTE[i % PALETTE.length] } },
        h('i'), h('span', { text: it.label + ' · ' + F.pct(it.value / total * 100, 0) })));
    });
    return h('div', bar, leg);
  }

  AGIR.charts = {
    area: area, bars: bars, ranking: ranking, donut: donut, funnel: funnel,
    heatmap: heatmap, gauge: gauge, sparkline: sparkline, stackbar: stackbar,
    PALETTE: PALETTE, niceMax: niceMax, monotonePath: monotonePath
  };
})(window);
