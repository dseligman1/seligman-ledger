const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ window: { Ledger: {} } });
for (const file of ['model.js', 'report-model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
const { model: M, reportModel: R } = context.window.Ledger;
M.thisMonth = () => '2026-11';
const fixture = () => ({
  meta: {}, settings: { planYear: 2026 },
  accounts: [{ id:'cash', bucket:'current', tags:[] }, { id:'save', bucket:'savings', tags:[] }, { id:'home', bucket:'asset', tags:[], estimate:true }], tags: [],
  snapshots: [
    { month:'2026-09', date:'2026-09-02', balances:{ cash:2000, save:10000, home:100000 } },
    { month:'2026-10', date:'2026-10-03', balances:{ cash:2200, save:11000, home:100000 } },
    { month:'2026-11', date:'2026-11-04', balances:{ cash:2400, save:12000, home:100000 }, updated:{cash:'2026-11-02',save:'2026-11-04'} },
  ],
  checklist: { '2026-11':{change:true, oneoffs:true, budget:true} },
  budget: { years:[2026,2027], groups:[], lines:[{id:'wages',kind:'income',amounts:{2026:3000,2027:9000}},{id:'bills',kind:'fixed',amounts:{2026:2000,2027:2000}}] },
  planHistory:{}, coverage:{fundAdjustments:[],costAdjustments:[]}, events:[], upcoming:[],
});
test('November completion reviews October, with dated snapshots and October plan', () => {
  const r = R.build(fixture(), '2026-11');
  assert.equal(r.month, '2026-10'); assert.equal(r.title, 'October 2026');
  assert.equal(r.liquid, 14400); assert.equal(r.delta, 1200); assert.equal(r.plan, 1000); assert.equal(r.gap, 200);
  assert.equal(r.fromDate, '2026-10-03'); assert.equal(r.balanceDate, '2026-11-04');
  assert.equal(r.netWorth, 114400); assert.equal(r.cover, 7.2);
});
test('all account confirmations and all review activities are required', () => {
  for (const key of ['change','oneoffs','budget']){ const s=fixture(); s.checklist['2026-11'][key]=false; assert.equal(R.build(s,'2026-11'),null); }
  const s=fixture(); delete s.snapshots[2].updated.save; s.checklist['2026-11'].balances=true;
  assert.equal(R.build(s,'2026-11'),null, 'manual balances tick must not bypass missing accounts');
  s.accounts=[]; assert.equal(R.build(s,'2026-11'),null);
});
test('missing months do not manufacture a zero change or an ahead/behind claim', () => {
  const s=fixture(); s.snapshots.splice(1,1); const r=R.build(s,'2026-11');
  assert.equal(r.delta,null); assert.equal(r.gap,null); assert.equal(r.trend.at(-1).actual,null);
  assert.match(r.bullets[1],/not yet available/); assert.equal(r.trend.at(-2).liquid,null);
});
test('historical reports never use future balances, assets or slower money', () => {
  const s=fixture(); s.snapshots.push({month:'2026-12',date:'2026-12-01',balances:{cash:999999,save:999999,home:999999}});
  const r=R.build(s,'2026-11'); assert.equal(r.liquid,14400); assert.equal(r.netWorth,114400); assert.equal(r.cover,7.2);
});
test('capture is idempotent; edits update the review; reopened check-ins withdraw it', () => {
  const s=fixture(); assert.deepEqual([...R.sync(s).created],['2026-11']);
  assert.equal(R.sync(s).changed.length,0);
  s.snapshots[2].balances.cash=1000; assert.equal(R.sync(s).changed.length,1); assert.equal(s.monthlyReports['2026-11'].delta,-200);
  s.checklist['2026-11'].budget=false; R.sync(s); assert.equal(s.monthlyReports['2026-11'],undefined);
  s.checklist['2026-11'].budget=true; assert.equal(R.sync(s).created.length,1);
});
test('January report uses December budget and correct year label', () => {
  const s=fixture(); s.snapshots.push({month:'2026-12',date:'2026-12-01',balances:{cash:2400,save:12000}}, {month:'2027-01',date:'2027-01-02',balances:{cash:2500,save:12000}});
  s.checklist['2027-01']={change:true,oneoffs:true,budget:true}; M.thisMonth=()=> '2027-01';
  try { const r=R.build(s,'2027-01'); assert.equal(r.title,'December 2026'); assert.equal(r.plan,1000); assert.equal(r.nextPlan,7000); }
  finally { M.thisMonth=()=> '2026-11'; }
});
test('new accounts do not erase completed historical reports', () => {
  const s=fixture(); R.sync(s); M.thisMonth=()=> '2026-12';
  try { s.accounts.push({id:'new',bucket:'current',tags:[]}); R.sync(s); assert.ok(s.monthlyReports['2026-11']); }
  finally { M.thisMonth=()=> '2026-11'; }
});
test('negative balances, zero planned costs and future check-ins are handled', () => {
  const s=fixture(); s.budget.lines=[]; s.snapshots[2].balances={cash:-2000,save:0};
  const r=R.build(s,'2026-11'); assert.equal(r.cover,null); assert.equal(r.liquid,-2000); assert.match(r.headline,/drawing/);
  assert.equal(R.build(s,'2026-12'),null);
});
