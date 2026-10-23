/* Model: every number the screens show is derived here from state, never stored twice.
   Liquid = Savings + Current (the old sheet's rows 92 + 93). Assets (house, shares) sit outside it. */
(function(){
  'use strict';
  const L = window.Ledger;
  const M = L.model = {};
  const pad = n => String(n).padStart(2, '0');
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ---------------- months ----------------
  M.thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  M.today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  M.addM = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); };
  M.diffM = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by * 12 + bm) - (ay * 12 + am); };
  M.yearOf = ym => Number(ym.slice(0, 4));
  M.monthNum = ym => Number(ym.slice(5, 7));
  M.lbl = (ym, style) => {
    const y = ym.slice(0, 4), m = Number(ym.slice(5, 7)) - 1;
    if (style === 'long') return MONTH[m] + ' ' + y;
    if (style === 'mon') return MON[m];
    if (style === 'month') return MONTH[m];
    return MON[m] + ' ' + y.slice(2);
  };
  M.MON = MON;
  M.dateLbl = (iso, withYear = true) => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MON[m - 1] + (withYear ? ' ' + y : ''); };
  M.daysSince = iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return Math.round((new Date(new Date().toDateString()) - new Date(y, m - 1, d)) / 86400000); };

  // ---------------- cache (cleared on every commit) ----------------
  let cache = {};
  M.invalidate = () => { cache = {}; };
  const memo = (k, fn) => (k in cache) ? cache[k] : (cache[k] = fn());

  // ---------------- accounts & snapshots ----------------
  // A snapshot is either per-account (`balances`) or, for months before Aug 2026, savings/current
  // `totals` from the sheet plus asset `balances` (house, shares) only.
  M.acc = (s, id) => s.accounts.find(a => a.id === id);
  M.activeAccounts = (s, bucket) => s.accounts.filter(a => !a.archived && (!bucket || a.bucket === bucket));
  M.checkinAccounts = s => s.accounts.filter(a => !a.archived && a.bucket !== 'asset');
  M.snap = (s, ym) => s.snapshots.find(x => x.month === ym);
  M.detailSnaps = s => s.snapshots.filter(x => x.balances && !x.totals);

  M.snapTotals = (s, snap) => {
    if (!snap) return null;
    const t = { savings: 0, current: 0, assets: 0, hasAssets: false, byAsset: {} };
    Object.entries(snap.balances || {}).forEach(([id, v]) => {
      const a = M.acc(s, id); if (!a || v == null || isNaN(v)) return;
      if (a.bucket === 'asset'){ t.assets += v; t.hasAssets = true; t.byAsset[id] = v; }
      else if (!snap.totals){ if (a.bucket === 'savings') t.savings += v; else t.current += v; }
    });
    if (snap.totals){ t.savings = snap.totals.savings || 0; t.current = snap.totals.current || 0; }
    t.liquid = t.savings + t.current;
    return t;
  };

  // Continuous month-by-month timeline. A month that was never logged repeats the previous month's figures.
  M.timeline = s => memo('tl', () => {
    const snaps = s.snapshots.filter(x => x.balances || x.totals);
    if (!snaps.length) return [];
    const first = snaps[0].month, last = snaps[snaps.length - 1].month;
    const rec = {}; snaps.forEach(x => rec[x.month] = x);
    const out = []; let prev = null;
    for (let m = first; m <= last; m = M.addM(m, 1)){
      const sn = rec[m];
      if (sn){ const t = M.snapTotals(s, sn); prev = { m, savings: t.savings, current: t.current, liquid: t.liquid, byAsset: t.byAsset, snap: sn }; out.push(prev); }
      else out.push({ ...prev, m, snap: null, carried: true });
    }
    // assets: carry the last known value of each forward
    const lastA = {};
    out.forEach(p => { Object.assign(lastA, p.byAsset || {}); p.assetsBy = { ...lastA }; p.assets = Object.values(lastA).reduce((a, b) => a + b, 0); p.netWorth = p.liquid + p.assets; });
    const ev = {}; (s.events || []).forEach(e => { if (e.month) ev[e.month] = (ev[e.month] || 0) + (Number(e.amount) || 0); });
    out.forEach((p, i) => {
      p.change = i ? p.liquid - out[i - 1].liquid : null;
      p.oneOff = ev[p.m] || 0;
      p.underlying = p.change == null ? null : p.change - p.oneOff;
    });
    return out;
  });

  M.rolling = (vals, n) => vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - n + 1), i + 1).filter(v => v != null);
    return w.length >= Math.min(n, 3) ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
  M.avgChange = (s, n, underlying = true) => {
    const tl = M.timeline(s).filter(p => p.change != null).slice(-n);
    if (!tl.length) return null;
    return tl.reduce((a, p) => a + (underlying ? p.underlying : p.change), 0) / tl.length;
  };
  M.latest = s => { const tl = M.timeline(s); return tl.length ? tl[tl.length - 1] : null; };
  M.point = (s, ym) => M.timeline(s).find(p => p.m === ym) || null;
  M.lastRecordedMonth = s => { const r = s.snapshots.filter(x => x.balances || x.totals); return r.length ? r[r.length - 1].month : null; };

  M.assetValues = s => memo('assets', () => {
    const out = {};
    s.accounts.filter(a => a.bucket === 'asset' && !a.archived).forEach(a => {
      for (let i = s.snapshots.length - 1; i >= 0; i--){
        const b = s.snapshots[i].balances; if (b && b[a.id] != null){ out[a.id] = { value: b[a.id], month: s.snapshots[i].month }; break; }
      }
    });
    return out;
  });
  M.netWorth = s => { const l = M.latest(s); if (!l) return null; return l.liquid + Object.values(M.assetValues(s)).reduce((t, x) => t + x.value, 0); };

  M.accountSeries = (s, id) => s.snapshots.filter(x => x.balances && x.balances[id] != null).map(x => ({ m: x.month, v: x.balances[id], date: M.updatedOn(x, id) }));

  // ---------------- check-in tracking ----------------
  // snapshot.updated = { accountId: 'YYYY-MM-DD' } records when each account was confirmed for that month.
  // Older snapshots have no map, so every account in them counts as updated on the snapshot date.
  M.updatedOn = (snap, id) => {
    if (!snap || !snap.balances || snap.balances[id] == null) return null;
    if (snap.updated) return snap.updated[id] || null;
    return snap.date || (snap.month + '-01');
  };
  M.lastUpdate = (s, id) => {
    for (let i = s.snapshots.length - 1; i >= 0; i--){ const d = M.updatedOn(s.snapshots[i], id); if (d) return { m: s.snapshots[i].month, date: d }; }
    return null;
  };
  M.checkin = (s, ym) => {
    const snap = M.snap(s, ym);
    const rows = M.checkinAccounts(s).map(a => ({ acc: a, on: M.updatedOn(snap, a.id), last: M.lastUpdate(s, a.id) }));
    const done = rows.filter(r => r.on).length;
    const cl = (s.checklist || {})[ym] || {};
    const balancesDone = done === rows.length || !!cl.balances;
    const items = [
      { id: 'balances', label: 'Update every account balance', auto: true, done: balancesDone, detail: `${done} of ${rows.length}` },
      { id: 'change', label: 'Check the monthly change', done: !!cl.change, tab: 'trends' },
      { id: 'oneoffs', label: 'Log any one-offs (big one-time spends or windfalls)', done: !!cl.oneoffs, tab: 'planner' },
      { id: 'budget', label: 'Update the budget if anything changed', done: !!cl.budget, tab: 'budget' },
    ];
    return { month: ym, snap, rows, done, total: rows.length, items, complete: items.every(i => i.done), started: done > 0 };
  };

  // Account deltas between the last two per-account snapshots, with transfers netted out.
  M.moves = s => memo('moves', () => {
    const d = M.detailSnaps(s); if (d.length < 2) return { rows: [], transfers: [], from: null, to: null };
    const a = d[d.length - 2], b = d[d.length - 1];
    let rows = s.accounts.filter(x => x.bucket !== 'asset').map(x => ({ acc: x, from: a.balances[x.id] ?? 0, to: b.balances[x.id] ?? 0 })).map(r => ({ ...r, d: r.to - r.from })).filter(r => Math.abs(r.d) >= 1);
    // pair an outflow with an inflow of about the same size (within 5%) as a transfer between your own accounts
    const transfers = [], used = new Set();
    const big = rows.filter(r => Math.abs(r.d) >= 500).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
    big.forEach(out => {
      if (out.d >= 0 || used.has(out.acc.id)) return;
      const match = big.find(inn => inn.d > 0 && !used.has(inn.acc.id) && Math.abs(inn.d + out.d) <= 0.05 * Math.max(inn.d, -out.d));
      if (match){ const amt = Math.min(match.d, -out.d); transfers.push({ from: out.acc, to: match.acc, amount: amt }); used.add(out.acc.id); used.add(match.acc.id); out.rest = out.d + amt; match.rest = match.d - amt; }
    });
    rows.forEach(r => { r.net = r.rest != null ? r.rest : r.d; });
    rows = rows.sort((p, q) => Math.abs(q.net) - Math.abs(p.net));
    return { rows, transfers, from: a.month, to: b.month };
  });

  // ---------------- tags ----------------
  M.tag = (s, id) => s.tags.find(t => t.id === id);
  M.tagAccounts = (s, tagId) => s.accounts.filter(a => a.tags.includes(tagId) && !a.archived);
  M.tagTotalAt = (s, tagId, snap) => (!snap || !snap.balances || snap.totals) ? null : M.tagAccounts(s, tagId).reduce((t, a) => t + (snap.balances[a.id] || 0), 0);
  M.untaggedAccounts = s => s.accounts.filter(a => !a.archived && a.bucket !== 'asset' && !a.tags.length);

  // ---------------- budget ----------------
  M.KINDS = [
    { id:'income', name:'Income' }, { id:'bonus', name:'Bonus' },
    { id:'fixed', name:'Fixed' }, { id:'living', name:'Living' }, { id:'extra', name:'Extras' },
    { id:'saving', name:'To savings' }, { id:'off', name:'Not active' },
  ];
  M.OUT = ['fixed','living','extra'];
  M.kindName = k => (M.KINDS.find(x => x.id === k) || {}).name || k;
  M.years = s => s.budget.years.slice().sort();
  M.budgetYear = (s, y) => { const ys = M.years(s); let best = ys[0]; ys.forEach(v => { if (v <= y) best = v; }); return best; };
  M.amt = (line, y) => Number(line.amounts && line.amounts[y]) || 0;
  // Monthly-equivalent totals for a year (a bonus paid once still counts as 1/12 a month here).
  M.plan = (s, year) => memo('plan' + year, () => {
    const y = M.budgetYear(s, year);
    const t = { year: y, income: 0, bonus: 0, fixed: 0, living: 0, extra: 0, saving: 0 };
    s.budget.lines.forEach(l => { if (t[l.kind] != null) t[l.kind] += M.amt(l, y); });
    t.inflow = t.income + t.bonus;
    t.outgoings = t.fixed + t.living + t.extra;
    t.net = t.inflow - t.outgoings;
    t.netExBonus = t.income - t.outgoings;
    return t;
  });
  // When a line is paid can differ by year (a bonus spread over 2024 but paid in one go in 2025).
  // payMonths = { year: [1-12] }; no entry for a year = every month. A bare list (older files) applies to every year.
  M.payMonths = (line, y) => {
    const pm = line.payMonths; if (!pm) return null;
    const v = Array.isArray(pm) ? pm : pm[y];
    return v && v.length ? v : null;
  };
  // What a line actually pays in a given calendar month: monthly, or lumped into chosen months.
  M.lineInMonth = (line, ym, monthly, y = M.yearOf(ym)) => {
    const pm = M.payMonths(line, y);
    if (!pm) return monthly;
    return pm.includes(M.monthNum(ym)) ? monthly * 12 / pm.length : 0;
  };
  // The sheet spread every line evenly, so for past months only the timing differs: each line with
  // pay months that year moves its monthly average into those months. { lineId: change vs the sheet }.
  const timingShift = (s, ym) => {
    const y = M.yearOf(ym), out = {};
    s.budget.lines.forEach(l => { if (l.kind === 'off' || !M.payMonths(l, y)) return; const a = M.amt(l, y), d = M.lineInMonth(l, ym, a, y) - a; if (d) out[l.id] = d; });
    return out;
  };
  // Plan for one calendar month. Past months use the sheet's own month-by-month model (planHistory),
  // because the budget's active/inactive flags describe today, not 2023-24 (flat rent, Hillend etc.),
  // with the budget's pay months for that year applied on top.
  M.planMonth = (s, ym) => memo('pm' + ym, () => {
    const h = s.planHistory && s.planHistory[ym];
    if (h && ym < M.thisMonth()){
      const r = { inflow: h.inflow, outgoings: h.outgoings, groups: { ...h.groups }, source: 'sheet' };
      Object.entries(timingShift(s, ym)).forEach(([id, d]) => {
        const l = s.budget.lines.find(x => x.id === id);
        if (l.kind === 'income' || l.kind === 'bonus') r.inflow += d;
        else { if (M.OUT.includes(l.kind)) r.outgoings += d; r.groups[l.groupId] = (r.groups[l.groupId] || 0) + d; }
      });
      r.net = r.inflow - r.outgoings;
      return r;
    }
    const y = M.budgetYear(s, M.yearOf(ym));
    const r = { inflow: 0, outgoings: 0, groups: {}, source: 'budget' };
    s.budget.lines.forEach(l => {
      if (l.kind === 'off') return;
      const v = M.lineInMonth(l, ym, M.amt(l, y), y);
      if (l.kind === 'income' || l.kind === 'bonus') r.inflow += v;
      else if (M.OUT.includes(l.kind)){ r.outgoings += v; r.groups[l.groupId] = (r.groups[l.groupId] || 0) + v; }
      else if (l.kind === 'saving'){ r.groups[l.groupId] = (r.groups[l.groupId] || 0) + v; }
    });
    r.net = r.inflow - r.outgoings;
    return r;
  });
  // Line-level version of planMonth's groups: { lineId: amount }. Past months come from the sheet's
  // own rows (planHistory.lines); a month with only group totals returns {} so callers fall back.
  M.planMonthLines = (s, ym) => memo('pl' + ym, () => {
    const h = s.planHistory && s.planHistory[ym];
    if (h && ym < M.thisMonth()){
      if (!h.lines) return {};
      const r = { ...h.lines };
      Object.entries(timingShift(s, ym)).forEach(([id, d]) => { const l = s.budget.lines.find(x => x.id === id); if (M.OUT.includes(l.kind) || l.kind === 'saving') r[id] = (r[id] || 0) + d; });
      return r;
    }
    const y = M.budgetYear(s, M.yearOf(ym)), r = {};
    s.budget.lines.forEach(l => { if (M.OUT.includes(l.kind) || l.kind === 'saving'){ const v = M.lineInMonth(l, ym, M.amt(l, y), y); if (v) r[l.id] = v; } });
    return r;
  });
  M.groupTotal = (s, gid, y, kinds) => s.budget.lines.filter(l => l.groupId === gid && (!kinds || kinds.includes(l.kind))).reduce((t, l) => t + M.amt(l, y), 0);
  M.spendGroups = s => s.budget.groups.filter(g => s.budget.lines.some(l => l.groupId === g.id && (M.OUT.includes(l.kind) || l.kind === 'saving')) || Object.values(s.planHistory || {}).some(h => h.groups && h.groups[g.id]));

  // ---------------- months of cover ----------------
  // One definition everywhere: (liquid funds [− slower money] + fund adjustments) ÷ (planning-year
  // fixed + living [+ extras] + cost adjustments). Same method as the sheet's "general costs" D57.
  // Slower money = accounts with the coverage tag (e.g. market-linked); only known where balances are per account.
  M.slowAt = (s, snap) => { const c = s.coverage; return c.slowTagId && M.tag(s, c.slowTagId) ? M.tagTotalAt(s, c.slowTagId, snap) : null; };
  M.slowLatest = s => { const d = M.detailSnaps(s); return d.length ? M.slowAt(s, d[d.length - 1]) || 0 : 0; };
  M.coverCosts = s => { const c = s.coverage, p = M.plan(s, s.settings.planYear); return p.fixed + p.living + (c.includeExtras ? p.extra : 0) + c.costAdjustments.reduce((t, x) => t + (Number(x.amount) || 0), 0); };
  M.coverage = (s, opts = {}) => {
    const c = s.coverage, p = M.plan(s, s.settings.planYear), l = M.latest(s);
    const liquid = opts.liquid != null ? opts.liquid : (l ? l.liquid : 0);
    const slow = M.slowLatest(s), slowOut = c.excludeSlow ? slow : 0;
    const fundAdj = c.fundAdjustments.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const costAdj = c.costAdjustments.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const costs = M.coverCosts(s) + (opts.extraMonthly || 0);
    const funds = liquid - slowOut + fundAdj + (opts.extraFunds || 0);
    return { funds, costs, liquid, slow, slowOut, fundAdj, costAdj, months: costs > 0 ? funds / costs : null, plan: p };
  };
  M.ladder = s => {
    const d = M.detailSnaps(s); const snap = d[d.length - 1]; if (!snap) return null;
    const slow = s.coverage.slowTagId;
    const tiers = [{ label: 'Current accounts', v: 0 }, { label: 'Savings', v: 0 }, { label: slow && M.tag(s, slow) ? M.tag(s, slow).name : 'Other', v: 0 }];
    s.accounts.forEach(a => {
      const v = snap.balances[a.id]; if (v == null || a.bucket === 'asset') return;
      if (slow && a.tags.includes(slow)) tiers[2].v += v;
      else if (a.bucket === 'current') tiers[0].v += v; else tiers[1].v += v;
    });
    return tiers.filter(t => t.v !== 0 || t.label !== 'Other');
  };
  // Same cost basis as the headline, so the last point matches it (fund adjustments only apply to today).
  // Slower money is taken out only from months with per-account balances (Aug 2026 on); carried months reuse the last.
  M.coverSeries = s => {
    const c = M.coverCosts(s), tl = M.timeline(s), ex = s.coverage.excludeSlow;
    const fa = s.coverage.fundAdjustments.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    let slow = 0;
    return tl.map((p, i) => {
      if (p.snap) slow = ex ? (M.slowAt(s, p.snap) || 0) : 0;
      return { m: p.m, v: c > 0 ? (p.liquid - slow + (i === tl.length - 1 ? fa : 0)) / c : null };
    });
  };

  // ---------------- year summaries ----------------
  M.yearSummary = s => memo('ys', () => {
    const tl = M.timeline(s), by = {};
    tl.forEach((p, i) => { const y = M.yearOf(p.m); (by[y] = by[y] || []).push({ ...p, i }); });
    return Object.keys(by).sort().map(y => {
      const pts = by[y], firstI = pts[0].i;
      const start = firstI > 0 ? tl[firstI - 1].liquid : pts[0].liquid;
      const end = pts[pts.length - 1].liquid;
      const ch = pts.filter(p => p.change != null && p.i > 0);
      const worst = ch.reduce((w, p) => (!w || p.underlying < w.underlying) ? p : w, null);
      const best = ch.reduce((w, p) => (!w || p.underlying > w.underlying) ? p : w, null);
      return { year: Number(y), start, end, change: end - start, months: ch.length, avg: ch.length ? ch.reduce((t, p) => t + p.underlying, 0) / ch.length : null, worst, best, partial: firstI === 0 || pts.length < 12, firstM: pts[0].m, endM: pts[pts.length - 1].m };
    });
  });

  // ---------------- projection & scenarios ----------------
  M.scenarioTotals = sc => sc.items.reduce((t, it) => { const a = Number(it.amount) || 0; if (it.type === 'monthly') t.monthly += a; else t.oneoff += a; return t; }, { oneoff: 0, monthly: 0 });
  // Looks back `back` months (actual) and forward `fwd` months along three paths.
  M.projection = (s, back = 24, fwd = 24) => {
    const tl = M.timeline(s), l = M.latest(s); if (!l) return null;
    const hist = tl.slice(-(back + 1));
    const trend = M.avgChange(s, 6) || 0;
    const up = {}; (s.upcoming || []).forEach(u => { if (!u.date) return; const k = u.date.slice(0, 7); up[k] = (up[k] || 0) + (Number(u.amount) || 0); });
    const act = (s.scenarios || []).filter(x => x.active).map(M.scenarioTotals).reduce((t, x) => ({ oneoff: t.oneoff + x.oneoff, monthly: t.monthly + x.monthly }), { oneoff: 0, monthly: 0 });
    const labels = hist.map(p => p.m), actual = hist.map(p => p.liquid);
    const pad0 = () => new Array(hist.length - 1).fill(null);
    const tr = pad0().concat([l.liquid]), bp = pad0().concat([l.liquid]), wi = pad0().concat([l.liquid]);
    let t = l.liquid, b = l.liquid, w = l.liquid;
    const planNet = [];
    for (let i = 1; i <= fwd; i++){
      const m = M.addM(l.m, i); labels.push(m); actual.push(null);
      const pm = M.planMonth(s, m).net; planNet.push(pm);
      t += trend + (up[m] || 0); b += pm + (up[m] || 0); w += pm + act.monthly + (up[m] || 0) + (i === 1 ? act.oneoff : 0);
      tr.push(t); bp.push(b); wi.push(w);
    }
    return { labels, actual, trend: tr, budget: bp, withS: wi, trendRate: trend, now: hist.length - 1, act, hasScenarios: act.oneoff !== 0 || act.monthly !== 0, hasUpcoming: Object.keys(up).length > 0, avgPlan: planNet.slice(0, 12).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(12, planNet.length)) };
  };
})();
