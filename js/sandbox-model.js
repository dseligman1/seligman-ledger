/* Sandbox model: turns bank transactions into "actual vs plan" for the budget.
   Pure functions only (no DOM, no storage) so they can be tested in Node.
   Nothing here writes to the ledger. See sandbox.html. */
(function(){
  'use strict';
  const L = window.Ledger = window.Ledger || {};
  const S = L.sandbox = {};

  // ---------------- the feed format ----------------
  // Every source (sample data, an uploaded CSV, later the live Barclays feed) is turned into this:
  // { format:'ledger-feed/1', source, fetchedAt,
  //   accounts: [{ id, name, kind:'current'|'card'|'savings' }],
  //   transactions: [{ id, accountId, date:'YYYY-MM-DD', amount, description, pending }] }
  // amount: negative = money out of that account, positive = money in.
  S.FORMAT = 'ledger-feed/1';

  // ---------------- CSV import ----------------
  S.splitCsv = function(text){
    const rows = []; let row = [], cur = '', q = false;
    text = String(text).replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++){
      const c = text[i];
      if (q){
        if (c === '"'){ if (text[i + 1] === '"'){ cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ','){ row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r'){
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur); if (row.some(v => v.trim() !== '')) rows.push(row);
    return rows;
  };

  const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  const pad = n => String(n).padStart(2, '0');
  // UK banks write dates as 12/11/2026 (day first), 2026-11-12 or 12 Nov 2026.
  S.parseDate = function(v){
    v = String(v || '').trim(); let m;
    if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    if ((m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))){ const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
    if ((m = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/)) && MONTHS[m[2].toLowerCase()]) return m[3] + '-' + pad(MONTHS[m[2].toLowerCase()]) + '-' + pad(m[1]);
    return null;
  };
  // "£1,234.50", "-12.00", "(12.00)", "12.00 DR", "12.00CR"
  S.parseAmount = function(v){
    let t = String(v == null ? '' : v).trim(); if (!t) return null;
    let sign = 1;
    if (/^\(.*\)$/.test(t)){ sign = -1; t = t.slice(1, -1); }
    if (/DR$/i.test(t)){ sign = -1; t = t.replace(/DR$/i, ''); } else if (/CR$/i.test(t)) t = t.replace(/CR$/i, '');
    t = t.replace(/[£,\s]/g, '');
    const n = Number(t);
    return Number.isFinite(n) && t !== '' ? sign * n : null;
  };

  // Small stable hash so re-importing the same file never doubles transactions.
  S.hash = function(str){ let h = 2166136261; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  // Reads a bank CSV by its headings. flip: card exports often show spending as positive numbers.
  S.parseBankCsv = function(text, opts = {}){
    const rows = S.splitCsv(text);
    if (rows.length < 2) throw new Error('That file has no transaction rows.');
    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = re => head.findIndex(h => re.test(h));
    const c = {
      date: col(/date/), amount: col(/^(amount|value|amount \(gbp\)|billing amount)$/),
      out: col(/paid out|debit|money out|withdrawal/), into: col(/paid in|credit|money in|deposit/),
      memo: col(/memo|description|details|narrative|merchant|payee|transaction$/), sub: col(/subcategory|type/), acct: col(/^account/),
    };
    if (c.date < 0) throw new Error('Couldn\'t find a date column. Expected a heading containing "Date".');
    if (c.amount < 0 && c.out < 0 && c.into < 0) throw new Error('Couldn\'t find an amount column ("Amount", or "Paid in" / "Paid out").');
    const accountId = opts.accountId || 'csv-' + S.hash(opts.fileName || 'file');
    const seen = {}, txns = [], skipped = [];
    rows.slice(1).forEach((r, i) => {
      const date = S.parseDate(r[c.date]);
      let amount = null;
      if (c.amount >= 0) amount = S.parseAmount(r[c.amount]);
      else {
        const o = c.out >= 0 ? S.parseAmount(r[c.out]) : null, n = c.into >= 0 ? S.parseAmount(r[c.into]) : null;
        if (o != null || n != null) amount = (n || 0) - Math.abs(o || 0);
      }
      if (!date || amount == null){ skipped.push(i + 2); return; }
      if (opts.flip) amount = -amount;
      const desc = [c.memo >= 0 ? r[c.memo] : '', c.memo < 0 && c.sub >= 0 ? r[c.sub] : ''].join(' ').replace(/\s+/g, ' ').trim() || '(no description)';
      const key = [accountId, date, amount.toFixed(2), desc.toUpperCase()].join('|');
      seen[key] = (seen[key] || 0) + 1; // two identical coffees on one day are both real
      txns.push({ id: 'c' + S.hash(key + '#' + seen[key]), accountId, date, amount: Math.round(amount * 100) / 100, description: desc, pending: false });
    });
    return { transactions: txns, skipped };
  };

  // Combine feeds, dropping repeats (the same file twice, or overlapping date ranges).
  S.mergeFeeds = function(feeds){
    const accounts = [], txns = [], ids = new Set(), accIds = new Set();
    feeds.forEach(f => {
      (f.accounts || []).forEach(a => { if (!accIds.has(a.id)){ accIds.add(a.id); accounts.push(a); } });
      (f.transactions || []).forEach(t => { if (!ids.has(t.id)){ ids.add(t.id); txns.push(t); } });
    });
    txns.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    return { format: S.FORMAT, accounts, transactions: txns };
  };

  // ---------------- sorting into budget lines ----------------
  // Built-in guesses. Each says: descriptions like this usually belong to a budget line named like that.
  // They only ever suggest a line that exists in your budget; your own rules always win.
  S.HINTS = [
    { what: 'Salary', tx: /SALARY|PAYROLL|\bWAGES\b/, line: /salary|take-home|pay\b|wage/, dir: 'in' },
    { what: 'Child benefit', tx: /CHILD BENEFIT|HMRC CHB/, line: /child benefit/, dir: 'in' },
    { what: 'Mortgage or rent', tx: /MORTGAGE|\bRENT\b|LETTINGS/, line: /mortgage|rent\b/ },
    { what: 'Council tax', tx: /COUNCIL/, line: /council/ },
    { what: 'Energy', tx: /OCTOPUS|BRITISH GAS|\bEDF\b|\bOVO\b|E\.ON|SCOTTISH POWER|OCTOPUS ENERGY/, line: /gas|electric|energy/ },
    { what: 'Water', tx: /WATER/, line: /water/ },
    { what: 'Broadband', tx: /\bBT\b|BT GROUP|\bSKY\b|VIRGIN MEDIA|PLUSNET|HYPEROPTIC|COMMUNITY FIBRE/, line: /broadband|internet|wifi/ },
    { what: 'Mobile', tx: /VODAFONE|\bEE\b|\bO2\b|THREE\.CO|GIFFGAFF|LEBARA|TESCO MOBILE/, line: /mobile|phone/ },
    { what: 'TV licence', tx: /TV LICENCE|TVL/, line: /tv licen/ },
    { what: 'Streaming', tx: /NETFLIX|SPOTIFY|DISNEY|APPLE\.COM|PRIME VIDEO|AMAZON PRIME|NOW TV|YOUTUBE/, line: /stream|subscri|apps/ },
    { what: 'Insurance', tx: /AVIVA|DIRECT LINE|ADMIRAL|LV=|LIVERPOOL VICTORIA|CHURCHILL|HASTINGS|INSURANCE/, line: /insurance/ },
    { what: 'Nursery or childcare', tx: /NURSERY|CHILDMINDER|CHILDCARE/, line: /nursery|childcare|childminder/ },
    { what: 'Kids\' clubs', tx: /SWIM|ACADEMY|CLUB/, line: /swim|club|activit/ },
    { what: 'Car finance', tx: /CAR FINANCE|BLACK HORSE|MOTONOVO|CLOSE BROTHERS/, line: /car finance|car loan/ },
    { what: 'Fuel', tx: /\bSHELL\b|\bBP\b|ESSO|TEXACO|JET\b|PODPOINT|POD POINT|IONITY|TESLA SUPERCHARG/, line: /fuel|petrol|charging/ },
    { what: 'Trains and travel', tx: /TRAINLINE|\bTFL\b|TFL TRAVEL|LNER|AVANTI|GWR|NATIONAL RAIL|RINGGO|PAYBYPHONE|NCP/, line: /train|travel|parking|transport/ },
    { what: 'Groceries', tx: /TESCO(?! MOBILE)|SAINSBURY|ASDA|ALDI|LIDL|WAITROSE|OCADO|MORRISONS|CO-OP|COOP|M&S SIMPLY|ICELAND/, line: /grocer|supermarket|food shop|^food/ },
    { what: 'Eating out', tx: /DELIVEROO|JUST EAT|UBER \*?EATS|PRET|NANDO|COSTA|STARBUCKS|CAFFE NERO|GREGGS|WAGAMAMA|PIZZA|RESTAURANT/, line: /eat|takeaway|restaurant|dining|coffee/ },
    { what: 'Gym', tx: /PUREGYM|THE GYM|GYM\b|VIRGIN ACTIVE|DAVID LLOYD|NUFFIELD|PARKRUN/, line: /gym|sport|fitness/ },
    { what: 'Clothes', tx: /\bNEXT\b|ZARA|H&M|UNIQLO|PRIMARK|\bGAP\b|TK MAXX|ASOS/, line: /cloth/ },
    { what: 'Home and DIY', tx: /B&Q|WICKES|SCREWFIX|TOOLSTATION|HOMEBASE|DUNELM|IKEA/, line: /repair|upkeep|diy|home\b|house/ },
    { what: 'Charity', tx: /CHARITY|JUSTGIVING|OXFAM|CANCER RESEARCH|\bRNLI\b/, line: /charit|donat/ },
  ];
  // Money moving between your own accounts: not spending, not income.
  S.MOVE_TX = /BARCLAYCARD|PAYMENT RECEIVED|PAYMENT - THANK|THANK YOU FOR YOUR PAYMENT|^TO A\/C|^FROM A\/C|TRANSFER (TO|FROM)|\bSAVINGS?\b|\bISA\b|^TFR\b/;

  // Keyword a person would recognise: "TESCO STORES 3312 ON 12 NOV BCC" -> "TESCO STORES".
  S.keyword = function(desc){
    const words = String(desc).toUpperCase().replace(/^(DD|SO|BGC|BP|CARD PAYMENT TO|DIRECT DEBIT|FPI|FPO|POS|VIS|CPT|TFR)\s+/, '')
      .split(/\s+ON\s+\d|\s{2,}/)[0].split(/\s+/).filter(w => !/\d{3,}/.test(w) && !/^[*#]/.test(w));
    return words.slice(0, 2).join(' ').replace(/[*.,]+$/, '').trim();
  };

  // Pairs of equal and opposite amounts between two feed accounts within 4 days (card repayments, transfers).
  S.pairMoves = function(txns){
    const ids = new Set(), byAmt = {};
    txns.forEach(t => { const k = Math.abs(t.amount).toFixed(2); (byAmt[k] = byAmt[k] || []).push(t); });
    const days = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
    Object.values(byAmt).forEach(list => {
      const outs = list.filter(t => t.amount < 0), ins = list.filter(t => t.amount > 0);
      outs.forEach(o => {
        const m = ins.find(i => !ids.has(i.id) && i.accountId !== o.accountId && Math.abs(days(i.date) - days(o.date)) <= 4);
        if (m){ ids.add(o.id); ids.add(m.id); }
      });
    });
    return ids;
  };

  const isIn = l => l.kind === 'income' || l.kind === 'bonus';
  const OUT = ['fixed', 'living', 'extra', 'saving'];
  // ctx: { lines, rules:[{ keyword, lineId }], picks:{ txnId: lineId | 'move' | 'ignore' }, moveIds:Set }
  // Returns { type:'spend'|'income'|'move'|'ignore'|'unsorted', lineId, by:'you'|'rule'|'guess'|'pair'|null, note }
  S.sort = function(t, ctx){
    const pick = ctx.picks && ctx.picks[t.id];
    const lineById = id => ctx.lines.find(l => l.id === id);
    const asLine = (l, by, note) => ({ type: isIn(l) ? 'income' : 'spend', lineId: l.id, by, note });
    if (pick === 'move') return { type: 'move', lineId: null, by: 'you' };
    if (pick === 'ignore') return { type: 'ignore', lineId: null, by: 'you' };
    if (pick && lineById(pick)) return asLine(lineById(pick), 'you');
    const D = String(t.description).toUpperCase();
    const rule = (ctx.rules || []).filter(r => r.keyword && D.includes(r.keyword.toUpperCase()) && (r.lineId === 'move' || r.lineId === 'ignore' || lineById(r.lineId)))
      .sort((a, b) => b.keyword.length - a.keyword.length)[0];
    if (rule){
      if (rule.lineId === 'move' || rule.lineId === 'ignore') return { type: rule.lineId, lineId: null, by: 'rule', note: rule.keyword };
      return asLine(lineById(rule.lineId), 'rule', rule.keyword);
    }
    if (ctx.moveIds && ctx.moveIds.has(t.id)) return { type: 'move', lineId: null, by: 'pair' };
    if (S.MOVE_TX.test(D)) return { type: 'move', lineId: null, by: 'guess' };
    const dir = t.amount > 0 ? 'in' : 'out';
    for (const h of S.HINTS){
      if (!h.tx.test(D)) continue;
      if ((h.dir || 'out') !== dir && !(dir === 'in' && !h.dir)) continue; // a refund still belongs to its spending line
      const fits = ctx.lines.filter(l => l.kind !== 'off' && (h.dir === 'in' ? isIn(l) : OUT.includes(l.kind)) && h.line.test(l.name.toLowerCase()));
      const line = fits.find(l => l.name.toLowerCase() === h.what.toLowerCase()) || fits[0]; // "Clothes" beats "Children's clothes"
      if (line) return asLine(line, 'guess', h.what);
      return { type: 'unsorted', lineId: null, by: null, note: 'Looks like ' + h.what.toLowerCase() + ', but no budget line matches' };
    }
    return { type: 'unsorted', lineId: null, by: null };
  };

  // ---------------- summaries ----------------
  // Actual vs plan for one month. plan(line) returns that line's planned amount for the month.
  S.summarise = function(feed, ctx, ym, plan){
    const txns = feed.transactions.filter(t => t.date.slice(0, 7) === ym);
    const sorted = txns.map(t => ({ t, r: S.sort(t, ctx) }));
    const lines = {}, accounts = {};
    const tot = { in: 0, out: 0, moved: 0, unsortedOut: 0, unsortedIn: 0, unsortedCount: 0, count: txns.length };
    feed.accounts.forEach(a => { accounts[a.id] = { in: 0, out: 0, movedIn: 0, movedOut: 0 }; });
    sorted.forEach(({ t, r }) => {
      const acc = accounts[t.accountId] = accounts[t.accountId] || { in: 0, out: 0, movedIn: 0, movedOut: 0 };
      if (r.type === 'ignore') return;
      if (r.type === 'move'){ if (t.amount < 0) tot.moved -= t.amount; if (t.amount < 0) acc.movedOut -= t.amount; else acc.movedIn += t.amount; return; }
      if (t.amount < 0){ tot.out -= t.amount; acc.out -= t.amount; } else { tot.in += t.amount; acc.in += t.amount; }
      if (r.type === 'unsorted'){ tot.unsortedCount++; if (t.amount < 0) tot.unsortedOut -= t.amount; else tot.unsortedIn += t.amount; return; }
      const row = lines[r.lineId] = lines[r.lineId] || { actual: 0, count: 0 };
      row.actual += r.type === 'income' ? t.amount : -t.amount; // a refund lowers its spending line
      row.count++;
    });
    const rows = ctx.lines.filter(l => l.kind !== 'off' || lines[l.id]).map(l => {
      const p = plan(l) || 0, a = lines[l.id] ? lines[l.id].actual : 0;
      return { line: l, plan: p, actual: a, count: lines[l.id] ? lines[l.id].count : 0, diff: isIn(l) ? a - p : p - a };
    });
    return { ym, tot, rows, accounts, sorted };
  };

  S.months = feed => Array.from(new Set(feed.transactions.map(t => t.date.slice(0, 7)))).sort();
})();
