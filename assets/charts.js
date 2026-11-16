/* PFE Tracker — charts (HTML/CSS based: crisp text at every width, hover + keyboard tooltips, table view). */
(function () {
  'use strict';
  var App = window.App, h = App.html, t = App.t;
  var Ch = App.Charts = {};

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function num(v) { return Math.round(v * 10) / 10; }

  function table(head, rows) {
    return h`<details class="chart-table"><summary>${t('Show the numbers')}</summary><div class="table-wrap"><table>
      <thead><tr>${App.join(head, function (c) { return h`<th>${c}</th>`; })}</tr></thead>
      <tbody>${App.join(rows, function (r) { return h`<tr>${App.join(r, function (c, i) { return i ? h`<td class="num">${c}</td>` : h`<th scope="row">${c}</th>`; })}</tr>`; })}</tbody>
    </table></div></details>`;
  }
  function legend(series, kind) {
    if (series.length < 2) return '';
    return h`<div class="legend">${App.join(series, function (s, i) {
      return h`<span class="key"><i class="sw ${kind || 'rect'} s${(s.slot || i + 1)}"></i>${s.name}</span>`;
    })}</div>`;
  }

  // grouped columns: {labels:[], series:[{name, values:[], slot}], unit, height}
  Ch.columns = function (o) {
    var max = 0;
    o.series.forEach(function (s) { s.values.forEach(function (v) { max = Math.max(max, v || 0); }); });
    var top = niceMax(max), ticks = [0, top / 2, top];
    var unit = o.unit ? ' ' + o.unit : '';
    if (!o.labels.length) return App.empty(t('No data yet.'));
    return h`<div class="chart">
      ${legend(o.series)}
      <div class="vchart" style="--ch:${o.height || 170}px" role="img" aria-label="${o.title || ''}">
        <div class="vc-grid">${App.join(ticks, function (v) { return h`<div class="vc-tick" style="bottom:${100 * v / top}%"><span>${num(v)}</span></div>`; })}</div>
        <div class="vc-groups">${App.join(o.labels, function (lab, i) {
          return h`<div class="vc-group"><div class="vc-bars">${App.join(o.series, function (s, j) {
            var v = s.values[i] || 0;
            return h`<div class="vc-bar s${s.slot || j + 1} ${v ? '' : 'zero'}" style="height:${100 * v / top}%" tabindex="0"
              data-tip="${lab} · ${s.name}: ${num(v)}${unit}"></div>`;
          })}</div><div class="vc-label">${lab}</div></div>`;
        })}</div>
      </div>
      ${table([''].concat(o.series.map(function (s) { return s.name; })), o.labels.map(function (l, i) {
        return [o.tableLabels ? o.tableLabels[i] : l].concat(o.series.map(function (s) { return num(s.values[i] || 0); }));
      }))}
    </div>`;
  };

  // line with markers and a crosshair band per point: {labels, values (null = no value), min, max, name}
  Ch.line = function (o) {
    var n = o.labels.length;
    if (!n || !o.values.some(function (v) { return v !== null && v !== undefined && v !== ''; })) return App.empty(t('No data yet.'));
    var min = o.min, max = o.max;
    var x = function (i) { return n === 1 ? 50 : 4 + 92 * i / (n - 1); };
    var y = function (v) { return 100 - 100 * (v - min) / (max - min); };
    var pts = [];
    o.values.forEach(function (v, i) { if (v !== null && v !== undefined && v !== '') pts.push([x(i), y(v), v, i]); });
    var ticks = [];
    for (var v = min; v <= max; v++) ticks.push(v);
    return h`<div class="chart">
      <div class="lchart" style="--ch:${o.height || 150}px" role="img" aria-label="${o.title || o.name}">
        <div class="vc-grid">${App.join(ticks, function (v) { return h`<div class="vc-tick" style="bottom:${100 - y(v)}%"><span>${v}</span></div>`; })}</div>
        <div class="lc-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline class="lc-line s1" vector-effect="non-scaling-stroke"
            points="${pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ')}"/></svg>
          ${App.join(pts, function (p) { return h`<span class="lc-dot s1" style="left:${p[0]}%;top:${p[1]}%"></span>`; })}
          ${App.join(o.labels, function (lab, i) {
            var v = o.values[i];
            var has = v !== null && v !== undefined && v !== '';
            return h`<span class="lc-band" tabindex="0" style="left:${x(i)}%;width:${n > 1 ? 92 / (n - 1) : 40}%" data-tip="${lab} · ${o.name}: ${has ? (o.fmt ? o.fmt(v) : v) : t('no report')}"><i></i></span>`;
          })}
        </div>
        <div class="lc-labels">${App.join(o.labels, function (lab, i) { return h`<span style="left:${x(i)}%">${lab}</span>`; })}</div>
      </div>
      ${table(['', o.name], o.labels.map(function (l, i) { var v = o.values[i]; return [l, v === null || v === undefined || v === '' ? '—' : (o.fmt ? o.fmt(v) : v)]; }))}
    </div>`;
  };

  // horizontal bars, one series, value at the tip: items [{label, value}]
  Ch.hbars = function (items, o) {
    o = o || {};
    if (!items.length) return App.empty(o.empty || t('No data yet.'));
    var max = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    return h`<div class="chart"><div class="hbars">${App.join(items, function (it) {
      return h`<div class="hb-row" tabindex="0" data-tip="${it.label}: ${num(it.value)}${o.unit ? ' ' + o.unit : ''}">
        <span class="hb-label">${it.label}</span>
        <span class="hb-track"><span class="hb-bar s${it.slot || 1}" style="width:${Math.max(1.5, 100 * it.value / max)}%"></span><b>${num(it.value)}</b></span>
      </div>`;
    })}</div></div>`;
  };

  // one whole split into parts (tall segmented bar): items [{label, value, slot}]
  Ch.segbar = function (items) {
    var total = items.reduce(function (s, i) { return s + i.value; }, 0);
    if (!total) return App.empty(t('No tasks yet.'));
    var parts = items.filter(function (i) { return i.value > 0; });
    return h`<div class="chart"><div class="segbar" role="img" aria-label="${parts.map(function (p) { return p.label + ' ' + p.value; }).join(', ')}">
      ${App.join(parts, function (p) {
        var pct = Math.round(100 * p.value / total);
        return h`<span class="seg ${p.cls || 's' + p.slot}" style="flex:${p.value}" tabindex="0" data-tip="${p.label}: ${p.value} (${pct}%)">${pct >= 12 ? pct + '%' : ''}</span>`;
      })}</div>
      <div class="legend">${App.join(parts, function (p) { return h`<span class="key"><i class="sw rect ${p.cls || 's' + p.slot}"></i>${p.label} · ${p.value}</span>`; })}</div>
    </div>`;
  };

  // circular meter
  Ch.ring = function (pct, label) {
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    var r = 42, c = 2 * Math.PI * r;
    return h`<div class="ring" role="img" aria-label="${label}: ${pct}%">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="${r}"/>
      <circle class="ring-fill" cx="50" cy="50" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 50 50)"/></svg>
      <span><b>${pct}%</b><small>${label}</small></span></div>`;
  };

  Ch.meter = function (pct, cls) {
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return h`<span class="meter ${cls || ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>`;
  };

  // timeline: {from, to, rows:[{label, sub, start, end, kind}], today}
  Ch.gantt = function (o) {
    var span = Math.max(1, App.days(o.from, o.to));
    var pos = function (d) { return Math.max(0, Math.min(100, 100 * App.days(o.from, d) / span)); };
    var months = [], d = App.parse(o.from);
    d.setDate(1);
    while (App.ymd(d) <= o.to) {
      var s = App.ymd(d);
      months.push({ at: pos(s < o.from ? o.from : s), label: new Intl.DateTimeFormat(App.locale(), { month: 'short' }).format(d) + (d.getMonth() === 0 ? ' ' + d.getFullYear() : '') });
      d.setMonth(d.getMonth() + 1);
    }
    var todayPos = o.today >= o.from && o.today <= o.to ? pos(o.today) : null;
    return h`<div class="gantt-wrap"><div class="gantt">
      <div class="g-row g-head"><span class="g-label"></span><span class="g-track">${App.join(months, function (m) { return h`<span class="g-month" style="left:${m.at}%">${m.label}</span>`; })}</span></div>
      ${App.join(o.rows, function (r) {
        var a = r.start || r.end, b = r.end || r.start;
        var bar = '';
        if (a && b) {
          var l = pos(a), w = Math.max(0.8, pos(b) - l);
          bar = r.point ? h`<i class="g-point ${r.kind}" style="left:${pos(b)}%" tabindex="0" data-tip="${r.label} · ${App.fmt(b)}"></i>`
            : h`<i class="g-bar ${r.kind}" style="left:${l}%;width:${w}%" tabindex="0" data-tip="${r.label} · ${App.fmt(a)} → ${App.fmt(b)}${r.tip ? ' · ' + r.tip : ''}">${r.pct !== undefined ? h`<b style="width:${r.pct}%"></b>` : ''}</i>`;
        }
        return h`<div class="g-row ${r.sub ? 'sub' : ''}"><span class="g-label" title="${r.label}">${r.label}</span><span class="g-track">
          ${App.join(months, function (m) { return h`<span class="g-line" style="left:${m.at}%"></span>`; })}
          ${todayPos !== null ? h`<span class="g-today" style="left:${todayPos}%"></span>` : ''}${bar}</span></div>`;
      })}
      ${todayPos !== null ? h`<div class="g-row g-foot"><span class="g-label"></span><span class="g-track"><span class="g-today-label" style="left:${todayPos}%">${t('Today')}</span></span></div>` : ''}
    </div></div>`;
  };

  // ---------------------------------------------------------------- one tooltip for every chart (text only)
  var tip;
  function showTip(el, x, y) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = el.getAttribute('data-tip');
    tip.style.display = 'block';
    var r = tip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    var top = y - r.height - 12;
    if (top < 8) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }
  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(el, e.clientX, e.clientY); else hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return hideTip();
    var r = el.getBoundingClientRect();
    showTip(el, r.left + r.width / 2, r.top);
  });
  document.addEventListener('scroll', hideTip, true);
})();
