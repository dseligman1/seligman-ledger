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
  const RANGES = [['1y','1Y'],['2y','2Y'],['3y','3Y'],['all','All']];
  const MEAS = { liquid: { name: 'Liquid funds', color: 'var(--accent)' }, savings: { name: 'Savings', color: 'var(--s1)' }, current: { name: 'Current accounts', color: 'var(--s2)' } };
  const yearColor = y => `var(--s${(((y - 2023) % 8) + 8) % 8 + 1})`;
  const pageHead = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}</div>`;
  const plusBtn = (act, label, extra = '') => `<button class="btn" data-act="${act}" ${extra}>${L.icons.plus.replace('<svg', '<svg width="16" height="16"')}${label}</button>`;

  function ranged(){ const tl = M.timeline(S()); const n = { '1y': 13, '2y': 25, '3y': 37 }[UI.range]; return n ? tl.slice(-n) : tl; }
  const recordedCount = () => S().snapshots.filter(x => x.balances || x.totals).length;

  function tipMonth(p, extra = ''){
    let h = `<div class="th">${M.lbl(p.m, 'long')}</div>`;
    h += C.tipRow('Savings', gbp(p.savings), 'var(--s1)') + C.tipRow('Current', gbp(p.current), 'var(--s2)') + C.tipRow('Liquid', `<b>${gbp(p.liquid)}</b>`);
    if (p.change != null) h += C.tipRow('Change', signed(p.change));
    if (p.oneOff) h += C.tipRow('One-offs', signed(p.oneOff));
    if (p.est) h += `<div class="tn">Not recorded: filled in between neighbouring months</div>`;
    return h + extra;
  }
  function monthTable(tl){
    const rows = tl.slice().reverse().map(p => `<tr class="${p.est ? 'est' : ''}"><td>${M.lbl(p.m)}${p.est ? ' (est.)' : ''}</td><td class="r hide-sm">${gbp(p.savings)}</td><td class="r hide-sm">${gbp(p.current)}</td><td class="r">${gbp(p.liquid)}</td><td class="r ${cls(p.change)}">${p.change == null ? '—' : signed(p.change)}</td></tr>`).join('');
    return `<table class="tbl"><thead><tr><th>Month</th><th class="r hide-sm">Savings</th><th class="r hide-sm">Current</th><th class="r">Liquid</th><th class="r">Change</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function gapsNote(){
    const s = S(), g = s.gaps || [], tl = M.timeline(s);
    const missing = tl.filter(p => p.est).map(p => p.m);
    let h = '';
    if (missing.length) h += `<b>Months not recorded:</b> ${missing.map(m => M.lbl(m, 'long')).join(', ')}. They're drawn dashed or hatched, with the change spread evenly across the gap.`;
    g.forEach(x => { if (missing.includes(x.month)) h += `<br>· ${M.lbl(x.month, 'long')}: ${esc(x.why)}`; });
    return h || 'Every month in this range was recorded.';
  }

  // ======================================================================
  // CHART SPECS
  // ======================================================================
  L.specs.composition = () => {
    const tl = ranged();
    return {
      title: 'Liquid funds', sub: 'Savings + current accounts at each month-end',
      controls: () => seg('range', RANGES, UI.range),
      legend: () => C.legend([{ name: 'Savings', color: 'var(--s1)', box: true }, { name: 'Current accounts', color: 'var(--s2)', box: true }]),
      draw(el, big){ C.line(el, { labels: tl.map(p => p.m), fmtX: i => M.lbl(tl[i].m), stacked: true, height: big ? 380 : (el.clientWidth > 560 ? 300 : 240), aria: 'Liquid funds stacked by savings and current',
        series: [{ name: 'Savings', color: 'var(--s1)', values: tl.map(p => p.savings) }, { name: 'Current', color: 'var(--s2)', values: tl.map(p => p.current) }], tipFmt: i => tipMonth(tl[i]) }); },
      table: () => monthTable(tl), notes: gapsNote,
    };
  };

  L.specs.balance = () => {
    const tl = ranged(), k = UI.measure, mm = MEAS[k] || MEAS.liquid;
    const vals = tl.map(p => p[k]), last = tl[tl.length - 1];
    return {
      title: mm.name + ' over time', sub: tl.length ? `${M.lbl(tl[0].m, 'long')} to ${M.lbl(last.m, 'long')}` : '',
      controls: () => seg('range', RANGES, UI.range) + seg('measure', [['liquid','Liquid'],['savings','Savings'],['current','Current']], UI.measure),
      draw(el, big){ C.line(el, { labels: tl.map(p => p.m), fmtX: i => M.lbl(tl[i].m), est: tl.map(p => p.est), height: big ? 380 : 270, aria: mm.name + ' over time',
        series: [{ name: mm.name, color: mm.color, values: vals, area: true }], tipFmt: i => tipMonth(tl[i]) }); },
      readout(){
        if (!tl.length) return '';
        const ago = M.point(S(), M.addM(last.m, -12));
        let hi = 0, lo = 0; vals.forEach((v, i) => { if (v > vals[hi]) hi = i; if (v < vals[lo]) lo = i; });
        return `<div class="readout"><span>Now <b>${gbp(last[k])}</b></span>${ago ? `<span>vs a year ago <b class="${cls(last[k] - ago[k])}">${signed(last[k] - ago[k])}</b></span>` : ''}<span>Over range <b class="${cls(last[k] - tl[0][k])}">${signed(last[k] - tl[0][k])}</b></span><span>Peak <b>${gbp(vals[hi])}</b> ${M.lbl(tl[hi].m)}</span><span>Low <b>${gbp(vals[lo])}</b> ${M.lbl(tl[lo].m)}</span></div>`;
      },
      table: () => monthTable(tl), notes: gapsNote,
    };
  };

  L.specs.change = () => {
    const s = S(), full = M.timeline(s), key = UI.strip ? 'underlying' : 'change';
    const allV = full.map(p => p[key]), allR = M.rolling(allV, UI.roll);
    let n = ranged().length; if (n === full.length) n = full.length - 1; // first month has no change
    const tl = full.slice(-n), v = allV.slice(-n), r = allR.slice(-n);
    const hasEst = tl.some(p => p.changeEst), hasEvents = (s.events || []).length > 0;
    const pv = v.filter(x => x != null);
    return {
      title: 'Monthly change', sub: `How much liquid funds rose or fell each month · line = ${UI.roll}-month average`,
      controls: () => seg('range', RANGES, UI.range) + seg('roll', [[3,'3-mo avg'],[6,'6-mo avg'],[12,'12-mo avg']], UI.roll) + (hasEvents ? `<label class="switch"><input type="checkbox" ${UI.strip ? 'checked' : ''} data-act="set" data-k="strip" data-v="${!UI.strip}">Strip one-offs</label>` : ''),
      legend: () => C.legend([{ name: 'Up', color: 'var(--pos)', box: true }, { name: 'Down', color: 'var(--neg)', box: true }, { name: UI.roll + '-month average', color: 'var(--accent)' }].concat(hasEst ? [{ name: 'Hatched = month not recorded', color: 'var(--muted)', box: true }] : [])),
      draw(el, big){ C.bars(el, { labels: tl.map(p => p.m), values: v, est: tl.map(p => p.changeEst), overlay: { name: 'avg', values: r, color: 'var(--accent)' }, height: big ? 360 : 230, fmtX: i => M.lbl(tl[i].m), aria: 'Monthly change in liquid funds',
        tipFmt: i => { const p = tl[i]; return `<div class="th">${M.lbl(p.m, 'long')}</div>` + C.tipRow('Change', `<b>${signed(p.change)}</b>`) + (p.oneOff ? C.tipRow('One-offs', signed(p.oneOff)) + C.tipRow('Underlying', signed(p.underlying)) : '') + (r[i] != null ? C.tipRow(UI.roll + '-mo avg', signed(r[i]), 'var(--accent)') : '') + C.tipRow('Liquid after', gbp(p.liquid)) + (p.changeEst ? '<div class="tn">Spread across a month that wasn\'t recorded</div>' : ''); } }); },
      readout(){
        if (!pv.length) return '';
        const avg = pv.reduce((a, b) => a + b, 0) / pv.length, up = pv.filter(x => x > 0).length;
        let bi = 0, wi = 0; v.forEach((x, i) => { if (x == null) return; if (v[bi] == null || x > v[bi]) bi = i; if (v[wi] == null || x < v[wi]) wi = i; });
        return `<div class="readout"><span>Average <b class="${cls(avg)}">${signed(avg)}</b>/mo</span><span>Up <b>${up}</b> of ${pv.length} months</span><span>Best <b class="pos">${signed(v[bi])}</b> ${M.lbl(tl[bi].m)}</span><span>Worst <b class="neg">${signed(v[wi])}</b> ${M.lbl(tl[wi].m)}</span></div>`;
      },
      table: () => monthTable(tl),
      notes: () => 'Very large months (like the 2024 house move) are capped so normal months stay readable; their real value is printed on the bar and in the table. ' + gapsNote(),
    };
  };

  L.specs.yoy = () => {
    const tl = M.timeline(S()), years = [...new Set(tl.map(p => M.yearOf(p.m)))].slice(-4);
    const ser = years.map(y => {
      const pts = Array.from({ length: 12 }, (_, m) => tl.find(q => q.m === `${y}-${pad(m + 1)}`));
      return { name: String(y), short: String(y), color: yearColor(y), values: pts.map(p => p ? p.liquid : null), est: pts.map(p => p ? p.est : false), pts };
    });
    return {
      title: 'Year against year', sub: 'Liquid funds by calendar month, one line per year',
      legend: () => C.legend(ser.map(x => ({ name: x.name, color: x.color }))),
      draw(el, big){ C.line(el, { labels: M.MON, height: big ? 380 : 260, series: ser, endLabels: true, xGap: 34, aria: 'Liquid funds by month, per year',
        tipFmt: i => `<div class="th">${M.MON[i]}</div>` + ser.map(x => x.values[i] == null ? '' : C.tipRow(x.name, gbp(x.values[i]) + (x.est[i] ? ' (est.)' : ''), x.color)).join('') }); },
      table: () => yearTable(),
    };
  };
  function yearTable(){
    const ys = M.yearSummary(S()).slice().reverse();
    return `<table class="tbl"><thead><tr><th>Year</th><th class="r">Change</th><th class="r">Avg / mo</th><th class="r hide-sm">Best month</th><th class="r hide-sm">Worst month</th></tr></thead><tbody>${ys.map(y => `<tr><td>${y.year}${y.partial ? ` <span class="muted tiny">${M.lbl(y.firstM, 'mon')}–${M.lbl(y.endM, 'mon')}</span>` : ''}</td><td class="r ${cls(y.change)}">${signed(y.change)}</td><td class="r ${cls(y.avg)}">${signed(y.avg)}</td><td class="r hide-sm">${y.best ? signed(y.best.underlying) + ' <span class="muted tiny">' + M.lbl(y.best.m, 'mon') + '</span>' : '—'}</td><td class="r hide-sm">${y.worst ? signed(y.worst.underlying) + ' <span class="muted tiny">' + M.lbl(y.worst.m, 'mon') + '</span>' : '—'}</td></tr>`).join('')}</tbody></table>`;
  }

  L.specs.cover = () => {
    const s = S(), tl = ranged(), all = M.coverSeries(s), cs = all.slice(-tl.length);
    return {
      title: 'Months of cover over time', sub: 'Liquid funds ÷ that year\'s planned fixed + living costs',
      controls: () => seg('range', RANGES, UI.range),
      draw(el, big){ C.line(el, { labels: cs.map(p => p.m), fmtX: i => M.lbl(cs[i].m), est: cs.map(p => p.est), height: big ? 360 : 250, yFmt: v => Math.round(v) + ' mo', zero: true,
        refs: [{ v: 6, label: '6 months' }, { v: 12, label: '12 months' }], series: [{ name: 'Months of cover', color: 'var(--accent)', values: cs.map(p => p.v), area: true }], aria: 'Months of cover over time',
        tipFmt: i => { const p = tl[i], pl = M.plan(s, M.yearOf(p.m)); return `<div class="th">${M.lbl(p.m, 'long')}</div>` + C.tipRow('Cover', `<b>${cs[i].v == null ? '—' : cs[i].v.toFixed(1) + ' months'}</b>`) + C.tipRow('Liquid', gbp(p.liquid)) + C.tipRow(pl.year + ' costs / mo', gbp(pl.fixed + pl.living)); } }); },
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="r">Liquid</th><th class="r hide-sm">Costs / mo</th><th class="r">Cover</th></tr></thead><tbody>${tl.slice().reverse().map((p, k) => { const c = cs[cs.length - 1 - k], pl = M.plan(s, M.yearOf(p.m)); return `<tr class="${p.est ? 'est' : ''}"><td>${M.lbl(p.m)}</td><td class="r">${gbp(p.liquid)}</td><td class="r hide-sm">${gbp(pl.fixed + pl.living)}</td><td class="r">${c.v == null ? '—' : c.v.toFixed(1)}</td></tr>`; }).join('')}</tbody></table>`,
      notes: () => 'Uses each year\'s budget, so the line reflects how costs changed (e.g. moving house, nursery). The headline number on Planner also adds your adjustments.',
    };
  };

  L.specs.plan = () => {
    const s = S(), tl = M.timeline(s), years = [...new Set(tl.map(p => M.yearOf(p.m)))];
    const y = years.includes(UI.planView) ? UI.planView : years[years.length - 1];
    const prevDec = M.point(s, `${y - 1}-12`), firstPt = tl.find(p => M.yearOf(p.m) === y);
    const base = prevDec ? prevDec.liquid : (firstPt ? firstPt.liquid : 0);
    const pl = M.plan(s, y);
    const pts = Array.from({ length: 12 }, (_, m) => M.point(s, `${y}-${pad(m + 1)}`));
    const actual = pts.map(p => p ? p.liquid - base : null);
    const offset = prevDec ? 1 : 0, startIdx = prevDec ? 0 : Math.max(0, pts.findIndex(p => p));
    const planV = Array.from({ length: 12 }, (_, m) => m < startIdx ? null : pl.net * (m - startIdx + offset));
    let li = -1; actual.forEach((v, i) => { if (v != null) li = i; });
    return {
      title: 'Actual against plan', sub: `${y}: change in liquid funds since ${prevDec ? 'December ' + (y - 1) : M.lbl(firstPt.m, 'long')} vs the budget's ${signed(pl.net)}/mo`,
      controls: () => seg('planView', years.map(v => [v, v]), y),
      legend: () => C.legend([{ name: 'Actual', color: 'var(--s1)' }, { name: 'Plan', color: 'var(--muted)', dash: true }]),
      draw(el, big){ C.line(el, { labels: M.MON, height: big ? 360 : 250, zero: true, xGap: 34, est: pts.map(p => p ? p.est : false), aria: 'Actual change vs plan',
        series: [{ name: 'Actual', color: 'var(--s1)', values: actual, width: 2.4 }, { name: 'Plan', color: 'var(--muted)', values: planV, dash: true }],
        tipFmt: i => `<div class="th">${M.MON[i]} ${y}</div>` + C.tipRow('Actual', actual[i] == null ? '—' : signed(actual[i]), 'var(--s1)') + C.tipRow('Plan', planV[i] == null ? '—' : signed(planV[i]), 'var(--muted)') + (actual[i] != null && planV[i] != null ? C.tipRow('Gap', `<b class="${cls(actual[i] - planV[i])}">${signed(actual[i] - planV[i])}</b>`) : '') }); },
      readout(){
        if (li < 0) return '';
        const gap = actual[li] - planV[li], months = li - startIdx + offset;
        const implied = months > 0 ? pl.inflow - actual[li] / months : null;
        return `<div class="readout"><span>By ${M.MON[li]}: actual <b class="${cls(actual[li])}">${signed(actual[li])}</b></span><span>Plan <b>${signed(planV[li])}</b></span><span><b class="${cls(gap)}">${gap >= 0 ? 'Ahead' : 'Behind'} by ${gbp(Math.abs(gap))}</b></span>${implied != null ? `<span>Implied spend ~<b>${gbp(implied)}</b>/mo vs ${gbp(pl.outgoings)} planned</span>` : ''}</div>`;
      },
      notes: () => '"Implied spend" assumes income arrived as budgeted, and includes any investment growth in HL, Morgan Stanley and Nutmeg, so treat it as a rough guide (Inferred).',
    };
  };

  L.specs.tags = () => {
    const s = S(), snaps = M.detailSnaps(s), tags = s.tags;
    const ser = tags.map(t => ({ name: t.name, color: tagColor(t), values: snaps.map(x => M.tagTotalAt(s, t.id, x)) }));
    return {
      title: 'Your buckets over time', sub: 'Totals per tag. Per-account detail starts ' + (snaps[0] ? M.lbl(snaps[0].month, 'long') : '—') + ', and each monthly log adds a point',
      legend: () => C.legend(ser.map(x => ({ name: x.name, color: x.color }))),
      draw(el, big){ if (!tags.length){ el.innerHTML = '<div class="empty">Add tags in Accounts to see buckets here.</div>'; return; }
        C.line(el, { labels: snaps.map(x => x.month), fmtX: i => M.lbl(snaps[i].month), height: big ? 360 : 250, series: ser, endLabels: ser.length <= 4, aria: 'Tag totals over time' }); },
      table: () => `<table class="tbl"><thead><tr><th>Tag</th><th class="r hide-sm">${snaps.length > 1 ? M.lbl(snaps[snaps.length - 2].month) : ''}</th><th class="r">${snaps.length ? M.lbl(snaps[snaps.length - 1].month) : ''}</th><th class="r">Change</th></tr></thead><tbody>${ser.map(x => { const a = x.values[x.values.length - 2], b = x.values[x.values.length - 1]; return `<tr><td>${esc(x.name)}</td><td class="r hide-sm">${gbp(a)}</td><td class="r">${gbp(b)}</td><td class="r ${cls(b - a)}">${a == null ? '—' : signed(b - a)}</td></tr>`; }).join('')}</tbody></table>`,
    };
  };

  L.specs.acc = id => {
    const s = S(), a = M.acc(s, id), ser = M.accountSeries(s, id), b = BUCKET[a.bucket] || BUCKET.current;
    return {
      title: a.name, sub: b.name + (a.estimate ? ' · estimate' : ''),
      draw(el, big){ C.line(el, { labels: ser.map(x => x.m), fmtX: i => M.lbl(ser[i].m), height: big ? 300 : 220, series: [{ name: a.name, color: b.color, values: ser.map(x => x.v), area: true }], aria: a.name + ' balance over time' }); },
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="hide-sm">Logged</th><th class="r">Balance</th><th class="r">Change</th></tr></thead><tbody>${ser.slice().reverse().map((x, k, arr) => `<tr><td>${M.lbl(x.m, 'long')}</td><td class="hide-sm muted">${x.date ? M.dateLbl(x.date) : '—'}</td><td class="r">${gbp(x.v)}</td><td class="r ${arr[k + 1] ? cls(x.v - arr[k + 1].v) : ''}">${arr[k + 1] ? signed(x.v - arr[k + 1].v) : '—'}</td></tr>`).join('')}</tbody></table>`,
    };
  };

  L.specs.waterfall = () => {
    const s = S(), y = UI.budgetYear || s.settings.planYear, p = M.plan(s, y);
    return {
      title: `${y} monthly plan`, sub: 'What\'s left after each layer of cost',
      draw(el, big){ C.waterfall(el, [
        { label: 'Income', value: p.income, total: true, color: 'var(--pos)' }, { label: 'Fixed', value: -p.fixed }, { label: 'Living', value: -p.living },
        { label: 'Extras', value: -p.extra }, { label: 'Bonus', value: p.bonus }, { label: 'Net', value: p.net, total: true, color: p.net >= 0 ? 'var(--pos)' : 'var(--neg)' },
      ], { height: big ? 340 : 240 }); },
      readout: () => `<div class="readout"><span>Before bonus <b class="${cls(p.netExBonus)}">${signed(p.netExBonus)}</b>/mo</span><span>After bonus <b class="${cls(p.net)}">${signed(p.net)}</b>/mo</span></div>`,
      table: () => `<table class="tbl"><thead><tr><th>Group</th><th class="r">${y} / mo</th><th class="r hide-sm">Per year</th></tr></thead><tbody>${s.budget.groups.map(g => { const t = M.groupTotal(s, g.id, M.budgetYear(s, y), ['income','bonus','fixed','living','extra']); return t ? `<tr><td>${esc(g.name)}</td><td class="r">${gbp(t)}</td><td class="r hide-sm">${gbp(t * 12)}</td></tr>` : ''; }).join('')}</tbody></table>`,
    };
  };

  L.specs.projection = () => {
    const s = S(), pr = M.projection(s, { rate: UI.projRate, months: 24 });
    if (!pr) return { title: 'Projection', draw(el){ el.innerHTML = '<div class="empty">Log some balances first.</div>'; } };
    const ser = [{ name: 'Current path', color: 'var(--s1)', values: pr.base }];
    if (pr.hasScenarios) ser.push({ name: 'With what-ifs', color: 'var(--s2)', values: pr.withS });
    return {
      title: 'Where liquid funds are heading', sub: `Assumes ${signed(pr.rate)}/mo (${UI.projRate === 'plan' ? s.settings.planYear + ' budget' : '6-month average'})${pr.hasUpcoming ? ' plus Coming up items' : ''}`,
      controls: () => seg('projRate', [['trend','Recent trend'],['plan','Budget plan']], UI.projRate),
      legend: () => ser.length > 1 ? C.legend(ser.map(x => ({ name: x.name, color: x.color }))) : '',
      draw(el, big){ C.line(el, { labels: pr.labels, fmtX: i => M.lbl(pr.labels[i]), height: big ? 360 : 250, series: ser, endLabels: ser.length > 1, aria: 'Projected liquid funds',
        tipFmt: i => `<div class="th">${M.lbl(pr.labels[i], 'long')}</div>` + ser.map(x => C.tipRow(x.name, gbp(x.values[i]), x.color)).join('') }); },
      readout: () => `<div class="readout"><span>In 12 months <b>${gbp(pr.base[12])}</b></span><span>In 24 months <b>${gbp(pr.base[24])}</b></span>${pr.hasScenarios ? `<span>With what-ifs at 12 months <b class="${cls(pr.withS[12] - pr.base[12])}">${signed(pr.withS[12] - pr.base[12])}</b></span>` : ''}</div>`,
      table: () => `<table class="tbl"><thead><tr><th>Month</th><th class="r">Current path</th>${pr.hasScenarios ? '<th class="r">With what-ifs</th>' : ''}</tr></thead><tbody>${pr.labels.map((m, i) => i % 3 ? '' : `<tr><td>${M.lbl(m, 'long')}</td><td class="r">${gbp(pr.base[i])}</td>${pr.hasScenarios ? `<td class="r">${gbp(pr.withS[i])}</td>` : ''}</tr>`).join('')}</tbody></table>`,
    };
  };

  // ======================================================================
  // OVERVIEW
  // ======================================================================
  L.pages.overview = { render(){
    const s = S(), l = M.latest(s);
    if (!l) return pageHead('Overview') + `<div class="card"><div class="empty">No balances yet.<br><br><button class="btn primary" data-act="logBalances">Log your first balances</button></div></div>`;
    const tl = M.timeline(s), prev = tl[tl.length - 2], ago = M.point(s, M.addM(l.m, -12));
    const avg6 = M.avgChange(s, 6), plan = M.plan(s, M.yearOf(l.m)), cov = M.coverage(s), nw = M.netWorth(s);
    const lastSnap = l.snap;

    // verdict: are we spending more than comes in?
    const implied = avg6 == null ? null : plan.inflow - avg6;
    let v;
    if (avg6 == null) v = { c: 'warn', i: '?', t: 'Not enough history yet', d: 'Log a few months to see the trend.' };
    else if (avg6 >= 250) v = { c: 'good', i: '✓', t: 'More is coming in than going out', d: `Liquid funds grew <b>${signed(avg6)}</b> a month on average over the last 6 months.` };
    else if (avg6 > -250) v = { c: 'warn', i: '≈', t: 'Roughly breaking even', d: `Liquid funds moved <b>${signed(avg6)}</b> a month on average over the last 6 months.` };
    else v = { c: 'bad', i: '!', t: 'Spending more than is coming in', d: `Liquid funds fell <b>${gbp(-avg6)}</b> a month on average over the last 6 months, so today's funds would last about ${(l.liquid / -avg6 / 12).toFixed(1)} years at that rate.` };
    if (implied != null) v.d += ` That suggests spending of roughly ${gbp(implied)}/mo against ${gbp(plan.outgoings)} planned for ${plan.year}.`;

    // check-in card
    const tm = M.thisMonth(), logged = M.snap(s, tm), lastM = M.lastRecordedMonth(s), lastS = M.snap(s, lastM);
    const days = logged && logged.date ? M.daysSince(logged.date) : null;
    const checkin = logged
      ? `<div class="hero-label">Monthly check-in</div><div class="month">${M.lbl(tm, 'long')} <span class="pos">✓</span></div>
         <div class="when">Logged ${logged.date ? M.dateLbl(logged.date) + (days != null ? ` (${days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'})` : '') : ''}. Next check-in is ${M.lbl(M.addM(tm, 1), 'month')}.</div>
         <button class="btn block" data-act="logBalances" data-m="${tm}">Edit ${M.lbl(tm, 'month')} balances</button>`
      : `<div class="hero-label">Monthly check-in</div><div class="month">${M.lbl(tm, 'month')} is due</div>
         <div class="when">Last logged: ${M.lbl(lastM, 'long')}${lastS && lastS.date ? ' (' + M.dateLbl(lastS.date) + ')' : ''}. Takes about two minutes.</div>
         <button class="btn primary block" data-act="logBalances" data-m="${tm}">Log ${M.lbl(tm, 'month')} balances</button>`;
    const steps = `<ul class="steps">
      <li><span class="tick ${logged ? 'done' : ''}">${logged ? '✓' : '1'}</span>Log each account's balance</li>
      <li><span class="tick">2</span><span>Check the <a href="#" data-act="tab" data-tab="trends">monthly change</a></span></li>
      <li><span class="tick">3</span><span>Update the <a href="#" data-act="tab" data-tab="budget">budget</a> if anything changed</span></li></ul>`;

    // buckets
    const d = M.detailSnaps(s), ds = d[d.length - 1], dp = d[d.length - 2];
    const bucketRows = s.tags.map(t => {
      const now = M.tagTotalAt(s, t.id, ds), was = dp ? M.tagTotalAt(s, t.id, dp) : null;
      return `<div class="row clickable" data-act="goTags"><div><div class="name"><span class="chip"><i class="sw" style="background:${tagColor(t)}"></i>${esc(t.name)}</span></div><div class="meta">${M.tagAccounts(s, t.id).length} accounts</div></div><div class="right"><div class="big">${gbp(now)}</div><div class="chg">${was == null ? '' : chg(now - was)}</div></div></div>`;
    }).join('');

    // movers
    const mv = M.movers(s).slice(0, 6);
    let transfer = '';
    for (let i = 0; i < mv.length && !transfer; i++) for (let j = i + 1; j < mv.length; j++){
      const a = mv[i], b = mv[j];
      if (Math.sign(a.d) !== Math.sign(b.d) && Math.abs(a.d + b.d) < 0.05 * Math.max(Math.abs(a.d), Math.abs(b.d)) && Math.abs(a.d) > 500){ transfer = `<div class="note box">${esc(a.acc.name)} ${signed(a.d)} and ${esc(b.acc.name)} ${signed(b.d)} look like a transfer between accounts (net ${signed(a.d + b.d)}).</div>`; break; }
    }
    const moverRows = mv.map(r => `<div class="row clickable" data-act="openAccount" data-id="${r.acc.id}"><div><div class="name">${esc(r.acc.name)}</div><div class="meta">${gbp(r.from)} → ${gbp(r.to)}</div></div><div class="right"><div class="big ${cls(r.d)}">${signed(r.d)}</div></div></div>`).join('');

    return pageHead('Overview', `Balances as of ${lastSnap && lastSnap.date ? M.dateLbl(lastSnap.date) : M.lbl(l.m, 'long')}`) + `
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
      <section class="card s5 accent update-card">${checkin}${steps}</section>
      <div class="stats" style="grid-column:1/-1">
        <button class="stat" data-act="openBucket" data-b="savings"><div class="k">Savings</div><div class="v">${gbp(l.savings)}</div><div class="d">${prev ? chg(l.savings - prev.savings, ' vs last month') : ''}</div></button>
        <button class="stat" data-act="openBucket" data-b="current"><div class="k">Current accounts</div><div class="v">${gbp(l.current)}</div><div class="d">${prev ? chg(l.current - prev.current, ' vs last month') : ''}</div></button>
        <button class="stat" data-act="tab" data-tab="planner"><div class="k">Months of cover</div><div class="v">${L.fmt.months(cov.months)}</div><div class="d">${cov.plan.year} plan, essentials</div></button>
        <button class="stat" data-act="tab" data-tab="accounts"><div class="k">Net worth</div><div class="v">${gbp(nw)}</div><div class="d">Incl. est. house + shares</div></button>
      </div>
      ${L.chartCard('composition', { cls: 's7' })}
      ${L.chartCard('change', { cls: 's5', sub: `${UI.roll}-month average line` })}
      <section class="card s6"><div class="card-head"><div><h2>Buckets</h2><div class="sub">Totals by tag, vs last log</div></div><div class="actions"><button class="btn sm" data-act="manageTags">Manage tags</button></div></div>
        <div class="rows">${bucketRows || '<div class="empty">No tags yet.</div>'}</div></section>
      <section class="card s6"><div class="card-head"><div><h2>What moved</h2><div class="sub">${dp ? `Biggest account changes, ${M.lbl(dp.month, 'mon')} → ${M.lbl(ds.month, 'mon')}` : 'Needs two monthly logs'}</div></div></div>
        <div class="rows">${moverRows || '<div class="empty">Nothing to compare yet.</div>'}</div>${transfer}</section>
    </div>`;
  } };

  // ======================================================================
  // ACCOUNTS
  // ======================================================================
  function accRow(a){
    const s = S(), ser = M.accountSeries(s, a.id), now = ser[ser.length - 1], prv = ser[ser.length - 2];
    const tags = a.tags.map(id => M.tag(s, id)).filter(Boolean);
    return `<div class="row acc-row clickable" data-act="openAccount" data-id="${a.id}">
      <div><div class="name">${esc(a.name)}${a.estimate ? '<span class="est-badge">est.</span>' : ''}</div>${tags.length ? `<div class="chips">${tags.map(chip).join('')}</div>` : ''}</div>
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
        ${L.chartCard('tags', { cls: 's12' })}
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
  L.acts.logBalances = el => openLog((el && el.dataset.m) || M.thisMonth());
  function openLog(month){
    const s = S();
    const existing = M.snap(s, month);
    const before = M.detailSnaps(s).filter(x => x.month < month), prevSnap = before[before.length - 1];
    const prevTotals = (() => { const r = s.snapshots.filter(x => x.month < month && (x.balances || x.totals)); return r.length ? M.snapTotals(s, r[r.length - 1]) : null; })();
    const prevMonth = (() => { const r = s.snapshots.filter(x => x.month < month && (x.balances || x.totals)); return r.length ? r[r.length - 1].month : null; })();
    const accs = s.accounts.filter(a => !a.archived);
    const start = id => existing && existing.balances && existing.balances[id] != null ? existing.balances[id] : (prevSnap ? prevSnap.balances[id] : null);
    const opts = []; for (let i = 0; i < 24; i++){ const m = M.addM(M.thisMonth(), -i); opts.push(`<option value="${m}" ${m === month ? 'selected' : ''}>${M.lbl(m, 'long')}${M.snap(s, m) ? ' ✓' : ''}</option>`); }
    const section = (b, title) => { const list = accs.filter(a => a.bucket === b); if (!list.length) return ''; return `<div class="section"><h3>${title}</h3>${list.map(a => { const pv = prevSnap ? prevSnap.balances[a.id] : null; return `<div class="log-row"><div><div class="name">${esc(a.name)}${a.estimate ? '<span class="est-badge">est.</span>' : ''}</div><div class="prev">${pv != null ? M.lbl(prevSnap.month, 'mon') + ': ' + gbp(pv) : 'New'} <span class="dl" data-dl="${a.id}"></span></div></div><input class="input num" inputmode="decimal" data-bal="${a.id}" data-bucket="${b}" data-prev="${pv == null ? '' : pv}" value="${inputNum(start(a.id))}" aria-label="${esc(a.name)} balance"></div>`; }).join('')}</div>`; };
    L.modal.open(() => ({
      title: 'Monthly check-in', sub: 'Last month\'s figure is under each account. Prefilled, so just change what moved.',
      body: `<div class="two"><div class="field"><label>Month</label><select class="input" id="log-month">${opts.join('')}</select></div>
          <div class="field"><label>Balances as of</label><input class="input" type="date" id="log-date" value="${(existing && existing.date) || M.today()}"></div></div>
        ${section('savings', 'Savings')}${section('current', 'Current accounts')}${section('asset', 'Other assets (estimates are fine)')}
        <div class="section field"><label>Note for this month (optional)</label><input class="input" id="log-note" value="${esc((existing && existing.note) || '')}" placeholder="e.g. paid nursery deposit, moved £10k to HL"></div>`,
      foot: `<div class="log-totals"><div><div class="k">Savings</div><div class="v" id="lt-s">—</div></div><div><div class="k">Current</div><div class="v" id="lt-c">—</div></div><!-- --><div><div class="k">Liquid</div><div class="v" id="lt-l">—</div></div></div>
        <button class="btn primary block" id="log-save">Save ${M.lbl(month, 'long')}</button>`,
      onMount(body){
        const foot = document.getElementById('modal-foot');
        const recalc = () => {
          let sv = 0, cu = 0;
          body.querySelectorAll('[data-bal]').forEach(i => {
            const v = L.parseNum(i.value), pv = i.dataset.prev === '' ? null : Number(i.dataset.prev);
            if (v != null){ if (i.dataset.bucket === 'savings') sv += v; else if (i.dataset.bucket === 'current') cu += v; }
            const dl = body.querySelector(`[data-dl="${i.dataset.bal}"]`);
            dl.innerHTML = (v != null && pv != null && Math.round(v - pv) !== 0) ? `· <span class="${cls(v - pv)}">${signed(v - pv)}</span>` : '';
          });
          foot.querySelector('#lt-s').textContent = gbp(sv); foot.querySelector('#lt-c').textContent = gbp(cu);
          const liq = sv + cu, d = prevTotals ? liq - prevTotals.liquid : null;
          foot.querySelector('#lt-l').innerHTML = gbp(liq) + (d != null ? `<div class="${cls(d)} tiny" style="font-weight:500">${signed(d)}</div>` : '');
        };
        body.addEventListener('input', e => { if (e.target.matches('[data-bal]')) recalc(); });
        body.querySelectorAll('[data-bal]').forEach(i => i.addEventListener('focus', () => i.select()));
        body.querySelector('#log-month').addEventListener('change', e => openLog(e.target.value));
        recalc();
        foot.querySelector('#log-save').addEventListener('click', () => {
          const bal = {}; body.querySelectorAll('[data-bal]').forEach(i => { const v = L.parseNum(i.value); if (v != null) bal[i.dataset.bal] = v; });
          if (!Object.keys(bal).length){ L.toast('Enter at least one balance'); return; }
          const date = body.querySelector('#log-date').value || M.today(), note = body.querySelector('#log-note').value.trim();
          L.commit(st => {
            const snap = { month, date, balances: bal, totals: null, note };
            const i = st.snapshots.findIndex(x => x.month === month);
            if (i >= 0){ const old = st.snapshots[i]; if (old.balances) Object.keys(old.balances).forEach(k => { const a = M.acc(st, k); if (a && a.archived && bal[k] == null) bal[k] = old.balances[k]; }); st.snapshots[i] = snap; }
            else st.snapshots.push(snap);
            st.snapshots.sort((a, b) => a.month < b.month ? -1 : 1);
            st.gaps = (st.gaps || []).filter(g => g.month !== month);
          });
          L.modal.close();
          const p = M.point(S(), month);
          L.toast(`${M.lbl(month, 'long')} saved · liquid ${p && p.change != null ? signed(p.change) : gbp(p ? p.liquid : 0)}`);
        });
      },
    }));
  }

  // ======================================================================
  // BUDGET
  // ======================================================================
  L.pages.budget = { render(){
    const s = S(), ys = M.years(s), cy = new Date().getFullYear();
    if (!ys.includes(UI.budgetYear)) UI.budgetYear = ys.includes(cy) ? cy : ys[ys.length - 1];
    const y = UI.budgetYear, py = ys[ys.indexOf(y) - 1], p = M.plan(s, y), pp = py ? M.plan(s, py) : null;
    const isPlan = s.settings.planYear === y;
    const d = (k) => pp ? `<span class="dlt ${cls(k === 'outgoings' || ['fixed','living','extra'].includes(k) ? -(p[k] - pp[k]) : p[k] - pp[k])}">${signed(p[k] - pp[k])}</span>` : '';
    const sumRow = (label, k, strong) => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto 70px"><div class="name">${label}</div><div class="right ${strong ? 'big' : ''}">${gbp(p[k])}</div><div class="right tiny">${d(k)}</div></div>`;
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
        return `<div class="row b-row ${l.kind === 'off' ? 'off' : ''}"><div style="min-width:0"><div class="name" data-act="openLine" data-id="${l.id}">${esc(l.name)}<span class="kind ${l.kind}">${M.kindName(l.kind)}</span></div>${l.note ? `<div class="meta">${esc(l.note)}</div>` : ''}</div>
          <input class="inline-num" inputmode="decimal" value="${inputNum(Math.round(a * 100) / 100)}" data-edit="amt" data-id="${l.id}" aria-label="${esc(l.name)} ${y} monthly amount">
          <div class="dlt">${dd == null || Math.abs(dd) < 0.5 ? '' : `<span class="${cls(isIncome ? dd : -dd)}">${signed(dd)}</span>`}</div></div>`;
      }).join('');
      return `<section class="card s6 group ${col ? 'collapsed' : ''}">
        <div class="group-head" data-act="toggleGroup" data-k="bg-${g.id}"><div class="gt"><span class="caret">${L.icons.caret.replace('<svg', '<svg width="18" height="18"')}</span><div><h2>${esc(g.name)}</h2><div class="sub muted small">${lines.filter(l => l.kind !== 'off').length} active${lines.some(l => l.kind === 'off') ? ` · ${lines.filter(l => l.kind === 'off').length} inactive` : ''}</div></div></div>
          <div class="tot"><div style="font-weight:600">${gbp(tot)}<span class="muted small">/mo</span></div><div class="chg">${ptot != null && Math.abs(tot - ptot) >= 0.5 ? `<span class="${cls(isIncome ? tot - ptot : ptot - tot)}">${signed(tot - ptot)}</span> vs ${py}` : ''}</div></div></div>
        <div class="group-body"><div class="rows">${rows || '<div class="empty">No active lines.</div>'}</div>
          <button class="add-link" data-act="addLine" data-g="${g.id}">+ Add line</button></div></section>`;
    }).join('');

    const sal = (s.budget.salaries || []).map(x => `<div class="row"><div><div class="name">${esc(x.name)}</div>${x.note ? `<div class="meta">${esc(x.note)}</div>` : ''}</div><div class="right">${gbp(x.amounts[y])}<div class="tiny muted">per year</div></div></div>`).join('');

    return pageHead('Budget', 'What you expect to come in and go out each month. Tap any amount to change it.', plusBtn('addGroup', 'Group')) + `
      <div class="filters">
        <div class="f"><span class="lbl">Year</span>${seg('budgetYear', ys.map(v => [v, v + (v === s.settings.planYear ? ' ★' : '')]), y)}<button class="btn sm" data-act="addYear">+ ${ys[ys.length - 1] + 1}</button></div>
        <div class="f">${isPlan ? '<span class="chip"><i class="sw" style="background:var(--accent)"></i>Planning year</span>' : `<button class="btn sm" data-act="makePlanYear" data-y="${y}">Make ${y} the planning year</button>`}</div>
        ${hidden ? `<label class="switch"><input type="checkbox" ${UI.showInactive ? 'checked' : ''} data-act="set" data-k="showInactive" data-v="${!UI.showInactive}">Show ${hidden} inactive</label>` : ''}
      </div>
      <div class="grid">
        <section class="card s5"><div class="card-head"><div><h2>${y} per month</h2><div class="sub">${pp ? 'Change vs ' + py + ' on the right' : 'First budgeted year'}</div></div></div>
          <div class="rows">
            ${sumRow('Take-home income', 'income')}${sumRow('Bonus (spread monthly)', 'bonus')}
            ${sumRow('Fixed costs', 'fixed')}${sumRow('Living costs', 'living')}${sumRow('Extras', 'extra')}
            <div class="row" style="grid-template-columns:minmax(0,1fr) auto 70px"><div class="name"><b>Left over each month</b></div><div class="right big ${cls(p.net)}" style="font-size:18px">${signed(p.net)}</div><div class="right tiny">${pp ? `<span class="dlt ${cls(p.net - pp.net)}">${signed(p.net - pp.net)}</span>` : ''}</div></div>
          </div>
          <div class="note">Fixed = must-pay (mortgage, bills, nursery). Living = day-to-day (food, kids, clothes). Extras = flexible (holidays, eating out). Same split as the sheet's A/B/X/C/D codes.</div>
        </section>
        ${L.chartCard('waterfall', { cls: 's7' })}
        ${groups}
        ${sal ? `<section class="card s6"><div class="card-head"><div><h2>Gross salaries</h2><div class="sub">Reference only, not counted in the totals</div></div></div><div class="rows">${sal}</div></section>` : ''}
      </div>`;
  } };
  L.edits.amt = el => { const v = L.parseNum(el.value) ?? 0; L.commit(s => { const l = s.budget.lines.find(x => x.id === el.dataset.id); l.amounts[UI.budgetYear] = v; }); };
  L.edits.lineYear = el => { const v = L.parseNum(el.value) ?? 0; L.commit(s => { const l = s.budget.lines.find(x => x.id === el.dataset.id); l.amounts[el.dataset.y] = v; }); };
  L.acts.makePlanYear = el => L.commit(s => { s.settings.planYear = Number(el.dataset.y); });
  L.acts.addYear = () => L.commit(s => { const ys = M.years(s), last = ys[ys.length - 1], ny = last + 1; s.budget.lines.forEach(l => { l.amounts[ny] = M.amt(l, last); }); (s.budget.salaries || []).forEach(x => { x.amounts[ny] = x.amounts[last]; }); s.budget.years.push(ny); UI.budgetYear = ny; L.saveUI(); L.toast(`${ny} added, copied from ${last}`); });
  L.acts.addLine = el => { const id = L.uid('b'); L.commit(s => { const amounts = {}; s.budget.years.forEach(y => amounts[y] = 0); s.budget.lines.push({ id, groupId: el.dataset.g, name: 'New line', kind: 'living', amounts, note: '' }); }); openLine(id); };
  L.acts.addGroup = () => { const name = prompt('Name for the new group'); if (!name) return; L.commit(s => s.budget.groups.push({ id: L.uid('g'), name: name.trim() })); };
  L.acts.openLine = el => openLine(el.dataset.id);
  function openLine(id){
    L.modal.open(() => {
      const s = S(), l = s.budget.lines.find(x => x.id === id); if (!l) return { title: 'Removed', body: '' };
      const ys = M.years(s);
      const max = Math.max(1, ...ys.map(y => Math.abs(M.amt(l, y))));
      return {
        title: l.name, sub: `${M.kindName(l.kind)} · ${esc((s.budget.groups.find(g => g.id === l.groupId) || {}).name || '')}`, narrow: true,
        body: `<div class="section">${C.hbars(ys.map(y => ({ label: String(y) + (y === s.settings.planYear ? ' ★' : ''), value: M.amt(l, y), color: y === UI.budgetYear ? 'var(--accent)' : 'var(--s1)', display: gbp(M.amt(l, y)) + '/mo' })), { max })}</div>
          <div class="section"><h3>Monthly amount by year</h3><div class="two">${ys.map(y => `<div class="field"><label>${y}</label><input class="input num" inputmode="decimal" value="${inputNum(Math.round(M.amt(l, y) * 100) / 100)}" data-edit="lineYear" data-id="${id}" data-y="${y}"></div>`).join('')}</div></div>
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
    return pageHead('Trends', `${recordedCount()} months recorded · ${M.lbl(tl[0].m, 'long')} to ${M.lbl(tl[tl.length - 1].m, 'long')}`) + `
      <div class="filters">
        <div class="f"><span class="lbl">Range</span>${seg('range', RANGES, UI.range)}</div>
        <div class="f"><span class="lbl">Show</span>${seg('measure', [['liquid','Liquid'],['savings','Savings'],['current','Current']], UI.measure)}</div>
        <div class="f"><span class="lbl">Average</span>${seg('roll', [[3,'3 mo'],[6,'6 mo'],[12,'12 mo']], UI.roll)}</div>
        ${hasEvents ? `<label class="switch"><input type="checkbox" ${UI.strip ? 'checked' : ''} data-act="set" data-k="strip" data-v="${!UI.strip}">Strip one-offs</label>` : ''}
      </div>
      <div class="grid">
        ${L.chartCard('balance', { cls: 's12' })}
        ${L.chartCard('change', { cls: 's7' })}
        <section class="card s5"><div class="card-head"><div><h2>Year by year</h2><div class="sub">Change in liquid funds per calendar year</div></div><div class="actions"><button class="icon-btn" data-act="expand" data-key="yoy" aria-label="Open year chart">${L.icons.expand}</button></div></div>${yearTable()}</section>
        ${L.chartCard('yoy', { cls: 's6' })}
        ${L.chartCard('plan', { cls: 's6', controls: `<div class="filters" style="margin-bottom:8px">${L.spec('plan').controls()}</div>` })}
        ${L.chartCard('cover', { cls: 's6' })}
        ${L.chartCard('tags', { cls: 's6' })}
        <section class="card s12"><h2>About this data</h2><div class="note" style="margin-top:8px">${gapsNote()}<br>History before Aug 2026 is the savings/current totals you pasted into rows 92–93 of the sheet. From Aug 2026 every account is logged, so account and tag charts build up from there. ${s.events.length ? '' : 'Log big one-offs (house works, bonuses) in Planner to strip them out of the monthly change.'}</div></section>
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
    const ladRows = ladder.map((t, i) => { cum += t.v; return `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div><span class="chip"><i class="sw" style="background:${ladCol[i]}"></i>${esc(t.label)}</span></div><div class="right"><b>${gbp(t.v)}</b> <span class="muted small">· ${cov.costs > 0 ? (t.v / cov.costs).toFixed(1) : '—'} mo${i ? `, ${(cum / cov.costs).toFixed(1)} cumulative` : ''}</span></div></div>`; }).join('');
    const rate = M.avgChange(s, 6) || 0;

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
          <div class="small ink2">${gbp(cov.funds)} available ÷ ${gbp(cov.costs)} a month (${cov.plan.year} fixed + living${c.includeExtras ? ' + extras' : ''}${cov.costAdj ? ', adjusted' : ''})</div>
          <div style="margin:12px 0 4px"><label class="switch"><input type="checkbox" ${c.includeExtras ? 'checked' : ''} data-edit="field" data-coll="coverage" data-f="includeExtras">Include extras (holidays, eating out…)</label></div>
          <div class="section" style="margin-top:16px"><h3 style="margin-bottom:8px">How quickly you can reach it</h3>${C.stack(ladder.map((t, i) => ({ label: t.label, value: t.v, color: ladCol[i] })))}<div class="rows" style="margin-top:6px">${ladRows}</div>
            <div class="field" style="margin-top:8px"><label>Count as slower money</label><select class="input" data-edit="field" data-coll="coverage" data-f="slowTagId"><option value="">Nothing</option>${s.tags.map(t => `<option value="${t.id}" ${c.slowTagId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div></div>
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
        <section class="card s6"><div class="card-head"><div><h2>One-offs log</h2><div class="sub">Big moves that weren't normal spending. Trends can strip these out.</div></div></div>
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
