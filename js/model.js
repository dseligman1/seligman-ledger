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
  M.addM = (ym, n) => { let [y, m] = ym.split('-').map(Number); let t = y * 12 + (m - 1) + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); };
  M.diffM = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by * 12 + bm) - (ay * 12 + am); };
  M.yearOf = ym => Number(ym.slice(0, 4));
  M.lbl = (ym, style) => {
    const y = ym.slice(0, 4), m = Number(ym.slice(5, 7)) - 1;
    if (style === 'long') return MONTH[m] + ' ' + y;
    if (style === 'mon') return MON[m];
    if (style === 'month') return MONTH[m];
    return MON[m] + ' ' + y.slice(2);
  };
  M.MON = MON;
  M.dateLbl = iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MON[m - 1] + ' ' + y; };
  M.daysSince = iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return Math.round((new Date() - new Date(y, m - 1, d)) / 86400000); };

  // ---------------- cache (cleared on every commit) ----------------
  let cache = {};
  M.invalidate = () => { cache = {}; };
  const memo = (k, fn) => (k in cache) ? cache[k] : (cache[k] = fn());

  // ---------------- accounts & snapshots ----------------
  M.acc = (s, id) => s.accounts.find(a => a.id === id);
  M.liquidAccounts = s => s.accounts.filter(a => (a.bucket === 'savings' || a.bucket === 'current'));
  M.activeAccounts = (s, bucket) => s.accounts.filter(a => !a.archived && (!bucket || a.bucket === bucket));
  M.snap = (s, ym) => s.snapshots.find(x => x.month === ym);
  M.detailSnaps = s => s.snapshots.filter(x => x.balances);

  M.snapTotals = (s, snap) => {
    if (!snap) return null;
    if (snap.balances){
      const t = { savings: 0, current: 0, assets: 0, hasAssets: false };
      for (const [id, v] of Object.entries(snap.balances)){
        const a = M.acc(s, id); if (!a || v == null || isNaN(v)) continue;
        if (a.bucket === 'savings') t.savings += v;
        else if (a.bucket === 'current') t.current += v;
        else { t.assets += v; t.hasAssets = true; }
      }
      t.liquid = t.savings + t.current; return t;
    }
    const t = snap.totals || {};
    return { savings: t.savings || 0, current: t.current || 0, liquid: (t.savings || 0) + (t.current || 0), assets: 0, hasAssets: false };
  };

  // Continuous month-by-month timeline. Months with no record are filled by straight-line
  // interpolation and flagged `est`, so a missed month spreads its change rather than showing a fake flat line.
  M.timeline = s => memo('tl', () => {
    const snaps = s.snapshots.filter(x => x.balances || x.totals);
    if (!snaps.length) return [];
    const first = snaps[0].month, last = snaps[snaps.length - 1].month;
    const rec = {}; snaps.forEach(x => rec[x.month] = x);
    const out = [];
    for (let m = first; m <= last; m = M.addM(m, 1)){
      const sn = rec[m];
      if (sn){ const t = M.snapTotals(s, sn); out.push({ m, savings: t.savings, current: t.current, liquid: t.liquid, assets: t.hasAssets ? t.assets : null, est: false, snap: sn }); }
      else out.push({ m, est: true });
    }
    for (let i = 0; i < out.length; i++){
      if (!out[i].est) continue;
      let a = i - 1; while (a >= 0 && out[a].est) a--;
      let b = i + 1; while (b < out.length && out[b].est) b++;
      const f = (i - a) / (b - a);
      ['savings','current'].forEach(k => out[i][k] = out[a][k] + (out[b][k] - out[a][k]) * f);
      out[i].liquid = out[i].savings + out[i].current;
      out[i].assets = null;
    }
    const ev = {}; (s.events || []).forEach(e => { if (e.month) ev[e.month] = (ev[e.month] || 0) + (Number(e.amount) || 0); });
    out.forEach((p, i) => {
      p.change = i ? p.liquid - out[i - 1].liquid : null;
      p.changeEst = i ? (p.est || out[i - 1].est) : false;
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

  // Latest known value of each asset (house, shares), carried forward.
  M.assetValues = s => memo('assets', () => {
    const out = {};
    s.accounts.filter(a => a.bucket === 'asset' && !a.archived).forEach(a => {
      for (let i = s.snapshots.length - 1; i >= 0; i--){
        const b = s.snapshots[i].balances; if (b && b[a.id] != null){ out[a.id] = { value: b[a.id], month: s.snapshots[i].month }; break; }
      }
    });
    return out;
  });
  M.netWorth = s => { const l = M.latest(s); if (!l) return null; const a = Object.values(M.assetValues(s)).reduce((t, x) => t + x.value, 0); return l.liquid + a; };

  // Per-account history from detailed snapshots only.
  M.accountSeries = (s, id) => M.detailSnaps(s).filter(x => x.balances[id] != null).map(x => ({ m: x.month, v: x.balances[id], date: x.date }));
  M.accountNow = (s, id) => { const ser = M.accountSeries(s, id); return ser.length ? ser[ser.length - 1] : null; };
  M.accountPrev = (s, id) => { const ser = M.accountSeries(s, id); return ser.length > 1 ? ser[ser.length - 2] : null; };

  // Account deltas between the last two detailed snapshots.
  M.movers = s => memo('movers', () => {
    const d = M.detailSnaps(s); if (d.length < 2) return [];
    const a = d[d.length - 2], b = d[d.length - 1];
    return s.accounts.filter(x => x.bucket !== 'asset').map(x => ({ acc: x, from: a.balances[x.id] ?? 0, to: b.balances[x.id] ?? 0 }))
      .map(r => ({ ...r, d: r.to - r.from })).filter(r => Math.abs(r.d) >= 1).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  });

  // ---------------- tags ----------------
  M.tag = (s, id) => s.tags.find(t => t.id === id);
  M.tagAccounts = (s, tagId) => s.accounts.filter(a => a.tags.includes(tagId) && !a.archived);
  M.tagTotalAt = (s, tagId, snap) => {
    if (!snap || !snap.balances) return null;
    return M.tagAccounts(s, tagId).reduce((t, a) => t + (snap.balances[a.id] || 0), 0);
  };
  M.tagSeries = (s, tagId) => M.detailSnaps(s).map(x => ({ m: x.month, v: M.tagTotalAt(s, tagId, x) }));
  M.untaggedAccounts = s => s.accounts.filter(a => !a.archived && a.bucket !== 'asset' && !a.tags.length);

  // ---------------- budget ----------------
  M.KINDS = [
    { id:'income', name:'Income', sign: 1 }, { id:'bonus', name:'Bonus', sign: 1 },
    { id:'fixed', name:'Fixed', sign: -1 }, { id:'living', name:'Living', sign: -1 }, { id:'extra', name:'Extras', sign: -1 },
    { id:'saving', name:'To savings', sign: 0 }, { id:'off', name:'Not active', sign: 0 },
  ];
  M.kindName = k => (M.KINDS.find(x => x.id === k) || {}).name || k;
  M.years = s => s.budget.years.slice().sort();
  // A month in a year we haven't budgeted uses the nearest earlier year (or the first one).
  M.budgetYear = (s, y) => { const ys = M.years(s); let best = ys[0]; ys.forEach(v => { if (v <= y) best = v; }); return best; };
  M.amt = (line, y) => Number(line.amounts && line.amounts[y]) || 0;
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
  M.groupTotal = (s, gid, y, kinds) => s.budget.lines.filter(l => l.groupId === gid && (!kinds || kinds.includes(l.kind))).reduce((t, l) => t + M.amt(l, y), 0);

  // ---------------- months of cover ----------------
  // Same method as the sheet's "general costs" tab: (liquid + fund adjustments) / (fixed + living [+ extras] + cost adjustments).
  M.coverage = (s, opts = {}) => {
    const c = s.coverage, y = opts.year || s.settings.planYear;
    const p = M.plan(s, y), l = M.latest(s);
    const liquid = opts.liquid != null ? opts.liquid : (l ? l.liquid : 0);
    const fundAdj = c.fundAdjustments.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const costAdj = c.costAdjustments.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const incl = opts.includeExtras != null ? opts.includeExtras : c.includeExtras;
    const costs = p.fixed + p.living + (incl ? p.extra : 0) + costAdj + (opts.extraMonthly || 0);
    const funds = liquid + fundAdj + (opts.extraFunds || 0);
    return { funds, costs, liquid, fundAdj, costAdj, months: costs > 0 ? funds / costs : null, plan: p };
  };
  // Access ladder: current accounts, then savings, with a "slow" tag (e.g. market-linked) last.
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
  M.coverSeries = s => M.timeline(s).map(p => { const pl = M.plan(s, M.yearOf(p.m)); const c = pl.fixed + pl.living; return { m: p.m, v: c > 0 ? p.liquid / c : null, est: p.est }; });

  // ---------------- year summaries ----------------
  M.yearSummary = s => memo('ys', () => {
    const tl = M.timeline(s), by = {};
    tl.forEach((p, i) => { const y = M.yearOf(p.m); (by[y] = by[y] || []).push({ ...p, i }); });
    return Object.keys(by).sort().map(y => {
      const pts = by[y], firstI = pts[0].i;
      const start = firstI > 0 ? tl[firstI - 1].liquid : pts[0].liquid;
      const end = pts[pts.length - 1].liquid;
      const ch = pts.filter(p => p.change != null && (p.i > 0));
      const worst = ch.reduce((w, p) => (!w || p.underlying < w.underlying) ? p : w, null);
      const best = ch.reduce((w, p) => (!w || p.underlying > w.underlying) ? p : w, null);
      return { year: Number(y), start, end, change: end - start, months: ch.length, avg: ch.length ? ch.reduce((t, p) => t + p.underlying, 0) / ch.length : null, worst, best, partial: firstI === 0 || pts.length < 12, firstM: pts[0].m, startM: firstI > 0 ? tl[firstI - 1].m : pts[0].m, endM: pts[pts.length - 1].m };
    });
  });

  // ---------------- projection & scenarios ----------------
  M.scenarioTotals = sc => sc.items.reduce((t, it) => { const a = Number(it.amount) || 0; if (it.type === 'monthly') t.monthly += a; else t.oneoff += a; return t; }, { oneoff: 0, monthly: 0 });
  M.projection = (s, opts) => {
    const l = M.latest(s); if (!l) return null;
    const months = opts.months || 24;
    const rate = opts.rate === 'plan' ? M.plan(s, s.settings.planYear).net : (M.avgChange(s, 6) || 0);
    const up = {}; (s.upcoming || []).forEach(u => { if (!u.date) return; const k = u.date.slice(0, 7); up[k] = (up[k] || 0) + (Number(u.amount) || 0); });
    const act = (s.scenarios || []).filter(x => x.active).map(M.scenarioTotals).reduce((t, x) => ({ oneoff: t.oneoff + x.oneoff, monthly: t.monthly + x.monthly }), { oneoff: 0, monthly: 0 });
    const labels = [], base = [], withS = [];
    let b = l.liquid, w = l.liquid;
    for (let i = 0; i <= months; i++){
      const m = M.addM(l.m, i); labels.push(m);
      if (i > 0){ b += rate + (up[m] || 0); w += rate + act.monthly + (up[m] || 0) + (i === 1 ? act.oneoff : 0); }
      base.push(b); withS.push(w);
    }
    return { labels, base, withS, rate, act, hasScenarios: act.oneoff !== 0 || act.monthly !== 0, hasUpcoming: Object.keys(up).length > 0 };
  };
})();
