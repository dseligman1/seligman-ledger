// Sandbox model tests. Invented data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const box = vm.createContext({ window:{}, location:{search:''}, URLSearchParams });
for (const f of ['core.js','model.js','demo.js','sandbox-model.js','sandbox-feed.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f),'utf8'),box);
const L = box.window.Ledger, S = L.sandbox;

test('Barclays-style CSV: day-first dates, signed amounts, memo, stable ids, no double import', () => {
  const csv = 'Number,Date,Account,Amount,Subcategory,Memo\n,12/11/2026,20-00-00 12345678,-23.40,Debit,"TESCO STORES 3312    ON 11 NOV  BCC"\n,12/11/2026,20-00-00 12345678,-23.40,Debit,"TESCO STORES 3312    ON 11 NOV  BCC"\n,13/11/2026,20-00-00 12345678,"1,250.00",Counter Credit,ACME LTD SALARY\n,bad,x,1,y,z\n';
  const a = S.parseBankCsv(csv, { fileName:'barclays.csv' });
  assert.equal(a.transactions.length, 3);
  assert.deepEqual([...a.skipped], [5]);
  assert.equal(a.transactions[0].date, '2026-11-12');
  assert.equal(a.transactions[0].amount, -23.4);
  assert.equal(a.transactions[2].amount, 1250);
  assert.notEqual(a.transactions[0].id, a.transactions[1].id, 'two identical purchases are both kept');
  const b = S.parseBankCsv(csv, { fileName:'barclays.csv' });
  const merged = S.mergeFeeds([{ transactions:a.transactions }, { transactions:b.transactions }]);
  assert.equal(merged.transactions.length, 3, 'same file twice is not doubled');
});

test('Paid in / paid out columns and card exports with positive spending', () => {
  const csv = 'Date,Description,Paid out,Paid in\n2026-11-01,NETFLIX.COM,10.99,\n2026-11-02,REFUND,,5.00\n';
  const r = S.parseBankCsv(csv, {});
  assert.deepEqual(Array.from(r.transactions, t => t.amount), [-10.99, 5]);
  const card = S.parseBankCsv('Transaction Date,Description,Amount\n01 Nov 2026,DELIVEROO,18.50\n', { flip:true });
  assert.equal(card.transactions[0].amount, -18.5);
  assert.equal(card.transactions[0].date, '2026-11-01');
  assert.throws(() => S.parseBankCsv('Foo,Bar\n1,2\n'), /date column/);
});

test('sorting: your pick beats your rule beats moves beats guesses; refunds stay on their line', () => {
  const lines = [
    { id:'inc', kind:'income', name:'Alex salary (take-home)' }, { id:'food', kind:'living', name:'Groceries' },
    { id:'eat', kind:'living', name:'Eating out' }, { id:'off', kind:'off', name:'Old groceries' },
  ];
  const t = (id, amount, description, accountId='a') => ({ id, amount, description, accountId, date:'2026-11-03' });
  const ctx = { lines, rules:[], picks:{}, moveIds:new Set() };
  assert.equal(S.sort(t('1', -40, 'TESCO STORES 3312'), ctx).lineId, 'food');
  assert.equal(S.sort(t('2', 5, 'TESCO STORES REFUND'), ctx).lineId, 'food');
  assert.equal(S.sort(t('3', 3000, 'ACME SALARY BGC'), ctx).lineId, 'inc');
  assert.equal(S.sort(t('4', -500, 'BARCLAYCARD'), ctx).type, 'move');
  assert.equal(S.sort(t('5', -30, 'AMZNMKTPLACE'), ctx).type, 'unsorted');
  assert.match(S.sort(t('6', -30, 'PUREGYM'), ctx).note, /no budget line/);
  ctx.rules = [{ keyword:'TESCO', lineId:'eat' }, { keyword:'TESCO STORES', lineId:'food' }];
  assert.equal(S.sort(t('7', -12, 'TESCO EXPRESS'), ctx).lineId, 'eat');
  assert.equal(S.sort(t('8', -12, 'TESCO STORES 1'), ctx).lineId, 'food', 'the longer, more specific rule wins');
  ctx.picks = { '8':'move' };
  assert.equal(S.sort(t('8', -12, 'TESCO STORES 1'), ctx).type, 'move');
});

test('equal and opposite amounts between two accounts within four days are moves', () => {
  const ids = S.pairMoves([
    { id:'o', accountId:'cur', amount:-812.5, date:'2026-11-05' }, { id:'i', accountId:'card', amount:812.5, date:'2026-11-06' },
    { id:'x', accountId:'cur', amount:-20, date:'2026-11-05' }, { id:'y', accountId:'cur', amount:20, date:'2026-11-05' },
    { id:'z', accountId:'card', amount:20, date:'2026-11-20' },
  ]);
  assert.deepEqual(Array.from(ids).sort(), ['i','o']);
});

test('sample feed against the demo budget: realistic, balanced and mostly sorted', () => {
  const today = new Date(2026, 10, 10);
  const feed = L.sandboxSampleFeed(today), state = L.normalise(L.demoState());
  assert.equal(feed.format, S.FORMAT);
  assert.deepEqual([...S.months(feed)], ['2026-08','2026-09','2026-10','2026-11']);
  assert.ok(feed.transactions.every(t => t.date <= '2026-11-10'));
  const ctx = { lines: state.budget.lines, rules:[], picks:{}, moveIds:S.pairMoves(feed.transactions) };
  const sum = S.summarise(feed, ctx, '2026-10', () => 0);
  assert.equal(Math.round(sum.tot.in - sum.tot.unsortedIn), 3950 + 2780 + 110, 'salaries and child benefit; the refund is left to sort');
  assert.equal(S.sort({ id:'z', amount:-40, description:'ZARA UK', accountId:'a' }, ctx).lineId, state.budget.lines.find(l => l.name === 'Clothes').id, 'Clothes beats Children\'s clothes');
  assert.ok(sum.tot.unsortedCount >= 3 && sum.tot.unsortedCount <= 8, 'a few left for you to sort: ' + sum.tot.unsortedCount);
  const sorted = sum.sorted.filter(x => x.r.type === 'spend' || x.r.type === 'income').length;
  assert.ok(sorted / sum.tot.count > 0.7, 'most transactions sorted');
  const groceries = sum.rows.find(r => r.line.name === 'Groceries');
  assert.ok(groceries.actual > 500 && groceries.actual < 1000, 'groceries near the demo plan: ' + groceries.actual);
  // October's card spend is repaid in November, and both sides are treated as a move.
  const nov = S.summarise(feed, ctx, '2026-11', () => 0);
  assert.ok(nov.sorted.filter(x => /BARCLAYCARD|PAYMENT RECEIVED/.test(x.t.description)).every(x => x.r.type === 'move'));
});
