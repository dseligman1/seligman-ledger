/* Sandbox page: try out how bank transactions would sort into the budget.
   Read-only by design: it never calls the ledger's save functions. Your own sorting rules are kept
   in this browser only (localStorage). Uploaded CSVs stay in memory and disappear on reload. */
(function(){
  'use strict';
  const L = window.Ledger, M = L.model, S = L.sandbox;
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const gbp0 = new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', maximumFractionDigits:0 });
  const gbp2 = new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2 });
  const money = (v, dp) => (dp ? gbp2 : gbp0).format(Math.abs(v) < 0.005 ? 0 : v);
  const signed = (v, dp) => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + money(Math.abs(v), dp);

  const KEY = 'ledger_sandbox_v1_';
  const st = {
    source: 'sample', csv: [], budgetSrc: 'demo', budget: null, month: null,
    filter: 'all', onlyActive: true, lastPick: null, unlockError: '', busy: false,
    rules: [], picks: {},
  };
  const budgetKey = () => st.budgetSrc === 'real' ? L.householdId : st.budgetSrc;
  const loadPrefs = () => {
    try { const p = JSON.parse(L.safeLS.get(KEY + budgetKey()) || '{}'); st.rules = Array.isArray(p.rules) ? p.rules : []; st.picks = p.picks && typeof p.picks === 'object' ? p.picks : {}; }
    catch(e){ st.rules = []; st.picks = {}; }
  };
  const savePrefs = () => L.safeLS.set(KEY + budgetKey(), JSON.stringify({ rules: st.rules, picks: st.picks }));

  // ---------------- data ----------------
  const sample = L.sandboxSampleFeed();
  const empty = { format: S.FORMAT, accounts: [], transactions: [] };
  const feed = () => st.source === 'csv' ? S.mergeFeeds(st.csv.map(f => f.feed)) : st.source === 'sample' ? sample : empty;
  const setBudget = (state, src) => { st.budget = state; st.budgetSrc = src; M.invalidate(); loadPrefs(); };
  const lines = () => st.budget.budget.lines;
  const ctx = () => { const f = feed(); return { lines: lines(), rules: st.rules, picks: st.picks, moveIds: S.pairMoves(f.transactions) }; };
  const planFor = ym => {
    const s = st.budget, y = M.budgetYear(s, M.yearOf(ym)), pl = M.planMonthLines(s, ym), has = Object.keys(pl).length > 0;
    return l => {
      if (l.kind === 'off') return 0;
      if (has && l.kind !== 'income' && l.kind !== 'bonus') return pl[l.id] || 0;
      return M.lineInMonth(l, ym, M.amt(l, y), y);
    };
  };
  const lineName = id => { const l = lines().find(x => x.id === id); return l ? l.name : id === 'move' ? 'Move between our accounts' : id === 'ignore' ? 'Leave out' : '(deleted line)'; };

  // ---------------- views ----------------
  const lineOptions = (sel, forRule) => {
    const groups = st.budget.budget.groups;
    const opt = (v, n) => `<option value="${esc(v)}"${sel === v ? ' selected' : ''}>${esc(n)}</option>`;
    let h = (forRule ? '' : opt('', 'Not sorted yet')) + opt('move', '↔ Move between our accounts') + opt('ignore', 'Leave out');
    groups.forEach(g => {
      const ls = lines().filter(l => l.groupId === g.id && l.kind !== 'off');
      if (ls.length) h += `<optgroup label="${esc(g.name)}">${ls.map(l => opt(l.id, l.name)).join('')}</optgroup>`;
    });
    const loose = lines().filter(l => l.kind !== 'off' && !groups.some(g => g.id === l.groupId));
    if (loose.length) h += `<optgroup label="Other">${loose.map(l => opt(l.id, l.name)).join('')}</optgroup>`;
    return h;
  };

  function sourceCard(){
    const seg = [['sample', 'Sample Barclays feed'], ['csv', 'Upload a bank CSV'], ['live', 'Live Barclays feed']]
      .map(([v, n]) => `<button class="${st.source === v ? 'on' : ''}" data-act="source" data-v="${v}">${n}</button>`).join('');
    let body = '';
    if (st.source === 'sample') body = `<p class="small ink2">A made-up Barclays current account and Barclaycard: salaries, direct debits, card spending, card repayments and transfers to savings. Every figure is invented.</p>`;
    if (st.source === 'csv'){
      body = `<p class="small ink2">Download a CSV from Barclays online banking (Account → Export, choose CSV) or any other bank, and drop it here. It's read on this device only, never uploaded or saved, and disappears when you reload.</p>
        <label class="btn" style="display:inline-flex;gap:8px;align-items:center">Choose CSV files<input type="file" id="csv-input" accept=".csv,text/csv" multiple class="sr"></label>
        ${st.csv.map((f, i) => `<div class="row"><div><div class="name">${esc(f.name)}</div><div class="meta">${f.feed.transactions.length} transactions${f.skipped ? ` · ${f.skipped} rows skipped` : ''}</div>
          <label class="tiny muted" style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" data-act="flip" data-i="${i}"${f.flip ? ' checked' : ''}> Spending shows as positive numbers (common on credit card exports)</label></div>
          <button class="btn sm ghost" data-act="dropCsv" data-i="${i}">Remove</button></div>`).join('')}
        <div class="gate-error">${esc(st.csvError || '')}</div>`;
    }
    if (st.source === 'live') body = `<p class="small ink2"><strong>Not connected yet.</strong> Once Barclays is linked (read-only), a nightly job will collect new transactions, encrypt them with your household PIN and save them next to the ledger, in exactly the same shape as the sample. This page will then read them here first, before anything changes in the main app.</p>`;
    return `<section class="card"><div class="card-head"><div><h2>1. Transactions</h2><div class="sub">Where the bank data comes from</div></div></div><div class="seg" role="group" aria-label="Transaction source">${seg}</div><div style="margin-top:12px">${body}</div></section>`;
  }

  function budgetCard(){
    const opts = [['demo', 'Demo household']];
    if (L.PREVIEW && window.LEDGER_PREVIEW_STATE) opts.push(['preview', 'Preview budget (this computer)']);
    opts.push(['real', 'Our real budget']);
    const seg = opts.map(([v, n]) => `<button class="${st.budgetSrc === v || (v === 'real' && st.wantReal) ? 'on' : ''}" data-act="budget" data-v="${v}">${n}</button>`).join('');
    let body = '';
    if (st.wantReal && st.budgetSrc !== 'real'){
      body = L.store.pat
        ? `<p class="small ink2">Unlocks <strong>${esc(L.household.name)}</strong> read-only. Nothing in the sandbox is saved to the ledger. <a href="#" data-act="household">Use the other household</a></p>
           <form id="unlock" class="field" style="max-width:260px"><label for="sb-pin">Household PIN</label><input class="input" id="sb-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"><button class="btn primary" style="margin-top:8px" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Unlocking…' : 'Unlock read-only'}</button></form>
           <div class="gate-error">${esc(st.unlockError)}</div>`
        : `<p class="small ink2">This device isn't connected yet. Open <a href="./">the main app</a> once and connect with the GitHub token, then come back here.</p>`;
    } else if (st.budgetSrc === 'real') body = `<p class="small ink2"><strong>${esc(L.household.name)}</strong> budget, read-only. Reload the page to lock it again.</p>`;
    else if (st.budgetSrc === 'preview') body = `<p class="small ink2">Your budget from the private preview file on this computer.</p>`;
    else body = `<p class="small ink2">The made-up demo household. Its budget roughly matches the sample feed.</p>`;
    return `<section class="card"><div class="card-head"><div><h2>2. Budget</h2><div class="sub">What the spending is compared against</div></div></div><div class="seg" role="group" aria-label="Budget">${seg}</div><div style="margin-top:12px">${body}</div></section>`;
  }

  function monthBar(months){
    return `<div class="seg" role="group" aria-label="Month">${months.map(m => `<button class="${st.month === m ? 'on' : ''}" data-act="month" data-v="${m}">${esc(M.lbl(m))}${m === M.thisMonth() ? ' (so far)' : ''}</button>`).join('')}</div>`;
  }

  function statsRow(sum){
    const t = sum.tot;
    return `<div class="stats">
      <div class="stat"><div class="k">Money in</div><div class="v pos">${money(t.in)}</div><div class="d">excluding moves</div></div>
      <div class="stat"><div class="k">Money out</div><div class="v">${money(t.out)}</div><div class="d">excluding moves</div></div>
      <div class="stat"><div class="k">Moved between our accounts</div><div class="v ink2">${money(t.moved)}</div><div class="d">not counted as in or out</div></div>
      <div class="stat"><button class="sb-stat-btn" data-act="filter" data-v="unsorted"><div class="k">Not sorted yet</div><div class="v ${t.unsortedCount ? 'neg' : ''}">${t.unsortedCount}</div><div class="d">${money(t.unsortedOut)} out${t.unsortedIn ? ' · ' + money(t.unsortedIn) + ' in' : ''}</div></button></div>
    </div>`;
  }

  function budgetTable(sum){
    const rows = sum.rows.filter(r => !st.onlyActive || r.count);
    const groups = st.budget.budget.groups;
    const rowHtml = r => {
      const inc = r.line.kind === 'income' || r.line.kind === 'bonus';
      const pct = r.plan > 0 ? Math.min(100, r.actual / r.plan * 100) : r.actual > 0 ? 100 : 0;
      const over = !inc && r.actual > r.plan + 0.5;
      const diffTxt = Math.abs(r.diff) < 0.5 ? 'on plan' : inc ? (r.diff > 0 ? money(r.diff) + ' more than planned' : money(-r.diff) + ' less than planned') : (r.diff > 0 ? money(r.diff) + ' under' : money(-r.diff) + ' over');
      return `<div class="row"><div><div class="name">${esc(r.line.name)}</div><div class="sb-bar"><span class="${over ? 'over' : inc ? 'inc' : ''}" style="width:${pct.toFixed(1)}%"></span></div><div class="meta">${r.count} transaction${r.count === 1 ? '' : 's'} · ${M.kindName(r.line.kind)}</div></div>
        <div class="right"><div class="big">${money(r.actual)} <span class="muted small">of ${money(r.plan)}</span></div><div class="meta ${over ? 'neg' : Math.abs(r.diff) < 0.5 ? '' : inc ? '' : 'pos'}">${diffTxt}</div></div></div>`;
    };
    const blocks = groups.map(g => {
      const rs = rows.filter(r => r.line.groupId === g.id); if (!rs.length) return '';
      const a = rs.reduce((t, r) => t + r.actual, 0), p = rs.reduce((t, r) => t + r.plan, 0);
      return `<div class="sb-group"><div class="sb-group-head"><span>${esc(g.name)}</span><span class="num">${money(a)} <span class="muted">of ${money(p)}</span></span></div>${rs.map(rowHtml).join('')}</div>`;
    }).join('');
    const hidden = sum.rows.filter(r => !r.count && r.plan > 0).length;
    return `<section class="card"><div class="card-head"><div><h2>Against the budget</h2><div class="sub">Actual from these accounts vs the plan for ${esc(M.lbl(st.month))}</div></div>
      <div class="actions"><label class="tiny muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-act="onlyActive"${st.onlyActive ? ' checked' : ''}> Only lines with transactions</label></div></div>
      ${blocks || '<p class="small muted">Nothing sorted into the budget yet.</p>'}
      ${st.onlyActive && hidden ? `<p class="tiny muted" style="margin-top:10px">${hidden} other planned lines have no transactions in this feed, probably because they're paid from accounts that aren't connected.</p>` : ''}</section>`;
  }

  function accountsCard(sum){
    const f = feed();
    return `<section class="card"><div class="card-head"><div><h2>Each account</h2><div class="sub">In and out, with moves between our accounts shown separately</div></div></div>
      ${f.accounts.map(a => { const x = sum.accounts[a.id] || { in:0, out:0, movedIn:0, movedOut:0 }; const net = x.in - x.out + x.movedIn - x.movedOut;
        return `<div class="row"><div><div class="name">${esc(a.name)}</div><div class="meta">In ${money(x.in)} · Out ${money(x.out)} · Moves ${money(x.movedIn)} in, ${money(x.movedOut)} out</div></div><div class="right"><div class="big ${net < 0 ? 'neg' : 'pos'}">${signed(net)}</div><div class="meta">net change</div></div></div>`; }).join('')}</section>`;
  }

  function txnCard(sum){
    const f = feed(), accName = id => (f.accounts.find(a => a.id === id) || {}).name || id;
    const list = sum.sorted.filter(({ t, r }) => st.filter === 'all' || t.id === st.lastPick || (st.filter === 'unsorted' && r.type === 'unsorted') || (st.filter === 'moves' && r.type === 'move'));
    const by = r => r.by === 'you' ? 'Sorted by you' : r.by === 'rule' ? `Your rule “${esc(r.note)}”` : r.by === 'pair' ? 'Matched pair' : r.by === 'guess' ? (r.note ? 'Guessed: ' + esc(r.note) : 'Guessed') : (r.note ? esc(r.note) : '');
    const seg = [['all', 'All'], ['unsorted', 'Not sorted'], ['moves', 'Moves']].map(([v, n]) => `<button class="${st.filter === v ? 'on' : ''}" data-act="filter" data-v="${v}">${n}</button>`).join('');
    return `<section class="card" id="txns"><div class="card-head"><div><h2>Transactions</h2><div class="sub">${sum.tot.count} in ${esc(M.lbl(st.month))}. Pick a line to sort one, then tap “Always sort…” to make it a rule.</div></div></div>
      <div class="seg" role="group" aria-label="Show">${seg}</div>
      <div style="margin-top:8px">${list.map(({ t, r }) => {
        const sel = st.picks[t.id] || (r.type === 'move' ? 'move' : r.type === 'ignore' ? 'ignore' : r.lineId || '');
        const kw = S.keyword(t.description);
        const offer = st.lastPick === t.id && st.picks[t.id] && kw && !st.rules.some(x => x.keyword === kw);
        return `<div class="row sb-txn"><div><div class="name">${esc(t.description)}${t.pending ? ' <span class="chip">pending</span>' : ''}</div>
          <div class="meta">${esc(M.dateLbl(t.date, false))} · ${esc(accName(t.accountId))}${by(r) ? ' · ' + by(r) : ''}</div>
          <select class="input sb-select" data-act="pick" data-id="${esc(t.id)}" aria-label="Budget line for ${esc(t.description)}">${lineOptions(sel)}</select>
          ${offer ? `<button class="btn sm" style="margin-top:6px" data-act="makeRule" data-id="${esc(t.id)}">Always sort “${esc(kw)}” here</button>` : ''}</div>
          <div class="right"><div class="big ${t.amount > 0 ? 'pos' : ''}">${signed(t.amount, true)}</div></div></div>`;
      }).join('') || '<p class="small muted">Nothing here.</p>'}</div></section>`;
  }

  function rulesCard(){
    return `<section class="card"><div class="card-head"><div><h2>Your sorting rules</h2><div class="sub">If a description contains the words, it goes to that line. Your rules beat the built-in guesses. Saved in this browser only.</div></div></div>
      ${st.rules.map((r, i) => `<div class="row"><div><div class="name">“${esc(r.keyword)}”</div><div class="meta">→ ${esc(lineName(r.lineId))}</div></div><button class="btn sm ghost" data-act="dropRule" data-i="${i}">Remove</button></div>`).join('') || '<p class="small muted">No rules yet.</p>'}
      <form id="add-rule" class="sb-add"><input class="input" id="rule-kw" placeholder="Words in the description, e.g. AMAZON" maxlength="40"><select class="input" id="rule-line" aria-label="Budget line">${lineOptions('', true)}</select><button class="btn">Add rule</button></form>
      <div style="margin-top:12px"><button class="btn sm danger" data-act="resetSandbox">Clear rules and picks</button></div></section>`;
  }

  function render(){
    const f = feed(), months = S.months(f);
    if (!months.includes(st.month)) st.month = months.length > 1 ? months[months.length - 2] : months[0] || null;
    let html = sourceCard() + budgetCard();
    if (!st.budget){}
    else if (!f.transactions.length){ if (st.source === 'csv') html += `<section class="card"><p class="small muted">No transactions yet. Choose a CSV file above.</p></section>`; }
    else {
      const c = ctx(), sum = S.summarise(f, c, st.month, planFor(st.month));
      html += `<div class="sb-months">${monthBar(months)}</div>` + statsRow(sum) + `<div class="sb-cols"><div>${budgetTable(sum) + accountsCard(sum)}</div><div>${txnCard(sum) + rulesCard()}</div></div>`;
    }
    $('sb-main').innerHTML = html;
  }

  // ---------------- actions ----------------
  const act = {
    source(el){ st.source = el.dataset.v; st.lastPick = null; render(); },
    budget(el){
      const v = el.dataset.v; st.unlockError = '';
      if (v === 'real'){ if (st.budgetSrc !== 'real'){ st.wantReal = true; render(); const p = $('sb-pin'); if (p) p.focus(); } return; }
      st.wantReal = false;
      setBudget(v === 'preview' ? L.normalise(JSON.parse(JSON.stringify(window.LEDGER_PREVIEW_STATE))) : L.normalise(L.demoState()), v);
      render();
    },
    household(){ L.selectHousehold(L.householdId === 'dan' ? 'sal' : 'dan'); },
    month(el){ st.month = el.dataset.v; st.lastPick = null; render(); },
    filter(el){ st.filter = el.dataset.v; render(); const t = $('txns'); if (t && el.classList.contains('sb-stat-btn')) t.scrollIntoView({ behavior: 'smooth' }); },
    onlyActive(el){ st.onlyActive = el.checked; render(); },
    dropCsv(el){ st.csv.splice(+el.dataset.i, 1); render(); },
    flip(el){ const f = st.csv[+el.dataset.i]; f.flip = el.checked; parseInto(f); render(); },
    makeRule(el){
      const t = feed().transactions.find(x => x.id === el.dataset.id); if (!t) return;
      st.rules.push({ keyword: S.keyword(t.description), lineId: st.picks[t.id] });
      st.lastPick = null; savePrefs(); render();
    },
    dropRule(el){ st.rules.splice(+el.dataset.i, 1); savePrefs(); render(); },
    resetSandbox(){ if (!confirm('Clear all sorting rules and picks for this budget in the sandbox?')) return; st.rules = []; st.picks = {}; savePrefs(); render(); },
  };

  function parseInto(f){
    const r = S.parseBankCsv(f.text, { fileName: f.name, flip: f.flip, accountId: f.accountId });
    f.feed = { accounts: [{ id: f.accountId, name: f.name.replace(/\.csv$/i, ''), kind: f.flip ? 'card' : 'current' }], transactions: r.transactions };
    f.skipped = r.skipped.length;
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
    if (act[el.dataset.act]){ e.preventDefault(); act[el.dataset.act](el); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.act === 'pick'){
      if (el.value) st.picks[el.dataset.id] = el.value; else delete st.picks[el.dataset.id];
      st.lastPick = el.value ? el.dataset.id : null; savePrefs(); render(); return;
    }
    if (el.type === 'checkbox' && act[el.dataset.act]) return act[el.dataset.act](el);
    if (el.id === 'csv-input'){
      st.csvError = '';
      Promise.all(Array.from(el.files).map(file => file.text().then(text => ({ name: file.name, text })))).then(files => {
        files.forEach(x => {
          const f = { name: x.name, text: x.text, flip: false, accountId: 'csv-' + S.hash(x.name) };
          try { parseInto(f); if (!st.csv.some(c => c.accountId === f.accountId)) st.csv.push(f); }
          catch(err){ st.csvError = x.name + ': ' + err.message; }
        });
        render();
      });
    }
  });
  document.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'add-rule'){
      const kw = $('rule-kw').value.trim().toUpperCase(), lineId = $('rule-line').value;
      if (!kw || !lineId) return;
      st.rules.push({ keyword: kw, lineId }); savePrefs(); render(); return;
    }
    if (e.target.id === 'unlock'){
      const pin = $('sb-pin').value.trim();
      if (!/^\d{6}$/.test(pin)){ st.unlockError = 'Enter your six-digit PIN.'; render(); return; }
      st.busy = true; st.unlockError = ''; render();
      try {
        const r = await L.store.unlock(pin);
        if (!r.state) throw new Error('No ledger found for this household.');
        st.wantReal = false; setBudget(r.state, 'real');
      } catch(err){
        st.unlockError = err.name === 'OperationError' ? 'That PIN didn\'t unlock the ledger.' : err.name === 'GhAuthError' ? 'GitHub rejected this device\'s token. Reconnect in the main app.' : err.message;
      } finally { st.busy = false; render(); }
    }
  });

  // ---------------- boot ----------------
  try { const ui = JSON.parse(L.safeLS.get(L.CFG.uiKey) || '{}'); const th = ui.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : ui.theme; if (th) document.documentElement.setAttribute('data-theme', th); } catch(e){}
  setBudget(L.normalise(L.demoState()), 'demo');
  render();
})();
