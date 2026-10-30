/* App shell: formatting, gates, render loop, modal, delegated events, settings. Pages live in views.js. */
(function(){
  'use strict';
  const L = window.Ledger, M = L.model, C = L.charts, esc = C.esc;
  const $ = id => document.getElementById(id);

  // ---------------- formatting ----------------
  const gbp = (n, dp = 0) => (n == null || isNaN(n)) ? '—' : (n < 0 ? '−' : '') + '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const signed = n => (n == null || isNaN(n)) ? '—' : (Math.round(n) === 0 ? '£0' : (n > 0 ? '+' : '−') + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB'));
  const pct = n => (n == null || !isFinite(n)) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%';
  const cls = n => n > 0.5 ? 'pos' : n < -0.5 ? 'neg' : 'muted';
  L.fmt = { gbp, signed, pct, cls, k: C.axisMoney, months: n => n == null ? '—' : n.toFixed(1) };
  L.parseNum = v => { if (v == null) return null; const t = String(v).replace(/[£,\s]/g, '').replace(/[−–]/g, '-'); if (t === '' || t === '-') return null; const n = Number(t); return isNaN(n) ? null : n; };

  // ---------------- icons ----------------
  const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  L.icons = {
    overview: ic('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
    accounts: ic('<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10.5h18M16 15h2"/><path d="M6 6V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
    budget: ic('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    trends: ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    planner: ic('<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M8 7.5h8M8.5 12h1M14.5 12h1M8.5 16h1M14.5 16h1"/>'),
    settings: ic('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
    expand: ic('<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    close: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
    caret: ic('<path d="M6 9l6 6 6-6"/>'),
    table: ic('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>'),
    menu: ic('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'),
    moon: ic('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    checkin: ic('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
    tag: ic('<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8" cy="8" r="1.4"/>'),
    bolt: ic('<path d="M13 3L5 13.5h6L10 21l9-11h-6z"/>'),
    bell: ic('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    lock: ic('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  };
  const TABS = [['overview','Overview'],['accounts','Accounts'],['budget','Budget'],['trends','Trends'],['planner','Planner']];

  // ---------------- UI prefs (per device) ----------------
  let saved = {}; try { saved = JSON.parse(L.safeLS.get(L.CFG.uiKey) || '{}'); } catch(e){}
  const UI = L.ui = Object.assign({ tab:'overview', range:'3y', measure:'liquid', roll:6, budgetYear:null, groupBy:'bucket', showInactive:false, collapsed:{}, strip:true, theme:'dark', planView:null, off:{ balance:['savings','current'] }, spendRange:'2y', menu:false }, saved);
  if (!UI.off) UI.off = {};
  L.saveUI = () => L.safeLS.set(L.CFG.uiKey, JSON.stringify(UI));
  const applyTheme = () => document.documentElement.setAttribute('data-theme', UI.theme || 'dark');
  applyTheme();

  // ---------------- state + render ----------------
  L.S = null;
  L.commit = (fn, opts = {}) => {
    fn(L.S);
    L.S.meta.updatedAt = new Date().toISOString();
    M.invalidate();
    if (L.reports) L.reports.sync(L.S, true);
    L.store.queue(L.S);
    if (opts.render !== false) L.requestRender();
    if (opts.modal) L.modal.refresh();
  };
  let pending = false;
  // Only a text box with unsaved typing blocks a redraw. Tick boxes, dropdowns and a box you've just
  // tapped into redraw straight away (focus is put back), so totals update as soon as a change is saved.
  const textField = a => a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/.test(a.type)));
  const editing = () => { const a = document.activeElement; return textField(a) && $('page').contains(a) && a.value !== a.defaultValue; };
  L.requestRender = () => { setTimeout(() => { if (editing()) pending = true; else L.render(); }, 0); };
  document.addEventListener('focusout', () => setTimeout(() => { if (pending && !editing()){ pending = false; L.render(); } }, 0));

  // An element's identity across redraws: its data-* attributes (data-edit/coll/id/f/y…), or its id.
  const fieldKey = el => el.id ? '#' + el.id : Object.entries(el.dataset).map(([k, v]) => k + '=' + v).sort().join('&');
  L.pages = {};
  L.render = function(){
    if (!L.S) return;
    const page = L.pages[UI.tab] || L.pages.overview;
    const root = $('page'), a = document.activeElement;
    const keep = a && a !== document.body && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) ? { key: fieldKey(a), tag: a.tagName, sel: textField(a) ? [a.selectionStart, a.selectionEnd] : null } : null;
    root.innerHTML = page.render();
    renderNav();
    L.mountCharts(root);
    if (L.reports) L.reports.afterRender();
    if (keep){
      const el = [...root.querySelectorAll(keep.tag)].find(x => fieldKey(x) === keep.key);
      if (el){ el.focus({ preventScroll: true }); if (keep.sel && keep.sel[0] != null) try { el.setSelectionRange(keep.sel[0], keep.sel[1]); } catch(e){} }
    }
  };
  function renderNav(){
    const ci = M.checkin(L.S, M.thisMonth()), out = ci.total - ci.done, due = out > 0;
    const btn = ([id, n]) => `<button data-act="tab" data-tab="${id}" class="${UI.tab === id ? 'on' : ''}" ${UI.tab === id ? 'aria-current="page"' : ''}>${L.icons[id]}<span>${n}</span>${id === 'overview' && due ? '<i class="dot-badge" aria-label="Check-in due"></i>' : ''}</button>`;
    $('bottomnav').innerHTML = TABS.map(btn).join('');
    $('side-nav').innerHTML = TABS.map(([id, n]) => `<button data-act="tab" data-tab="${id}" class="${UI.tab === id ? 'on' : ''}">${L.icons[id]}<span>${n}</span>${id === 'overview' && due ? `<span class="nbadge">${out} to update</span>` : ''}</button>`).join('');
    $('side-actions').innerHTML = `<span class="lbl">Quick actions</span>
      <button class="si" data-act="logBalances">${L.icons.checkin}<span>${M.lbl(M.thisMonth(), 'month')} check-in</span>${out ? `<span class="nbadge">${ci.done}/${ci.total}</span>` : ''}</button>
      <button class="si" data-act="quickOneOff">${L.icons.bolt}<span>Log a one-off</span></button>
      <button class="si" data-act="manageTags">${L.icons.tag}<span>Manage tags</span></button>
      <button class="si" data-act="reminder">${L.icons.bell}<span>Monthly reminder</span></button>`;
    if (L.reports) $('side-actions').insertAdjacentHTML('beforeend', `<button class="si" data-act="monthlyReport">${L.icons.trends}<span>Monthly reviews</span></button>`);
    $('side-foot').innerHTML = `<div class="seg" role="group" aria-label="Theme">${[['dark','Dark'],['light','Light'],['system','Auto']].map(([v, n]) => `<button class="${UI.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${n}</button>`).join('')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="settings">${L.icons.settings.replace('<svg', '<svg width="15" height="15"')}Settings</button>${L.PREVIEW ? '' : `<button class="btn sm" data-act="lock">${L.icons.lock.replace('<svg', '<svg width="15" height="15"')}${L.DEMO ? 'Exit demo' : 'Lock'}</button>`}</div>`;
    $('theme-btn').innerHTML = isDark() ? L.icons.sun : L.icons.moon;
    // home-screen icon badge (installed app, where supported)
    try { if ('setAppBadge' in navigator){ if (due && out) navigator.setAppBadge(out); else navigator.clearAppBadge(); } } catch(e){}
  }
  const isDark = () => UI.theme === 'dark' || (UI.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);

  // ---------------- charts registry ----------------
  L.specs = {};
  L.spec = key => { const [base, arg] = key.split(':'); const s = L.specs[base]; return s ? (typeof s === 'function' ? s(arg) : s) : null; };
  const ro = ('ResizeObserver' in window) ? new ResizeObserver(entries => {
    entries.forEach(e => { const el = e.target; const w = Math.floor(e.contentRect.width); if (w && Math.abs(w - (el._w || 0)) > 2){ el._w = w; drawChart(el); } });
  }) : null;
  function drawChart(el){ const sp = L.spec(el.dataset.chart); if (!sp || !el.isConnected) return; try { sp.draw(el, el.dataset.big === '1'); } catch(err){ console.error(err); el.innerHTML = '<div class="empty">Chart failed to draw</div>'; } }
  L.mountCharts = root => root.querySelectorAll('[data-chart]').forEach(el => { el._w = Math.floor(el.clientWidth); drawChart(el); if (ro) ro.observe(el); });

  // Tick-box pills: which series a chart shows. Stored per chart, per device.
  const baseKey = key => key.split(':')[0];
  L.vis = (key, id) => !((UI.off[baseKey(key)] || []).includes(String(id)));
  L.pillsHtml = (key, items) => `<div class="pills" role="group" aria-label="Show or hide">${items.map(i => { const on = L.vis(key, i.id); return `<button class="pill ${on ? 'on' : ''}" style="--c:${i.color}" data-act="pill" data-key="${baseKey(key)}" data-id="${esc(i.id)}" aria-pressed="${on}"><span class="tk"></span>${esc(i.name)}</button>`; }).join('')}</div>`;
  L.chartCard = (key, o = {}) => {
    const sp = L.spec(key);
    return `<section class="card ${o.cls || ''}">
      <div class="card-head"><div><h2>${esc(o.title || sp.title)}</h2>${(o.sub || sp.sub) ? `<div class="sub">${o.sub || sp.sub}</div>` : ''}</div>
        <div class="actions">${o.actions || ''}<button class="icon-btn" data-act="expand" data-key="${key}" aria-label="Open larger with table">${L.icons.expand}</button></div></div>
      ${o.controls || ''}${sp.pills ? L.pillsHtml(key, sp.pills) : (sp.legend ? sp.legend(false) : '')}
      <div class="chart" data-chart="${key}"></div>
      ${sp.readout ? sp.readout() : ''}${o.after || ''}
    </section>`;
  };

  // ---------------- modal ----------------
  let builder = null, mounted = null;
  L.modal = {
    open(b){ builder = b; this.refresh(); $('modal').classList.add('on'); document.body.style.overflow = 'hidden'; },
    refresh(){
      if (!builder) return;
      const body = $('modal-body'), top = body.scrollTop;
      const m = builder();
      $('modal-sheet').className = 'sheet' + (m.narrow ? ' narrow' : '');
      $('modal-title').innerHTML = esc(m.title);
      $('modal-sub').innerHTML = m.sub || ''; $('modal-sub').style.display = m.sub ? '' : 'none';
      body.innerHTML = m.body;
      $('modal-foot').innerHTML = m.foot || ''; $('modal-foot').style.display = m.foot ? '' : 'none';
      L.mountCharts(body); body.scrollTop = top;
      mounted = m; if (m.onMount) m.onMount(body);
    },
    close(){ builder = null; mounted = null; $('modal').classList.remove('on'); document.body.style.overflow = ''; setTimeout(() => { if (!builder){ $('modal-body').innerHTML = ''; } }, 200); if (pending){ pending = false; L.render(); } if (L.reports) L.reports.afterRender(); },
    get isOpen(){ return !!builder; },
  };

  L.toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600); };

  // ---------------- generic collection editing ----------------
  // data-coll paths like "coverage.fundAdjustments" or "scenarios.#s12.items"
  L.coll = path => path.split('.').reduce((o, seg) => o == null ? o : (seg[0] === '#' ? o.find(x => x.id === seg.slice(1)) : o[seg]), L.S);

  L.acts = {
    tab(el){ UI.tab = el.dataset.tab; L.saveUI(); closeMenu(); L.render(); window.scrollTo({ top: 0 }); },
    menu(){ const s = $('side'); s.classList.toggle('open'); },
    toggleTheme(){ UI.theme = isDark() ? 'light' : 'dark'; L.saveUI(); applyTheme(); L.render(); if (L.modal.isOpen) L.modal.refresh(); },
    pill(el){
      const k = el.dataset.key, id = String(el.dataset.id), list = UI.off[k] = UI.off[k] || [];
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
      else { if (el.parentElement.querySelectorAll('.pill.on').length <= 1){ L.toast('Keep at least one showing'); return; } list.push(id); }
      L.saveUI(); L.render(); if (L.modal.isOpen) L.modal.refresh();
    },
    tick(el){ const ym = el.dataset.m, k = el.dataset.k; L.commit(s => { s.checklist = s.checklist || {}; const c = s.checklist[ym] = s.checklist[ym] || {}; c[k] = !c[k]; }); },
    reminder(){ downloadReminder(); },
    set(el){ const k = el.dataset.k; let v = el.dataset.v; if (/^-?\d+$/.test(v)) v = Number(v); if (v === 'true') v = true; if (v === 'false') v = false; UI[k] = v; L.saveUI(); L.render(); if (L.modal.isOpen) L.modal.refresh(); },
    toggleGroup(el){ const k = el.dataset.k; UI.collapsed[k] = !UI.collapsed[k]; L.saveUI(); el.closest('.group').classList.toggle('collapsed', !!UI.collapsed[k]); },
    expand(el){ L.openChart(el.dataset.key); },
    close(){ L.modal.close(); },
    add(el){
      const tpl = JSON.parse(el.dataset.tpl || '{}'); tpl.id = L.uid(el.dataset.p || 'x');
      L.commit(() => { L.coll(el.dataset.coll).push(tpl); }, { modal: L.modal.isOpen && el.closest('#modal') });
    },
    del(el){
      if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
      L.commit(() => { const a = L.coll(el.dataset.coll); const i = a.findIndex(x => x.id === el.dataset.id); if (i >= 0) a.splice(i, 1); }, { modal: L.modal.isOpen && el.closest('#modal') });
    },
    settings(){ openSettings(); },
    theme(el){ UI.theme = el.dataset.v; L.saveUI(); applyTheme(); L.render(); if (L.modal.isOpen) L.modal.refresh(); },
    lock(){ if (L.DEMO) L.exitDemo(); else L.store.lock(); },
    resetPreview(){ if (confirm('Reset the preview back to the spreadsheet data? Your preview edits will be lost.')) L.resetPreview(); },
    resetDemo(){ if (confirm('Reset the demo back to its original made-up data? Every change made in the demo on this browser will be lost.')) L.resetDemo(); },
    exitDemo(){ L.exitDemo(); },
    backup(){
      const blob = new Blob([JSON.stringify(L.S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ledger-backup-' + M.today() + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    importFile(){ $('import-input').click(); },
    changeToken(){ if (confirm('Forget this device\'s GitHub token and enter a new one?')){ L.store.clearPat(); location.reload(); } },
  };
  L.edits = {
    field(el){ // generic: data-coll + data-id + data-f + data-type
      const a = L.coll(el.dataset.coll); const item = el.dataset.id ? a.find(x => x.id === el.dataset.id) : a; if (!item) return;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.type === 'num') v = L.parseNum(v) ?? 0;
      L.commit(() => { item[el.dataset.f] = v; }, { modal: el.dataset.refresh === '1' });
    },
  };

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const fn = L.acts[el.dataset.act]; if (fn){ ev.preventDefault(); fn(el, ev); }
  });
  document.addEventListener('change', ev => {
    const el = ev.target.closest('[data-edit]'); if (!el) return;
    const fn = L.edits[el.dataset.edit]; if (fn) fn(el, ev);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape'){ if (L.modal.isOpen) L.modal.close(); else closeMenu(); }
    if (ev.key === 'Enter' && ev.target.matches('.inline-num, .inline-text, .edit-list .input')) ev.target.blur();
  });

  function closeMenu(){ const s = $('side'); if (s) s.classList.remove('open'); }
  L.closeMenu = closeMenu;

  // A recurring calendar event works on every phone with no server: 9am on the 1st, nudge again on the 3rd.
  function downloadReminder(){
    const now = new Date(), y = now.getFullYear(), m = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2, yy = m === 1 ? y + 1 : y;
    const d = `${yy}${String(m).padStart(2, '0')}01`, url = location.origin + location.pathname;
    const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Seligman Ledger//EN','BEGIN:VEVENT',
      'UID:ledger-monthly-checkin@seligman', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      `DTSTART:${d}T090000`, `DTEND:${d}T091500`, 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
      'SUMMARY:Ledger check-in: update account balances', `DESCRIPTION:Open the Seligman Ledger and log this month's balances: ${url}`, `URL:${url}`,
      'BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:Ledger check-in','END:VALARM',
      'BEGIN:VALARM','TRIGGER:P2D','ACTION:DISPLAY','DESCRIPTION:Ledger check-in still to do?','END:VALARM',
      'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'ledger-monthly-reminder.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    L.toast('Open the downloaded file to add the reminder to your calendar');
  }

  // ---------------- phone notifications ----------------
  // The device subscribes here; the subscription is saved (encrypted) in the ledger. A scheduled GitHub
  // Action (.github/workflows/reminders.yml) decrypts it and sends the reminder at 9am UK time.
  const VAPID_PUBLIC = 'BMbsd0OxaCI31bmYOBD8yF3KUwX3UPqKhV5QipwDPcJWepLOg_8Lq-U1gKAfj6Nz_NutHu5cQmMgWl9ksXzR5Eg';
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const pushCapable = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const deviceName = () => { const u = navigator.userAgent; const d = isIOS ? (/iPad/.test(u) || !/iPhone/.test(u) ? 'iPad' : 'iPhone') : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows PC' : 'Device'; return d + (standalone() ? ' (home-screen app)' : ''); };
  const push = L.push = { endpoint: null, ready: false };
  push.init = async () => {
    if (!pushCapable()) { push.ready = true; return; }
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      const sub = await reg.pushManager.getSubscription();
      push.endpoint = sub ? sub.endpoint : null;
      navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.type === 'checkin'){ UI.tab = 'overview'; L.saveUI(); L.render(); } });
    } catch(e){ console.warn('Service worker not registered', e); }
    push.ready = true;
    if (L.modal.isOpen) L.modal.refresh();
  };
  const pushHtml = () => {
    if (L.DEMO) return '<div class="small muted">Switched off in the demo. In the real app: a notification at 9am on the 1st of each month, then every day until that month\'s check-in is ticked off.</div>';
    const s = L.S, subs = s.push.subs, mine = push.endpoint && subs.some(x => x.endpoint === push.endpoint);
    const intro = '<div class="small muted" style="margin-bottom:10px">A notification at 9am on the 1st of each month, then every day at 9am until that month\'s check-in is ticked off.</div>';
    let ctl;
    if (!pushCapable()){
      ctl = isIOS && !standalone()
        ? '<div class="note box small">On iPhone, notifications only work in the home-screen app. In Safari tap <b>Share → Add to Home Screen</b>, open the Ledger from the new icon, then come back here.</div>'
        : `<div class="note box small">${window.isSecureContext ? 'This browser doesn\'t support web notifications.' : 'Notifications need the live app (https). They can\'t run in the local preview.'}</div>`;
    } else if (Notification.permission === 'denied'){
      ctl = `<div class="note box small">Notifications are blocked for this app. ${isIOS ? 'Turn them on in iPhone Settings → Notifications → Ledger' : 'Allow them in your browser\'s site settings'}, then come back here.</div>`;
    } else if (mine){
      ctl = `<div class="small" style="margin-bottom:8px"><span class="upd ok">✓ On for this device</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="pushTest">Show a test here</button><button class="btn" data-act="pushOff">Turn off on this device</button></div>`;
    } else {
      ctl = `<button class="btn primary" data-act="pushOn">${L.icons.bell.replace('<svg', '<svg width="16" height="16"')}Turn on notifications for this device</button>`;
    }
    const list = subs.length ? `<div class="rows" style="margin-top:12px">${subs.map(x => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="name small">${esc(x.device || 'Device')}${x.endpoint === push.endpoint ? ' <span class="muted">· this one</span>' : ''}<div class="tiny muted">Added ${M.dateLbl(x.added) || ''}</div></div><button class="btn sm" data-act="pushRemove" data-id="${esc(x.id)}">Remove</button></div>`).join('')}</div>` : '';
    return intro + ctl + list;
  };
  L.acts.pushOn = async () => {
    try {
      const perm = await Notification.requestPermission(); // must be the first await: iOS needs it inside the tap
      if (perm !== 'granted'){ L.toast('Notifications weren\'t allowed'); L.modal.refresh(); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
      const j = sub.toJSON(); push.endpoint = j.endpoint;
      L.commit(s => { s.push.subs = s.push.subs.filter(x => x.endpoint !== j.endpoint); s.push.subs.push({ id: L.uid('p'), endpoint: j.endpoint, keys: j.keys, device: deviceName(), added: M.today() }); }, { modal: true });
      L.toast('Notifications on for this device');
    } catch(e){ L.toast('Couldn\'t turn on notifications: ' + e.message); }
  };
  L.acts.pushOff = async () => {
    try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch(e){}
    const ep = push.endpoint; push.endpoint = null;
    L.commit(s => { s.push.subs = s.push.subs.filter(x => x.endpoint !== ep); }, { modal: true });
    L.toast('Notifications off for this device');
  };
  L.acts.pushRemove = el => { const x = L.S.push.subs.find(v => v.id === el.dataset.id); if (x && x.endpoint === push.endpoint) return L.acts.pushOff(); L.commit(s => { s.push.subs = s.push.subs.filter(v => v.id !== el.dataset.id); }, { modal: true }); };
  L.acts.pushTest = async () => {
    try { const reg = await navigator.serviceWorker.ready; await reg.showNotification('The Seligman Ledger', { body: 'Test: this is how the 9am check-in reminder will look.', icon: 'icon-192.png', tag: 'ledger-test' }); }
    catch(e){ L.toast('Couldn\'t show a test: ' + e.message); }
  };

  // ---------------- chart popup ----------------
  L.openChart = key => {
    L.modal.open(() => {
      const sp = L.spec(key);
      return {
        title: sp.title, sub: sp.sub,
        body: `${sp.controls ? `<div class="filters">${sp.controls()}</div>` : ''}${sp.pills ? L.pillsHtml(key, sp.pills) : (sp.legend ? sp.legend(true) : '')}
          <div class="chart" data-chart="${key}" data-big="1"></div>${sp.readout ? sp.readout() : ''}
          ${sp.table ? `<div class="section"><h3>As a table</h3>${sp.table()}</div>` : ''}${sp.notes ? `<div class="note box">${sp.notes()}</div>` : ''}`,
      };
    });
  };

  // ---------------- settings ----------------
  function openSettings(){
    L.modal.open(() => {
      const s = L.S;
      const themeSeg = [['dark','Dark'],['light','Light'],['system','Match device']].map(([v, n]) => `<button class="${UI.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${n}</button>`).join('');
      const years = M.years(s).map(y => `<option value="${y}" ${y === s.settings.planYear ? 'selected' : ''}>${y}</option>`).join('');
      return {
        title: 'Settings', narrow: true,
        body: `
          <div class="section"><h3>Look</h3><div class="seg">${themeSeg}</div></div>
          <div class="section"><h3>Phone notifications</h3>${pushHtml()}</div>
          <div class="section"><h3>Calendar reminder</h3><div class="small muted" style="margin-bottom:8px">Prefer your calendar? Adds a repeating event: 9am on the 1st of each month, with a nudge two days later.</div><button class="btn" data-act="reminder">${L.icons.bell.replace('<svg', '<svg width="16" height="16"')}Add to calendar</button></div>
          <div class="section"><h3>Planning year</h3>
            <div class="small muted" style="margin-bottom:8px">Drives months of cover, the plan line on Trends and the projection.</div>
            <select class="input" data-edit="field" data-coll="settings" data-f="planYear" data-type="num" data-refresh="1">${years}</select></div>
          <div class="section"><h3>Your data</h3>
            <div class="small muted" style="margin-bottom:10px">${L.DEMO ? 'Demo: made-up data. Changes stay in this browser until you reset it, and never reach GitHub.' : L.PREVIEW ? 'Preview mode: changes stay in this browser only and never reach GitHub.' : 'Encrypted with your PIN and saved to <code>ledger.json</code> in the GitHub repo. Every save is a commit, so nothing is ever lost.'}
              ${s.meta.updatedAt ? '<br>Last change: ' + new Date(s.meta.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}${s.meta.importedFrom ? '<br>Imported from: ' + esc(s.meta.importedFrom) : ''}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${L.LOCAL ? '' : '<button class="btn" data-act="versions">Versions…</button>'}
              <button class="btn" data-act="backup">Download backup</button>
              <button class="btn" data-act="importFile">Import a file…</button>
              ${L.PREVIEW ? '<button class="btn danger" data-act="resetPreview">Reset preview</button>' : ''}
              ${L.DEMO ? '<button class="btn danger" data-act="resetDemo">Reset demo data</button>' : ''}
            </div>
            <div class="note">The backup file is <b>not</b> encrypted — keep it somewhere private.</div></div>
          ${L.DEMO ? '<div class="section"><h3>Demo</h3><button class="btn" data-act="exitDemo">Exit demo</button></div>' : ''}
          ${L.LOCAL ? '' : `<div class="section"><h3>This device</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="lock">Lock now</button><button class="btn" data-act="changeToken">Change GitHub token</button></div></div>`}
          <div class="section note">The Seligman Ledger · v2 · data schema ${s.meta.schemaVersion}</div>`,
      };
    });
  }
  // ---------------- versions ----------------
  // Lists every save of ledger.json (newest first). Tap one to see what it held; restoring saves it as a
  // new version, so the current one stays in the list and a restore can itself be undone.
  const V = { list: [], page: 0, more: true, loading: false, error: null, open: null, picked: {} };
  const when = d => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  // Model results are memoised for L.S, so clear the cache either side of measuring another state.
  const statsOf = st => { M.invalidate(); const l = M.latest(st), nw = M.netWorth(st); M.invalidate(); return { nw, month: l && l.m, accounts: st.accounts.filter(a => !a.archived).length, lines: st.budget.lines.length, updated: st.meta.updatedAt }; };
  async function loadVersions(){
    if (V.loading || !V.more) return;
    V.loading = true; V.error = null; L.modal.refresh();
    try { const rows = await L.versions.list(V.page + 1); V.page++; V.list = V.list.concat(rows); V.more = rows.length === 30; }
    catch(e){ V.error = e.name === 'GhAuthError' ? 'GitHub rejected this device\'s token, so versions can\'t be listed.' : 'Couldn\'t reach GitHub. Check the connection and try again.'; }
    V.loading = false; L.modal.refresh();
  }
  function versionDetail(v, i){
    const p = V.picked[v.sha];
    if (!p || p.loading) return '<div class="ver-detail small muted">Opening…</div>';
    if (p.error) return `<div class="ver-detail small neg">${esc(p.error)}</div>`;
    const now = statsOf(L.S), then = p.stats, row = (k, a, b) => `<tr><td>${k}</td><td class="num">${a}</td><td class="num muted">${b}</td></tr>`;
    return `<div class="ver-detail">
      <table class="ver-compare small"><tr><th></th><th class="num">This version</th><th class="num">Now</th></tr>
        ${row('Net worth', gbp(then.nw), gbp(now.nw))}
        ${row('Latest check-in', then.month ? M.lbl(then.month) : '—', now.month ? M.lbl(now.month) : '—')}
        ${row('Accounts', then.accounts, now.accounts)}
        ${row('Budget lines', then.lines, now.lines)}</table>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        ${i === 0 ? '<span class="small muted">This is the version you\'re using now.</span>' : `<button class="btn primary sm" data-act="verRestore" data-sha="${v.sha}">Restore this version</button>`}
        <button class="btn sm" data-act="verDownload" data-sha="${v.sha}">Download it</button>
      </div></div>`;
  }
  function openVersions(){
    Object.assign(V, { list: [], page: 0, more: true, error: null, open: null, picked: {} });
    L.modal.open(() => {
      let day = '';
      const rows = V.list.map((v, i) => {
        const d = new Date(v.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const head = d !== day ? `<h4 class="ver-day">${esc(day = d)}</h4>` : '';
        const t = new Date(v.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const tag = i === 0 ? '<span class="ver-tag">Current</span>' : /^Restore/.test(v.message) ? '<span class="ver-tag muted">Restore</span>' : '';
        return `${head}<div class="ver-row${V.open === v.sha ? ' on' : ''}"><button class="ver-btn" data-act="verOpen" data-sha="${v.sha}"><span>${t}</span>${tag}<span class="ver-caret">${L.icons.caret}</span></button>${V.open === v.sha ? versionDetail(v, i) : ''}</div>`;
      }).join('');
      return {
        title: 'Versions', narrow: true,
        sub: 'Every save is kept. Tap one to compare it with now, then restore it if you need to.',
        body: `${rows}${V.error ? `<div class="note box">${esc(V.error)}</div>` : ''}
          ${V.loading ? '<div class="small muted" style="padding:12px 0">Loading…</div>' : V.more ? '<button class="btn block ghost" data-act="verMore" style="margin-top:10px">Show older</button>' : ''}
          <div class="note">Restoring saves the old version as a new one, so nothing is deleted and you can switch back. Phone notification settings are kept as they are now.</div>`,
        foot: '<button class="btn" data-act="settings">Back to settings</button>',
      };
    });
    loadVersions();
  }
  Object.assign(L.acts, {
    versions(){ openVersions(); },
    verMore(){ loadVersions(); },
    async verOpen(el){
      const sha = el.dataset.sha;
      V.open = V.open === sha ? null : sha; L.modal.refresh();
      if (!V.open || (V.picked[sha] && !V.picked[sha].retry)) return;
      V.picked[sha] = { loading: true }; L.modal.refresh();
      try { const st = await L.versions.load(sha); V.picked[sha] = { state: st, stats: statsOf(st) }; }
      catch(e){ V.picked[sha] = e.name === 'OperationError' ? { error: 'This version was saved with a different PIN, so it can\'t be opened here.' } : { error: 'Couldn\'t open this version. Close it and tap again to retry.', retry: true }; }
      L.modal.refresh();
    },
    verDownload(el){
      const p = V.picked[el.dataset.sha], v = V.list.find(x => x.sha === el.dataset.sha); if (!p || !p.state) return;
      const blob = new Blob([JSON.stringify(p.state, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ledger-version-' + v.date.slice(0, 16).replace(/[T:]/g, '-') + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    verRestore(el){
      const p = V.picked[el.dataset.sha], v = V.list.find(x => x.sha === el.dataset.sha); if (!p || !p.state) return;
      if (!confirm('Restore the version saved ' + when(v.date) + '?\n\nIt becomes the current version for both of you. Today\'s version stays in Versions, so you can switch back.')) return;
      const next = JSON.parse(JSON.stringify(p.state));
      next.push = L.S.push; // notification sign-ups belong to devices, not to a point in time
      next.meta.updatedAt = new Date().toISOString(); next.meta.restoredFrom = { sha: v.sha, date: v.date };
      L.S = L.normalise(next); M.invalidate();
      if (L.reports) L.reports.sync(L.S);
      L.store.queue(L.S, 'Restore ledger to version from ' + v.date);
      L.modal.close(); L.render(); L.toast('Restored the version from ' + when(v.date));
    },
  });

  $('import-input').addEventListener('change', async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const next = obj.meta && obj.meta.schemaVersion === 2 ? obj : L.migrateV1(obj);
      if (!confirm('Replace everything in the ledger with "' + f.name + '"?' + (L.LOCAL ? '' : ' (The current version stays in GitHub history.)'))) return;
      L.S = L.normalise(next); M.invalidate(); if (L.reports) L.reports.sync(L.S); L.store.queue(L.S); L.modal.close(); L.render(); L.toast('Imported ' + f.name);
    } catch(e){ alert('That file could not be read as ledger data.'); }
  });

  // ---------------- gates + boot ----------------
  const show = id => ['gate-connect','gate-pin','gate-demo','gate-msg','app'].forEach(g => $(g).classList.toggle('hidden', g !== id));
  function syncStatus(kind, msg){ const d = $('sync-dot'); if (!d) return; d.className = 'sync-dot ' + kind; $('sync-label').textContent = msg; }
  L.store.onStatus = syncStatus;
  L.store.onRemote = s => { L.S = s; M.invalidate(); if (L.reports && L.reports.sync(s)) L.store.queue(s); if (!editing() && !L.modal.isOpen) L.render(); else pending = true; };

  function buildShell(){
    $('settings-btn').innerHTML = L.icons.settings; $('modal-close').innerHTML = L.icons.close;
    $('menu-btn').innerHTML = L.icons.menu; $('side-close').innerHTML = L.icons.close;
    document.querySelector('.side').addEventListener('click', ev => { if (ev.target.closest('[data-act="logBalances"],[data-act="manageTags"],[data-act="quickOneOff"],[data-act="settings"],[data-act="monthlyReport"]')) closeMenu(); });
    if (L.PREVIEW) $('preview-bar').classList.remove('hidden');
    if (L.DEMO){
      $('preview-bar').innerHTML = `<div class="inner"><strong>Demo</strong><span>Made-up data, saved only in this browser.</span><span class="bar-actions"><button class="btn sm" data-act="resetDemo">Reset demo data</button><button class="btn sm" data-act="exitDemo">Exit demo</button></span></div>`;
      $('preview-bar').classList.remove('hidden');
    }
  }
  function enterApp(state){
    L.S = state; M.invalidate();
    if (location.hash === '#checkin'){ UI.tab = 'overview'; history.replaceState(null, '', location.pathname + location.search); }
    show('app'); buildShell(); push.init();
    if (L.LOCAL) syncStatus('preview', (L.DEMO ? 'Demo' : 'Preview') + ' · local only'); else syncStatus('saved', 'Synced');
    if (L.reports && L.reports.sync(L.S)) L.store.queue(L.S);
    L.render();
    if (!L.LOCAL){
      window.addEventListener('focus', () => L.store.pullIfChanged());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) L.store.pullIfChanged(); });
    }
  }

  async function unlock(){
    const pin = $('pin-input').value.trim(); if (!pin) return;
    $('pin-error').textContent = ''; $('pin-btn').disabled = true; $('pin-btn').textContent = 'Unlocking…';
    try {
      const res = await L.store.unlock(pin);
      if (!res.state){
        $('pin-error').textContent = 'No ledger data found in the repo yet.';
        $('first-run').classList.remove('hidden');
      } else {
        enterApp(res.state);
        if (res.migrated){ L.store.queue(L.S); L.toast('Upgraded your data to the new ledger'); }
      }
    } catch(e){
      if (e.name === 'GhAuthError'){ $('pin-error').innerHTML = 'GitHub rejected the token. <a href="#" data-act="changeToken">Use a different token</a>'; }
      else if (e.name === 'OperationError'){ $('pin-error').textContent = 'That PIN didn\'t unlock the data.'; }
      else { $('pin-error').textContent = 'Couldn\'t reach GitHub — check your connection. (' + e.message + ')'; }
    }
    $('pin-btn').disabled = false; $('pin-btn').textContent = 'Unlock';
  }

  L.boot = function(){
    if (L.PREVIEW){
      const s = L.loadPreview();
      if (!s){ $('gate-msg-text').innerHTML = 'Preview data wasn\'t found. Open this page from the project folder via the local preview server (see the project README).'; show('gate-msg'); return; }
      enterApp(s); return;
    }
    if (L.DEMO){ enterApp(L.loadDemo()); return; }
    // Demo login: a made-up ledger for showing the app to others. Not a security gate; the real
    // data still needs this device's GitHub token and the PIN.
    let back = 'gate-connect';
    document.querySelectorAll('[data-demo-open]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); back = a.closest('.gate').id; $('demo-error').textContent = ''; show('gate-demo'); $('demo-user').focus();
    }));
    $('demo-back').addEventListener('click', e => { e.preventDefault(); show(back); });
    const demoLogin = () => {
      const name = $('demo-user').value.trim().toLowerCase().replace(/\s+/g, ' ');
      if (name === 'test demo' && $('demo-pin').value.trim() === '123456') L.startDemo();
      else $('demo-error').textContent = 'That name and PIN don\'t match the demo login.';
    };
    $('demo-btn').addEventListener('click', demoLogin);
    ['demo-user', 'demo-pin'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') demoLogin(); }));
    $('pat-btn').addEventListener('click', () => {
      const v = $('pat-input').value.trim(); if (!v){ $('pat-error').textContent = 'Paste the token first.'; return; }
      L.store.setPat(v); show('gate-pin'); $('pin-input').focus();
    });
    $('pin-btn').addEventListener('click', unlock);
    $('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
    $('start-empty').addEventListener('click', async () => {
      const s = L.normalise({ meta: {}, budget: { years: [new Date().getFullYear()], groups: [{ id: 'g-income', name: 'Income' }], lines: [] } });
      try { await L.createInitial(s); enterApp(s); } catch(e){ $('pin-error').textContent = 'Couldn\'t create the data file: ' + e.message; }
    });
    if (L.store.pat){ show('gate-pin'); setTimeout(() => $('pin-input').focus(), 50); } else show('gate-connect');
  };

  // backdrop click closes
  $('modal').addEventListener('click', ev => { if (ev.target.id === 'modal') L.modal.close(); });
})();
