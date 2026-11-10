// Life admin (v2.11): pensions and bills/subscriptions/insurance. Run: node --test tests/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const box = vm.createContext({ window: {}, location: { search: '' }, URLSearchParams });
for (const f of ['core.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), box);
const L = box.window.Ledger, M = L.model;
const plain = x => JSON.parse(JSON.stringify(x));
const deq = (a, b) => assert.deepEqual(plain(a), plain(b));
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

const base = () => L.normalise({
  meta: {}, budget: { years: [2026], groups: [], lines: [] },
  accounts: [{ id: 'a1', name: 'Saver', bucket: 'savings' }, { id: 'a2', name: 'Current', bucket: 'current' }, { id: 'h', name: 'House', bucket: 'asset' }],
  snapshots: [{ month: M.thisMonth(), date: M.today(), balances: { a1: 10000, a2: 2000, h: 300000 } }],
});

test('older files gain an empty life admin section, and normalising twice changes nothing', () => {
  const s = base();
  deq(plain(s.admin), { pensions: [], items: [] });
  const once = plain(s); L.normalise(s); deq(plain(s), once);
});

test('pensions never change liquid funds, net worth or the monthly check-in', () => {
  const s = base();
  M.invalidate(); const before = { liquid: M.latest(s).liquid, nw: M.netWorth(s), ci: M.checkin(s, M.thisMonth()).total };
  s.admin.pensions.push({ id: 'p1', name: 'Work', kind: 'workplace', values: [{ id: 'v1', date: inDays(-10), value: 50000 }] });
  L.normalise(s); M.invalidate();
  deq({ liquid: M.latest(s).liquid, nw: M.netWorth(s), ci: M.checkin(s, M.thisMonth()).total }, before);
  assert.equal(before.nw, 312000);
  assert.equal(M.pensionTotals(s).pots, 50000);
});

test('pots add up; final-salary and state pensions are a separate yearly income; archived ones drop out', () => {
  const s = base();
  s.admin.pensions.push(
    { id: 'p1', name: 'Work', kind: 'workplace', values: [{ id: 'a', date: '2026-01-05', value: 40000 }, { id: 'b', date: inDays(-5), value: 42500 }] },
    { id: 'p2', name: 'SIPP', kind: 'personal', values: [{ id: 'c', date: '2025-12-01', value: 10000 }] },
    { id: 'p3', name: 'NHS', kind: 'db', values: [{ id: 'd', date: inDays(-20), value: 8000 }] },
    { id: 'p4', name: 'State', kind: 'state', values: [{ id: 'e', date: inDays(-20), value: 11500 }] },
    { id: 'p5', name: 'Old', kind: 'workplace', archived: true, values: [{ id: 'f', date: inDays(-1), value: 99999 }] },
  );
  M.invalidate();
  const t = M.pensionTotals(s);
  assert.equal(t.pots, 52500); assert.equal(t.potCount, 2);
  assert.equal(t.income, 19500); assert.equal(t.incomeCount, 2);
  assert.equal(t.change, 2500); // only the work pot has a previous value
  deq(t.due.map(x => x.p.id), ['p2']); // SIPP last valued Dec 2025, more than a quarter ago
});

test('values are read in date order, ignore blanks, and the series carries the last value forward', () => {
  const s = base();
  s.admin.pensions.push({ id: 'p1', kind: 'workplace', values: [{ date: '2026-07-01', value: 1200 }, { date: '2026-04-01', value: 1000 }, { date: '', value: 5 }, { date: '2026-05-01', value: '' }] });
  L.normalise(s); M.invalidate();
  deq(M.pensionValues(s.admin.pensions[0]).map(v => v.value), [1000, 1200]);
  assert.ok(s.admin.pensions[0].values.every(v => v.id), 'every value gets an id so it can be deleted');
  const ser = M.pensionSeries(s);
  assert.equal(ser[0].m, '2026-04');
  deq(ser.slice(0, 4).map(p => p.total), [1000, 1000, 1000, 1200]);
  assert.equal(ser[ser.length - 1].m, M.thisMonth());
});

test('bill costs convert to monthly and yearly; renewal status by end date', () => {
  assert.equal(M.itemAnnual({ cost: 30, period: 'monthly' }), 360);
  assert.equal(M.itemAnnual({ cost: 90, period: 'quarterly' }), 360);
  assert.equal(M.itemMonthly({ cost: 456, period: 'annual' }), 38);
  assert.equal(M.itemMonthly({ cost: '', period: 'monthly' }), 0);
  assert.equal(M.renewal({ endDate: '' }).status, 'none');
  assert.equal(M.renewal({ endDate: inDays(-3) }).status, 'passed');
  assert.equal(M.renewal({ endDate: inDays(0) }).status, 'soon');
  assert.equal(M.renewal({ endDate: inDays(30) }).status, 'soon');
  assert.equal(M.renewal({ endDate: inDays(31) }).status, 'later');
  assert.equal(M.renewal({ endDate: inDays(12) }).days, 12);
});

test('summary totals by category, ignores archived, and lists what needs attention soonest first', () => {
  const s = base();
  s.admin.items.push(
    { id: 'i1', category: 'utility', cost: 100, period: 'monthly', endDate: inDays(60) },
    { id: 'i2', category: 'insurance', cost: 600, period: 'annual', endDate: inDays(10) },
    { id: 'i3', category: 'subscription', cost: 10, period: 'monthly', endDate: inDays(-2) },
    { id: 'i4', category: 'mystery', cost: 5, period: 'monthly' },
    { id: 'i5', category: 'utility', cost: 1000, period: 'monthly', archived: true },
  );
  M.invalidate();
  const sum = M.adminSummary(s), cat = id => sum.cats.find(c => c.id === id);
  assert.equal(sum.count, 4);
  assert.equal(cat('utility').monthly, 100); assert.equal(cat('insurance').annual, 600); assert.equal(cat('other').monthly, 5);
  assert.equal(sum.monthly, 165); assert.equal(sum.annual, 1980);
  deq(sum.attention.map(x => x.it.id), ['i3', 'i2']);
  deq(sum.upcoming.map(x => x.it.id), ['i2', 'i1']);
});

test('the demo household has life admin data that the model reads without errors', () => {
  const dbox = vm.createContext({ window: {}, location: { search: '' }, URLSearchParams });
  for (const f of ['core.js', 'model.js', 'demo.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), dbox);
  const DL = dbox.window.Ledger, DM = DL.model, s = DL.normalise(DL.demoState());
  DM.invalidate();
  const t = DM.pensionTotals(s), sum = DM.adminSummary(s);
  assert.equal(t.potCount, 3); assert.equal(t.incomeCount, 1); assert.ok(t.pots > 100000);
  assert.ok(sum.count >= 15); assert.ok(sum.attention.length >= 2);
  assert.ok(DM.pensionSeries(s).length >= 10);
});
