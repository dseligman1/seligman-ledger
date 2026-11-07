/* Monthly review: a check-in at the start of November reviews October.
   Balance movements are between dated snapshots, not measured category spending. */
(function(){
  'use strict';
  const L = window.Ledger, M = L.model;
  const R = L.reportModel = { version: 1 };
  const money = n => (n < 0 ? '-' : '') + '£' + Math.round(Math.abs(n)).toLocaleString('en-GB');
  const validMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  const idsFor = (s, cm) => {
    const saved = s.monthlyReports && s.monthlyReports[cm];
    // Adding a new account must not reopen every historical check-in.
    return cm < M.thisMonth() && saved && saved.accountIds ? saved.accountIds : M.checkinAccounts(s).map(a => a.id);
  };
  R.complete = (s, cm) => {
    if (!validMonth(cm) || cm > M.thisMonth()) return false;
    const snap = M.snap(s, cm), ids = idsFor(s, cm), c = (s.checklist || {})[cm] || {};
    return !!(snap && !snap.totals && ids.length && ids.every(id => M.updatedOn(snap, id)) && c.change && c.oneoffs && c.budget);
  };
  R.build = (s, cm) => {
    if (!R.complete(s, cm)) return null;
    // No later balances or asset values may leak into a historical review.
    const asof = { ...s, snapshots: s.snapshots.filter(x => x.month <= cm).slice().sort((a, b) => a.month.localeCompare(b.month)) };
    M.invalidate();
    const month = M.addM(cm, -1), tl = M.timeline(asof), end = M.point(asof, cm), prev = M.point(asof, month);
    const comparable = !!(prev && prev.snap && end && end.snap);
    const delta = comparable ? end.liquid - prev.liquid : null;
    const plan = M.planMonth(asof, month), gap = delta == null ? null : delta - plan.net;
    const cover = M.coverage(asof, { liquid: end.liquid });
    const trend = [];
    for (let i = 5; i >= 0; i--){
      const m = M.addM(cm, -i), p = tl.find(x => x.m === m), before = tl.find(x => x.m === M.addM(m, -1));
      const actual = p && p.snap && before && before.snap ? p.liquid - before.liquid : null;
      const dm = actual == null ? null : M.drivers(asof, before.snap, p.snap);
      trend.push({ checkMonth: m, month: M.addM(m, -1), liquid: p && p.snap ? p.liquid : null, actual, ours: dm ? dm.ours : null, plan: M.planMonth(asof, M.addM(m, -1)).net });
    }
    // What drove the change: our own money versus market prices on investments.
    const dr = comparable ? M.drivers(asof, prev.snap, end.snap) : null;
    const oursGap = dr ? dr.ours - plan.net : null;
    const drivers = dr ? { tag: dr.tag.name, total: dr.total, ours: dr.ours, market: dr.market, intoMarket: dr.intoMarket, source: dr.source, lead: dr.lead,
      groups: dr.groups.map(g => ({ id: g.id, name: g.name, controllable: g.controllable, change: g.change, moved: g.moved, real: g.real })),
      transfers: dr.transfers.slice(0, 4).map(m => ({ from: String(m.fromAcc.name || 'Account'), to: String(m.toAcc.name || 'Account'), amount: m.amount })), transferCount: dr.transfers.length,
      check: dr.check ? { market: dr.check.market, other: dr.check.other } : null, movedLine: M.movedLine(dr, money),
      ourTop: dr.ourRows.slice(0, 3).map(r => ({ name: String(r.acc.name || 'Account'), d: r.real })), marketTop: dr.marketRows.slice(0, 3).map(r => ({ name: String(r.acc.name || 'Account'), d: r.real })) } : null;
    const bullets = [];
    let headline = 'A fresh view of the family finances';
    if (delta != null){
      headline = Math.round(delta) > 0 ? 'A stronger position this month' : Math.round(delta) < 0 ? 'A month of drawing on our funds' : 'Holding steady this month';
      if (dr && dr.lead === 'market' && Math.round(delta) !== 0) headline = Math.round(delta) > 0 ? 'Markets lifted our funds this month' : 'Markets pulled our funds down this month';
      bullets.push(`Liquid funds ${Math.round(delta) >= 0 ? 'rose' : 'fell'} ${money(Math.abs(delta))} between check-ins.`);
      if (dr) bullets.push(M.driverLine(dr, money));
      if (dr && drivers.movedLine) bullets.push(drivers.movedLine);
      bullets.push(dr ? `Leaving out market moves, ${money(Math.abs(oursGap))} ${Math.round(oursGap) >= 0 ? 'ahead of' : 'behind'} the ${M.lbl(month, 'month')} plan.`
        : `${money(Math.abs(gap))} ${Math.round(gap) >= 0 ? 'ahead of' : 'behind'} the ${M.lbl(month, 'month')} plan for balance growth.`);
    } else {
      bullets.push(`Liquid funds stand at ${money(end.liquid)}.`);
      bullets.push('No previous-month snapshot: monthly change is not yet available.');
    }
    const upcoming = (s.upcoming || []).filter(x => x.date && x.date.slice(0, 7) === cm && Number(x.amount)).map(x => ({ label: String(x.label || 'Upcoming item'), date: x.date, amount: Number(x.amount) })).sort((a, b) => a.date.localeCompare(b.date));
    const outgoing = upcoming.filter(x => x.amount < 0).reduce((t, x) => t - x.amount, 0);
    bullets.push(outgoing ? `${money(outgoing)} in listed one-off costs coming up in ${M.lbl(cm, 'month')}.` : cover.months != null ? `${cover.months.toFixed(1)} months of planned costs covered by adjusted funds.` : 'Review upcoming costs together before the next check-in.');
    const dates = [...new Set(Object.values(end.snap.updated || {}).filter(Boolean))].sort();
    const report = {
      version: R.version, month, checkMonth: cm, accountIds: idsFor(s, cm),
      title: M.lbl(month, 'long'), headline, bullets,
      balanceDate: end.snap.date || cm + '-01', fromDate: comparable ? (prev.snap.date || month + '-01') : null,
      confirmedFrom: dates[0] || end.snap.date, confirmedTo: dates[dates.length - 1] || end.snap.date,
      liquid: end.liquid, savings: end.savings, current: end.current,
      netWorth: end.netWorth, hasAssets: Object.keys(end.assetsBy).length > 0,
      delta, plan: plan.net, gap, oursGap, drivers, cover: cover.months, coverYear: cover.plan.year,
      trend, upcoming: upcoming.slice(0, 3), upcomingCount: upcoming.length,
      nextPlan: M.planMonth(asof, cm).net,
      summary: `${M.lbl(month, 'long')} - ${headline}\n${bullets.map(x => '• ' + x).join('\n')}`,
    };
    M.invalidate();
    return report;
  };
  // Derived report data lives inside the existing encrypted ledger. Blobs stay in memory.
  // Refresh automatically on edits, but never make an incomplete check-in look finished.
  R.sync = s => {
    const reports = s.monthlyReports || {}, created = [], changed = [];
    const months = [...new Set([...Object.keys(s.checklist || {}), ...Object.keys(reports)])].filter(validMonth).sort();
    months.forEach(cm => {
      const old = reports[cm], next = R.build(s, cm);
      if (!next){ if (old){ delete reports[cm]; changed.push(cm); } return; }
      const previous = old && { ...old }; if (previous) delete previous.generatedAt;
      if (JSON.stringify(previous) !== JSON.stringify(next)){
        reports[cm] = { ...next, generatedAt: new Date().toISOString() };
        changed.push(cm); if (!old) created.push(cm);
      }
    });
    if (changed.length) s.monthlyReports = reports;
    M.invalidate();
    return { created, changed };
  };
})();
