/* Life admin (v2.11): pensions, bills, subscriptions and insurance. Numbers come from model.js (M.pensions,
   M.adminSummary…); this file is the page, its popups and the small cards it adds to Overview and Accounts.
   Pensions are deliberately kept out of liquid funds, savings, months of cover, net worth and the monthly check-in. */
(function(){
  'use strict';
  const L = window.Ledger, M = L.model, C = L.charts, esc = C.esc, UI = L.ui;
  const { gbp, signed, cls } = L.fmt;
  const S = () => L.S;
  const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  L.icons.admin = ic('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 9.5h7M8.5 13.5h7M8.5 17.5h4"/>');
  const sm = svg => svg.replace('<svg', '<svg width="16" height="16"');
  const kindName = id => (M.PENSION_KINDS.find(k => k.id === id) || M.PENSION_KINDS[0]).name;
  const catOf = id => M.ADMIN_CATS.find(c => c.id === id) || M.ADMIN_CATS[M.ADMIN_CATS.length - 1];
  const periodShort = { monthly: '/mo', quarterly: '/qtr', annual: '/yr' };
  const inputNum = n => (n == null || n === '') ? '' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  const money = (n, dp) => gbp(n, dp == null ? (Math.round(n) === n ? 0 : 2) : dp);
  const PAL = [1, 2, 3, 5, 7, 4, 6, 8];

  // ---------------- small pieces ----------------
  const pensionStatus = x => !x.last ? '<span class="upd due">No value yet</span>'
    : x.due ? `<span class="upd due">Due an update · last ${M.dateLbl(x.last.date)}</span>` : `<span class="upd ok">✓ Updated ${M.dateLbl(x.last.date)}</span>`;
  const renewLbl = it => {
    const r = M.renewal(it), verb = it.autoRenew ? 'Renews' : 'Ends', d = it.endDate ? M.dateLbl(it.endDate) : '';
    if (r.status === 'none') return '<span class="upd">No end date</span>';
    if (r.status === 'passed') return `<span class="upd neg">${it.autoRenew ? 'Renewed' : 'Ended'} ${d} · set the next date</span>`;
    if (r.status === 'soon') return `<span class="upd due">${verb} ${r.days === 0 ? 'today' : r.days === 1 ? 'tomorrow' : 'in ' + r.days + ' days'} · ${d}</span>`;
    return `<span class="upd">${verb} ${d}</span>`;
  };
  const metaLine = (...bits) => bits.filter(Boolean).map(esc).join(' · ');

  function pensionRow(x){
    const p = x.p;
    return `<div class="row acc-row clickable" data-act="openPension" data-id="${p.id}">
      <div><div class="name">${esc(p.name || 'Untitled pension')}${x.pot ? '' : '<span class="est-badge">income</span>'}</div>
        <div class="meta">${metaLine(p.provider, p.owner, kindName(p.kind))}</div><div style="margin-top:3px">${pensionStatus(x)}</div></div>
      ${C.spark(x.vals.map(v => v.value))}
      <div class="right"><div class="big">${x.last ? gbp(x.last.value) : '—'}${x.pot || !x.last ? '' : '<span class="muted small">/yr</span>'}</div><div class="chg">${x.change != null ? `<span class="${cls(x.change)}">${signed(x.change)}</span>` : ''}</div></div></div>`;
  }
  function itemRow(it){
    const per = periodShort[it.period] || '/mo';
    return `<div class="row clickable" data-act="openAdminItem" data-id="${it.id}">
      <div><div class="name">${esc(it.name || 'Untitled')}</div><div class="meta">${metaLine(it.provider, it.owner)}</div><div style="margin-top:3px">${renewLbl(it)}</div></div>
      <div class="right"><div class="big">${it.cost ? money(Number(it.cost)) + `<span class="muted small">${per}</span>` : '<span class="muted">—</span>'}</div>
        <div class="chg muted">${it.cost && it.period !== 'annual' ? gbp(M.itemAnnual(it)) + '/yr' : it.cost ? gbp(M.itemMonthly(it)) + '/mo' : ''}</div></div></div>`;
  }

  // ---------------- chart: pension pots over time ----------------
  L.specs.pensions = () => {
    const s = S(), ser = M.pensionSeries(s), pots = M.pensions(s).filter(x => x.pot && x.vals.length);
    const items = pots.map((x, i) => ({ id: x.p.id, name: x.p.name || 'Untitled', color: `var(--s${PAL[i % 8]})` }));
    const on = items.filter(i => L.vis('pensions', i.id));
    return {
      title: 'Pension pots over time', sub: 'Total of the pots at each month-end, using the latest value logged', pills: items.length > 1 ? items : null,
      draw(el, big){
        if (!ser.length){ el.innerHTML = '<div class="empty">Add a pension and its value to see it here.</div>'; return; }
        C.line(el, { labels: ser.map(p => p.m), fmtX: i => M.lbl(ser[i].m), stacked: on.length > 1, height: big ? 360 : 250, aria: 'Pension pots over time',
          series: on.map(i => ({ name: i.name, color: i.color, values: ser.map(p => p.by[i.id] || 0), area: on.length === 1 })),
          tipFmt: i => `<div class="th">${M.lbl(ser[i].m, 'long')}</div>` + on.map(it => C.tipRow(it.name, gbp(ser[i].by[it.id] || 0), it.color)).join('') + (on.length > 1 ? C.tipRow('Total', `<b>${gbp(on.reduce((t, it) => t + (ser[i].by[it.id] || 0), 0))}</b>`) : '') });
      },
      table: () => `<table class="tbl"><thead><tr><th>Month</th>${items.map(i => `<th class="r hide-sm">${esc(i.name)}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>${ser.slice().reverse().map(p => `<tr><td>${M.lbl(p.m)}</td>${items.map(i => `<td class="r hide-sm">${p.by[i.id] == null ? '—' : gbp(p.by[i.id])}</td>`).join('')}<td class="r">${gbp(p.total)}</td></tr>`).join('')}</tbody></table>`,
      notes: () => 'Months between updates repeat the last value logged. A pension added later counts from the month of its first value. Final-salary and state pensions are a yearly income, not a pot, so they are not in this total.',
    };
  };
  L.specs.pen = id => {
    const s = S(), p = s.admin.pensions.find(x => x.id === id), vals = p ? M.pensionValues(p) : [], pot = p ? M.isPot(p) : true;
    return {
      title: p ? p.name : 'Pension', sub: pot ? 'Pot value' : 'Expected yearly income',
      draw(el, big){ if (vals.length < 2){ el.innerHTML = `<div class="empty">${vals.length ? 'One value so far. Each update adds a point.' : 'No values yet.'}</div>`; return; }
        C.line(el, { labels: vals.map(v => v.date.slice(0, 7)), fmtX: i => M.dateLbl(vals[i].date), height: big ? 260 : 200, aria: (p ? p.name : 'Pension') + ' over time',
          series: [{ name: p.name, color: pot ? 'var(--s5)' : 'var(--s7)', values: vals.map(v => v.value), area: true }], tipFmt: i => `<div class="th">${M.dateLbl(vals[i].date)}</div>` + C.tipRow('Value', `<b>${gbp(vals[i].value)}</b>`) }); },
    };
  };

  // ---------------- the page ----------------
  L.pages.admin = { render(){
    const s = S(), pens = M.pensions(s), pt = M.pensionTotals(s), sum = M.adminSummary(s), l = M.latest(s), nw = M.netWorth(s);
    const archivedP = s.admin.pensions.filter(p => p.archived), archivedI = s.admin.items.filter(it => it.archived);
    const potRows = pens.filter(x => x.pot).map(pensionRow).join(''), incRows = pens.filter(x => !x.pot).map(pensionRow).join('');
    const upcoming = sum.attention.concat(sum.upcoming.filter(x => x.r.status === 'later')).slice(0, 8);
    const catCards = sum.cats.map(c => `<section class="card s6"><div class="card-head"><div><h2>${esc(c.name)}</h2><div class="sub">${c.items.length ? `${c.items.length} · <b>${money(c.monthly, 0)}</b> a month · ${gbp(c.annual)} a year` : esc(c.eg)}</div></div>
        <div class="actions"><button class="btn sm" data-act="addAdminItem" data-cat="${c.id}">${sm(L.icons.plus)}Add</button></div></div>
        <div class="rows">${c.items.slice().sort((a, b) => M.itemMonthly(b) - M.itemMonthly(a)).map(itemRow).join('') || '<div class="empty">Nothing added yet.</div>'}</div></section>`).join('');

    return `<div class="page-head"><div><h1>Life admin</h1><div class="sub">Pensions, bills, subscriptions and insurance: who they're with, what they cost and when they end</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${pens.length ? '<button class="btn primary" data-act="updatePensions">Update pension values</button>' : ''}<button class="btn" data-act="addPension">${sm(L.icons.plus)}Pension</button></div></div>
      <div class="grid">
        <div class="stats" style="grid-column:1/-1">
          <div class="stat"><div class="k">Pension pots</div><div class="v">${pt.potCount ? gbp(pt.pots) : '—'}</div><div class="d">${pt.change != null ? `<span class="${cls(pt.change)}">${signed(pt.change)}</span> since previous values` : `${pt.potCount} pot${pt.potCount === 1 ? '' : 's'}`}</div></div>
          <div class="stat"><div class="k">Net worth + pensions</div><div class="v">${nw == null ? '—' : gbp(nw + pt.pots)}</div><div class="d">${gbp(nw)} net worth + pots</div></div>
          <div class="stat"><div class="k">Bills and subscriptions</div><div class="v">${money(sum.monthly, 0)}<span class="small muted">/mo</span></div><div class="d">${gbp(sum.annual)} a year · ${sum.count} item${sum.count === 1 ? '' : 's'}</div></div>
          <div class="stat"><div class="k">Needs attention</div><div class="v">${sum.attention.length + pt.due.length}</div><div class="d">${sum.attention.length} ending soon · ${pt.due.length} pension${pt.due.length === 1 ? '' : 's'} due</div></div>
        </div>
        <section class="card s6"><div class="card-head"><div><h2>Pensions</h2><div class="sub">Kept apart from savings: not in liquid funds, months of cover or net worth. Update every quarter or when a statement arrives.</div></div></div>
          ${pt.potCount ? `<div class="hero-value" style="font-size:34px">${gbp(pt.pots)}</div><div class="small ink2" style="margin-bottom:6px">${pt.potCount} pot${pt.potCount === 1 ? '' : 's'}${pt.newest ? ` · latest value ${M.dateLbl(pt.newest)}` : ''}</div>` : ''}
          <div class="rows">${potRows || (incRows ? '' : '<div class="empty">No pensions yet. Add each workplace pension, SIPP or old pot, then log its value from the latest statement or app.</div>')}</div>
          ${incRows ? `<h3 style="margin:14px 0 2px">Final salary and state pensions</h3><div class="small muted">Expected yearly income, from benefit statements and state pension forecasts. Not added to the pots.</div><div class="rows">${incRows}</div>${pt.incomeCount > 1 ? `<div class="small" style="margin-top:6px">Together: <b>${gbp(pt.income)}</b> a year</div>` : ''}` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${pens.length ? '<button class="btn sm" data-act="updatePensions">Update values</button>' : ''}<button class="btn sm" data-act="addPension">${sm(L.icons.plus)}Add a pension</button></div></section>
        ${L.chartCard('pensions', { cls: 's6' })}
        <section class="card s12"><div class="card-head"><div><h2>Coming up</h2><div class="sub">Renewals and end dates, soonest first. Most deals are cheapest to switch in the last few weeks.</div></div>
          <div class="actions">${sum.upcoming.length ? '<button class="btn sm" data-act="adminCalendar">Add dates to calendar</button>' : ''}</div></div>
          <div class="rows">${upcoming.map(x => itemRow(x.it)).join('') || '<div class="empty">No end dates yet. Add one to any bill, subscription or policy to see it here.</div>'}</div></section>
        ${catCards}
        ${archivedP.length || archivedI.length ? `<section class="card s12"><h2>Archived</h2><div class="rows" style="margin-top:8px">${archivedP.map(p => `<div class="row clickable" data-act="openPension" data-id="${p.id}"><div><div class="name">${esc(p.name || 'Untitled pension')}</div><div class="meta">${metaLine(p.provider, 'Pension')}</div></div><div class="right muted small">Archived</div></div>`).join('')}${archivedI.map(it => `<div class="row clickable" data-act="openAdminItem" data-id="${it.id}"><div><div class="name">${esc(it.name || 'Untitled')}</div><div class="meta">${metaLine(it.provider, catOf(it.category).short)}</div></div><div class="right muted small">Archived</div></div>`).join('')}</div></section>` : ''}
      </div>
      <div class="note">Costs here are a record of what you pay; they don't change the Budget tab. Liquid funds ${gbp(l ? l.liquid : 0)}, net worth ${gbp(nw)}; pensions are shown alongside, never inside, those figures.</div>`;
  } };

  // ---------------- pensions: add, edit, values ----------------
  L.acts.addPension = () => { const id = L.uid('pn'); L.commit(s => s.admin.pensions.push({ id, name: '', provider: '', owner: '', kind: 'workplace', note: '', archived: false, values: [] })); openPension(id, true); };
  L.acts.openPension = el => openPension(el.dataset.id);
  function openPension(id, fresh){
    L.modal.open(() => {
      const s = S(), p = s.admin.pensions.find(x => x.id === id); if (!p) return { title: 'Pension removed', body: '' };
      const vals = M.pensionValues(p), pot = M.isPot(p), last = vals[vals.length - 1];
      const f = (lbl, k, ph, extra = '') => `<div class="field"><label>${lbl}</label><input class="input" value="${esc(p[k] || '')}" placeholder="${ph}" data-edit="field" data-coll="admin.pensions" data-id="${id}" data-f="${k}" ${extra}></div>`;
      return {
        title: p.name || 'New pension', sub: last ? `${gbp(last.value)}${pot ? '' : ' a year'} on ${M.dateLbl(last.date)}` : 'Add its name, then its latest value',
        body: `
          ${vals.length ? `<div class="chart" data-chart="pen:${id}" data-big="1"></div>` : ''}
          <div class="section"><h3>${pot ? 'Add a value' : 'Add a forecast'}</h3>
            <div class="small muted" style="margin-bottom:8px">${pot ? 'The pot value from the provider\'s app or latest statement.' : 'The expected yearly income from the latest benefit statement or state pension forecast.'}</div>
            <div class="pv-add"><input class="input" type="date" id="pv-date" value="${M.today()}" aria-label="Date"><div class="num-wrap"><input class="input num" inputmode="decimal" id="pv-val" placeholder="${pot ? '£ value' : '£ a year'}" aria-label="Value"></div><button class="btn primary" data-act="addPensionValue" data-id="${id}">Add</button></div></div>
          ${vals.length ? `<div class="section"><h3>History</h3><table class="tbl"><thead><tr><th>Date</th><th class="r">${pot ? 'Value' : 'A year'}</th><th class="r">Change</th><th></th></tr></thead><tbody>${vals.slice().reverse().map((v, k, arr) => `<tr><td>${M.dateLbl(v.date)}</td><td class="r">${gbp(v.value)}</td><td class="r ${arr[k + 1] ? cls(v.value - arr[k + 1].value) : ''}">${arr[k + 1] ? signed(v.value - arr[k + 1].value) : '—'}</td><td class="r"><button class="x-btn" data-act="del" data-coll="admin.pensions.#${id}.values" data-id="${v.id}" data-confirm="Delete the value from ${M.dateLbl(v.date)}?" aria-label="Delete this value">×</button></td></tr>`).join('')}</tbody></table></div>` : ''}
          <div class="section"><h3>Details</h3>
            ${f('Name', 'name', 'e.g. Dan workplace pension', 'data-refresh="1" id="pn-name"')}
            <div class="two">${f('Provider', 'provider', 'e.g. Aviva, Nest, Vanguard')}${f('Whose', 'owner', 'e.g. Dan, Micks')}</div>
            <div class="field"><label>Type</label><select class="input" data-edit="field" data-coll="admin.pensions" data-id="${id}" data-f="kind" data-refresh="1">${M.PENSION_KINDS.map(k => `<option value="${k.id}" ${(p.kind || 'workplace') === k.id ? 'selected' : ''}>${k.name}${k.pot ? '' : ' (yearly income)'}</option>`).join('')}</select></div>
            <div class="field"><label>Note</label><textarea class="input" data-edit="field" data-coll="admin.pensions" data-id="${id}" data-f="note" placeholder="e.g. policy number, contribution %, login hint (never a password)">${esc(p.note || '')}</textarea></div>
            <label class="switch"><input type="checkbox" ${p.archived ? 'checked' : ''} data-edit="field" data-coll="admin.pensions" data-id="${id}" data-f="archived" data-refresh="1">Archived (moved or cashed in; hidden from totals)</label></div>
          <div class="section"><button class="btn danger sm" data-act="deletePension" data-id="${id}">Delete pension</button></div>`,
        onMount(b){ const v = b.querySelector('#pv-val'); if (v) v.addEventListener('keydown', e => { if (e.key === 'Enter') L.acts.addPensionValue({ dataset: { id } }); }); if (fresh){ fresh = false; const n = b.querySelector('#pn-name'); if (n) n.focus(); } },
      };
    });
  }
  // One value per pension per date: a second value on the same date replaces the first.
  const putValue = (p, date, value) => { const i = p.values.findIndex(v => v.date === date); if (i >= 0) p.values[i].value = value; else p.values.push({ id: L.uid('pv'), date, value }); p.values.sort((a, b) => a.date < b.date ? -1 : 1); };
  L.acts.addPensionValue = el => {
    const d = document.getElementById('pv-date'), v = document.getElementById('pv-val'); if (!d || !v) return;
    const value = L.parseNum(v.value), date = d.value || M.today();
    if (value == null){ L.toast('Enter the value first'); v.focus(); return; }
    L.commit(s => putValue(s.admin.pensions.find(x => x.id === el.dataset.id), date, value), { modal: true });
    L.toast('Value saved');
  };
  L.acts.deletePension = el => {
    if (!confirm('Delete this pension and all its values? Archive it instead if it was moved or cashed in.')) return;
    L.commit(s => { s.admin.pensions = s.admin.pensions.filter(p => p.id !== el.dataset.id); }); L.modal.close();
  };

  // Quarterly round-up: every pension on one screen. Blank boxes are left as they are.
  L.acts.updatePensions = () => L.modal.open(() => {
    const pens = M.pensions(S());
    return {
      title: 'Update pension values', sub: 'Type the latest value for any that have changed. Leave a box blank to skip it.',
      body: `<div class="field" style="max-width:220px"><label for="pu-date">Values as of</label><input class="input" type="date" id="pu-date" value="${M.today()}"></div>
        ${pens.map(x => `<div class="log-row"><div><div class="name">${esc(x.p.name || 'Untitled pension')}${x.pot ? '' : '<span class="est-badge">a year</span>'}</div>
          <div class="prev">${x.last ? `Last: ${gbp(x.last.value)} on ${M.dateLbl(x.last.date)}` : 'No value yet'}</div>${x.last ? `<button class="same" data-pusame="${x.p.id}" data-v="${x.last.value}">Same as last time</button>` : ''}</div>
          <div class="num-wrap"><input class="input num" inputmode="decimal" data-pu="${x.p.id}" placeholder="${x.last ? inputNum(x.last.value) : '£'}" aria-label="${esc(x.p.name)} value"></div></div>`).join('') || '<div class="empty">No pensions yet.</div>'}`,
      foot: '<button class="btn primary block" id="pu-save">Save values</button>',
      onMount(b){
        b.addEventListener('click', e => { const t = e.target.closest('[data-pusame]'); if (!t) return; e.preventDefault(); b.querySelector(`[data-pu="${t.dataset.pusame}"]`).value = inputNum(Number(t.dataset.v)); t.remove(); });
        document.getElementById('pu-save').addEventListener('click', () => {
          const date = b.querySelector('#pu-date').value || M.today(), got = [];
          b.querySelectorAll('[data-pu]').forEach(i => { const v = L.parseNum(i.value); if (v != null) got.push([i.dataset.pu, v]); });
          if (!got.length){ L.toast('Type at least one value'); return; }
          L.commit(s => got.forEach(([id, v]) => putValue(s.admin.pensions.find(p => p.id === id), date, v)));
          L.modal.close(); L.toast(`Saved ${got.length} pension value${got.length === 1 ? '' : 's'}`);
        });
      },
    };
  });

  // ---------------- bills, subscriptions, insurance ----------------
  L.acts.addAdminItem = el => {
    const id = L.uid('ad'), cat = (el && el.dataset.cat) || 'utility';
    L.commit(s => s.admin.items.push({ id, category: cat, name: '', provider: '', cost: 0, period: cat === 'insurance' ? 'annual' : 'monthly', endDate: '', owner: '', autoRenew: cat === 'subscription', ref: '', note: '', archived: false }));
    openItem(id, true);
  };
  L.acts.openAdminItem = el => openItem(el.dataset.id);
  function openItem(id, fresh){
    L.modal.open(() => {
      const s = S(), it = s.admin.items.find(x => x.id === id); if (!it) return { title: 'Removed', body: '' };
      const c = catOf(it.category), attr = (k, extra = '') => `data-edit="field" data-coll="admin.items" data-id="${id}" data-f="${k}" ${extra}`;
      const txt = (lbl, k, ph, extra = '') => `<div class="field"><label>${lbl}</label><input class="input" value="${esc(it[k] || '')}" placeholder="${ph}" ${attr(k, extra)}></div>`;
      return {
        title: it.name || 'New ' + c.one, narrow: true,
        sub: `${esc(c.short)}${it.cost ? ` · ${gbp(M.itemMonthly(it), 2)} a month, ${gbp(M.itemAnnual(it))} a year` : ''}`,
        body: `${txt('Name', 'name', c.eg, 'data-refresh="1" id="ad-name"')}
          ${txt('Provider', 'provider', 'Who it\'s with')}
          <div class="field"><label>Type</label><select class="input" ${attr('category', 'data-refresh="1"')}>${M.ADMIN_CATS.map(x => `<option value="${x.id}" ${c.id === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>
          <div class="two"><div class="field"><label>Cost</label><input class="input num" inputmode="decimal" value="${inputNum(it.cost)}" placeholder="£" ${attr('cost', 'data-type="num" data-refresh="1"')}></div>
            <div class="field"><label>Paid</label><select class="input" ${attr('period', 'data-refresh="1"')}>${M.PERIODS.map(p => `<option value="${p.id}" ${(it.period || 'monthly') === p.id ? 'selected' : ''}>${p.id === 'monthly' ? 'Monthly' : p.id === 'quarterly' ? 'Quarterly' : 'Yearly'}</option>`).join('')}</select></div></div>
          <div class="two"><div class="field"><label>${it.autoRenew ? 'Renews on' : 'Ends or renews on'}</label><input class="input" type="date" value="${esc(it.endDate || '')}" ${attr('endDate', 'data-refresh="1"')}></div>
            ${txt('Whose', 'owner', 'e.g. Joint, Dan')}</div>
          <label class="switch" style="margin-bottom:14px"><input type="checkbox" ${it.autoRenew ? 'checked' : ''} ${attr('autoRenew', 'data-refresh="1"')}>Renews automatically</label>
          ${txt('Reference', 'ref', 'Policy, account or customer number')}
          <div class="field"><label>Note</label><textarea class="input" ${attr('note')} placeholder="e.g. notice period, what's covered, excess, how it's paid">${esc(it.note || '')}</textarea></div>
          <label class="switch"><input type="checkbox" ${it.archived ? 'checked' : ''} ${attr('archived', 'data-refresh="1"')}>Archived (cancelled or switched; kept for reference)</label>
          <div class="section"><button class="btn danger sm" data-act="deleteAdminItem" data-id="${id}">Delete</button></div>`,
        onMount(b){ if (fresh){ fresh = false; const n = b.querySelector('#ad-name'); if (n) n.focus(); } },
      };
    });
  }
  L.acts.deleteAdminItem = el => {
    if (!confirm('Delete this item? Archive it instead to keep a record.')) return;
    L.commit(s => { s.admin.items = s.admin.items.filter(x => x.id !== el.dataset.id); }); L.modal.close();
  };

  // ---------------- calendar ----------------
  // One .ics: every future end/renewal date as an all-day event with a reminder two weeks before,
  // plus a repeating quarterly "update pension values" reminder. Stable UIDs, so re-importing updates them.
  const icsTxt = t => String(t || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  L.acts.adminCalendar = () => {
    const s = S(), stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', ev = [];
    const day = iso => iso.replace(/-/g, ''), next = iso => { const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1, d + 1); return x.getFullYear() + String(x.getMonth() + 1).padStart(2, '0') + String(x.getDate()).padStart(2, '0'); };
    M.adminSummary(s).upcoming.forEach(({ it }) => ev.push(['BEGIN:VEVENT', `UID:ledger-admin-${it.id}-${day(it.endDate)}@seligman`, 'DTSTAMP:' + stamp,
      `DTSTART;VALUE=DATE:${day(it.endDate)}`, `DTEND;VALUE=DATE:${next(it.endDate)}`, `SUMMARY:${icsTxt(`${it.name || 'Contract'} ${it.autoRenew ? 'renews' : 'ends'}${it.provider ? ' (' + it.provider + ')' : ''}`)}`,
      `DESCRIPTION:${icsTxt(`${it.cost ? gbp(Number(it.cost), 2) + ' ' + ((M.PERIODS.find(p => p.id === it.period) || M.PERIODS[0]).name) + '. ' : ''}Compare deals before it ${it.autoRenew ? 'renews' : 'ends'}. ${it.note || ''}`.trim())}`,
      'BEGIN:VALARM', 'TRIGGER:-P14D', 'ACTION:DISPLAY', 'DESCRIPTION:Renewal in two weeks', 'END:VALARM', 'END:VEVENT'].join('\r\n')));
    if (M.pensions(s).length){
      const n = new Date(), qm = [0, 3, 6, 9].find(m => m > n.getMonth()), y = qm == null ? n.getFullYear() + 1 : n.getFullYear(), d = `${y}${String((qm == null ? 0 : qm) + 1).padStart(2, '0')}01`;
      ev.push(['BEGIN:VEVENT', 'UID:ledger-pensions-quarterly@seligman', 'DTSTAMP:' + stamp, `DTSTART;VALUE=DATE:${d}`, 'RRULE:FREQ=MONTHLY;INTERVAL=3', 'SUMMARY:Ledger: update pension values',
        'DESCRIPTION:Open the Seligman Ledger → Life admin → Update pension values.', 'END:VEVENT'].join('\r\n'));
    }
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Seligman Ledger//Life admin//EN', ...ev, 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'ledger-renewals.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    L.toast('Open the downloaded file to add the dates to your calendar');
  };

  // ---------------- pieces other pages show ----------------
  L.admin = {
    // Overview stat tile: pension pots in total.
    stat(){
      const pt = M.pensionTotals(S());
      return `<button class="stat" data-act="tab" data-tab="admin"><div class="k">Pensions</div><div class="v">${pt.potCount ? gbp(pt.pots) : '—'}</div><div class="d">${pt.potCount ? 'Separate from net worth' : 'Add in Life admin'}</div></button>`;
    },
    // Overview card, only when something needs doing: a renewal within 30 days, a lapsed date, or pensions due.
    card(){
      const s = S(), sum = M.adminSummary(s), due = M.pensions(s).filter(x => x.due);
      if (!sum.attention.length && !due.length) return '';
      const rows = sum.attention.slice(0, 5).map(x => itemRow(x.it)).join('');
      return `<section class="card s12"><div class="card-head"><div><h2>Life admin</h2><div class="sub">Coming up in the next ${M.RENEW_SOON_DAYS} days, and anything overdue</div></div>
          <div class="actions"><button class="btn sm" data-act="tab" data-tab="admin">Open</button></div></div>
        <div class="rows">${rows}${due.length ? `<div class="row clickable" data-act="updatePensions"><div><div class="name">Pension values</div><div class="meta">${due.length} not updated in the last 3 months: ${due.map(x => esc(x.p.name || 'Untitled')).join(', ')}</div></div><div class="right"><span class="upd due">Update</span></div></div>` : ''}</div></section>`;
    },
    // Accounts page note: pensions alongside net worth.
    note(){
      const pt = M.pensionTotals(S()); if (!pt.potCount) return '';
      return ` Pensions, kept separate: ${gbp(pt.pots)} (<a href="#" data-act="tab" data-tab="admin">Life admin</a>), so ${gbp(M.netWorth(S()) + pt.pots)} including them.`;
    },
  };
})();
