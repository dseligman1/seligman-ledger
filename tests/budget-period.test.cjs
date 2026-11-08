const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const box = vm.createContext({ window:{}, location:{search:''}, URLSearchParams });
for (const f of ['core.js','model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f),'utf8'),box);
const L = box.window.Ledger, M = L.model;
const plain = x => JSON.parse(JSON.stringify(x));
test('single-month legacy entries become annual once, with identical month-by-month cashflow', () => {
  for (const kind of ['income','bonus','fixed','living','extra','saving','off']) {
    const line = {id:'test',kind,amounts:{2026:125.25,2027:210},payMonths:{2026:[3],2027:[3,9]}};
    const before = Array.from({length:12},(_,i)=>M.lineInMonth(line,`2026-${String(i+1).padStart(2,'0')}`,M.amt(line,2026)));
    const s = L.normalise({budget:{years:[2026,2027],lines:[line]}});
    assert.equal(line.amounts[2026],1503);
    assert.equal(line.amountPeriod[2026],'annual');
    assert.equal(line.amounts[2027],210);
    assert.equal(line.amountPeriod[2027],'monthly');
    assert.equal(M.amt(line,2026),125.25);
    assert.deepEqual(Array.from({length:12},(_,i)=>M.lineInMonth(line,`2026-${String(i+1).padStart(2,'0')}`,M.amt(line,2026))),before);
    const migrated = plain(s); L.normalise(s); assert.deepEqual(plain(s),migrated);
  }
});
test('annual values work with monthly payments, split payments and year-specific units', () => {
  const line = {amounts:{2026:1200,2027:250},amountPeriod:{2026:'annual',2027:'monthly'}};
  assert.equal(M.amt(line,2026),100); assert.equal(M.amt(line,2027),250);
  assert.equal(M.lineInMonth(line,'2026-01',M.amt(line,2026)),100);
  line.payMonths={2026:[3,9]};
  assert.equal(M.lineInMonth(line,'2026-03',M.amt(line,2026)),600);
  assert.equal(M.lineInMonth(line,'2026-04',M.amt(line,2026)),0);
});
test('explicit monthly entries are never re-migrated when selecting a single month', () => {
  const line = {amounts:{2026:100},amountPeriod:{2026:'monthly'},payMonths:{2026:[3]}};
  L.normalise({budget:{years:[2026],lines:[line]}});
  assert.equal(line.amounts[2026],100); assert.equal(line.amountPeriod[2026],'monthly');
});
test('old list timing and amounts beyond the visible years migrate without losing data', () => {
  const line = {amounts:{2026:-50,2027:0},payMonths:[4]};
  L.normalise({budget:{years:[2026,2027],lines:[line]}});
  assert.equal(line.amounts[2026],-600); assert.equal(line.amounts[2027],0);
  assert.equal(M.amt(line,2026),-50);
});
