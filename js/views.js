/* Pages, chart specs and popups. Every page is a pure render of state -> HTML; charts mount afterwards. */
(function(){
  'use strict';
  const L = window.Ledger, M = L.model, C = L.charts, esc = C.esc, UI = L.ui;
  const { gbp, signed, pct, cls } = L.fmt;
  const S = () => L.S;
  const pad = n => String(n).padStart(2, '0');

  // ---------------- small builders ----------------
  const seg = (k, opts, cur) => `<div class="seg" role="group">${opts.map(([v, n]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${n}</button>`).join('')}</div>`;
  const tagColor = t => `var(--s${(t && t.color) || 1})`;
  const chip = t => `<span class="chip"><i class="sw" style="background:${tagColor(t)}"></i>${esc(t.name)}</span>`;
  const chg = (n, suffix = '') => n == null ? '<span class="muted">—</span>' : `<span class="${cls(n)}">${signed(n)}</span>${suffix}`;
  const inputNum = n => (n == null || n === '') ? '' : (Number.isInteger(Math.round(Number(n) * 100) / 100) ? Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 }) : Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const BUCKET = { savings: { name: 'Savings', color: 'var(--s1)' }, current: { name: 'Current accounts', color: 'var(--s2)' }, asset: { name: 'Other assets', color: 'var(--s3)' } };
  const ASSET_COL = ['var(--s3)', 'var(--s7)', 'var(--s5)', 'var(--s6)'];
  const RANGES = [['1y','1Y'],['2y','2Y'],['3y','3Y'],['all','All']];
  const MEAS = [{ id: 'liquid', name: 'Liquid funds', color: 'var(--accent)' }, { id: 'savings', name: 'Savings', color: 'var(--s1)' }, { id: 'current', name: 'Current accounts', color: 'var(--s2)' }];
  const yearColor = y => `var(--s${(((y - 2023) % 8) + 8) % 8 + 1})`;
  const groupColor = (s, gid) => `var(--s${(s.budget.groups.findIndex(g => g.id === gid) % 8) + 1})`;
  const pageHead = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}</div>`;
  const plusBtn = (act, label, extra = '') => `<button class="btn" data-act="${act}" ${extra}>${L.icons.plus.replace('<svg', '<svg width="16" height="16"')}${label}</button>`;
  const vis = L.vis;
  const updLbl = (on, last) => on ? `<span class="upd ok">✓ Updated ${M.dateLbl(on, false)}</span>` : `<span class="upd due">Due${last ? ` · last updated ${M.dateLbl(last.date, false)}` : ''}</span>`;

  function ranged(){ const tl = M.timeline(S()); const n = { '1y': 13, '2y': 25, '3y': 37 }[UI.range]; return n ? tl.slice(-n) : tl; }
  const recordedCount = () => S().snapshots.filter(x => x.balances || x.totals).length;

  function tipMonth(p){
    let h = `<div class="th">${M.lbl(p.m, 'long')}</div>`;
    h += C.tipRow('Savings', gbp(p.savings), 'var(--s1)') + C.tipRow('Current', gbp(p.current), 'var(--s2)') + C.tipRow('Liquid', `<b>${gbp(p.liquid)}</b>`);
    if (p.change != null) h += C.tipRow('Change', signed(p.change));
    if (p.oneOff) h += C.tipRow('One-offs', signed(p.oneOff));
    return h;
  }
  function monthTable(tl){
    const rows = tl.slice().reverse().map(p => `<tr><td>${M.lbl(p.m)}</td><td class="r hide-sm">${gbp(p.savings)}</td><td class="r hide-sm">${gbp(p.current)}</td><td class="r">${gbp(p.liquid)}</td><td class="r ${cls(p.change)}">${p.change == null ? '—' : signed(p.change)}</td></tr>`).join('');
    return `<table class="tbl"><thead><tr><th>Month</th><th class="r hide-sm">Savings</th><th class="r hide-sm">Current</th><th class="r">Liquid</th><th class="r">Change</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ======================================================================
  // CHART SPECS  (pills = tick-box series toggles; the y-axis rescales to what's ticked)
  // ======================================================================
  L.specs.composition = () => {
    const tl = ranged();
    const items = [{ id: 'savings', name: 'Savings', color: 'var(--s1)' }, { id: 'current', name: 'Current accounts', color: 'var(--s2)' }];
    const on = items.filter(i => vis('composition', i.id));
    return {
      title: 'Liquid funds', sub: 'Savings + current accounts at each month-end', pills: items,
      controls: () => seg('range', RANGES, UI.range),
      draw(el, big){ C.line(el, { labels: tl.map(p => p.m), fmtX: i => M.lbl(tl[i].m), stacked: on.length > 1, height: big ? 380 : (el.clientWidth > 560 ? 300 : 240), aria: 'Liquid funds',
        series: on.map(i => ({ name: i.name, color: i.color, values: tl.map(p => p[i.id]), area: on.length === 1 })), tipFmt: i => tipMonth(tl[i]) }); },
      table: () => monthTable(tl),
    };
  };

  L.specs.balance = () => {
    const tl = ranged(), last = tl[tl.length - 1], on = MEAS.filter(i => vis('balance', i.id));
    return {
      title: 'Balances over time', sub: tl.length ? `${M.lbl(tl[0].m, 'long')} to ${M.lbl(last.m, 'long')}` : '', pills: MEAS,
      controls: () => seg('range', RANGES, UI.range),
      draw(el, big){ C.line(el, { labels: tl.map(p => p.m), fmtX: i => M.lbl(tl[i].m), height: big ? 380 : 270, aria: 'Balances over time', endLabels: on.length > 1,
        series: on.map(i => ({ name: i.name, short: i.name.split(' ')[0], color: i.color, values: tl.map(p => p[i.id]), area: on.length === 1 })), tipFmt: i => tipMonth(tl[i]) }); },
      readout(){
        if (!tl.length) return '';
        const k = on[0].id, vals = tl.map(p => p[k]), ago = M.point(S(), M.addM(last.m, -12));
        let hi = 0, lo = 0; vals.forEach((v, i) => { if (v > vals[hi]) hi = i; if (v < vals[lo]) lo = i; });
        return `<div class="readout"><span>${on[0].name} now <b>${gbp(last[k])}</b></span>${ago ? `<span>vs a year ago <b class="${cls(last[k] - ago[k])}">${signed(last[k] - ago[k])}</b></span>` : ''}<span>Over range <b class="${cls(last[k] - tl[0][k])}">${signed(last[k] - tl[0][k])}</b></span><span>Peak <b>${gbp(vals[hi])}</b> ${M.lbl(tl[hi].m)}</span><span>Low <b>${gbp(vals[lo])}</b> ${M.lbl(tl[lo].m)}</span></div>`;
      },
      table: () => monthTable(tl),
    };
  };

  L.specs.change = () => {
    const s = S(), full = M.timeline(s), key = UI.strip ? 'underlying' : 'change';
    const allV = full.map(p => p[key]), allR = M.rolling(allV, UI.roll);
    let n = ranged().length; if (n === full.length) n = full.length - 1;
    const tl = full.slice(-n), v = allV.slice(-n), r = allR.slice(-n);
    const hasEvents = (s.events || []).length > 0;
    const items = [{ id: 'bars', name: 'Monthly change', color: 'var(--pos)' }, { id: 'avg', name: UI.roll + '-month average', color: 'var(--accent)' }];
    const showBars = vis('change', 'bars'), showAvg = vis('change', 'avg');
    const pv = v.filter(x => x != null);
    return {
      title: 'Monthly change', sub: `How much liquid funds rose (blue) or fell (red) each month`, pills: items,
      controls: () => seg('range', RANGES, UI.range) + seg('roll', [[3,'3-mo avg'],[6,'6-mo avg'],[12,'12-mo avg']], UI.roll) + (hasEvents ? `<label class="switch"><input type="checkbox" ${UI.strip ? 'checked' : ''} data-act="set" data-k="strip" data-v="${!UI.strip}">Strip one-offs</label>` : ''),
      draw(el, big){ C.bars(el, { labels: tl.map(p => p.m), values: showBars ? v : v.map(() => null), overlay: showAvg ? { name: 'avg', values: r, color: 'var(--accent)' } : null, clip: showBars, height: big ? 360 : 230, fmtX: i => M.lbl(tl[i].m), aria: 'Monthly change in liquid funds',
        tipFmt: i => { const p = tl[i]; return `<div class="th">${M.lbl(p.m, 'long')}</div>` + C.tipRow('Change', `<b>${signed(p.change)}</b>`) + (p.oneOff ? C.tipRow('One-offs', signed(p.oneOff)) + C.tipRow('Underlying', signed(p.underlying)) : '') + (r[i] != null ? C.tipRow(UI.roll + '-mo avg', signed(r[i]), 'var(--accent)') : '') + C.tipRow('Liquid after', gbp(p.liquid)); } }); },
      readout(){
        if (!pv.length) return '';
        const avg = pv.reduce((a, b) => a + b, 0) / pv.length, up = pv.filter(x => x > 0).length;
        let bi = 0, wi = 0; v.forEach((x, i) => { if (x == null) return; if (v[bi] == null || x > v[bi]) bi = i; if (v[wi] == null || x < v[wi]) wi = i; });
        return `<div class="readout"><span>Average <b class="${cls(avg)}">${signed(avg)}</b>/mo</span><span>Up <b>${up}</b> of ${pv.length} months</span><span>Best <b class="pos">${signed(v[bi])}</b> ${M.lbl(tl[bi].m)}</span><span>Worst <b class="neg">${signed(v[wi])}</b> ${M.lbl(tl[wi].m)}</span></div>`;
      },
      table: () => monthTable(tl),
      notes: () => 'Very large months (like the 2024 house move) are capped so normal months stay readable. Their real value is printed on the bar and in the table. Transfers between your own accounts net to zero here.',
    };
  };

  L.specs.yoy = () => {
    const tl = M.timeline(S()), years = [...new Set(tl.map(p => M.yearOf(p.m)))];
    const items = years.map(y => ({ id: String(y), name: String(y), color: yearColor(y) }));
    const ser = years.filter(y => vis('yoy', y)).map(y => ({ name: String(y), short: String(y), color: yearColor(y), values: Array.from({ length: 12 }, (_, m) => { const p = tl.find(q => q.m === `${y}-${pad(m + 1)}`); return p ? p.liquid : null; }) }));
    return {
      title: 'Year against year', sub: 'Liquid funds by calendar month, one line per year', pills: items,
      draw(el, big){ C.line(el, { labels: M.MON, height: big ? 380 : 260, series: ser, endLabels: true, xGap: 34, aria: 'Liquid funds by month, per year',
        tipFmt: i => `<div class="th">${M.MON[i]}</div>` + ser.map(x => x.values[i] == null ? '' : C.tipRow(x.name, gbp(x.values[i]), x.color)).join('') }); },
      table: () => yearTable(),
    };
  };
  function yearTable(){
    const ys = M.yearSummary(S()).slice().reverse();
    return `<table class="tbl"><thead><tr><th>Year</th><th class="r hide-sm">Start</th><th class="r hide-sm">End</th><th class="r">Change</th><th class="r">Avg / mo</th><th class="r hide-sm">Best month</th><th class="r hide-sm">Worst month</th></tr></thead><tbody>${ys.map(y => `<tr><td>${y.year}${y.partial ? ` <span class="muted tiny">${M.lbl(y.firstM, 'mon')}–${M.lbl(y.endM, 'mon')}</span>` : ''}</td><td class="r hide-sm">${gbp(y.start)}</td><td class="r hide-sm">${gbp(y.end)}</td><td class="r ${cls(y.change)}">${signed(y.change)}</td><td class="r ${cls(y.avg)}">${signed(y.avg)}</td><td class="r hide-sm">${y.best ? signed(y.best.underlying) + ' <span class="muted tiny">' + M.lbl(y.best.m, 'mon') + '</span>' : '—'}</td><td class="r hide-sm">${y.worst ? signed(y.worst.underlying) + ' <span class="muted tiny">' + M.lbl(y.worst.m, 'mon') + '</span>' : '—'}</td></tr>`).join('')}</tbody></table>`;
  }

  L.specs.cover = () => {
    const s = S(), tl = ranged(), all = M.coverSeries(s), cs = all.slice(-tl.length), costs = M.coverCosts(s);
    return {
      title: 'Months of cover over time', sub: `Liquid funds${s.coverage.excludeSlow && s.coverage.slowTagId && M.tag(s, s.coverage.slowTagId) ? ` less ${esc(M.tag(s, s.coverage.slowTagId).name)}${M.detailSnaps(s).length ? ` (from ${M.lbl(M.detailSnaps(s)[0].month, 'mon')} ${M.detailSnaps(s)[0].month.slice(0, 4)}, when accounts were first logged one by one)` : ''}` : ''} ÷ ${gbp(costs)} a month (${s.settings.planYear} plan, same as the headline)`,
      controls: () => seg('range', RANGES, UI.range),
      draw(el, big){ C.line(el, { labels: cs.map(p => p.m), fmtX: i => M.lbl(cs[i].m), height: big ? 360 : 250, yFmt: v => Math.round(v) + ' mo', zero: true,
        refs: [{ v: 6, label: '6 months' }, { v: 12, label: '12 months' }], series: [{ name: 'Months of cover', color: 'var(--accent)', values: cs.map(p => p.v), area: true }], aria: 'Months of cover over time',
        tipFmt: i => `<div class="th">${M.lbl(tl[i].m, 'long')}</div>` + C.tipRow('Cover', `<b>${cs[i].v == null ? '—' : cs[i].v.toFixed(1) + ' months'}</b>`) + C.tipRow('Liquid', gbp(tl[i].liquid)) }); },
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="r">Liquid</th><th class="r">Cover</th></tr></thead><tbody>${tl.slice().reverse().map((p, k) => { const c = cs[cs.length - 1 - k]; return `<tr><td>${M.lbl(p.m)}</td><td class="r">${gbp(p.liquid)}</td><td class="r">${c.v == null ? '—' : c.v.toFixed(1)}</td></tr>`; }).join('')}</tbody></table>`,
      notes: () => 'Every month uses the same yardstick as the Planner headline: your planning-year fixed + living costs (plus extras if you switch them on) and your cost adjustments. Fund adjustments ("coming in", "still owed") only apply to today, so the last point matches the headline exactly.',
    };
  };

  L.specs.plan = () => {
    const s = S(), tl = M.timeline(s), years = [...new Set(tl.map(p => M.yearOf(p.m)))];
    const y = years.includes(UI.planView) ? UI.planView : years[years.length - 1];
    const prevDec = M.point(s, `${y - 1}-12`), firstPt = tl.find(p => M.yearOf(p.m) === y);
    const startIdx = prevDec ? 0 : M.monthNum(firstPt.m) - 1;
    const base = prevDec ? prevDec.liquid : firstPt.liquid;
    const key = UI.strip ? 'underlying' : 'change';
    const actual = [], plan = []; let a = 0, p = 0;
    for (let m = 0; m < 12; m++){
      const ym = `${y}-${pad(m + 1)}`, pt = M.point(s, ym);
      if (m < startIdx){ actual.push(null); plan.push(null); continue; }
      if (m === startIdx && !prevDec){ actual.push(0); plan.push(0); continue; }
      p += M.planMonth(s, ym).net; plan.push(p);
      if (pt && pt.change != null){ a += pt[key]; actual.push(a); } else actual.push(null);
    }
    const items = [{ id: 'actual', name: 'Actual', color: 'var(--s1)' }, { id: 'plan', name: 'Plan', color: 'var(--muted)' }];
    const ser = [];
    if (vis('plan', 'actual')) ser.push({ name: 'Actual', color: 'var(--s1)', values: actual, width: 2.4 });
    if (vis('plan', 'plan')) ser.push({ name: 'Plan', color: 'var(--muted)', values: plan, dash: true });
    let li = -1; actual.forEach((v, i) => { if (v != null) li = i; });
    const src = M.planMonth(s, `${y}-01`).source;
    return {
      title: 'Actual against plan', sub: `${y}: cumulative change in liquid funds since ${prevDec ? 'December ' + (y - 1) : M.lbl(firstPt.m, 'long')}, against the ${src === 'sheet' ? 'sheet\'s month-by-month plan' : 'budget'}`, pills: items,
      controls: () => seg('planView', years.map(v => [v, v]), y),
      draw(el, big){ C.line(el, { labels: M.MON, height: big ? 360 : 250, zero: true, xGap: 34, aria: 'Actual change vs plan', series: ser,
        tipFmt: i => `<div class="th">${M.MON[i]} ${y}</div>` + C.tipRow('Actual', actual[i] == null ? '—' : signed(actual[i]), 'var(--s1)') + C.tipRow('Plan', plan[i] == null ? '—' : signed(plan[i]), 'var(--muted)') + (actual[i] != null && plan[i] != null ? C.tipRow('Gap', `<b class="${cls(actual[i] - plan[i])}">${signed(actual[i] - plan[i])}</b>`) : '') + C.tipRow('Plan that month', signed(M.planMonth(s, `${y}-${pad(i + 1)}`).net)) }); },
      readout(){
        if (li < 0) return '';
        const gap = actual[li] - plan[li];
        return `<div class="readout"><span>By ${M.MON[li]}: actual <b class="${cls(actual[li])}">${signed(actual[li])}</b></span><span>Plan <b>${signed(plan[li])}</b></span><span><b class="${cls(gap)}">${gap >= 0 ? 'Ahead' : 'Behind'} by ${gbp(Math.abs(gap))}</b></span></div>`;
      },
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="r">Plan that month</th><th class="r">Actual that month</th><th class="r">Gap so far</th></tr></thead><tbody>${M.MON.map((mn, i) => { const ym = `${y}-${pad(i + 1)}`, pt = M.point(s, ym), pm = M.planMonth(s, ym); if (plan[i] == null) return ''; return `<tr><td>${mn}</td><td class="r">${signed(pm.net)}</td><td class="r ${pt ? cls(pt[key]) : ''}">${pt && pt.change != null ? signed(pt[key]) : '—'}</td><td class="r ${actual[i] != null ? cls(actual[i] - plan[i]) : ''}">${actual[i] != null ? signed(actual[i] - plan[i]) : '—'}</td></tr>`; }).join('')}</tbody></table>`,
      notes: () => 'Past months use the plan your sheet had for that month (Cash Flow rows 85 and 87), which already included the flat rent, the house move and other one-offs you planned for. From this month on, the plan comes from the Budget tab, including any bonus months you set there.',
    };
  };

  L.specs.tags = () => {
    const s = S(), snaps = M.detailSnaps(s);
    const items = s.tags.map(t => ({ id: t.id, name: t.name, color: tagColor(t) }));
    const ser = s.tags.filter(t => vis('tags', t.id)).map(t => ({ name: t.name, color: tagColor(t), values: snaps.map(x => M.tagTotalAt(s, t.id, x)) }));
    return {
      title: 'Your buckets over time', sub: 'Totals per tag. Per-account detail starts ' + (snaps[0] ? M.lbl(snaps[0].month, 'long') : '—') + ' and fills in with every check-in', pills: items,
      draw(el, big){ if (!s.tags.length){ el.innerHTML = '<div class="empty">Add tags in Accounts to see buckets here.</div>'; return; }
        C.line(el, { labels: snaps.map(x => x.month), fmtX: i => M.lbl(snaps[i].month), height: big ? 360 : 250, series: ser, endLabels: ser.length <= 4, aria: 'Tag totals over time' }); },
      table: () => `<table class="tbl"><thead><tr><th>Tag</th><th class="r hide-sm">${snaps.length > 1 ? M.lbl(snaps[snaps.length - 2].month) : ''}</th><th class="r">${snaps.length ? M.lbl(snaps[snaps.length - 1].month) : ''}</th><th class="r">Change</th></tr></thead><tbody>${s.tags.map(t => { const v = snaps.map(x => M.tagTotalAt(s, t.id, x)); const a = v[v.length - 2], b = v[v.length - 1]; return `<tr><td>${esc(t.name)}</td><td class="r hide-sm">${gbp(a)}</td><td class="r">${gbp(b)}</td><td class="r ${cls(b - a)}">${a == null ? '—' : signed(b - a)}</td></tr>`; }).join('')}</tbody></table>`,
    };
  };

  L.specs.networth = () => {
    const s = S(), tl = ranged(), assets = s.accounts.filter(a => a.bucket === 'asset' && !a.archived);
    const items = [{ id: 'liquid', name: 'Liquid funds', color: 'var(--accent)' }].concat(assets.map((a, i) => ({ id: a.id, name: a.name, color: ASSET_COL[i % 4] })));
    const on = items.filter(i => vis('networth', i.id));
    const val = (p, id) => id === 'liquid' ? p.liquid : (p.assetsBy[id] || 0);
    return {
      title: 'Net worth', sub: L.DEMO ? 'Liquid funds plus other assets (home and car are estimates)' : 'Liquid funds plus other assets (house and shares are estimates from the sheet)', pills: items,
      controls: () => seg('range', RANGES, UI.range),
      draw(el, big){ C.line(el, { labels: tl.map(p => p.m), fmtX: i => M.lbl(tl[i].m), stacked: on.length > 1, height: big ? 380 : 270, aria: 'Net worth over time',
        series: on.map(i => ({ name: i.name, color: i.color, values: tl.map(p => val(p, i.id)), area: on.length === 1 })),
        tipFmt: i => `<div class="th">${M.lbl(tl[i].m, 'long')}</div>` + on.map(it => C.tipRow(it.name, gbp(val(tl[i], it.id)), it.color)).join('') + (on.length > 1 ? C.tipRow('Total', `<b>${gbp(on.reduce((t, it) => t + val(tl[i], it.id), 0))}</b>`) : '') }); },
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="r hide-sm">Liquid</th>${assets.map(a => `<th class="r hide-sm">${esc(a.name)}</th>`).join('')}<th class="r">Net worth</th></tr></thead><tbody>${tl.slice().reverse().map(p => `<tr><td>${M.lbl(p.m)}</td><td class="r hide-sm">${gbp(p.liquid)}</td>${assets.map(a => `<td class="r hide-sm">${gbp(p.assetsBy[a.id] || 0)}</td>`).join('')}<td class="r">${gbp(p.netWorth)}</td></tr>`).join('')}</tbody></table>`,
    };
  };

  L.specs.acc = id => {
    const s = S(), a = M.acc(s, id), ser = M.accountSeries(s, id), b = BUCKET[a.bucket] || BUCKET.current;
    return {
      title: a.name, sub: b.name + (a.estimate ? ' · estimate' : ''),
      draw(el, big){ C.line(el, { labels: ser.map(x => x.m), fmtX: i => M.lbl(ser[i].m), height: big ? 300 : 220, series: [{ name: a.name, color: b.color, values: ser.map(x => x.v), area: true }], aria: a.name + ' balance over time' }); },
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="hide-sm">Updated</th><th class="r">Balance</th><th class="r">Change</th></tr></thead><tbody>${ser.slice().reverse().map((x, k, arr) => `<tr><td>${M.lbl(x.m, 'long')}</td><td class="hide-sm muted">${x.date ? M.dateLbl(x.date) : '—'}</td><td class="r">${gbp(x.v)}</td><td class="r ${arr[k + 1] ? cls(x.v - arr[k + 1].v) : ''}">${arr[k + 1] ? signed(x.v - arr[k + 1].v) : '—'}</td></tr>`).join('')}</tbody></table>`,
    };
  };

  L.specs.waterfall = () => {
    const s = S(), y = UI.budgetYear || s.settings.planYear, p = M.plan(s, y);
    return {
      title: `${y} monthly plan`, sub: 'What\'s left after each layer of cost (monthly average)',
      draw(el, big){ C.waterfall(el, [
        { label: 'Income', value: p.income, total: true, color: 'var(--pos)' }, { label: 'Fixed', value: -p.fixed }, { label: 'Living', value: -p.living },
        { label: 'Extras', value: -p.extra }, { label: 'Bonus', value: p.bonus }, { label: 'Net', value: p.net, total: true, color: p.net >= 0 ? 'var(--pos)' : 'var(--neg)' },
      ], { height: big ? 340 : 240 }); },
      readout: () => `<div class="readout"><span>Before bonus <b class="${cls(p.netExBonus)}">${signed(p.netExBonus)}</b>/mo</span><span>After bonus <b class="${cls(p.net)}">${signed(p.net)}</b>/mo</span></div>`,
      table: () => `<table class="tbl"><thead><tr><th>Group</th><th class="r">${y} / mo</th><th class="r hide-sm">Per year</th></tr></thead><tbody>${s.budget.groups.map(g => { const t = M.groupTotal(s, g.id, M.budgetYear(s, y), ['income','bonus','fixed','living','extra']); return t ? `<tr><td>${esc(g.name)}</td><td class="r">${gbp(t)}</td><td class="r hide-sm">${gbp(t * 12)}</td></tr>` : ''; }).join('')}</tbody></table>`,
    };
  };

  // Planned spend per month by group: the sheet's plan for past months, the Budget tab from now on.
  // One bucket ticked -> the bars split by that bucket's budget lines. Tap a bar for the month's breakdown.
  const LINE_SLOTS = 7;
  function spendModel(){
    const s = S(), groups = M.spendGroups(s), now = M.thisMonth();
    const lastY = M.years(s)[M.years(s).length - 1], end = `${lastY}-12`;
    const firstPlan = Object.keys(s.planHistory || {}).sort()[0] || now;
    const start = UI.spendRange === 'all' ? firstPlan : M.addM(now, UI.spendRange === '1y' ? -12 : -24);
    const labels = []; for (let m = start < firstPlan && s.planHistory && Object.keys(s.planHistory).length ? firstPlan : start; m <= end; m = M.addM(m, 1)) labels.push(m);
    const items = groups.map(g => ({ id: g.id, name: g.name, color: groupColor(s, g.id) }));
    const on = items.filter(i => vis('spend', i.id));
    const gAmt = (m, gid) => M.planMonth(s, m).groups[gid] || 0;
    let ser, mode = 'groups', gid = null, lineItems = [];
    if (on.length === 1){
      mode = 'lines'; gid = on[0].id;
      // rank the bucket's lines by spend over the whole history + plan, so colours don't shift with the range
      const all = Object.keys(s.planHistory || {}).concat(labels);
      const lines = s.budget.lines.filter(l => l.groupId === gid).map(l => ({ l, t: all.reduce((t, m) => t + (M.planMonthLines(s, m)[l.id] || 0), 0) })).filter(x => x.t > 0).sort((p, q) => q.t - p.t);
      const top = lines.length > LINE_SLOTS + 1 ? lines.slice(0, LINE_SLOTS) : lines, rest = lines.slice(top.length);
      lineItems = top.map((x, k) => ({ id: x.l.id, name: x.l.name, color: `var(--s${k + 1})`, ids: [x.l.id] }));
      if (rest.length) lineItems.push({ id: 'other', name: `Other (${rest.length})`, color: 'var(--muted)', ids: rest.map(x => x.l.id) });
      ser = lineItems.map(i => ({ name: i.name, color: i.color, values: labels.map(m => { const pl = M.planMonthLines(s, m); return i.ids.reduce((t, id) => t + (pl[id] || 0), 0); }) }));
      const unsplit = labels.map((m, k) => Math.max(0, gAmt(m, gid) - ser.reduce((t, x) => t + x.values[k], 0)));
      if (unsplit.some(v => v > 0.5)) ser.push({ name: 'Not split by line', color: 'var(--line-2)', values: unsplit.map(v => v > 0.5 ? v : 0) });
    } else ser = on.map(i => ({ name: i.name, color: i.color, values: labels.map(m => gAmt(m, i.id)) }));
    const tot = labels.map((_, k) => ser.reduce((t, x) => t + x.values[k], 0));
    const inflow = labels.map(m => M.planMonth(s, m).inflow);
    const pctInc = tot.map((v, k) => inflow[k] > 0 ? v / inflow[k] * 100 : null);
    return { s, now, labels, items, on, ser, mode, gid, lineItems, tot, inflow, pctInc };
  }
  const pctTxt = v => v == null ? '—' : Math.round(v) + '%';

  // The month breakdown under the chart: each bucket with its share of income, opening to its lines' share of the bucket.
  const spendOpen = new Set();
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('.drill-g')){ if (d.open) spendOpen.add(d.dataset.g); else spendOpen.delete(d.dataset.g); } }, true);
  function spendDetail(sm){
    const s = sm.s, m = sm.labels.includes(UI.spendSel) ? UI.spendSel : (sm.labels.includes(sm.now) ? sm.now : sm.labels[sm.labels.length - 1]);
    const pmo = M.planMonth(s, m), pl = M.planMonthLines(s, m), inflow = pmo.inflow;
    const rows = sm.on.map(g => {
      const total = pmo.groups[g.id] || 0;
      const lines = s.budget.lines.filter(l => l.groupId === g.id && pl[l.id]).map(l => ({ l, v: pl[l.id] })).sort((p, q) => q.v - p.v);
      const split = lines.reduce((t, x) => t + x.v, 0);
      if (total - split > 0.5) lines.push({ l: { name: 'Not split by line' }, v: total - split, muted: true });
      return { g, total, lines };
    }).filter(r => r.total > 0).sort((p, q) => q.total - p.total);
    const spend = rows.reduce((t, r) => t + r.total, 0);
    const lineCol = id => { const it = sm.lineItems.find(i => i.ids.includes(id)); return it ? it.color : 'var(--muted)'; };
    const open = r => sm.mode === 'lines' || spendOpen.has(r.g.id);
    const body = rows.map(r => `<details class="drill-g" data-g="${r.g.id}" ${open(r) ? 'open' : ''}>
        <summary><span class="dg-name"><i class="sw box" style="background:${r.g.color}"></i>${esc(r.g.name)}</span><span class="dg-num">${gbp(r.total)}</span><span class="dg-pct muted">${pctTxt(inflow ? r.total / inflow * 100 : null)}<span class="hide-sm"> of income</span></span></summary>
        <div class="drill-lines">${r.lines.length ? C.hbars(r.lines.map(x => ({ label: x.l.name, value: x.v, color: x.muted ? 'var(--line-2)' : (sm.mode === 'lines' ? lineCol(x.l.id) : r.g.color), display: `${gbp(x.v)} <span class="muted tiny">${Math.round(x.v / r.total * 100)}%</span>` })), { max: r.total }) : '<div class="muted small">No line detail for this month.</div>'}
          ${sm.mode === 'groups' ? `<button class="btn sm" data-act="spendOnly" data-g="${r.g.id}">Chart ${esc(r.g.name)} by line</button>` : ''}</div>
      </details>`).join('');
    return `<div class="drill-head"><div><b>${M.lbl(m, 'long')}</b> <span class="muted small">· ${m > sm.now ? 'budget plan' : m === sm.now ? 'this month' : 'the sheet\'s plan'}</span></div>
        <div class="small"><b>${gbp(spend)}</b> <span class="muted">of ${gbp(inflow)} income ·</span> <b class="${spend > inflow ? 'neg' : ''}">${pctTxt(inflow ? spend / inflow * 100 : null)}</b></div></div>
      ${body || '<div class="muted small">Nothing planned for the buckets you\'ve ticked.</div>'}
      ${sm.mode === 'lines' ? `<button class="btn sm" data-act="spendAll">Show all buckets</button>` : ''}
      <div class="tiny muted" style="margin-top:8px">Tap any bar to see that month. Line % = share of its bucket.</div>`;
  }
  L.acts.spendOnly = el => { UI.off.spend = M.spendGroups(S()).map(g => g.id).filter(id => id !== el.dataset.g); spendOpen.add(el.dataset.g); L.saveUI(); L.render(); if (L.modal.isOpen) L.modal.refresh(); };
  L.acts.spendAll = () => { UI.off.spend = []; L.saveUI(); L.render(); if (L.modal.isOpen) L.modal.refresh(); };

  L.specs.spend = () => {
    const sm = spendModel(), { labels, ser, now } = sm;
    const nowIdx = labels.indexOf(now);
    const one = sm.mode === 'lines' ? sm.on[0].name : null;
    const selIdx = () => { const i = labels.indexOf(UI.spendSel); return i >= 0 ? i : nowIdx; };
    const tableMonths = [M.addM(now, -12), now, M.addM(now, 12)].filter(m => labels.includes(m));
    return {
      title: 'Where the money goes',
      sub: one ? `${esc(one)} split by budget line. Line on the right axis = ${esc(one)} as a % of total income.` : 'Planned spend each month by bucket. The line (right axis) is the ticked buckets as a % of total income; above the dashed 100% line means more going out than coming in.',
      pills: sm.items,
      controls: () => seg('spendRange', [['1y','Last 12 mo + ahead'],['2y','Last 24 mo + ahead'],['all','All']], UI.spendRange),
      draw(el, big){ C.stackBars(el, { labels, series: ser, height: big ? 380 : 280, fmtX: i => M.lbl(labels[i]), markIdx: nowIdx, markLabel: 'Now', faded: i => labels[i] > now, aria: 'Planned spend per month with share of income',
        pct: { name: '% of income', values: sm.pctInc, ref: sm.mode === 'groups' ? 100 : null, refLabel: '100% of income' }, sel: selIdx(),
        onPick: i => { UI.spendSel = labels[i]; const html = spendDetail(spendModel()); document.querySelectorAll('[data-drill="spend"]').forEach(d => { d.innerHTML = html; }); document.querySelectorAll('[data-chart="spend"]').forEach(c => { if (c !== el) L.spec('spend').draw(c, c.dataset.big === '1'); }); },
        tipFmt: i => `<div class="th">${M.lbl(labels[i], 'long')}${labels[i] > now ? ' · planned' : ''}</div>` + ser.slice().reverse().map(x => x.values[i] ? C.tipRow(x.name, gbp(x.values[i]), x.color) : '').join('') + C.tipRow('Total', `<b>${gbp(sm.tot[i])}</b>`) + C.tipRow('Income', gbp(sm.inflow[i])) + C.tipRow('% of income', `<b>${pctTxt(sm.pctInc[i])}</b>`) }); },
      readout: () => `${sm.mode === 'lines' ? C.legend(ser.map(x => ({ name: x.name, color: x.color, box: true })).concat([{ name: '% of income', color: 'var(--ink)' }])) : C.legend([{ name: '% of income (right axis)', color: 'var(--ink)' }, { name: '100% of income', color: 'var(--ink-2)', dash: true }])}<div class="drill" data-drill="spend">${spendDetail(sm)}</div>`,
      table: () => sm.mode === 'lines'
        ? `<table class="tbl"><thead><tr><th>Line</th>${tableMonths.map(m => `<th class="r">${M.lbl(m)}</th>`).join('')}</tr></thead><tbody>${ser.map(x => `<tr><td>${esc(x.name)}</td>${tableMonths.map(m => `<td class="r">${gbp(x.values[labels.indexOf(m)])}</td>`).join('')}</tr>`).join('')}<tr><td><b>% of income</b></td>${tableMonths.map(m => `<td class="r">${pctTxt(sm.pctInc[labels.indexOf(m)])}</td>`).join('')}</tr></tbody></table>`
        : `<table class="tbl"><thead><tr><th>Bucket</th>${tableMonths.map(m => `<th class="r">${M.lbl(m)}</th>`).join('')}</tr></thead><tbody>${sm.on.map(i => `<tr><td>${esc(i.name)}</td>${tableMonths.map(m => `<td class="r">${gbp(M.planMonth(sm.s, m).groups[i.id] || 0)}</td>`).join('')}</tr>`).join('')}<tr><td><b>% of income</b></td>${tableMonths.map(m => `<td class="r">${pctTxt(sm.pctInc[labels.indexOf(m)])}</td>`).join('')}</tr></tbody></table>`,
      notes: () => 'Bars after "Now" are lighter because they\'re planned. ' + (Object.keys(S().planHistory).length ? 'Before today the figures are what the sheet planned at the time; from today they come from the Budget tab.' : 'The figures come from the Budget tab, using each year\'s amounts.') + ' Income includes bonuses in the month they\'re paid, so bonus months show a lower %. Tick one bucket to split it by line.',
    };
  };

  L.specs.projection = () => {
    const s = S(), back = UI.projBack || 12, pr = M.projection(s, back, 24);
    if (!pr) return { title: 'Projection', draw(el){ el.innerHTML = '<div class="empty">Log some balances first.</div>'; } };
    const items = [{ id: 'actual', name: 'Actual', color: 'var(--accent)' }, { id: 'trend', name: `Recent trend (${signed(pr.trendRate)}/mo)`, color: 'var(--s1)' }, { id: 'budget', name: 'Budget plan', color: 'var(--s3)' }];
    if (pr.hasScenarios) items.push({ id: 'withS', name: 'Budget + what-ifs', color: 'var(--s2)' });
    const pick = { actual: { values: pr.actual, width: 2.4 }, trend: { values: pr.trend, dash: true }, budget: { values: pr.budget, dash: true }, withS: { values: pr.withS, dash: true } };
    const ser = items.filter(i => vis('projection', i.id)).map(i => ({ name: i.name, short: i.name.split(' (')[0], color: i.color, ...pick[i.id] }));
    return {
      title: 'Where liquid funds are heading', controls: () => seg('projBack', [[12,'1 year back'],[24,'2 years back']], back), sub: `Last ${back} months actual (solid), next 24 months projected (dashed)${pr.hasUpcoming ? ', including Coming up items' : ''}`, pills: items,
      draw(el, big){ C.line(el, { labels: pr.labels, fmtX: i => M.lbl(pr.labels[i]), height: big ? 380 : 270, series: ser, markIdx: pr.now, markLabel: 'Today', aria: 'Liquid funds: actual and projected',
        tipFmt: i => `<div class="th">${M.lbl(pr.labels[i], 'long')}${i > pr.now ? ' · projected' : ''}</div>` + ser.map(x => x.values[i] == null ? '' : C.tipRow(x.short, gbp(x.values[i]), x.color)).join('') + (i > pr.now ? C.tipRow('Plan that month', signed(M.planMonth(s, pr.labels[i]).net)) : '') }); },
      readout: () => { const i12 = pr.now + 12, i24 = pr.now + 24; return `<div class="readout"><span>In 12 months: trend <b>${gbp(pr.trend[i12])}</b> · budget <b>${gbp(pr.budget[i12])}</b></span><span>In 24 months: trend <b>${gbp(pr.trend[i24])}</b> · budget <b>${gbp(pr.budget[i24])}</b></span>${pr.hasScenarios ? `<span>What-ifs at 12 months <b class="${cls(pr.withS[i12] - pr.budget[i12])}">${signed(pr.withS[i12] - pr.budget[i12])}</b></span>` : ''}</div>`; },
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="r">Trend</th><th class="r">Budget</th>${pr.hasScenarios ? '<th class="r hide-sm">+ What-ifs</th>' : ''}</tr></thead><tbody>${pr.labels.map((m, i) => (i <= pr.now || (i - pr.now) % 3) ? '' : `<tr><td>${M.lbl(m, 'long')}</td><td class="r">${gbp(pr.trend[i])}</td><td class="r">${gbp(pr.budget[i])}</td>${pr.hasScenarios ? `<td class="r hide-sm">${gbp(pr.withS[i])}</td>` : ''}</tr>`).join('')}</tbody></table>`,
      notes: () => '"Recent trend" repeats your 6-month average change. "Budget plan" uses the Budget tab month by month, so bonus months and annual bills show as steps. Both add anything in Coming up.',
    };
  };

  // ======================================================================
  // OVERVIEW
  // ======================================================================
  function checkinCard(s){
    const tm = M.thisMonth(), ci = M.checkin(s, tm), pctDone = ci.total ? Math.round(ci.done / ci.total * 100) : 0;
    const stepsDone = ci.items.filter(i => i.done).length;
    const status = ci.complete ? '<span class="pos">✓ Complete</span>' : (ci.started ? 'In progress' : '<span style="color:var(--accent)">Due now</span>');
    const out = ci.rows.filter(r => !r.on);
    const btn = ci.done === ci.total
      ? `<button class="btn block" data-act="logBalances" data-m="${tm}">Review ${M.lbl(tm, 'month')} balances</button>`
      : `<button class="btn primary block" data-act="logBalances" data-m="${tm}">${ci.started ? 'Continue' : 'Start'} ${M.lbl(tm, 'month')} check-in</button>`;
    const list = ci.items.map(i => `<li class="${i.done ? 'done' : ''}"><button class="box ${i.done ? 'done' : ''}" data-act="tick" data-m="${tm}" data-k="${i.id}" aria-pressed="${i.done}" aria-label="${esc(i.label)}">✓</button>
      <span class="txt"><span>${i.tab ? `<a href="#" data-act="tab" data-tab="${i.tab}">${esc(i.label)}</a>` : esc(i.label)}</span>${i.auto ? `<span class="sub">${i.detail} accounts${ci.done === ci.total ? ' · ticked automatically' : ''}</span>` : ''}</span></li>`).join('');
    return `<section class="card s5 accent update-card">
      <div class="hero-label">Monthly check-in · ${status}</div>
      <div class="month">${M.lbl(tm, 'long')}</div>
      <div class="progress ${ci.done === ci.total ? 'done' : ''}"><div style="width:${pctDone}%"></div></div>
      <div class="when"><b>${ci.done} of ${ci.total}</b> accounts updated${ci.started ? '' : ` · last check-in ${(() => { const p = M.lastRecordedMonth(s); const sn = p && M.snap(s, p); return p ? M.lbl(p, 'long') + (sn && sn.date ? ' (' + M.dateLbl(sn.date, false) + ')' : '') : '—'; })()}`}</div>
      ${out.length && ci.started ? `<div class="small muted">Still to update:</div><div class="outstanding">${out.slice(0, 10).map(r => `<span class="chip">${esc(r.acc.name)}</span>`).join('')}${out.length > 10 ? `<span class="chip">+${out.length - 10} more</span>` : ''}</div>` : ''}
      <div style="margin-top:12px">${btn}</div>
      <ul class="checklist" aria-label="Check-in steps, ${stepsDone} of ${ci.items.length} done">${list}</ul>
    </section>`;
  }

  L.pages.overview = { render(){
    const s = S(), l = M.latest(s);
    if (!l) return pageHead('Overview') + `<div class="card"><div class="empty">No balances yet.<br><br><button class="btn primary" data-act="logBalances">Log your first balances</button></div></div>`;
    const tl = M.timeline(s), prev = tl[tl.length - 2], ago = M.point(s, M.addM(l.m, -12));
    const avg6 = M.avgChange(s, 6), plan = M.plan(s, M.yearOf(l.m)), cov = M.coverage(s), nw = M.netWorth(s);

    const implied = avg6 == null ? null : plan.inflow - avg6;
    let v;
    if (avg6 == null) v = { c: 'warn', i: '?', t: 'Not enough history yet', d: 'Log a few months to see the trend.' };
    else if (avg6 >= 250) v = { c: 'good', i: '✓', t: 'More is coming in than going out', d: `Liquid funds grew <b>${signed(avg6)}</b> a month on average over the last 6 months.` };
    else if (avg6 > -250) v = { c: 'warn', i: '≈', t: 'Roughly breaking even', d: `Liquid funds moved <b>${signed(avg6)}</b> a month on average over the last 6 months.` };
    else v = { c: 'bad', i: '!', t: 'Spending more than is coming in', d: `Liquid funds fell <b>${gbp(-avg6)}</b> a month on average over the last 6 months, so today's funds would last about ${(l.liquid / -avg6 / 12).toFixed(1)} years at that rate.` };
    if (implied != null) v.d += ` That suggests spending of roughly ${gbp(implied)}/mo against ${gbp(plan.outgoings)} planned for ${plan.year}.`;

    const d = M.detailSnaps(s), ds = d[d.length - 1], dp = d[d.length - 2];
    const bucketRows = s.tags.map(t => {
      const now = M.tagTotalAt(s, t.id, ds), was = dp ? M.tagTotalAt(s, t.id, dp) : null;
      return `<div class="row clickable" data-act="goTags"><div><div class="name"><span class="chip"><i class="sw" style="background:${tagColor(t)}"></i>${esc(t.name)}</span></div><div class="meta">${M.tagAccounts(s, t.id).length} accounts</div></div><div class="right"><div class="big">${gbp(now)}</div><div class="chg">${was == null ? '' : chg(now - was)}</div></div></div>`;
    }).join('');

    const mv = M.moves(s);
    const trRows = mv.transfers.map(t => `<div class="row"><div><div class="name">Transfer</div><div class="meta">${esc(t.from.name)} → ${esc(t.to.name)}</div></div><div class="right"><div class="big muted">${gbp(t.amount)}</div><div class="chg muted">net £0</div></div></div>`).join('');
    const moverRows = mv.rows.filter(r => Math.abs(r.net) >= 1).slice(0, 6).map(r => `<div class="row clickable" data-act="openAccount" data-id="${r.acc.id}"><div><div class="name">${esc(r.acc.name)}</div><div class="meta">${gbp(r.from)} → ${gbp(r.to)}${r.rest != null ? ` · after the ${gbp(Math.abs(r.d - r.rest))} transfer` : ''}</div></div><div class="right"><div class="big ${cls(r.net)}">${signed(r.net)}</div></div></div>`).join('');

    return pageHead('Overview', `Balances as of ${l.snap && l.snap.date ? M.dateLbl(l.snap.date) : M.lbl(l.m, 'long')}`) + `
    <div class="grid">
      <section class="card s7">
        <div class="hero-label">Liquid funds · savings + current</div>
        <div class="hero-value">${gbp(l.liquid)}</div>
        <div class="hero-deltas">
          ${prev ? `<span><b class="${cls(l.change)}">${signed(l.change)}</b> vs ${M.lbl(prev.m, 'month')}</span>` : ''}
          ${ago ? `<span><b class="${cls(l.liquid - ago.liquid)}">${signed(l.liquid - ago.liquid)}</b> vs ${M.lbl(ago.m)}</span>` : ''}
          ${avg6 != null ? `<span>6-mo average <b class="${cls(avg6)}">${signed(avg6)}</b>/mo</span>` : ''}
        </div>
        <div class="verdict"><div class="vi ${v.c}" aria-hidden="true">${v.i}</div><div class="vt"><strong>${v.t}</strong>${v.d}</div></div>
      </section>
      ${checkinCard(s)}
      <div class="stats" style="grid-column:1/-1">
        <button class="stat" data-act="openBucket" data-b="savings"><div class="k">Savings</div><div class="v">${gbp(l.savings)}</div><div class="d">${prev ? chg(l.savings - prev.savings, ' vs last month') : ''}</div></button>
        <button class="stat" data-act="openBucket" data-b="current"><div class="k">Current accounts</div><div class="v">${gbp(l.current)}</div><div class="d">${prev ? chg(l.current - prev.current, ' vs last month') : ''}</div></button>
        <button class="stat" data-act="tab" data-tab="planner"><div class="k">Months of cover</div><div class="v">${L.fmt.months(cov.months)}</div><div class="d">${cov.plan.year} plan, essentials</div></button>
        <button class="stat" data-act="expand" data-key="networth"><div class="k">Net worth</div><div class="v">${gbp(nw)}</div><div class="d">Incl. est. house + shares</div></button>
      </div>
      ${L.chartCard('composition', { cls: 's7' })}
      ${L.chartCard('change', { cls: 's5' })}
      <section class="card s6"><div class="card-head"><div><h2>Buckets</h2><div class="sub">Totals by tag, vs last check-in</div></div><div class="actions"><button class="btn sm" data-act="manageTags">Manage tags</button></div></div>
        <div class="rows">${bucketRows || '<div class="empty">No tags yet.</div>'}</div></section>
      <section class="card s6"><div class="card-head"><div><h2>What moved</h2><div class="sub">${mv.from ? `Biggest account changes, ${M.lbl(mv.from, 'mon')} → ${M.lbl(mv.to, 'mon')}. Transfers between your accounts are netted out` : 'Needs two monthly check-ins'}</div></div></div>
        <div class="rows">${trRows}${moverRows || (trRows ? '' : '<div class="empty">Nothing to compare yet.</div>')}</div></section>
    </div>`;
  } };

  // ======================================================================
  // ACCOUNTS
  // ======================================================================
  function accRow(a){
    const s = S(), ser = M.accountSeries(s, a.id), now = ser[ser.length - 1], prv = ser[ser.length - 2];
    const tags = a.tags.map(id => M.tag(s, id)).filter(Boolean);
    return `<div class="row acc-row clickable" data-act="openAccount" data-id="${a.id}">
      <div><div class="name">${esc(a.name)}${a.estimate ? '<span class="est-badge">est.</span>' : ''}</div>${tags.length ? `<div class="chips">${tags.map(chip).join('')}</div>` : ''}${a.bucket !== 'asset' ? `<div style="margin-top:3px">${(() => { const on = M.updatedOn(M.snap(s, M.thisMonth()), a.id); const last = M.lastUpdate(s, a.id); return updLbl(on, last); })()}</div>` : ''}</div>
      ${C.spark(ser.map(x => x.v), a.bucket === 'asset' ? { color: 'var(--s3)' } : {})}
      <div class="right"><div class="big">${now ? gbp(now.v) : '—'}</div><div class="chg">${prv ? chg(now.v - prv.v) : (now ? `<span class="muted">${M.lbl(now.m)}</span>` : '')}</div></div></div>`;
  }
  function groupCard(key, title, accs, o = {}){
    const s = S(), d = M.detailSnaps(s), ds = d[d.length - 1], dp = d[d.length - 2];
    const tot = x => x ? accs.reduce((t, a) => t + (x.balances[a.id] || 0), 0) : null;
    const now = tot(ds), was = tot(dp), col = UI.collapsed['acc-' + key];
    return `<section class="card ${o.cls || 's6'} group ${col ? 'collapsed' : ''}">
      <div class="group-head" data-act="toggleGroup" data-k="acc-${key}"><div class="gt"><span class="caret">${L.icons.caret.replace('<svg', '<svg width="18" height="18"')}</span><div><h2>${o.swatch ? `<i class="sw" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${o.swatch};margin-right:8px"></i>` : ''}${esc(title)}</h2><div class="sub muted small">${accs.length} account${accs.length === 1 ? '' : 's'}</div></div></div>
        <div class="tot"><div class="big" style="font-weight:600">${gbp(now)}</div><div class="chg">${was != null && o.noChange !== true ? chg(now - was) : ''}</div></div></div>
      <div class="group-body"><div class="rows">${accs.map(accRow).join('') || '<div class="empty">Nothing here.</div>'}</div></div></section>`;
  }
  L.pages.accounts = { render(){
    const s = S(), live = s.accounts.filter(a => !a.archived), d = M.detailSnaps(s), ds = d[d.length - 1];
    let groups = '';
    if (UI.groupBy === 'tag'){
      groups = s.tags.map(t => groupCard('t' + t.id, t.name, M.tagAccounts(s, t.id).filter(a => a.bucket !== 'asset'), { swatch: tagColor(t) })).join('');
      const un = M.untaggedAccounts(s); if (un.length) groups += groupCard('untagged', 'Untagged', un);
    } else {
      groups = ['savings','current'].map(b => groupCard(b, BUCKET[b].name, live.filter(a => a.bucket === b), { swatch: BUCKET[b].color })).join('');
    }
    const assets = live.filter(a => a.bucket === 'asset');
    const archived = s.accounts.filter(a => a.archived);
    return pageHead('Accounts', `${live.filter(a => a.bucket !== 'asset').length} accounts · last logged ${ds ? M.lbl(ds.month, 'long') : '—'}`,
      `<button class="btn primary" data-act="logBalances">Log balances</button><button class="btn" data-act="manageTags">Tags</button>${plusBtn('addAccount', 'Account')}`) + `
      <div class="filters"><div class="f"><span class="lbl">Group by</span>${seg('groupBy', [['bucket','Savings / current'],['tag','Tag']], UI.groupBy)}</div></div>
      <div class="grid">${groups}
        ${assets.length ? groupCard('assets', 'Other assets', assets, { cls: 's12', swatch: BUCKET.asset.color, noChange: true }) : ''}
        ${L.chartCard('tags', { cls: 's6' })}${L.chartCard('networth', { cls: 's6' })}
        ${archived.length ? `<section class="card s12"><h2>Archived</h2><div class="rows" style="margin-top:8px">${archived.map(accRow).join('')}</div></section>` : ''}
      </div>
      <div class="note">Net worth: liquid ${gbp(M.latest(s) ? M.latest(s).liquid : 0)} + other assets ${gbp(Object.values(M.assetValues(s)).reduce((t, x) => t + x.value, 0))} = <b>${gbp(M.netWorth(s))}</b>. Other assets are estimates until you enter real values.</div>`;
  } };

  L.acts.goTags = () => { UI.groupBy = 'tag'; UI.tab = 'accounts'; L.saveUI(); L.render(); window.scrollTo({ top: 0 }); };
  L.acts.openBucket = el => { UI.groupBy = 'bucket'; UI.tab = 'accounts'; UI.collapsed['acc-' + el.dataset.b] = false; L.saveUI(); L.render(); window.scrollTo({ top: 0 }); };
  L.acts.addAccount = () => { const id = L.uid('a'); L.commit(s => s.accounts.push({ id, name: 'New account', bucket: 'current', tags: [], note: '', archived: false })); openAccount(id); };
  L.acts.openAccount = el => openAccount(el.dataset.id);

  function openAccount(id){
    L.modal.open(() => {
      const s = S(), a = M.acc(s, id); if (!a) return { title: 'Account removed', body: '' };
      const ser = M.accountSeries(s, id), now = ser[ser.length - 1], first = ser[0];
      const bucketOpts = [['savings','Savings'],['current','Current account'],['asset','Other asset (not liquid)']].map(([v, n]) => `<option value="${v}" ${a.bucket === v ? 'selected' : ''}>${n}</option>`).join('');
      const sp = L.spec('acc:' + id);
      return {
        title: a.name, sub: (BUCKET[a.bucket] || {}).name + (now ? ` · ${gbp(now.v)} in ${M.lbl(now.m, 'long')}` : ''),
        body: `
          ${ser.length ? `<div class="chart" data-chart="acc:${id}" data-big="1"></div>
          <div class="readout">${now ? `<span>Now <b>${gbp(now.v)}</b></span>` : ''}${ser.length > 1 ? `<span>Since ${M.lbl(first.m)} <b class="${cls(now.v - first.v)}">${signed(now.v - first.v)}</b></span>` : ''}<span>${ser.length} month${ser.length === 1 ? '' : 's'} logged</span></div>` : '<div class="empty">No balances logged yet.</div>'}
          ${ser.length < 4 ? '<div class="note">Per-account history started with the new app. Each monthly check-in adds a point here.</div>' : ''}
          ${ser.length ? `<div class="section"><h3>History</h3>${sp.table()}</div>` : ''}
          <div class="section"><h3>Details</h3>
            <div class="field"><label>Name</label><input class="input" value="${esc(a.name)}" data-edit="field" data-coll="accounts" data-id="${id}" data-f="name" data-refresh="1"></div>
            <div class="field"><label>Type</label><select class="input" data-edit="field" data-coll="accounts" data-id="${id}" data-f="bucket" data-refresh="1">${bucketOpts}</select></div>
            <div class="field"><label>Tags</label><div class="chips">${s.tags.map(t => `<button class="chip ${a.tags.includes(t.id) ? 'on' : ''}" data-act="toggleTag" data-acc="${id}" data-tag="${t.id}"><i class="sw" style="background:${tagColor(t)}"></i>${esc(t.name)}</button>`).join('')}<button class="chip" data-act="manageTags">+ New tag</button></div></div>
            <div class="field"><label>Note</label><textarea class="input" data-edit="field" data-coll="accounts" data-id="${id}" data-f="note" placeholder="e.g. joint, fixed until 2027, interest rate…">${esc(a.note || '')}</textarea></div>
            <label class="switch"><input type="checkbox" ${a.archived ? 'checked' : ''} data-edit="field" data-coll="accounts" data-id="${id}" data-f="archived" data-refresh="1">Archived (closed account, hidden from check-ins)</label>
          </div>
          <div class="section"><button class="btn danger sm" data-act="deleteAccount" data-id="${id}">Delete account</button></div>`,
      };
    });
  }
  L.acts.toggleTag = el => L.commit(s => { const a = M.acc(s, el.dataset.acc), t = el.dataset.tag; const i = a.tags.indexOf(t); if (i >= 0) a.tags.splice(i, 1); else a.tags.push(t); }, { modal: true });
  L.acts.deleteAccount = el => {
    if (!confirm('Delete this account and its balance history? Archive it instead if it was simply closed.')) return;
    L.commit(s => { s.accounts = s.accounts.filter(a => a.id !== el.dataset.id); s.snapshots.forEach(x => { if (x.balances) delete x.balances[el.dataset.id]; }); });
    L.modal.close();
  };

  // ---------------- tags ----------------
  L.acts.manageTags = () => L.modal.open(() => {
    const s = S();
    const tagRows = s.tags.map(t => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div>
        <input class="inline-text" value="${esc(t.name)}" data-edit="field" data-coll="tags" data-id="${t.id}" data-f="name" data-refresh="1" aria-label="Tag name">
        <div class="swatches" style="margin:6px 0 0 8px">${[1,2,3,4,5,6,7,8].map(c => `<button class="${t.color === c ? 'on' : ''}" style="background:var(--s${c})" data-act="tagColor" data-id="${t.id}" data-c="${c}" aria-label="Colour ${c}"></button>`).join('')}</div></div>
        <div class="right"><div class="small muted">${M.tagAccounts(s, t.id).length} accts</div><button class="x-btn" data-act="deleteTag" data-id="${t.id}" aria-label="Delete tag">×</button></div></div>`).join('');
    const assign = s.accounts.filter(a => !a.archived && a.bucket !== 'asset').map(a => `<div class="row" style="grid-template-columns:minmax(0,1fr)"><div><div class="name">${esc(a.name)} <span class="muted small">${a.bucket === 'savings' ? 'Savings' : 'Current'}</span></div>
        <div class="chips" style="margin-top:6px">${s.tags.map(t => `<button class="chip ${a.tags.includes(t.id) ? 'on' : ''}" data-act="toggleTag" data-acc="${a.id}" data-tag="${t.id}"><i class="sw" style="background:${tagColor(t)}"></i>${esc(t.name)}</button>`).join('')}</div></div></div>`).join('');
    return {
      title: 'Tags', sub: 'Bucket accounts together. An account can have several tags, e.g. ISAs + Market-linked.',
      body: `<div class="section"><h3>Your tags</h3><div class="rows">${tagRows || '<div class="empty">No tags yet.</div>'}</div>
          <div style="display:flex;gap:8px;margin-top:10px"><input class="input" id="new-tag" placeholder="New tag, e.g. Dan, Joint, Kids"><button class="btn primary" data-act="addTag">Add</button></div></div>
        <div class="section"><h3>Assign accounts</h3>${assign}</div>`,
      onMount(b){ const i = b.querySelector('#new-tag'); i.addEventListener('keydown', e => { if (e.key === 'Enter') L.acts.addTag(); }); },
    };
  });
  L.acts.addTag = () => { const i = document.getElementById('new-tag'), name = i && i.value.trim(); if (!name) return; L.commit(s => { const used = s.tags.map(t => t.color); const c = [3,5,7,4,6,8,1,2].find(x => !used.includes(x)) || 3; s.tags.push({ id: L.uid('t'), name, color: c }); }, { modal: true }); };
  L.acts.tagColor = el => L.commit(s => { M.tag(s, el.dataset.id).color = Number(el.dataset.c); }, { modal: true });
  L.acts.deleteTag = el => { if (!confirm('Delete this tag? Accounts keep their balances.')) return; L.commit(s => { s.tags = s.tags.filter(t => t.id !== el.dataset.id); s.accounts.forEach(a => a.tags = a.tags.filter(x => x !== el.dataset.id)); if (s.coverage.slowTagId === el.dataset.id) s.coverage.slowTagId = null; }, { modal: true }); };

  // ---------------- monthly check-in ----------------
  // Accounts can be updated over several days: each one records the date it was confirmed for the month.
  L.acts.logBalances = el => openLog((el && el.dataset && el.dataset.m) || M.thisMonth());
  function openLog(month){
    const s = S();
    const existing = M.snap(s, month);
    const before = s.snapshots.filter(x => x.month < month && x.balances && !x.totals), prevSnap = before[before.length - 1];
    const prevAny = s.snapshots.filter(x => x.month < month && (x.balances || x.totals)), prevRec = prevAny[prevAny.length - 1];
    const prevTotals = prevRec ? M.snapTotals(s, prevRec) : null;
    const accs = s.accounts.filter(a => !a.archived);
    const startVal = id => existing && existing.balances && existing.balances[id] != null ? existing.balances[id] : (prevSnap && prevSnap.balances[id] != null ? prevSnap.balances[id] : (M.accountSeries(s, id).filter(x => x.m < month).pop() || {}).v);
    const opts = []; for (let i = -1; i < 24; i++){ const m = M.addM(M.thisMonth(), -i); opts.push(`<option value="${m}" ${m === month ? 'selected' : ''}>${M.lbl(m, 'long')}${M.snap(s, m) ? ' ✓' : ''}</option>`); }
    const row = (a, b) => {
      const on = M.updatedOn(existing, a.id), last = M.lastUpdate(s, a.id);
      const pv = prevSnap ? prevSnap.balances[a.id] : null;
      return `<div class="log-row ${on ? 'is-done' : ''}" data-row="${a.id}"><div><div class="name">${esc(a.name)}${a.estimate ? '<span class="est-badge">est.</span>' : ''}</div>
          <div class="prev">${pv != null ? M.lbl(prevSnap.month, 'mon') + ': ' + gbp(pv) : 'New'} <span class="dl" data-dl="${a.id}"></span></div>
          <div data-st="${a.id}">${b === 'asset' ? '' : updLbl(on, last && last.m < month ? last : null)}</div>
          ${!on && b !== 'asset' ? `<button class="same" data-same="${a.id}">Same as last month</button>` : ''}</div>
        <input class="input num" inputmode="decimal" data-bal="${a.id}" data-bucket="${b}" data-prev="${pv == null ? '' : pv}" value="${inputNum(startVal(a.id))}" aria-label="${esc(a.name)} balance"></div>`;
    };
    const section = (b, title) => { const list = accs.filter(a => a.bucket === b); return list.length ? `<div class="section"><h3>${title}</h3>${list.map(a => row(a, b)).join('')}</div>` : ''; };
    L.modal.open(() => ({
      title: `${M.lbl(month, 'long')} check-in`, sub: 'Change what moved, or tap "Same as last month". You can save part-way and come back as balances come in.',
      body: `<div class="two"><div class="field"><label>Month</label><select class="input" id="log-month">${opts.join('')}</select></div>
          <div class="field"><label>Updated on</label><input class="input" type="date" id="log-date" value="${M.today()}"></div></div>
        ${section('savings', 'Savings')}${section('current', 'Current accounts')}${section('asset', 'Other assets (optional, estimates are fine)')}
        <div class="section field"><label>Note for this month (optional)</label><input class="input" id="log-note" value="${esc((existing && existing.note) || '')}" placeholder="e.g. paid nursery deposit, moved £10k to HL"></div>`,
      foot: `<div class="log-totals"><div><div class="k">Savings</div><div class="v" id="lt-s">—</div></div><div><div class="k">Current</div><div class="v" id="lt-c">—</div></div><div><div class="k">Liquid</div><div class="v" id="lt-l">—</div></div></div>
        <button class="btn primary block" id="log-save">Save</button>`,
      onMount(body){
        const foot = document.getElementById('modal-foot'), touched = new Set();
        const required = accs.filter(a => a.bucket !== 'asset').map(a => a.id);
        const already = new Set(required.filter(id => M.updatedOn(existing, id)));
        const recalc = () => {
          let sv = 0, cu = 0;
          body.querySelectorAll('[data-bal]').forEach(i => {
            const v = L.parseNum(i.value), pv = i.dataset.prev === '' ? null : Number(i.dataset.prev);
            if (v != null){ if (i.dataset.bucket === 'savings') sv += v; else if (i.dataset.bucket === 'current') cu += v; }
            body.querySelector(`[data-dl="${i.dataset.bal}"]`).innerHTML = (v != null && pv != null && Math.round(v - pv) !== 0) ? `· <span class="${cls(v - pv)}">${signed(v - pv)}</span>` : '';
          });
          foot.querySelector('#lt-s').textContent = gbp(sv); foot.querySelector('#lt-c').textContent = gbp(cu);
          const liq = sv + cu, d = prevTotals ? liq - prevTotals.liquid : null;
          foot.querySelector('#lt-l').innerHTML = gbp(liq) + (d != null ? `<div class="${cls(d)} tiny" style="font-weight:500">${signed(d)}</div>` : '');
          const n = required.filter(id => already.has(id) || touched.has(id)).length;
          foot.querySelector('#log-save').textContent = n === required.length ? `Save · all ${n} accounts updated` : `Save progress · ${n} of ${required.length} updated`;
        };
        const mark = id => { touched.add(id); const r = body.querySelector(`[data-row="${id}"]`); if (r){ r.classList.add('is-done'); const st = r.querySelector(`[data-st="${id}"]`); if (st && st.innerHTML) st.innerHTML = `<span class="upd ok">✓ Will save as updated</span>`; const b = r.querySelector('.same'); if (b) b.remove(); } };
        body.addEventListener('input', e => { if (e.target.matches('[data-bal]')){ mark(e.target.dataset.bal); recalc(); } });
        body.addEventListener('click', e => { const b = e.target.closest('[data-same]'); if (b){ e.preventDefault(); mark(b.dataset.same); recalc(); } });
        body.querySelectorAll('[data-bal]').forEach(i => i.addEventListener('focus', () => i.select()));
        body.querySelector('#log-month').addEventListener('change', e => openLog(e.target.value));
        recalc();
        foot.querySelector('#log-save').addEventListener('click', () => {
          const date = body.querySelector('#log-date').value || M.today(), note = body.querySelector('#log-note').value.trim();
          const bal = {}; body.querySelectorAll('[data-bal]').forEach(i => { const v = L.parseNum(i.value); if (v != null) bal[i.dataset.bal] = v; });
          if (!Object.keys(bal).length){ L.toast('Enter at least one balance'); return; }
          L.commit(st => {
            const i = st.snapshots.findIndex(x => x.month === month), old = i >= 0 ? st.snapshots[i] : null;
            // carry forward when-updated dates; older snapshots without a map count as updated on their date
            const updated = old ? (old.updated ? { ...old.updated } : Object.fromEntries(Object.keys(old.balances || {}).map(k => [k, old.date || month + '-01']))) : {};
            touched.forEach(id => { updated[id] = date; });
            if (old && old.balances) Object.keys(old.balances).forEach(k => { if (bal[k] == null) bal[k] = old.balances[k]; });
            const snap = { month, date: Object.values(updated).sort().pop() || date, balances: bal, totals: null, updated, note };
            if (i >= 0) st.snapshots[i] = snap; else st.snapshots.push(snap);
            st.snapshots.sort((a, b) => a.month < b.month ? -1 : 1);
          });
          L.modal.close();
          const ci = M.checkin(S(), month), p = M.point(S(), month);
          L.toast(`${M.lbl(month, 'long')}: ${ci.done} of ${ci.total} updated · liquid ${p && p.change != null ? signed(p.change) : gbp(p ? p.liquid : 0)}`);
        });
      },
    }));
  }
  L.acts.quickOneOff = () => {
    L.commit(s => s.events.push({ id: L.uid('e'), month: M.thisMonth(), label: '', amount: 0 }), { render: false });
    UI.tab = 'planner'; L.saveUI(); L.render();
    setTimeout(() => { const c = document.getElementById('oneoffs'); if (c){ c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const inp = c.querySelectorAll('.edit-list .input:not(.date)'); if (inp.length) inp[inp.length - 2].focus(); } }, 80);
  };

  // ======================================================================
  // BUDGET
  // ======================================================================
  const paidLbl = (l, y) => { const pm = M.payMonths(l, y); return pm ? `<span class="paid">Paid ${pm.map(m => M.MON[m - 1]).join(', ')}</span>` : ''; };
  L.pages.budget = { render(){
    const s = S(), ys = M.years(s), cy = new Date().getFullYear();
    if (!ys.includes(UI.budgetYear)) UI.budgetYear = ys.includes(cy) ? cy : ys[ys.length - 1];
    const y = UI.budgetYear, py = ys[ys.indexOf(y) - 1], p = M.plan(s, y), pp = py ? M.plan(s, py) : null;
    const isPlan = s.settings.planYear === y;
    const d = (k) => pp ? `<span class="dlt ${cls(['outgoings','fixed','living','extra'].includes(k) ? -(p[k] - pp[k]) : p[k] - pp[k])}">${signed(p[k] - pp[k])}</span>` : '';
    const sumRow = (label, k) => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto 70px"><div class="name">${label}</div><div class="right">${gbp(p[k])}</div><div class="right tiny">${d(k)}</div></div>`;
    const hidden = s.budget.lines.filter(l => l.kind === 'off').length;

    const groups = s.budget.groups.map(g => {
      const lines = s.budget.lines.filter(l => l.groupId === g.id);
      const visible = lines.filter(l => UI.showInactive || l.kind !== 'off');
      const tot = lines.filter(l => l.kind !== 'off').reduce((t, l) => t + M.amt(l, y), 0);
      const ptot = py ? lines.filter(l => l.kind !== 'off').reduce((t, l) => t + M.amt(l, py), 0) : null;
      const isIncome = lines.some(l => l.kind === 'income' || l.kind === 'bonus');
      const col = UI.collapsed['bg-' + g.id];
      const rows = visible.map(l => {
        const a = M.amt(l, y), pa = py ? M.amt(l, py) : null, dd = pa == null ? null : a - pa;
        return `<div class="row b-row ${l.kind === 'off' ? 'off' : ''}"><div style="min-width:0"><div class="name" data-act="openLine" data-id="${l.id}">${esc(l.name)}<span class="kind ${l.kind}">${M.kindName(l.kind)}</span>${paidLbl(l, y)}</div>${l.note ? `<div class="meta">${esc(l.note)}</div>` : ''}</div>
          <input class="inline-num" inputmode="decimal" value="${inputNum(Math.round(a * 100) / 100)}" data-edit="amt" data-id="${l.id}" aria-label="${esc(l.name)} ${y} monthly amount">
          <div class="dlt">${dd == null || Math.abs(dd) < 0.5 ? '' : `<span class="${cls(isIncome ? dd : -dd)}">${signed(dd)}</span>`}</div></div>`;
      }).join('');
      return `<section class="card s6 group ${col ? 'collapsed' : ''}">
        <div class="group-head" data-act="toggleGroup" data-k="bg-${g.id}"><div class="gt"><span class="caret">${L.icons.caret.replace('<svg', '<svg width="18" height="18"')}</span><div><h2>${esc(g.name)}</h2><div class="sub muted small">${lines.filter(l => l.kind !== 'off').length} active${lines.some(l => l.kind === 'off') ? ` · ${lines.filter(l => l.kind === 'off').length} inactive` : ''}</div></div></div>
          <div class="tot"><div style="font-weight:600">${gbp(tot)}<span class="muted small">/mo</span></div><div class="chg">${ptot != null && Math.abs(tot - ptot) >= 0.5 ? `<span class="${cls(isIncome ? tot - ptot : ptot - tot)}">${signed(tot - ptot)}</span> vs ${py}` : ''}</div></div></div>
        <div class="group-body"><div class="rows">${rows || '<div class="empty">No active lines.</div>'}</div>
          <button class="add-link" data-act="addLine" data-g="${g.id}">+ Add line</button></div></section>`;
    }).join('');

    // biggest costs + share by group for the selected year
    const costLines = s.budget.lines.filter(l => M.OUT.includes(l.kind) && M.amt(l, y) > 0).sort((a, b) => M.amt(b, y) - M.amt(a, y));
    const top = costLines.slice(0, 10);
    const groupShare = s.budget.groups.map(g => ({ g, v: M.groupTotal(s, g.id, y, M.OUT) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const sal = (s.budget.salaries || []).map(x => `<div class="row"><div><div class="name">${esc(x.name)}</div>${x.note ? `<div class="meta">${esc(x.note)}</div>` : ''}</div><div class="right">${gbp(x.amounts[y])}<div class="tiny muted">per year</div></div></div>`).join('');

    return pageHead('Budget', 'What you expect to come in and go out each month. Tap any amount to change it, or a name for more options.', plusBtn('addGroup', 'Group')) + `
      <div class="filters">
        <div class="f"><span class="lbl">Year</span>${seg('budgetYear', ys.map(v => [v, v + (v === s.settings.planYear ? ' ★' : '')]), y)}<button class="btn sm" data-act="addYear">+ ${ys[ys.length - 1] + 1}</button></div>
        <div class="f">${isPlan ? '<span class="chip"><i class="sw" style="background:var(--accent)"></i>Planning year</span>' : `<button class="btn sm" data-act="makePlanYear" data-y="${y}">Make ${y} the planning year</button>`}</div>
        ${hidden ? `<label class="switch"><input type="checkbox" ${UI.showInactive ? 'checked' : ''} data-act="set" data-k="showInactive" data-v="${!UI.showInactive}">Show ${hidden} inactive</label>` : ''}
      </div>
      <div class="grid">
        <section class="card s5"><div class="card-head"><div><h2>${y} per month</h2><div class="sub">${pp ? 'Change vs ' + py + ' on the right' : 'First budgeted year'}</div></div></div>
          <div class="rows">
            ${sumRow('Take-home income', 'income')}${sumRow('Bonus (monthly average)', 'bonus')}
            ${sumRow('Fixed costs', 'fixed')}${sumRow('Living costs', 'living')}${sumRow('Extras', 'extra')}
            <div class="row" style="grid-template-columns:minmax(0,1fr) auto 70px"><div class="name"><b>Left over each month</b></div><div class="right big ${cls(p.net)}" style="font-size:18px">${signed(p.net)}</div><div class="right tiny">${pp ? `<span class="dlt ${cls(p.net - pp.net)}">${signed(p.net - pp.net)}</span>` : ''}</div></div>
          </div>
          <div class="note">Fixed = must-pay (mortgage, bills, nursery). Living = day-to-day (food, kids, clothes). Extras = flexible (holidays, eating out). Same split as the sheet's column-A codes.</div>
        </section>
        ${L.chartCard('waterfall', { cls: 's7' })}
        ${L.chartCard('spend', { cls: 's12' })}
        <section class="card s6"><div class="card-head"><div><h2>Biggest costs in ${y}</h2><div class="sub">Top ${top.length} lines, share of ${gbp(p.outgoings)} a month</div></div></div>
          ${C.hbars(top.map(l => ({ label: l.name, value: M.amt(l, y), color: groupColor(s, l.groupId), display: `${gbp(M.amt(l, y))} <span class="muted tiny">${Math.round(M.amt(l, y) / p.outgoings * 100)}%</span>` })))}</section>
        <section class="card s6"><div class="card-head"><div><h2>By group in ${y}</h2><div class="sub">Monthly spend${pp ? ' and change vs ' + py : ''}</div></div></div>
          ${C.hbars(groupShare.map(x => { const pv = py ? M.groupTotal(s, x.g.id, py, M.OUT) : null; return { label: x.g.name, value: x.v, color: groupColor(s, x.g.id), display: `${gbp(x.v)}${pv != null && Math.abs(x.v - pv) >= 1 ? ` <span class="${cls(pv - x.v)} tiny">${signed(x.v - pv)}</span>` : ''}` }; }))}</section>
        ${groups}
        ${sal ? `<section class="card s6"><div class="card-head"><div><h2>Gross salaries</h2><div class="sub">Reference only, not counted in the totals</div></div></div><div class="rows">${sal}</div></section>` : ''}
      </div>`;
  } };
  L.edits.amt = el => { const v = L.parseNum(el.value) ?? 0; L.commit(s => { const l = s.budget.lines.find(x => x.id === el.dataset.id); l.amounts[UI.budgetYear] = v; }); };
  L.edits.lineYear = el => { const v = L.parseNum(el.value) ?? 0; L.commit(s => { const l = s.budget.lines.find(x => x.id === el.dataset.id); l.amounts[el.dataset.y] = v; }); };
  L.acts.makePlanYear = el => L.commit(s => { s.settings.planYear = Number(el.dataset.y); });
  L.acts.addYear = () => L.commit(s => { const ys = M.years(s), last = ys[ys.length - 1], ny = last + 1; s.budget.lines.forEach(l => { l.amounts[ny] = M.amt(l, last); const pm = M.payMonths(l, last); if (pm) l.payMonths[ny] = pm.slice(); }); (s.budget.salaries || []).forEach(x => { x.amounts[ny] = x.amounts[last]; }); s.budget.years.push(ny); UI.budgetYear = ny; L.saveUI(); L.toast(`${ny} added, copied from ${last}`); });
  L.acts.addLine = el => { const id = L.uid('b'); L.commit(s => { const amounts = {}; s.budget.years.forEach(y => amounts[y] = 0); s.budget.lines.push({ id, groupId: el.dataset.g, name: 'New line', kind: 'living', amounts, note: '' }); }); openLine(id); };
  L.acts.addGroup = () => { const name = prompt('Name for the new group'); if (!name) return; L.commit(s => s.budget.groups.push({ id: L.uid('g'), name: name.trim() })); };
  L.acts.openLine = el => openLine(el.dataset.id);
  // Pay months are set per year (data-y); the popup shows one year at a time (payYear).
  let payYear = null;
  const payObj = l => (l.payMonths && !Array.isArray(l.payMonths)) ? l.payMonths : (l.payMonths = {});
  L.acts.payYear = el => { payYear = Number(el.dataset.y); L.modal.refresh(); };
  L.acts.payMode = el => L.commit(s => { const l = s.budget.lines.find(x => x.id === el.dataset.id), o = payObj(l), y = el.dataset.y; if (el.dataset.v === 'months') o[y] = M.payMonths(l, y) || [3]; else delete o[y]; }, { modal: true });
  L.acts.payMonth = el => L.commit(s => { const l = s.budget.lines.find(x => x.id === el.dataset.id), o = payObj(l), y = el.dataset.y, m = Number(el.dataset.m); const pm = o[y] = (o[y] || []).slice(); const i = pm.indexOf(m); if (i >= 0){ if (pm.length > 1) pm.splice(i, 1); } else pm.push(m); pm.sort((a, b) => a - b); }, { modal: true });
  L.acts.payAll = el => L.commit(s => { const l = s.budget.lines.find(x => x.id === el.dataset.id), pm = M.payMonths(l, el.dataset.y); l.payMonths = {}; if (pm) s.budget.years.forEach(y => { l.payMonths[y] = pm.slice(); }); L.toast(`${el.dataset.y} timing copied to every year`); }, { modal: true });
  const payDesc = pm => pm ? pm.map(m => M.MON[m - 1]).join(', ') : 'Every month';
  function openLine(id){
    payYear = null;
    L.modal.open(() => {
      const s = S(), l = s.budget.lines.find(x => x.id === id); if (!l) return { title: 'Removed', body: '' };
      const ys = M.years(s);
      const max = Math.max(1, ...ys.map(y => Math.abs(M.amt(l, y))));
      const y = UI.budgetYear || s.settings.planYear;
      if (!ys.includes(payYear)) payYear = ys.includes(y) ? y : ys[ys.length - 1];
      const py = payYear, pa = M.amt(l, py), pm = M.payMonths(l, py);
      const same = ys.every(yy => payDesc(M.payMonths(l, yy)) === payDesc(pm));
      return {
        title: l.name, sub: `${M.kindName(l.kind)} · ${esc((s.budget.groups.find(g => g.id === l.groupId) || {}).name || '')}`, narrow: true,
        body: `<div class="section">${C.hbars(ys.map(yy => ({ label: String(yy) + (yy === s.settings.planYear ? ' ★' : ''), value: M.amt(l, yy), color: yy === y ? 'var(--accent)' : 'var(--s1)', display: gbp(M.amt(l, yy)) + '/mo' })), { max })}</div>
          <div class="section"><h3>Monthly amount by year</h3><div class="small muted" style="margin-bottom:8px">Enter the monthly average (the yearly amount ÷ 12), even if it's paid in one go. Then pick the month below.</div><div class="two">${ys.map(yy => `<div class="field"><label>${yy}</label><input class="input num" inputmode="decimal" value="${inputNum(Math.round(M.amt(l, yy) * 100) / 100)}" data-edit="lineYear" data-id="${id}" data-y="${yy}"></div>`).join('')}</div></div>
          <div class="section"><h3>When is it paid?</h3>
            <div class="small muted" style="margin-bottom:8px">Set this for each year. For example, a bonus spread across 2024 but paid in one go in March 2025.</div>
            <div class="seg" role="group" aria-label="Year" style="margin-bottom:8px">${ys.map(yy => `<button class="${yy === py ? 'on' : ''}" data-act="payYear" data-y="${yy}">${yy}</button>`).join('')}</div>
            <div class="seg" style="margin-bottom:10px"><button class="${pm ? '' : 'on'}" data-act="payMode" data-id="${id}" data-y="${py}" data-v="monthly">Every month</button><button class="${pm ? 'on' : ''}" data-act="payMode" data-id="${id}" data-y="${py}" data-v="months">Specific months</button></div>
            ${pm ? `<div class="mgrid">${M.MON.map((mn, i) => `<button class="${pm.includes(i + 1) ? 'on' : ''}" data-act="payMonth" data-id="${id}" data-y="${py}" data-m="${i + 1}">${mn}</button>`).join('')}</div>
              <div class="note">In ${py} that's ${gbp(pa * 12 / pm.length)} in ${payDesc(pm)} and nothing in other months. Forecasts and "actual against plan" use these months; annual totals don't change.</div>` : `<div class="note">In ${py}: spread evenly, ${gbp(pa)} every month.</div>`}
            <div class="rows" style="margin-top:10px">${ys.map(yy => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="name">${yy}</div><div class="right small ${yy === py ? '' : 'muted'}">${payDesc(M.payMonths(l, yy))}</div></div>`).join('')}</div>
            ${same ? '' : `<button class="add-link" data-act="payAll" data-id="${id}" data-y="${py}">Use the ${py} timing for every year</button>`}</div>
          <div class="section"><h3>Details</h3>
            <div class="field"><label>Name</label><input class="input" value="${esc(l.name)}" data-edit="field" data-coll="budget.lines" data-id="${id}" data-f="name" data-refresh="1"></div>
            <div class="two"><div class="field"><label>Type</label><select class="input" data-edit="field" data-coll="budget.lines" data-id="${id}" data-f="kind" data-refresh="1">${M.KINDS.map(k => `<option value="${k.id}" ${l.kind === k.id ? 'selected' : ''}>${k.name}</option>`).join('')}</select></div>
            <div class="field"><label>Group</label><select class="input" data-edit="field" data-coll="budget.lines" data-id="${id}" data-f="groupId" data-refresh="1">${s.budget.groups.map(g => `<option value="${g.id}" ${l.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div></div>
            <div class="field"><label>Note / assumption</label><textarea class="input" data-edit="field" data-coll="budget.lines" data-id="${id}" data-f="note">${esc(l.note || '')}</textarea></div></div>
          <div class="section"><button class="btn danger sm" data-act="deleteLine" data-id="${id}">Delete line</button></div>`,
      };
    });
  }
  L.acts.deleteLine = el => { if (!confirm('Delete this budget line for every year?')) return; L.commit(s => { s.budget.lines = s.budget.lines.filter(l => l.id !== el.dataset.id); }); L.modal.close(); };

  // ======================================================================
  // TRENDS
  // ======================================================================
  L.pages.trends = { render(){
    const s = S(), tl = M.timeline(s); if (!tl.length) return pageHead('Trends') + '<div class="card"><div class="empty">No history yet.</div></div>';
    const hasEvents = (s.events || []).length > 0;
    return pageHead('Trends', `${tl.length} months of history · ${M.lbl(tl[0].m, 'long')} to ${M.lbl(tl[tl.length - 1].m, 'long')}`) + `
      <div class="filters">
        <div class="f"><span class="lbl">Range</span>${seg('range', RANGES, UI.range)}</div>
        <div class="f"><span class="lbl">Average</span>${seg('roll', [[3,'3 mo'],[6,'6 mo'],[12,'12 mo']], UI.roll)}</div>
        ${hasEvents ? `<label class="switch"><input type="checkbox" ${UI.strip ? 'checked' : ''} data-act="set" data-k="strip" data-v="${!UI.strip}">Strip one-offs</label>` : ''}
      </div>
      <div class="grid">
        ${L.chartCard('balance', { cls: 's12' })}
        ${L.chartCard('change', { cls: 's7' })}
        ${L.chartCard('plan', { cls: 's5', controls: `<div class="filters" style="margin-bottom:8px">${L.spec('plan').controls()}</div>` })}
        <section class="card s12"><div class="card-head"><div><h2>Year by year</h2><div class="sub">Change in liquid funds per calendar year</div></div><div class="actions"><button class="icon-btn" data-act="expand" data-key="yoy" aria-label="Open year chart">${L.icons.expand}</button></div></div>${yearTable()}</section>
        ${L.chartCard('yoy', { cls: 's6' })}
        ${L.chartCard('networth', { cls: 's6' })}
        ${L.chartCard('cover', { cls: 's6' })}
        ${L.chartCard('tags', { cls: 's6' })}
        <section class="card s12"><h2>About this data</h2><div class="note" style="margin-top:8px">${L.DEMO ? `A made-up household for the demo. Every account is logged month by month from ${M.lbl(tl[0].m, 'long')}, so the account and tag charts cover the whole history. Home equity and the car are estimates.` : `History before Aug 2026 is the savings/current totals from rows 92–93 of the sheet (Feb and Jul 2026 weren't recorded there, so they repeat the month before). From Aug 2026 every account is logged, so account and tag charts fill in from there. House equity and Motorway shares come from the sheet's rows 82–83, which were estimates.`} ${s.events.length ? '' : 'Log big one-offs (house works, bonuses) in Planner and you can strip them out of the monthly change.'}</div></section>
      </div>`;
  } };

  // ======================================================================
  // PLANNER
  // ======================================================================
  const editRow = (coll, it, o = {}) => {
    const dated = o.date || o.month;
    return `<div class="er ${dated ? 'dated' : ''} ${o.type ? 'three' : ''}">
      ${o.date ? `<input class="input date" type="date" value="${esc(it.date || '')}" data-edit="field" data-coll="${coll}" data-id="${it.id}" data-f="date">` : ''}
      ${o.month ? `<input class="input date" type="month" placeholder="YYYY-MM" value="${esc(it.month || '')}" data-edit="field" data-coll="${coll}" data-id="${it.id}" data-f="month">` : ''}
      <input class="input" value="${esc(it[o.f || 'label'] || '')}" placeholder="${o.ph || 'Description'}" data-edit="field" data-coll="${coll}" data-id="${it.id}" data-f="${o.f || 'label'}">
      ${o.type ? `<select class="input type" data-edit="field" data-coll="${coll}" data-id="${it.id}" data-f="type"><option value="oneoff" ${it.type !== 'monthly' ? 'selected' : ''}>One-off</option><option value="monthly" ${it.type === 'monthly' ? 'selected' : ''}>Monthly</option></select>` : ''}
      <input class="input num" inputmode="decimal" value="${inputNum(it.amount)}" placeholder="± £" data-edit="field" data-coll="${coll}" data-id="${it.id}" data-f="amount" data-type="num">
      <button class="x-btn" data-act="del" data-coll="${coll}" data-id="${it.id}" aria-label="Remove">×</button></div>`;
  };
  const houseAmt = (s, it) => it.link === 'furnishings' ? s.house.furnishings.reduce((t, x) => t + (Number(x.amount) || 0), 0) : (Number(it.amount) || 0);

  L.pages.planner = { render(){
    const s = S(), c = s.coverage, cov = M.coverage(s), l = M.latest(s);
    const ladder = M.ladder(s) || [];
    const ladCol = ['var(--s2)', 'var(--s1)', c.slowTagId && M.tag(s, c.slowTagId) ? tagColor(M.tag(s, c.slowTagId)) : 'var(--s3)'];
    let cum = 0;
    const slowTag = c.slowTagId && M.tag(s, c.slowTagId);
    const ladRows = ladder.map((t, i) => { cum += t.v; return `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div><span class="chip"><i class="sw" style="background:${ladCol[i]}"></i>${esc(t.label)}${i === 2 && slowTag && c.excludeSlow ? ' (not counted)' : ''}</span></div><div class="right"><b>${gbp(t.v)}</b> <span class="muted small">· ${cov.costs > 0 ? (t.v / cov.costs).toFixed(1) : '—'} mo${i ? `, ${(cum / cov.costs).toFixed(1)} cumulative` : ''}</span></div></div>`; }).join('');
    const rate = M.avgChange(s, 6) || 0; // scratchpad impact uses the recent trend

    const scns = s.scenarios.map(sc => {
      const t = M.scenarioTotals(sc);
      const monthlyCost = sc.items.filter(i => i.type === 'monthly' && Number(i.amount) < 0).reduce((a, i) => a - Number(i.amount), 0);
      const after = M.coverage(s, { extraFunds: t.oneoff, extraMonthly: monthlyCost });
      const in12 = (l ? l.liquid : 0) + rate * 12 + t.oneoff + t.monthly * 12;
      return `<div class="scn"><div class="scn-head"><input class="inline-text" value="${esc(sc.name)}" data-edit="field" data-coll="scenarios" data-id="${sc.id}" data-f="name" aria-label="Scenario name">
          <label class="switch tiny"><input type="checkbox" ${sc.active ? 'checked' : ''} data-edit="field" data-coll="scenarios" data-id="${sc.id}" data-f="active">In projection</label>
          <button class="x-btn" data-act="del" data-coll="scenarios" data-id="${sc.id}" data-confirm="Delete this what-if?" aria-label="Delete scenario">×</button></div>
        <div class="edit-list">${sc.items.map(it => editRow(`scenarios.#${sc.id}.items`, it, { type: true, ph: 'e.g. New car' })).join('')}</div>
        <button class="add-link" data-act="add" data-coll="scenarios.#${sc.id}.items" data-p="i" data-tpl='{"label":"","amount":0,"type":"oneoff"}'>+ Add item</button>
        <div class="impact"><div><div class="k">One-offs</div><div class="v ${cls(t.oneoff)}">${signed(t.oneoff)}</div></div><div><div class="k">Per month</div><div class="v ${cls(t.monthly)}">${signed(t.monthly)}</div></div>
          <div><div class="k">Cover after</div><div class="v">${L.fmt.months(after.months)} <span class="muted small">(${after.months != null && cov.months != null ? (after.months - cov.months >= 0 ? '+' : '−') + Math.abs(after.months - cov.months).toFixed(1) : '—'})</span></div></div>
          <div><div class="k">Liquid in 12 mo</div><div class="v">${gbp(in12)}</div></div></div></div>`;
    }).join('');

    const house = s.house, hTotal = house.summary.reduce((t, x) => t + houseAmt(s, x), 0);
    return pageHead('Planner', 'Cover, what-ifs, upcoming costs and the house project') + `
      <div class="grid">
        <section class="card s6 accent"><div class="card-head"><div><h2>Months of cover</h2><div class="sub">How long liquid funds would pay planned costs with no income</div></div></div>
          <div class="hero-value">${L.fmt.months(cov.months)} <span style="font-size:20px;font-weight:500" class="ink2">months</span></div>
          <div class="small ink2">${gbp(cov.funds)} available${cov.slowOut ? ` (${esc(slowTag.name)} left out)` : ''} ÷ ${gbp(cov.costs)} a month (${cov.plan.year} fixed + living${c.includeExtras ? ' + extras' : ''}${cov.costAdj ? ', adjusted' : ''})</div>
          <div style="margin:12px 0 4px;display:flex;flex-direction:column;gap:6px"><label class="switch"><input type="checkbox" ${c.includeExtras ? 'checked' : ''} data-edit="field" data-coll="coverage" data-f="includeExtras">Include extras (holidays, eating out…)</label>
            ${slowTag ? `<label class="switch"><input type="checkbox" ${c.excludeSlow ? 'checked' : ''} data-edit="field" data-coll="coverage" data-f="excludeSlow">Leave out ${esc(slowTag.name)} (${gbp(cov.slow)})</label>` : ''}</div>
          <div class="section" style="margin-top:16px"><h3 style="margin-bottom:8px">How quickly you can reach it</h3>${C.stack(ladder.map((t, i) => ({ label: t.label, value: t.v, color: ladCol[i] })))}<div class="rows" style="margin-top:6px">${ladRows}</div>
            <div class="field" style="margin-top:8px"><label>Money that's slower to get out</label><select class="input" data-edit="field" data-coll="coverage" data-f="slowTagId"><option value="">None</option>${s.tags.map(t => `<option value="${t.id}" ${c.slowTagId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
              <div class="small muted" style="margin-top:4px">Pick the tag for accounts you couldn't use straight away, such as investments that would need selling or fixed-term savings. They show as their own layer above, and you can leave them out of months of cover.</div></div></div>
          <div class="section" style="margin-top:14px"><h3 style="margin-bottom:6px">Adjustments to funds</h3><div class="edit-list">${c.fundAdjustments.map(x => editRow('coverage.fundAdjustments', x)).join('')}</div><button class="add-link" data-act="add" data-coll="coverage.fundAdjustments" data-p="f" data-tpl='{"label":"","amount":0}'>+ Add</button>
            <h3 style="margin:10px 0 6px">Adjustments to monthly costs</h3><div class="edit-list">${c.costAdjustments.map(x => editRow('coverage.costAdjustments', x)).join('')}</div><button class="add-link" data-act="add" data-coll="coverage.costAdjustments" data-p="c" data-tpl='{"label":"","amount":0}'>+ Add</button></div>
        </section>
        ${L.chartCard('projection', { cls: 's6', controls: `<div class="filters" style="margin-bottom:8px">${L.spec('projection').controls()}</div>` })}
        <section class="card s12"><div class="card-head"><div><h2>Scratchpad: what-ifs</h2><div class="sub">Model a change before you commit. Negative = cost, positive = money in. Turn one on to see it in the projection.</div></div><div class="actions"><button class="btn sm" data-act="addScenario">+ New what-if</button></div></div>
          ${scns || '<div class="empty">Nothing modelled yet. Try "New car": −£30,000 one-off, −£450 monthly.</div>'}
          <div class="section"><h3 style="margin-bottom:6px">Notes</h3><textarea class="input" data-edit="field" data-coll="" data-f="notes" placeholder="Anything you're thinking through: quotes, ideas, reminders…">${esc(s.notes || '')}</textarea></div>
        </section>
        <section class="card s6"><div class="card-head"><div><h2>Coming up</h2><div class="sub">Known future costs or income. They feed the projection.</div></div></div>
          <div class="edit-list">${s.upcoming.map(u => editRow('upcoming', u, { date: true, ph: 'e.g. Car insurance' })).join('') || '<div class="muted small">Nothing yet.</div>'}</div>
          <button class="add-link" data-act="add" data-coll="upcoming" data-p="u" data-tpl='{"date":"","label":"","amount":0}'>+ Add item</button></section>
        <section class="card s6" id="oneoffs"><div class="card-head"><div><h2>One-offs log</h2><div class="sub">Big moves that weren't normal spending. Trends can strip these out.</div></div></div>
          <div class="edit-list">${s.events.map(e => editRow('events', e, { month: true, ph: 'e.g. Builder final payment' })).join('') || '<div class="muted small">Nothing logged.</div>'}</div>
          <button class="add-link" data-act="add" data-coll="events" data-p="e" data-tpl='{"month":"${M.thisMonth()}","label":"","amount":0}'>+ Log a one-off</button></section>
        <section class="card s12"><div class="card-head"><div><h2>House project</h2><div class="sub">Everything the move and works have cost, from "general costs in and out"</div></div></div>
          <div class="hero-value" style="font-size:36px">${gbp(hTotal)}</div>
          ${C.hbars(house.summary.map(x => ({ label: x.label, value: houseAmt(s, x), color: 'var(--accent)' })))}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" data-act="openBuilding">Building work (${house.building.length})</button><button class="btn" data-act="openFurnishings">Furnishings (${house.furnishings.length} items)</button><button class="btn" data-act="openHouseTotals">Edit totals</button></div></section>
      </div>`;
  } };
  L.acts.addScenario = () => L.commit(s => s.scenarios.push({ id: L.uid('s'), name: 'New what-if', active: true, items: [{ id: L.uid('i'), label: '', amount: 0, type: 'oneoff' }] }));
  L.acts.openHouseTotals = () => L.modal.open(() => ({ title: 'House project totals', narrow: true, sub: 'Furnishings is the sum of the itemised list.',
    body: `<div class="edit-list">${S().house.summary.map(x => x.link ? `<div class="er"><div class="input" style="opacity:.7">${esc(x.label)}</div><div class="input num" style="opacity:.7">${gbp(houseAmt(S(), x))}</div><span></span></div>` : editRow('house.summary', x)).join('')}</div>
      <button class="add-link" data-act="add" data-coll="house.summary" data-p="h" data-tpl='{"label":"","amount":0}'>+ Add</button>` }));
  L.acts.openBuilding = () => L.modal.open(() => {
    const s = S(), b = s.house.building, sum = b.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const official = (s.house.summary.find(x => /building/i.test(x.label)) || {}).amount;
    return { title: 'Building work', sub: `${gbp(sum)} across ${b.length} categories${official && Math.abs(official - sum) >= 1 ? ` · headline total ${gbp(official)} (${gbp(official - sum)} not allocated)` : ''}`,
      body: `<div class="section">${C.hbars(b.slice().sort((p, q) => q.amount - p.amount).map(x => ({ label: x.name, value: x.amount, color: 'var(--s1)' })))}</div>
        <div class="section"><h3>Edit</h3><div class="edit-list">${b.map(x => editRow('house.building', x, { f: 'name', ph: 'Category' })).join('')}</div>
        <button class="add-link" data-act="add" data-coll="house.building" data-p="w" data-tpl='{"name":"","amount":0}'>+ Add category</button></div>` };
  });
  L.acts.openFurnishings = () => L.modal.open(() => {
    const s = S(), f = s.house.furnishings, sum = f.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const top = f.slice().sort((p, q) => q.amount - p.amount).slice(0, 8);
    return { title: 'Furnishings', sub: `${gbp(sum)} across ${f.length} items`,
      body: `<div class="section"><h3>Biggest items</h3>${C.hbars(top.map(x => ({ label: x.name, value: x.amount, color: 'var(--s1)' })))}</div>
        <div class="section"><h3>All items</h3><input class="input search" id="furn-search" placeholder="Search items…" type="search">
        <div class="edit-list" id="furn-list">${f.map(x => `<div data-name="${esc(String(x.name).toLowerCase())}">${editRow('house.furnishings', x, { f: 'name', ph: 'Item' })}</div>`).join('')}</div>
        <button class="add-link" data-act="add" data-coll="house.furnishings" data-p="i" data-tpl='{"name":"","amount":0,"status":""}'>+ Add item</button></div>`,
      onMount(b){ const i = b.querySelector('#furn-search'); i.addEventListener('input', () => { const q = i.value.toLowerCase(); b.querySelectorAll('#furn-list > div').forEach(r => r.style.display = r.dataset.name.includes(q) ? '' : 'none'); }); } };
  });

  // generic field edit at the state root (notes)
  const baseField = L.edits.field;
  L.edits.field = el => { if (el.dataset.coll === ''){ L.commit(s => { s[el.dataset.f] = el.value; }, { render: false }); return; } if (el.dataset.f === 'slowTagId' && el.value === ''){ L.commit(s => { s.coverage.slowTagId = null; }); return; } baseField(el); };
})();
