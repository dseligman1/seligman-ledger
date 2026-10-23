/* Charts: small dependency-free SVG charts sized to their container.
   Line (incl. stacked area), bars with overlay line, waterfall, sparkline, html bars.
   Colours are CSS variables so both themes work; text always uses ink tokens. */
(function(){
  'use strict';
  const L = window.Ledger;
  const C = L.charts = {};
  let gid = 0;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  C.esc = esc;

  // "£193k", "£1.2m", "−£20k"
  C.axisMoney = v => {
    const a = Math.abs(v), sg = v < 0 ? '−' : '';
    if (a >= 1e6) return sg + '£' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'm';
    if (a >= 1e3) return sg + '£' + (a / 1e3).toFixed(a >= 1e5 ? 0 : (a >= 1e4 ? 0 : 1)).replace(/\.0$/, '') + 'k';
    return sg + '£' + Math.round(a);
  };

  function niceStep(span, count){
    const raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function ticks(lo, hi, count){
    if (lo === hi){ lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
    const st = niceStep(hi - lo, count), out = [];
    for (let v = Math.floor(lo / st) * st; v <= hi + st * 0.5; v += st) out.push(Math.round(v * 1e6) / 1e6);
    if (out[out.length - 1] < hi) out.push(out[out.length - 1] + st);
    return out;
  }
  const svgOpen = (W, H, extra = '') => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" ${extra}>`;

  // ---------- tooltip (one per chart container) ----------
  function tipFor(el){
    let t = el.querySelector(':scope > .tip');
    if (!t){ t = document.createElement('div'); t.className = 'tip'; el.appendChild(t); }
    return t;
  }
  function placeTip(el, t, x, y){
    const W = el.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
    let left = x + 14; if (left + tw > W) left = x - tw - 14; if (left < 0) left = Math.max(0, Math.min(W - tw, x - tw / 2));
    let top = y - th - 12; if (top < -8) top = y + 16;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  C.tipRow = (label, value, color) => `<div class="tr"><span class="l">${color ? `<i style="background:${color}"></i>` : ''}${esc(label)}</span><span>${value}</span></div>`;

  // Wire a hover/touch layer: idxAt(px) -> index; draw(i) -> {x, y, html}
  function interact(el, svg, plot, n, idxAt, show){
    const hit = svg.querySelector('.hit'); if (!hit) return;
    const t = tipFor(el), cross = svg.querySelector('.cross');
    let on = false;
    const move = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (svg.viewBox.baseVal.width / r.width);
      const i = idxAt(px); if (i < 0 || i >= n) return;
      const res = show(i); if (!res){ hide(); return; }
      t.innerHTML = res.html; t.classList.add('on'); on = true;
      if (cross){ cross.setAttribute('x1', res.x); cross.setAttribute('x2', res.x); cross.style.opacity = 1; }
      placeTip(el, t, res.x * r.width / svg.viewBox.baseVal.width, res.y * r.height / svg.viewBox.baseVal.height);
    };
    const hide = () => { t.classList.remove('on'); on = false; if (cross) cross.style.opacity = 0; svg.querySelectorAll('.hl').forEach(n => n.style.opacity = 0); };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') hide(); });
    el._hideTip = hide;
  }
  document.addEventListener('pointerdown', ev => { document.querySelectorAll('.chart').forEach(c => { if (!c.contains(ev.target) && c._hideTip) c._hideTip(); }); }, true);

  function xLabelIdx(labels, plotW, minGap){
    const n = labels.length, max = Math.max(2, Math.floor(plotW / minGap));
    const step = Math.max(1, Math.ceil(n / max));
    const out = []; for (let i = n - 1; i >= 0; i -= step) out.push(i);
    return out.reverse();
  }

  // ---------- line / stacked area ----------
  // o: { labels, fmtX(i), series:[{name,color,values,area,dash}], est:[bool], stacked, height, yFmt, tipFmt, zero, refs:[{v,label}], endLabels }
  C.line = function(el, o){
    const W = Math.max(260, Math.floor(el.clientWidth)), H = o.height || 240;
    const n = o.labels.length; if (!n){ el.innerHTML = '<div class="empty">No data yet</div>'; return; }
    const yF = o.yFmt || C.axisMoney;
    let ser = o.series;
    if (o.stacked){
      const acc = new Array(n).fill(0);
      ser = ser.map(s => { const base = acc.slice(); const top = s.values.map((v, i) => (acc[i] += (v || 0))); return { ...s, base, top }; });
    }
    const all = [];
    ser.forEach(s => (s.top || s.values).forEach(v => v != null && all.push(v)));
    (o.refs || []).forEach(r => all.push(r.v));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (o.zero || o.stacked){ lo = Math.min(0, lo); hi = Math.max(0, hi); }
    else { const sp = (hi - lo) || Math.abs(hi) || 1; lo -= sp * 0.08; hi += sp * 0.08; }
    const tk = ticks(lo, hi, H < 260 ? 4 : 5); lo = tk[0]; hi = tk[tk.length - 1];
    const ml = Math.max(...tk.map(v => yF(v).length)) * 6.6 + 10, mr = o.endLabels ? 14 : 10, mt = 12, mb = 24;
    const pw = W - ml - mr, ph = H - mt - mb;
    const x = i => ml + (n === 1 ? pw / 2 : i * pw / (n - 1));
    const y = v => mt + (hi - v) / (hi - lo) * ph;
    const est = o.est || [];
    let g = svgOpen(W, H, `aria-label="${esc(o.aria || 'Line chart')}"`);
    tk.forEach(v => { g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" style="stroke:${v === 0 ? 'var(--axis)' : 'var(--grid)'}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${esc(yF(v))}</text>`; });
    const fx = o.fmtX || (i => o.labels[i]);
    xLabelIdx(o.labels, pw, o.xGap || 62).forEach(i => { g += `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 && n > 1 ? 'start' : (i === n - 1 && n > 1 ? 'end' : 'middle')}">${esc(fx(i))}</text>`; });
    (o.refs || []).forEach(r => { g += `<line x1="${ml}" x2="${W - mr}" y1="${y(r.v)}" y2="${y(r.v)}" style="stroke:var(--muted);stroke-dasharray:3 4"/><text x="${W - mr}" y="${y(r.v) - 5}" text-anchor="end" class="dl" style="fill:var(--muted)">${esc(r.label)}</text>`; });

    ser.forEach(s => {
      const vals = s.top || s.values;
      if (o.stacked){
        let d = '', started = false;
        for (let i = 0; i < n; i++){ d += (started ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(vals[i]).toFixed(1); started = true; }
        for (let i = n - 1; i >= 0; i--) d += 'L' + x(i).toFixed(1) + ',' + y(s.base[i]).toFixed(1);
        g += `<path d="${d}Z" style="fill:${s.color};fill-opacity:.82;stroke:var(--surface);stroke-width:2"/>`;
        return;
      }
      if (s.area){
        let d = '', first = -1, last = -1;
        for (let i = 0; i < n; i++) if (vals[i] != null){ if (first < 0) first = i; last = i; d += (d ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(vals[i]).toFixed(1); }
        if (d){ const b = y(Math.max(lo, Math.min(0, hi))); g += `<path d="${d}L${x(last)},${b}L${x(first)},${b}Z" style="fill:${s.color};fill-opacity:.10"/>`; }
      }
      let solid = '', dash = '';
      const se = s.est || est;
      for (let i = 1; i < n; i++){
        if (vals[i] == null || vals[i - 1] == null) continue;
        const seg = `M${x(i - 1).toFixed(1)},${y(vals[i - 1]).toFixed(1)}L${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`;
        if (s.dash || se[i] || se[i - 1]) dash += seg; else solid += seg;
      }
      if (n === 1 && vals[0] != null) g += `<circle cx="${x(0)}" cy="${y(vals[0])}" r="4" style="fill:${s.color}"/>`;
      if (solid) g += `<path d="${solid}" style="fill:none;stroke:${s.color};stroke-width:${s.width || 2};stroke-linecap:round;stroke-linejoin:round"/>`;
      if (dash) g += `<path d="${dash}" style="fill:none;stroke:${s.color};stroke-width:${s.width || 2};stroke-dasharray:4 4;stroke-linecap:round;opacity:.85"/>`;
    });
    // end labels, nudged apart so they never collide
    if (o.endLabels && ser.length <= 4){
      const pts = ser.map(s => { const v = (s.top || s.values); let i = n - 1; while (i >= 0 && v[i] == null) i--; return i < 0 ? null : { s, i, yy: y(v[i]) }; }).filter(Boolean).sort((a, b) => a.yy - b.yy);
      for (let k = 1; k < pts.length; k++) if (pts[k].yy - pts[k - 1].yy < 14) pts[k].yy = pts[k - 1].yy + 14;
      pts.forEach(p => { g += `<circle cx="${x(p.i)}" cy="${y((p.s.top || p.s.values)[p.i])}" r="3.5" style="fill:${p.s.color};stroke:var(--surface);stroke-width:2"/>`;
        g += `<text x="${x(p.i) - 7}" y="${p.yy - 7}" text-anchor="end" class="dl">${esc(p.s.short || p.s.name)}</text>`; });
    }
    g += `<line class="cross" x1="0" x2="0" y1="${mt}" y2="${mt + ph}" style="stroke:var(--axis);opacity:0"/>`;
    ser.forEach((s, k) => { g += `<circle class="hl hl${k}" r="4.5" cx="-10" cy="-10" style="fill:${s.color};stroke:var(--surface);stroke-width:2;opacity:0"/>`; });
    g += `<rect class="hit" x="${ml}" y="0" width="${pw}" height="${H}" fill="transparent"/></svg>`;
    el.innerHTML = g;
    const svg = el.querySelector('svg');
    interact(el, svg, null, n, px => Math.round(n === 1 ? 0 : (px - ml) / pw * (n - 1)), i => {
      let topY = H;
      ser.forEach((s, k) => { const v = (s.top || s.values)[i]; const c = svg.querySelector('.hl' + k); if (v == null){ c.style.opacity = 0; return; } c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v)); c.style.opacity = 1; topY = Math.min(topY, y(v)); });
      const html = o.tipFmt ? o.tipFmt(i) : `<div class="th">${esc(fx(i))}</div>` + o.series.map(s => s.values[i] == null ? '' : C.tipRow(s.name, L.fmt.gbp(s.values[i]), s.color)).join('');
      return { x: x(i), y: topY, html };
    });
  };

  // ---------- bars (signed) with optional overlay line ----------
  // o: { labels, values, est, overlay:{name,values,color}, height, fmtX, tipFmt, clip, colorFn }
  C.bars = function(el, o){
    const W = Math.max(260, Math.floor(el.clientWidth)), H = o.height || 220;
    const n = o.labels.length; if (!n){ el.innerHTML = '<div class="empty">No data yet</div>'; return; }
    const vals = o.values, ov = o.overlay ? o.overlay.values : [];
    const present = vals.filter(v => v != null);
    let lo = Math.min(0, ...present, ...ov.filter(v => v != null)), hi = Math.max(0, ...present, ...ov.filter(v => v != null));
    let cap = null;
    if (o.clip !== false && present.length > 6){
      const abs = present.map(Math.abs).sort((a, b) => a - b), q = abs[Math.floor(abs.length * 0.88)];
      const lim = q * 1.6;
      if (abs[abs.length - 1] > lim * 1.25){ cap = lim; lo = Math.max(lo, -cap); hi = Math.min(hi, cap); ov.forEach(v => { if (v != null){ lo = Math.min(lo, v); hi = Math.max(hi, v); } }); }
    }
    const tk = ticks(lo, hi, H < 240 ? 4 : 5); lo = tk[0]; hi = tk[tk.length - 1];
    const ml = Math.max(...tk.map(v => C.axisMoney(v).length)) * 6.6 + 10, mr = 8, mt = 14, mb = 24;
    const pw = W - ml - mr, ph = H - mt - mb, band = pw / n;
    const bw = Math.max(1.5, Math.min(34, band - Math.min(4, Math.max(1.5, band * 0.28))));
    const cx = i => ml + band * i + band / 2;
    const y = v => mt + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * ph;
    const id = 'h' + (++gid);
    const fx = o.fmtX || (i => o.labels[i]);
    let g = svgOpen(W, H, `aria-label="${esc(o.aria || 'Bar chart')}"`);
    g += `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--surface)"/><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--muted);stroke-width:3"/></pattern></defs>`;
    tk.forEach(v => { g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" style="stroke:${v === 0 ? 'var(--axis)' : 'var(--grid)'}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${esc(C.axisMoney(v))}</text>`; });
    xLabelIdx(o.labels, pw, o.xGap || 56).forEach(i => { g += `<text x="${cx(i)}" y="${H - 6}" text-anchor="middle">${esc(fx(i))}</text>`; });
    const r = Math.min(4, bw / 2), y0 = y(0); let lastLbl = -1e9;
    vals.forEach((v, i) => {
      if (v == null || v === 0) return;
      const yt = y(v), left = cx(i) - bw / 2, h = Math.abs(yt - y0); if (h < 0.5) return;
      const rr = Math.min(r, h);
      const col = o.colorFn ? o.colorFn(v, i) : (v >= 0 ? 'var(--pos)' : 'var(--neg)');
      const d = v > 0
        ? `M${left},${y0}V${yt + rr}Q${left},${yt} ${left + rr},${yt}H${left + bw - rr}Q${left + bw},${yt} ${left + bw},${yt + rr}V${y0}Z`
        : `M${left},${y0}V${yt - rr}Q${left},${yt} ${left + rr},${yt}H${left + bw - rr}Q${left + bw},${yt} ${left + bw},${yt - rr}V${y0}Z`;
      const isEst = o.est && o.est[i];
      g += `<path d="${d}" style="fill:${isEst ? `url(#${id})` : col};${isEst ? `stroke:${col};stroke-width:1.2` : ''}"/>`;
      if (cap && Math.abs(v) > cap && cx(i) - lastLbl > 38){ lastLbl = cx(i); const ty = v > 0 ? yt - 4 : yt - 6; g += `<text x="${cx(i)}" y="${ty}" text-anchor="${v > 0 ? 'middle' : 'start'}" dx="${v > 0 ? 0 : bw / 2 + 3}" class="dl" style="font-size:10px;paint-order:stroke;stroke:var(--surface);stroke-width:3px">${esc(C.axisMoney(v))}</text>`; }
    });
    if (o.overlay){
      let d = ''; ov.forEach((v, i) => { if (v == null){ return; } d += (d ? 'L' : 'M') + cx(i).toFixed(1) + ',' + y(v).toFixed(1); });
      if (d) g += `<path d="${d}" style="fill:none;stroke:var(--surface);stroke-width:5;stroke-linejoin:round"/><path d="${d}" style="fill:none;stroke:${o.overlay.color || 'var(--accent)'};stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round"/>`;
    }
    g += `<rect class="hl" x="0" y="${mt}" width="${band}" height="${ph}" style="fill:var(--ink);opacity:0;pointer-events:none"/>`;
    g += `<rect class="hit" x="${ml}" y="0" width="${pw}" height="${H}" fill="transparent"/></svg>`;
    el.innerHTML = g;
    const svg = el.querySelector('svg'), hl = svg.querySelector('.hl');
    interact(el, svg, null, n, px => Math.floor((px - ml) / band), i => {
      hl.setAttribute('x', ml + band * i); hl.style.opacity = 0.06;
      const v = vals[i];
      const html = o.tipFmt ? o.tipFmt(i) : `<div class="th">${esc(fx(i))}</div>${C.tipRow('Value', v == null ? '—' : L.fmt.signed(v))}`;
      return { x: cx(i), y: v == null ? y0 : Math.min(y(v), y0), html };
    });
  };

  // ---------- waterfall ----------
  // steps: [{label, value, total:boolean, color}]
  C.waterfall = function(el, steps, o = {}){
    const W = Math.max(260, Math.floor(el.clientWidth)), H = o.height || 230;
    let run = 0; const bars = steps.map(s => { if (s.total){ const b = { ...s, from: 0, to: s.value }; run = s.value; return b; } const b = { ...s, from: run, to: run + s.value }; run += s.value; return b; });
    const all = bars.flatMap(b => [b.from, b.to]);
    const tk = ticks(Math.min(0, ...all), Math.max(0, ...all), 4); const lo = tk[0], hi = tk[tk.length - 1];
    const ml = Math.max(...tk.map(v => C.axisMoney(v).length)) * 6.6 + 10, mr = 6, mt = 22, mb = 26;
    const pw = W - ml - mr, ph = H - mt - mb, band = pw / bars.length, bw = Math.min(64, band * 0.66);
    const y = v => mt + (hi - v) / (hi - lo) * ph;
    let g = svgOpen(W, H, 'aria-label="Monthly plan waterfall"');
    tk.forEach(v => { g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" style="stroke:${v === 0 ? 'var(--axis)' : 'var(--grid)'}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${esc(C.axisMoney(v))}</text>`; });
    bars.forEach((b, i) => {
      const cx = ml + band * i + band / 2, top = y(Math.max(b.from, b.to)), bot = y(Math.min(b.from, b.to)), h = Math.max(1, bot - top);
      const col = b.color || (b.total ? 'var(--ink-2)' : (b.value >= 0 ? 'var(--pos)' : 'var(--neg)'));
      g += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="4" style="fill:${col}"/>`;
      if (i < bars.length - 1){ const nx = ml + band * (i + 1) + band / 2 - bw / 2; g += `<line x1="${cx + bw / 2}" x2="${nx}" y1="${y(b.to)}" y2="${y(b.to)}" style="stroke:var(--axis);stroke-dasharray:2 3"/>`; }
      g += `<text x="${cx}" y="${top - 6}" text-anchor="middle" class="dl">${esc((b.total ? '' : (b.value >= 0 ? '+' : '')) + C.axisMoney(b.value))}</text>`;
      g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
    });
    el.innerHTML = g + '</svg>';
  };

  // ---------- sparkline (string) ----------
  C.spark = function(vals, o = {}){
    const w = o.w || 76, h = o.h || 28, v = vals.filter(x => x != null);
    if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="4" x2="${w - 4}" y1="${h / 2}" y2="${h / 2}" style="stroke:var(--line-2);stroke-dasharray:2 3"/>${v.length ? `<circle cx="${w - 4}" cy="${h / 2}" r="2.5" style="fill:${o.color || 'var(--ink-2)'}"/>` : ''}</svg>`;
    const lo = Math.min(...v), hi = Math.max(...v), sp = (hi - lo) || 1;
    const pts = v.map((x, i) => [3 + i * (w - 6) / (v.length - 1), h - 3 - (x - lo) / sp * (h - 6)]);
    const up = v[v.length - 1] >= v[0];
    const col = o.color || (up ? 'var(--pos)' : 'var(--neg)');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('')}" style="fill:none;stroke:${col};stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.4" style="fill:${col}"/></svg>`;
  };

  // ---------- html horizontal bars ----------
  // items: [{label, value, color, display}] ; values are magnitudes
  C.hbars = function(items, o = {}){
    const max = o.max || Math.max(1, ...items.map(i => Math.abs(i.value)));
    return `<div class="hbars ${o.cls || ''}">` + items.map(i => `<div class="hbar"><div class="top"><span>${esc(i.label)}</span><span>${i.display != null ? i.display : L.fmt.gbp(i.value)}</span></div><div class="track"><div class="fill" style="width:${Math.max(0.5, Math.abs(i.value) / max * 100).toFixed(2)}%;background:${i.color || 'var(--accent)'}"></div></div></div>`).join('') + '</div>';
  };
  // a single stacked track: segs [{label, value, color}]
  C.stack = function(segs){
    const tot = segs.reduce((t, s) => t + Math.max(0, s.value), 0) || 1;
    return `<div class="hbar ladder"><div class="track">${segs.map(s => `<div class="fill" title="${esc(s.label)}" style="width:${(Math.max(0, s.value) / tot * 100).toFixed(2)}%;background:${s.color};border-radius:3px"></div>`).join('')}</div></div>`;
  };

  C.legend = items => `<div class="legend">${items.map(i => `<span><i class="sw ${i.box ? 'box' : ''} ${i.dash ? 'dash' : ''}" style="background:${i.color}"></i>${esc(i.name)}</span>`).join('')}</div>`;
})();
