(function(){
  'use strict';

  // ================= CONFIG =================
  const REPO_OWNER = 'dseligman1';
  const REPO_NAME = 'seligman-ledger';
  const DATA_PATH = 'data.json';
  const GH_API = 'https://api.github.com';
  const PAT_KEY = 'ledger_pat';

  // ================= CRYPTO =================
  function bufToB64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function b64ToBuf(b64){ return Uint8Array.from(atob(b64), c=>c.charCodeAt(0)).buffer; }

  async function deriveKey(pin, saltBuf){
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt: saltBuf, iterations:210000, hash:'SHA-256' },
      keyMaterial, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
    );
  }
  async function encryptData(obj, pinVal){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pinVal, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(obj));
    const ciphertext = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, plaintext);
    return { v:1, salt: bufToB64(salt), iv: bufToB64(iv), data: bufToB64(ciphertext) };
  }
  async function decryptData(payload, pinVal){
    const salt = new Uint8Array(b64ToBuf(payload.salt));
    const iv = new Uint8Array(b64ToBuf(payload.iv));
    const key = await deriveKey(pinVal, salt);
    const ciphertext = b64ToBuf(payload.data);
    const plaintext = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  // ================= GITHUB SYNC =================
  function ghHeaders(){ return { Authorization: `Bearer ${pat}`, Accept:'application/vnd.github+json' }; }
  async function ghGetFile(){
    const res = await fetch(`${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_PATH}`, { headers: ghHeaders() });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403){ const e = new Error('auth'); e.name='GhAuthError'; throw e; }
    if (!res.ok) throw new Error('GitHub read failed: '+res.status);
    const json = await res.json();
    const content = JSON.parse(decodeURIComponent(escape(atob(json.content.replace(/\n/g,'')))));
    return { content, sha: json.sha };
  }
  async function ghPutFile(payload, sha){
    const body = {
      message: 'Update ledger data — ' + new Date().toISOString(),
      content: btoa(unescape(encodeURIComponent(JSON.stringify(payload)))),
    };
    if (sha) body.sha = sha;
    const res = await fetch(`${GH_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_PATH}`, {
      method:'PUT', headers: { ...ghHeaders(), 'Content-Type':'application/json' }, body: JSON.stringify(body)
    });
    if (res.status === 401 || res.status === 403){ const e = new Error('auth'); e.name='GhAuthError'; throw e; }
    if (!res.ok){ const t = await res.text(); throw new Error('GitHub write failed: '+res.status+' '+t); }
    return res.json();
  }

  // ================= STATE / GATE =================
  let pat = localStorage.getItem(PAT_KEY);
  let pin = null;
  let pendingPin = null;
  let currentSha = null;
  let state = null;
  let saveTimer = null;

  const $ = id => document.getElementById(id);

  function showConnectGate(){ $('gate-connect').style.display='flex'; $('gate-pin').style.display='none'; $('app-root').style.display='none'; }
  function showPinGate(){ $('gate-connect').style.display='none'; $('gate-pin').style.display='flex'; $('app-root').style.display='none'; }
  function enterApp(){
    $('gate-connect').style.display='none'; $('gate-pin').style.display='none'; $('app-root').style.display='block';
    ensureMonthRolled();
    initAppUI();
    window.addEventListener('focus', pullLatestIfChanged);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pullLatestIfChanged(); });
  }

  $('pat-save-btn').addEventListener('click', () => {
    const val = $('pat-input').value.trim();
    if (!val){ $('pat-error').textContent = 'Paste your token first.'; return; }
    pat = val;
    localStorage.setItem(PAT_KEY, pat);
    $('pat-error').textContent = '';
    showPinGate();
  });

  $('pin-unlock-btn').addEventListener('click', attemptUnlock);
  $('pin-input').addEventListener('keydown', e => { if (e.key==='Enter') attemptUnlock(); });

  async function attemptUnlock(){
    const val = $('pin-input').value;
    if (!val) return;
    $('pin-error').textContent = '';
    $('pin-unlock-btn').disabled = true;
    try {
      const remote = await ghGetFile();
      if (remote === null){
        pendingPin = val;
        $('first-run-choice').style.display = 'block';
        $('pin-unlock-btn').disabled = false;
        return;
      }
      const decoded = await decryptData(remote.content, val);
      state = decoded;
      currentSha = remote.sha;
      pin = val;
      setSyncStatus('saved');
      enterApp();
    } catch(e){
      if (e.name === 'GhAuthError'){
        $('pin-error').innerHTML = 'GitHub token was rejected. <a href="#" id="reconnect-link">Reconnect</a>.';
        $('reconnect-link').addEventListener('click', (ev) => { ev.preventDefault(); localStorage.removeItem(PAT_KEY); pat=null; showConnectGate(); });
      } else {
        $('pin-error').textContent = 'Incorrect PIN, or the data could not be read.';
      }
    }
    $('pin-unlock-btn').disabled = false;
  }

  $('start-empty-btn').addEventListener('click', async () => {
    state = defaultEmptyState();
    pin = pendingPin;
    await createInitialData();
  });
  $('start-import-btn').addEventListener('click', () => $('import-file-input').click());
  $('import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      state = JSON.parse(text);
      pin = pendingPin;
      await createInitialData();
    } catch(err){
      $('pin-error').textContent = 'That file did not look like valid JSON.';
    }
  });
  async function createInitialData(){
    try {
      const payload = await encryptData(state, pin);
      const result = await ghPutFile(payload, null);
      currentSha = result.content.sha;
      setSyncStatus('saved');
      enterApp();
    } catch(e){
      if (e.name === 'GhAuthError'){
        $('pin-error').innerHTML = 'GitHub rejected the write — your token likely doesn\'t have Contents: Read and write on this repo. <a href="#" id="reconnect-link-2">Reconnect with a new token</a>.';
        $('reconnect-link-2').addEventListener('click', (ev) => { ev.preventDefault(); localStorage.removeItem(PAT_KEY); pat=null; $('first-run-choice').style.display='none'; showConnectGate(); });
      } else {
        $('pin-error').textContent = 'Could not save to GitHub: ' + e.message;
      }
    }
  }

  function defaultEmptyState(){
    return {
      meta: { schemaVersion: 1 },
      accounts: [], illiquidAssets: [
        { id: uid(), name:'House Equity', kind:'house', balance:0, prevBalance:0 },
        { id: uid(), name:'Motorway Shares', kind:'shares', balance:0, prevBalance:0 },
      ],
      history: [], balancesAsOf: todayISO(), currentTrackedMonth: null,
      groups: [], categories: [], keyDates: [], futureItems: [], oneOffEvents: [],
      houseCats: [], furnishings: [], houseFundsTotal: 0,
    };
  }

  // start on load
  if (pat) showPinGate(); else showConnectGate();

  // ================= SAVE / SYNC =================
  function setSyncStatus(kind, msg){
    const dot = $('sync-dot'), label = $('sync-label');
    if (!dot) return;
    dot.className = 'sync-dot ' + kind;
    label.textContent = msg || ({ saving:'Saving…', saved:'Synced', error:'Sync error' })[kind] || kind;
  }
  function scheduleSave(){
    clearTimeout(saveTimer);
    setSyncStatus('saving');
    saveTimer = setTimeout(doSave, 1200);
  }
  async function doSave(){
    try {
      const latest = await ghGetFile();
      const payload = await encryptData(state, pin);
      const result = await ghPutFile(payload, latest ? latest.sha : currentSha);
      currentSha = result.content.sha;
      setSyncStatus('saved', 'Synced ' + new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
    } catch(e){
      setSyncStatus('error', e.name==='GhAuthError' ? 'Token rejected' : 'Sync error — will retry on next edit');
    }
  }
  async function pullLatestIfChanged(){
    if (!state || !pin) return;
    try {
      const remote = await ghGetFile();
      if (remote && remote.sha !== currentSha){
        state = await decryptData(remote.content, pin);
        currentSha = remote.sha;
        ensureMonthRolled();
        renderAll();
        setSyncStatus('saved', 'Updated with latest changes');
      }
    } catch(e){ /* keep local state silently */ }
  }

  const uid = () => 'id' + Math.random().toString(36).slice(2,10);
  const todayISO = () => new Date().toISOString().slice(0,10);
  const fmt = n => (n<0?'−':'') + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB');
  const fmtSigned = n => (n >= 0 ? '+' : '−') + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB');
  const fmtPct = n => (isFinite(n)?((n>=0?'+':'') + n.toFixed(1) + '%'):'—');

  // ================= APP UI (init once per unlock) =================
  function initAppUI(){
    const tooltip = $('tooltip');
    let tipHideTimer = null;
    function showTip(x, y, html, container){
      clearTimeout(tipHideTimer);
      const rect = container.getBoundingClientRect();
      const anchor = document.querySelector('.fs-overlay.open') || document.querySelector('.app');
      const anchorRect = anchor.getBoundingClientRect();
      tooltip.innerHTML = html;
      tooltip.style.left = (rect.left - anchorRect.left + x) + 'px';
      tooltip.style.top = (rect.top - anchorRect.top + y) + 'px';
      tooltip.style.opacity = '1';
    }
    function hideTip(){ tooltip.style.opacity = '0'; }
    function bindPointEvents(root, sel, tipFn){
      root.querySelectorAll(sel).forEach(pt => {
        pt.addEventListener('mouseenter', () => tipFn(pt));
        pt.addEventListener('mouseleave', hideTip);
        pt.addEventListener('click', (e) => { e.stopPropagation(); tipFn(pt); clearTimeout(tipHideTimer); tipHideTimer=setTimeout(hideTip,2500); });
      });
    }
    document.addEventListener('click', hideTip);

    // ---- tabs ----
    const tabs = document.querySelectorAll('nav.tabs button');
    function activateTab(name){
      tabs.forEach(b => { const on=b.dataset.tab===name; b.classList.toggle('active',on); b.setAttribute('aria-selected',on); });
      document.querySelectorAll('section.panel').forEach(p=>p.classList.remove('active'));
      $('panel-'+name).classList.add('active');
    }
    tabs.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

    // ================= DATA HELPERS =================
    function accountsSum(group){ return state.accounts.filter(a=>a.group===group).reduce((s,a)=>s+a.balance,0); }
    function accountsPrevSum(group){ return state.accounts.filter(a=>a.group===group).reduce((s,a)=>s+a.prevBalance,0); }
    function illiquid(kind){ return state.illiquidAssets.find(a=>a.kind===kind); }
    function currentNetWorth(){ return accountsSum('savings')+accountsSum('current')+(illiquid('shares')?.balance||0)+(illiquid('house')?.balance||0); }
    function assumedTotal(type){ return state.categories.filter(c=>{ const g=state.groups.find(g=>g.id===c.groupId); return g && g.type===type; }).reduce((s,c)=>s+c.amount,0); }
    function liquidDelta(){ return (accountsSum('savings')+accountsSum('current')) - (accountsPrevSum('savings')+accountsPrevSum('current')); }
    function computedNetSpend(){ return assumedTotal('income') - liquidDelta(); }
    const GROWTH_ACCOUNT_NAMES = ['Hargreaves Lansdown','Morgan Stanley','Nutmeg'];
    function growthAccountsDelta(){ return state.accounts.filter(a=>GROWTH_ACCOUNT_NAMES.includes(a.name)).reduce((s,a)=>s+(a.balance-a.prevBalance),0); }
    function allAccountsDelta(){ return state.accounts.reduce((s,a)=>s+(a.balance-a.prevBalance),0); }
    function controllableDelta(){ return allAccountsDelta() - growthAccountsDelta(); }
    function thisMonthOneOffs(){ const now=new Date(); return state.oneOffEvents.filter(e=>{ const d=new Date(e.date); return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth(); }); }

    function ensureMonthRolledLocal(){ /* placeholder, real one is module-level */ }

    function upsertCurrentMonthHistory(){
      const key = todayISO().slice(0,7);
      let entry = state.history.find(h=>h.month===key);
      if (!entry){ entry = { month:key }; state.history.push(entry); state.history.sort((a,b)=>a.month.localeCompare(b.month)); }
      entry.savings = accountsSum('savings');
      entry.current = accountsSum('current');
      entry.mwShares = illiquid('shares') ? illiquid('shares').balance : null;
      entry.houseEquity = illiquid('house') ? illiquid('house').balance : null;
    }

    function afterMutate(){ scheduleSave(); }

    // ================= HISTORY / SERIES =================
    function histIdxToday(){ return state.history.length - 1; }
    function histVal(key, i){ if (i<0 || i>=state.history.length) return null; const v = state.history[i][key]; return v===undefined?null:v; }
    function projectForward(key, months){
      const vals = state.history.map(h=>h[key]).filter(v=>v!=null && v!==undefined);
      if (vals.length < 2) return new Array(months).fill(null);
      const n = Math.min(6, vals.length-1);
      const avgDelta = (vals[vals.length-1]-vals[vals.length-1-n]) / n;
      const out = []; let last = vals[vals.length-1];
      for (let i=0;i<months;i++){ last += avgDelta; out.push(Math.round(last)); }
      return out;
    }
    const FORECAST_MONTHS = 12;
    let forecastCache = {};
    function rebuildForecastCache(){ forecastCache = { savings: projectForward('savings',FORECAST_MONTHS), current: projectForward('current',FORECAST_MONTHS), mwShares: projectForward('mwShares',FORECAST_MONTHS), houseEquity: projectForward('houseEquity',FORECAST_MONTHS) }; }
    function timelineLength(){ return state.history.length + FORECAST_MONTHS; }
    function timelineMeta(i){
      if (i < state.history.length){
        const [y,m] = state.history[i].month.split('-').map(Number);
        return { y, m: m-1, key: state.history[i].month, isForecast:false };
      }
      const lastReal = state.history.length ? state.history[state.history.length-1].month : todayISO().slice(0,7);
      const [y0,m0] = lastReal.split('-').map(Number);
      const d = new Date(y0, m0-1 + (i-state.history.length+1), 1);
      return { y: d.getFullYear(), m: d.getMonth(), key: d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'), isForecast:true };
    }
    function rawVal(key, i){
      if (i < state.history.length) return histVal(key, i);
      const fIdx = i - state.history.length;
      return forecastCache[key] ? (forecastCache[key][fIdx] ?? null) : null;
    }
    function totalAt(i){ const s=rawVal('savings',i), c=rawVal('current',i), mw=rawVal('mwShares',i), h=rawVal('houseEquity',i); if ([s,c,mw,h].some(v=>v==null)) return null; return s+c+mw+h; }
    function exMWAt(i){ const t=totalAt(i), mw=rawVal('mwShares',i); return (t==null||mw==null)?null:t-mw; }
    function exHouseAt(i){ const t=totalAt(i), h=rawVal('houseEquity',i); return (t==null||h==null)?null:t-h; }
    function exBothAt(i){ const t=totalAt(i), mw=rawVal('mwShares',i), h=rawVal('houseEquity',i); return (t==null||mw==null||h==null)?null:t-mw-h; }

    const SERIES_DEFS = [
      { key:'savings', label:'Savings', color:'var(--cat-1)', fn:i=>rawVal('savings',i) },
      { key:'current', label:'Current Accounts', color:'var(--cat-2)', fn:i=>rawVal('current',i) },
      { key:'total', label:'Total Net Worth', color:'var(--cat-3)', fn:totalAt },
      { key:'exmw', label:'NW ex. MW Shares', color:'var(--cat-4)', fn:exMWAt },
      { key:'exhouse', label:'NW ex. House Equity', color:'var(--cat-5)', fn:exHouseAt },
      { key:'exboth', label:'NW ex. House & Shares', color:'var(--cat-6)', fn:exBothAt },
    ];

    // ================= DASHBOARD HERO =================
    function renderHero(){
      rebuildForecastCache();
      const lastRealIdx = histIdxToday();
      const nw = currentNetWorth();
      const prevNw = lastRealIdx>=1 ? totalAt(lastRealIdx-1) : null;
      const nwDelta = prevNw==null ? 0 : nw - prevNw;
      $('nw-value').textContent = fmt(nw);
      $('nw-delta').innerHTML = prevNw==null ? '<span style="color:var(--ink-muted)">No prior month yet</span>' : `<span class="${nwDelta>=0?'arrow-up':'arrow-down'}">${nwDelta>=0?'▲':'▼'}</span> ${fmt(Math.abs(nwDelta))} this month`;

      const assumedOut = assumedTotal('outgoing');
      const assumedInc = assumedTotal('income');
      const netSpend = computedNetSpend();
      const diff = netSpend - assumedOut;
      $('spend-value').textContent = fmt(netSpend);
      let spendHtml = `<span style="color:${diff<=0?'var(--success-text)':'var(--critical)'}">${diff<=0?'▼':'▲'} ${fmt(Math.abs(diff))} vs ${fmt(assumedOut)} assumed</span>`;
      if (assumedOut > 0){
        const asOf = new Date(state.balancesAsOf);
        const dayOfMonth = asOf.getDate();
        const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth()+1, 0).getDate();
        const expectedToDate = assumedOut * (dayOfMonth/daysInMonth);
        spendHtml += `<div class="stat-caption">Pace: day ${dayOfMonth}/${daysInMonth} — expected ~${fmt(expectedToDate)} by now</div>`;
      }
      $('spend-delta').innerHTML = spendHtml;

      const onTrack = assumedOut===0 || diff <= assumedOut*0.03;
      const chip = $('status-chip');
      chip.className = 'chip ' + (onTrack ? 'good' : 'warn');
      chip.innerHTML = `<span class="dot"></span> ${onTrack ? 'On track' : 'Running hot'} — net spend is ${assumedOut? fmtPct((diff/assumedOut)*100) : '—'} vs assumptions this month`;

      const ctrl = controllableDelta();
      const growth = growthAccountsDelta();
      $('controllable-value').textContent = fmtSigned(ctrl);
      $('controllable-caption').textContent = `Market-driven accounts moved ${fmtSigned(growth)} separately — that part isn't something monthly spending controls`;

      const offs = thisMonthOneOffs();
      let oneOffSentence = '';
      if (offs.length) oneOffSentence = ' This includes ' + offs.map(o=>`a one-off (${o.desc}: ${fmtSigned(o.amount)})`).join(' and ') + ' — excluding that, the picture looks steadier than the headline number suggests.';

      $('narrative-text').innerHTML = state.history.length < 2
        ? `Add at least two months of balances to start seeing trend commentary here. Assumed income is <strong>${fmt(assumedInc)}</strong> against <strong>${fmt(assumedOut)}</strong> of planned outgoings.`
        : `Net worth ${nwDelta>=0?'rose':'fell'} <strong>${fmt(Math.abs(nwDelta))}</strong> this month. Assumed income is <strong>${fmt(assumedInc)}</strong> against <strong>${fmt(assumedOut)}</strong> of planned outgoings — net spend works out to <strong>${fmt(netSpend)}</strong>, ${diff<=0?`<strong>${fmt(Math.abs(diff))} under</strong> plan`:`<strong>${fmt(diff)} over</strong> plan`}. Stripping out HL, Morgan Stanley and Nutmeg (which move with markets, not spending), your controllable accounts moved <strong>${fmtSigned(ctrl)}</strong>.${oneOffSentence}`;
    }
    $('tile-networth').addEventListener('click', () => { setExploreSeries(['total']); scrollToExplore(); });
    $('tile-controllable').addEventListener('click', () => { setExploreSeries(['exboth']); scrollToExplore(); });
    function scrollToExplore(){ $('explore-panel').scrollIntoView({behavior:'smooth', block:'start'}); }
    $('balances-asof').addEventListener('change', (e) => { state.balancesAsOf = e.target.value; renderHero(); afterMutate(); });

    // ---- one-off events ----
    $('add-oneoff-btn').addEventListener('click', () => { const f=$('add-oneoff-form'); f.style.display = f.style.display==='none'?'flex':'none'; });
    $('confirm-add-oneoff').addEventListener('click', () => {
      const date = $('new-oneoff-date').value, desc = $('new-oneoff-desc').value, amount = +$('new-oneoff-amount').value;
      if (!date || !desc || !amount) return;
      state.oneOffEvents.push({ id: uid(), date, desc, amount });
      $('new-oneoff-date').value=''; $('new-oneoff-desc').value=''; $('new-oneoff-amount').value='';
      $('add-oneoff-form').style.display='none';
      renderOneOffs(); renderHero(); afterMutate();
    });
    function renderOneOffs(){
      const list = $('oneoff-list');
      const sorted = [...state.oneOffEvents].sort((a,b)=>b.date.localeCompare(a.date));
      list.innerHTML = sorted.map(e => `
        <div class="oneoff-row">
          <div class="future-date">${new Date(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}</div>
          <div class="future-desc">${e.desc}</div>
          <div class="future-amt ${e.amount>=0?'pos':''}">${fmtSigned(e.amount)}</div>
          <button class="icon-btn" data-remove-oneoff="${e.id}">✕</button>
        </div>`).join('') || '<div class="sub">Nothing logged</div>';
      list.querySelectorAll('[data-remove-oneoff]').forEach(btn => btn.addEventListener('click', () => { state.oneOffEvents = state.oneOffEvents.filter(x=>x.id!==btn.dataset.removeOneoff); renderOneOffs(); renderHero(); afterMutate(); }));
    }

    // ================= EXPLORE PANEL =================
    let exploreState = { range:'1y', forecast:false, compare:false, series:['total'], trend:'mom' };
    function rangeOpts(){ const len = state.history.length; return [ ['6m','6M',Math.min(6,len)], ['1y','1Y',Math.min(12,len)], ['3y','3Y',Math.min(36,len)], ['all','All',len] ]; }

    function buildRangeButtons(){
      const el = $('range-buttons'); el.innerHTML = '';
      rangeOpts().forEach(([key,label]) => {
        const b = document.createElement('button');
        b.className = 'seg-btn'+(exploreState.range===key?' active':'');
        b.textContent = label;
        b.addEventListener('click', () => { exploreState.range = key; renderExplore(); });
        el.appendChild(b);
      });
    }
    function buildSeriesToggles(){
      const el = $('series-toggles'); el.innerHTML = '';
      SERIES_DEFS.forEach(s => {
        const b = document.createElement('button');
        const on = exploreState.series.includes(s.key);
        b.className = 'toggle-chip'+(on?' on':'');
        b.innerHTML = `<span class="sw" style="background:${on?s.color:'var(--border-strong)'}"></span>${s.label}`;
        b.addEventListener('click', () => {
          if (exploreState.compare) exploreState.series = [s.key];
          else { if (on) exploreState.series = exploreState.series.filter(k=>k!==s.key); else exploreState.series.push(s.key); }
          renderExplore();
        });
        el.appendChild(b);
      });
    }
    function setExploreSeries(keys){ exploreState.series = keys; renderExplore(); }
    const TREND_OPTS = [ ['mom','MoM'], ['yoy','YoY'], ['t6m','Trailing 6M'], ['seasonal','Seasonal'] ];
    function buildTrendButtons(){
      const el = $('trend-buttons'); el.innerHTML = '';
      TREND_OPTS.forEach(([key,label]) => {
        const b = document.createElement('button');
        b.className = 'seg-btn'+(exploreState.trend===key?' active':'');
        b.textContent = label;
        b.addEventListener('click', () => { exploreState.trend = key; renderExplore(); });
        el.appendChild(b);
      });
    }
    $('forecast-toggle').addEventListener('click', (e) => { exploreState.forecast=!exploreState.forecast; e.target.classList.toggle('on',exploreState.forecast); renderExplore(); });
    $('compare-toggle').addEventListener('click', (e) => {
      exploreState.compare = !exploreState.compare;
      e.target.classList.toggle('on', exploreState.compare);
      if (exploreState.compare && exploreState.series.length!==1) exploreState.series = [exploreState.series[0]||'total'];
      $('trend-row').style.display = exploreState.compare ? 'none' : '';
      $('trend-readout').style.display = exploreState.compare ? 'none' : '';
      renderExplore();
    });
    $('explore-table-toggle').addEventListener('click', (e) => {
      const chart=$('chart-explore'), table=$('table-explore');
      const showing = table.style.display!=='none';
      table.style.display = showing?'none':'block'; chart.style.display = showing?'block':'none';
      e.target.textContent = showing?'View as table':'View as chart';
    });
    $('explore-expand-btn').addEventListener('click', () => { $('fs-overlay').classList.add('open'); renderExploreChart('chart-fullscreen','fs-legend',900,460,true); });
    $('fs-close').addEventListener('click', () => $('fs-overlay').classList.remove('open'));

    function trendFor(series, mode){
      const f = series.fn, today = histIdxToday();
      if (today < 0) return { label:mode, value:'—', pct:'no data yet' };
      if (mode==='mom'){ const a=f(today), b=f(today-1); if (a==null||b==null) return {label:'MoM',value:'—',pct:'not enough history'}; return { label:'MoM', value: fmtSigned(a-b), pct: fmtPct(((a-b)/Math.abs(b))*100) }; }
      if (mode==='yoy'){ const a=f(today), b=f(today-12); if (a==null||b==null) return {label:'YoY',value:'—',pct:'not enough history'}; return { label:'YoY', value: fmtSigned(a-b), pct: fmtPct(((a-b)/Math.abs(b))*100) }; }
      if (mode==='t6m'){ const a=f(today), b=f(today-6); if (a==null||b==null) return {label:'Trailing 6M',value:'—',pct:'not enough history'}; return { label:'Trailing 6M', value: fmtSigned(a-b), pct: fmt((a-b)/6)+'/mo avg' }; }
      if (mode==='seasonal'){
        let summer=[], winter=[];
        for (let i=1;i<=today;i++){ const meta=timelineMeta(i), a=f(i), b=f(i-1); if (a==null||b==null) continue; const delta=a-b;
          if ([5,6,7].includes(meta.m)) summer.push(delta);
          if ([11,0,1].includes(meta.m)) winter.push(delta); }
        const avg = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;
        const sAvg = avg(summer), wAvg = avg(winter);
        return { label:'Seasonal', value: sAvg==null?'—':`Summer ${fmtSigned(sAvg)}/mo`, pct: wAvg==null?'not enough history':`Winter ${fmtSigned(wAvg)}/mo` };
      }
    }
    function renderTrendReadout(){
      const el = $('trend-readout');
      if (exploreState.compare){ el.innerHTML=''; return; }
      el.innerHTML = '';
      exploreState.series.forEach(key => {
        const s = SERIES_DEFS.find(d=>d.key===key), t = trendFor(s, exploreState.trend);
        const div = document.createElement('div'); div.className='trend-stat';
        div.innerHTML = `<div class="t-label"><span class="t-sw" style="background:${s.color}"></span>${s.label} · ${t.label}</div><div class="t-value">${t.value}</div><div class="t-value" style="color:var(--ink-muted); font-size:11px;">${t.pct}</div>`;
        el.appendChild(div);
      });
      if (!exploreState.series.length) el.innerHTML = '<div style="font-size:12px;color:var(--ink-muted);">Pick at least one series above</div>';
    }

    function renderExploreChart(containerId, legendId, w, h, isFullscreen){
      const container = $(containerId);
      if (state.history.length === 0){ container.innerHTML = '<div class="sub">No history yet — update your account balances to start building this chart.</div>'; $(legendId).innerHTML=''; return; }
      if (exploreState.compare){ renderCompareChart(container, legendId, w, h); return; }
      const padL=50, padR=10, padT=12, padB=24;
      const today = histIdxToday();
      const rangeCount = rangeOpts().find(r=>r[0]===exploreState.range)[2] || state.history.length;
      let startIdx = Math.max(0, today - rangeCount + 1);
      let endIdx = exploreState.forecast ? timelineLength()-1 : today;
      const idxs = []; for (let i=startIdx;i<=endIdx;i++) idxs.push(i);

      const activeSeries = SERIES_DEFS.filter(s => exploreState.series.includes(s.key));
      let allVals = [];
      activeSeries.forEach(s => idxs.forEach(i => { const v=s.fn(i); if (v!=null) allVals.push(v); }));
      if (!allVals.length) allVals=[0,1];
      const minV = Math.min(...allVals)*0.98, maxV = Math.max(...allVals)*1.02;
      const x = i => padL + ((idxs.indexOf(i))/Math.max(idxs.length-1,1))*(w-padL-padR);
      const y = v => padT + (1-(v-minV)/(maxV-minV||1))*(h-padT-padB);

      let gridSvg = '';
      for (let g=0; g<=4; g++){ const gy=padT+(g/4)*(h-padT-padB), val=maxV-(g/4)*(maxV-minV);
        gridSvg += `<line class="grid-line" x1="${padL}" x2="${w-padR}" y1="${gy}" y2="${gy}"/><text x="${padL-6}" y="${gy+3}" font-size="9.5" text-anchor="end">£${Math.round(val/1000)}k</text>`; }
      const tickEvery = Math.max(1, Math.ceil(idxs.length/8));
      let xLabels = idxs.map((i,pos) => { if (pos%tickEvery!==0) return ''; const meta=timelineMeta(i); return `<text x="${x(i).toFixed(1)}" y="${h-6}" font-size="9" text-anchor="middle">${MONTH_NAMES[meta.m]}${meta.m===0?" '"+String(meta.y).slice(2):''}</text>`; }).join('');

      let paths='', dots='';
      activeSeries.forEach(s => {
        function segPath(list){ const pts = list.filter(i=>s.fn(i)!=null); if (!pts.length) return ''; return pts.map((i,k)=>(k===0?'M':'L')+x(i).toFixed(1)+','+y(s.fn(i)).toFixed(1)).join(' '); }
        const actualIdxs = idxs.filter(i=>i<=today);
        const forecastIdxs = idxs.filter(i=>i>=today);
        const ap = segPath(actualIdxs); if (ap) paths += `<path d="${ap}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (exploreState.forecast && forecastIdxs.length>1){ const fp = segPath(forecastIdxs); if (fp) paths += `<path d="${fp}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round"/>`; }
        const denom = isFullscreen?40:24;
        idxs.forEach(i => { const v=s.fn(i); if (v==null) return; if (i%Math.max(1,Math.ceil(idxs.length/denom))===0 || i===today){ dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${isFullscreen?3.6:2.6}" fill="${s.color}" class="ex-pt" data-k="${s.key}" data-i="${i}" style="cursor:pointer"/>`; } });
      });

      container.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}" id="${containerId}-svg">${gridSvg}${paths}${dots}${xLabels}</svg>`;
      bindPointEvents(container, '.ex-pt', (pt) => { const s=SERIES_DEFS.find(d=>d.key===pt.dataset.k), i=+pt.dataset.i, meta=timelineMeta(i); showTip(+pt.getAttribute('cx'), +pt.getAttribute('cy'), `${s.label} · ${MONTH_NAMES[meta.m]} ${meta.y}: ${fmt(s.fn(i))}`, container); });
      $(legendId).innerHTML = activeSeries.map(s=>`<div class="item"><span class="line-swatch" style="background:${s.color}"></span>${s.label}</div>`).join('') || '<div style="font-size:12px;color:var(--ink-muted);">No series selected</div>';

      if (!isFullscreen){
        let rows = idxs.map(i => { const meta=timelineMeta(i); return `<tr><td>${MONTH_NAMES[meta.m]} ${meta.y}</td>${activeSeries.map(s=>{ const v=s.fn(i); return `<td>${v==null?'—':fmt(v)}</td>`; }).join('')}</tr>`; }).join('');
        $('table-explore').innerHTML = `<table class="dv"><tr><th>Month</th>${activeSeries.map(s=>`<th>${s.label}</th>`).join('')}</tr>${rows}</table>`;
      }
    }

    function renderCompareChart(container, legendId, w, h){
      const padL=50, padR=10, padT=12, padB=24;
      const s = SERIES_DEFS.find(d=>d.key===exploreState.series[0]) || SERIES_DEFS[2];
      const now = new Date();
      function idxForCalMonth(year, m){ const len=timelineLength(); for (let i=0;i<len;i++){ const meta=timelineMeta(i); if (meta.y===year && meta.m===m) return i; } return -1; }
      const lastYearVals = MONTH_NAMES.map((_,m)=>{ const idx=idxForCalMonth(now.getFullYear()-1,m); return idx===-1?null:s.fn(idx); });
      const thisYearVals = MONTH_NAMES.map((_,m)=>{ const idx=idxForCalMonth(now.getFullYear(),m); return idx===-1?null:s.fn(idx); });
      const allVals = lastYearVals.concat(thisYearVals).filter(v=>v!=null);
      if (!allVals.length){ container.innerHTML = '<div class="sub">Not enough history yet to compare years.</div>'; $(legendId).innerHTML=''; return; }
      const minV=Math.min(...allVals)*0.98, maxV=Math.max(...allVals)*1.02;
      const x = m => padL + (m/11)*(w-padL-padR);
      const y = v => padT + (1-(v-minV)/(maxV-minV||1))*(h-padT-padB);
      let gridSvg=''; for (let g=0; g<=4; g++){ const gy=padT+(g/4)*(h-padT-padB), val=maxV-(g/4)*(maxV-minV); gridSvg += `<line class="grid-line" x1="${padL}" x2="${w-padR}" y1="${gy}" y2="${gy}"/><text x="${padL-6}" y="${gy+3}" font-size="9.5" text-anchor="end">£${Math.round(val/1000)}k</text>`; }
      let xLabels = MONTH_NAMES.map((lbl,m)=>`<text x="${x(m).toFixed(1)}" y="${h-6}" font-size="9" text-anchor="middle">${lbl}</text>`).join('');
      function pathFor(vals, upTo){ const pts=[]; for (let m=0;m<=upTo;m++) if (vals[m]!=null) pts.push([m,vals[m]]); return pts.map(([m,v],k)=>(k===0?'M':'L')+x(m).toFixed(1)+','+y(v).toFixed(1)).join(' '); }
      const curM = now.getMonth();
      const lastYearPath = pathFor(lastYearVals,11);
      const thisYearActualPath = pathFor(thisYearVals,curM);
      let thisYearForecastPath = '';
      if (curM<11){ const pts=[]; if (thisYearVals[curM]!=null) pts.push([curM,thisYearVals[curM]]); for (let m=curM+1;m<=11;m++) if (thisYearVals[m]!=null) pts.push([m,thisYearVals[m]]); thisYearForecastPath = pts.map(([m,v],k)=>(k===0?'M':'L')+x(m).toFixed(1)+','+y(v).toFixed(1)).join(' '); }
      let dots='';
      lastYearVals.forEach((v,m)=>{ if (v!=null) dots += `<circle cx="${x(m).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.8" fill="var(--ink-muted)" class="cmp-pt" data-label="Last year, ${MONTH_NAMES[m]}" data-v="${v}" style="cursor:pointer"/>`; });
      thisYearVals.forEach((v,m)=>{ if (v!=null) dots += `<circle cx="${x(m).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}" class="cmp-pt" data-label="${m<=curM?'This year':'Forecast'}, ${MONTH_NAMES[m]}" data-v="${v}" style="cursor:pointer"/>`; });
      container.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}">${gridSvg}
        <path d="${lastYearPath}" fill="none" stroke="var(--ink-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${thisYearActualPath}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${thisYearForecastPath}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round"/>
        ${dots}${xLabels}</svg>`;
      bindPointEvents(container, '.cmp-pt', (pt) => showTip(+pt.getAttribute('cx'), +pt.getAttribute('cy'), `${pt.dataset.label}: ${fmt(+pt.dataset.v)}`, container));
      $(legendId).innerHTML = `<div class="item"><span class="line-swatch" style="background:var(--ink-muted)"></span>Last year</div><div class="item"><span class="line-swatch" style="background:${s.color}"></span>This year</div><div class="item"><span class="dashed"></span>Forecast (trend projection)</div><div class="item" style="color:var(--ink-muted)">Showing: ${s.label}</div>`;
    }

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function renderExplore(){
      buildRangeButtons(); buildSeriesToggles(); buildTrendButtons(); renderTrendReadout();
      $('series-row').style.opacity = exploreState.compare?'0.6':'1';
      renderExploreChart('chart-explore','explore-legend',680,240,false);
      if ($('fs-overlay').classList.contains('open')) renderExploreChart('chart-fullscreen','fs-legend',900,460,true);
    }

    // ================= ACCOUNTS TAB =================
    function groupCardHeader(id, title, subLabel, total, collapsed){
      return `<div class="group-card-head" data-toggle="${id}">
        <div class="group-card-title"><span class="chevron${collapsed?'':' open'}">▶</span>${title}${subLabel?`<span class="sub-label">${subLabel}</span>`:''}</div>
        <div class="group-card-total">${total}</div></div>`;
    }
    let accountGroupsUI = { savings:{collapsed:false}, current:{collapsed:false} };

    function commitBalanceEdit(){
      ensureMonthRolled();
      upsertCurrentMonthHistory();
    }

    function renderAccounts(){
      const container = $('accounts-groups'); container.innerHTML='';
      [['savings','Savings & Investments'],['current','Current Accounts']].forEach(([groupKey,groupLabel]) => {
        const ui = accountGroupsUI[groupKey];
        const box = document.createElement('div'); box.className='group-card';
        box.innerHTML = groupCardHeader('acct-'+groupKey, groupLabel, `${state.accounts.filter(a=>a.group===groupKey).length} accounts`, fmt(accountsSum(groupKey)), ui.collapsed);
        const body = document.createElement('div'); body.className='group-card-body'+(ui.collapsed?'':' open');
        state.accounts.filter(a=>a.group===groupKey).forEach(a => {
          const delta = a.balance - a.prevBalance;
          const row = document.createElement('div'); row.className='row-flex';
          row.innerHTML = `
            <div style="flex:1 1 100px;"><div style="font-size:13.5px;font-weight:600;">${a.name}</div><div style="font-size:11px;color:var(--ink-muted);">${a.institution}</div></div>
            <input class="inline-input num" type="number" value="${a.balance}" data-acct-id="${a.id}">
            <div style="font-size:11px; width:100%; text-align:right; color:${delta>=0?'var(--success-text)':'var(--critical)'};">${delta>=0?'▲':'▼'} ${fmt(Math.abs(delta))} vs last</div>
            <button class="icon-btn" data-remove="${a.id}" title="Remove">✕</button>`;
          body.appendChild(row);
        });
        const addRow = document.createElement('div'); addRow.className='add-row';
        addRow.innerHTML = `<input type="text" placeholder="Account name" class="new-acct-name" data-group="${groupKey}"><input type="text" placeholder="Institution" class="new-acct-inst" data-group="${groupKey}"><input type="number" placeholder="Balance" class="new-acct-bal" data-group="${groupKey}"><button class="ghost-btn add-acct-btn" data-group="${groupKey}">+ Add</button>`;
        body.appendChild(addRow); box.appendChild(body); container.appendChild(box);
        box.querySelector('[data-toggle]').addEventListener('click', () => { ui.collapsed=!ui.collapsed; renderAccounts(); });
      });
      container.querySelectorAll('[data-acct-id]').forEach(inp => inp.addEventListener('change', () => {
        const acc = state.accounts.find(a=>a.id===inp.dataset.acctId); const val=+inp.value;
        if (!isNaN(val)){ ensureMonthRolled(); acc.balance = val; upsertCurrentMonthHistory(); }
        renderAccounts(); renderHero(); renderExplore(); renderFuture(); renderRunway(); afterMutate();
      }));
      container.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => { state.accounts = state.accounts.filter(a=>a.id!==btn.dataset.remove); renderAccounts(); renderHero(); renderExplore(); afterMutate(); }));
      container.querySelectorAll('.add-acct-btn').forEach(btn => btn.addEventListener('click', () => {
        const g = btn.dataset.group;
        const nameEl = container.querySelector(`.new-acct-name[data-group="${g}"]`), instEl = container.querySelector(`.new-acct-inst[data-group="${g}"]`), balEl = container.querySelector(`.new-acct-bal[data-group="${g}"]`);
        if (!nameEl.value) return;
        state.accounts.push({ id: uid(), name:nameEl.value, institution:instEl.value||'—', group:g, balance:+balEl.value||0, prevBalance:+balEl.value||0 });
        upsertCurrentMonthHistory();
        renderAccounts(); renderHero(); renderExplore(); afterMutate();
      }));
    }

    function renderIlliquid(){
      const el = $('illiquid-list');
      el.innerHTML = state.illiquidAssets.map(a => {
        const delta = a.balance - a.prevBalance;
        return `<div class="row-flex">
          <div style="flex:1 1 100px;"><div style="font-size:13.5px;font-weight:600;">${a.name}</div></div>
          <input class="inline-input num" type="number" value="${a.balance}" data-illiq-id="${a.id}">
          <div style="font-size:11px; width:100%; text-align:right; color:${delta>=0?'var(--success-text)':'var(--critical)'};">${delta>=0?'▲':'▼'} ${fmt(Math.abs(delta))} vs last</div>
        </div>`;
      }).join('');
      el.querySelectorAll('[data-illiq-id]').forEach(inp => inp.addEventListener('change', () => {
        const a = state.illiquidAssets.find(x=>x.id===inp.dataset.illiqId); const val=+inp.value;
        if (!isNaN(val)){ ensureMonthRolled(); a.balance = val; upsertCurrentMonthHistory(); }
        renderIlliquid(); renderHero(); renderExplore(); afterMutate();
      }));
    }

    // ================= ASSUMPTIONS TAB =================
    function renderAssumptions(){
      const inc = assumedTotal('income'), out = assumedTotal('outgoing');
      $('assum-income-total').textContent = fmt(inc); $('assum-outgoing-total').textContent = fmt(out);
      const netEl = $('assum-net-total'); netEl.textContent = fmtSigned(inc-out); netEl.style.color = (inc-out)>=0?'var(--success-text)':'var(--critical)';

      const container = $('assumptions-groups'); container.innerHTML='';
      state.groups.forEach(g => {
        const cats = state.categories.filter(c=>c.groupId===g.id);
        const total = cats.reduce((s,c)=>s+c.amount,0);
        const box = document.createElement('div'); box.className='group-card';
        box.innerHTML = groupCardHeader('g-'+g.id, g.name, `${g.type} · ${cats.length}`, fmt(total)+'/mo', g.collapsed);
        const body = document.createElement('div'); body.className='group-card-body'+(g.collapsed?'':' open');
        body.innerHTML = `<div style="display:flex; justify-content:flex-end; padding-top:8px;"><button class="icon-btn" data-remove-group="${g.id}">Remove group ✕</button></div>`;
        cats.forEach(c => {
          const row = document.createElement('div'); row.className='row-flex'; row.style.flexDirection='column'; row.style.alignItems='stretch';
          row.innerHTML = `<div style="display:flex; gap:6px; align-items:center;">
            <input class="inline-input txt" style="flex:1 1 100px;" value="${c.name}" data-id="${c.id}" data-field="name">
            <input class="inline-input num" type="number" value="${c.amount}" data-id="${c.id}" data-field="amount">
            <button class="icon-btn" data-remove-cat="${c.id}">✕</button></div>
            <input class="inline-input txt wide" style="font-size:12px; color:var(--ink-muted);" value="${c.notes||''}" data-id="${c.id}" data-field="notes" placeholder="Add a note...">`;
          body.appendChild(row);
        });
        const addRow = document.createElement('div'); addRow.className='add-row';
        addRow.innerHTML = `<input type="text" class="new-cat-name" data-group="${g.id}" placeholder="New category"><input type="number" class="new-cat-amt" data-group="${g.id}" placeholder="£/mo"><button class="ghost-btn add-cat-btn" data-group="${g.id}">+ Add</button>`;
        body.appendChild(addRow); box.appendChild(body); container.appendChild(box);
        box.querySelector('[data-toggle]').addEventListener('click', () => { g.collapsed=!g.collapsed; renderAssumptions(); });
      });
      container.querySelectorAll('[data-field]').forEach(inp => inp.addEventListener('change', () => {
        const cat = state.categories.find(c=>c.id===inp.dataset.id);
        cat[inp.dataset.field] = inp.dataset.field==='amount' ? (+inp.value||0) : inp.value;
        renderAssumptions(); renderHero(); afterMutate();
      }));
      container.querySelectorAll('[data-remove-cat]').forEach(btn => btn.addEventListener('click', () => { state.categories = state.categories.filter(c=>c.id!==btn.dataset.removeCat); renderAssumptions(); renderHero(); afterMutate(); }));
      container.querySelectorAll('[data-remove-group]').forEach(btn => btn.addEventListener('click', () => {
        state.groups = state.groups.filter(g=>g.id!==btn.dataset.removeGroup); state.categories = state.categories.filter(c=>c.groupId!==btn.dataset.removeGroup);
        renderAssumptions(); renderHero(); afterMutate();
      }));
      container.querySelectorAll('.add-cat-btn').forEach(btn => btn.addEventListener('click', () => {
        const g = btn.dataset.group, nameEl = container.querySelector(`.new-cat-name[data-group="${g}"]`), amtEl = container.querySelector(`.new-cat-amt[data-group="${g}"]`);
        if (!nameEl.value) return;
        state.categories.push({ id: uid(), groupId:g, name:nameEl.value, amount:+amtEl.value||0, notes:'' });
        renderAssumptions(); renderHero(); afterMutate();
      }));
    }
    $('add-group-btn').addEventListener('click', () => {
      const name = prompt('New group name (e.g. "Pets", "Travel")'); if (!name) return;
      const type = confirm('Is this an income group? Cancel = outgoing.') ? 'income' : 'outgoing';
      state.groups.push({ id: uid(), name, type, collapsed:false });
      renderAssumptions(); afterMutate();
    });

    $('add-keydate-btn').addEventListener('click', () => { const f=$('add-keydate-form'); f.style.display=f.style.display==='none'?'flex':'none'; });
    $('confirm-add-keydate').addEventListener('click', () => {
      const label = $('new-keydate-label').value, day = +$('new-keydate-day').value;
      if (!label || !day) return;
      state.keyDates.push({ id: uid(), label, day: Math.min(31,Math.max(1,day)) });
      $('new-keydate-label').value=''; $('new-keydate-day').value=''; $('add-keydate-form').style.display='none';
      renderKeyDates(); afterMutate();
    });
    function nextOccurrence(day){ const now=new Date(); const y=now.getFullYear(),m=now.getMonth(); let d=new Date(y,m,day); if (d<now) d=new Date(y,m+1,day); return { diffDays: Math.ceil((d-now)/86400000) }; }
    function renderKeyDates(){
      const list = $('keydates-list');
      const sorted = [...state.keyDates].sort((a,b)=>a.day-b.day);
      list.innerHTML = sorted.map(k => { const occ = nextOccurrence(k.day); return `<div class="keydate-row">
        <input class="inline-input txt" style="flex:1 1 100px;" value="${k.label}" data-kid="${k.id}" data-kfield="label">
        <span style="font-size:11px;color:var(--ink-muted);">day</span>
        <input class="inline-input num keydate-day" type="number" min="1" max="31" value="${k.day}" data-kid="${k.id}" data-kfield="day">
        <span style="font-size:11px;color:var(--ink-muted);">in ${occ.diffDays}d</span>
        <button class="icon-btn" data-remove-kd="${k.id}">✕</button></div>`; }).join('') || '<div class="sub">No key dates yet</div>';
      list.querySelectorAll('[data-kfield]').forEach(inp => inp.addEventListener('change', () => { const k=state.keyDates.find(x=>x.id===inp.dataset.kid); k[inp.dataset.kfield]= inp.dataset.kfield==='day'?Math.min(31,Math.max(1,+inp.value||1)):inp.value; renderKeyDates(); afterMutate(); }));
      list.querySelectorAll('[data-remove-kd]').forEach(btn => btn.addEventListener('click', () => { state.keyDates = state.keyDates.filter(k=>k.id!==btn.dataset.removeKd); renderKeyDates(); afterMutate(); }));
    }

    // ================= FUTURE / RUNWAY =================
    function liquidBalance(){ return accountsSum('savings')+accountsSum('current'); }
    function renderFuture(){
      const list = $('future-list');
      const sorted = [...state.futureItems].sort((a,b)=>a.date.localeCompare(b.date));
      list.innerHTML = sorted.map(it => { const d=new Date(it.date); return `<div class="future-item">
        <div class="future-date">${isNaN(d)?it.date:d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
        <div class="future-desc">${it.desc}</div>
        <div class="future-amt ${it.amount>=0?'pos':''}">${fmtSigned(it.amount)}</div>
        <button class="icon-btn" data-remove-future="${it.id}">✕</button></div>`; }).join('') || '<div class="sub">Nothing coming up</div>';
      list.querySelectorAll('[data-remove-future]').forEach(btn => btn.addEventListener('click', () => { state.futureItems = state.futureItems.filter(i=>i.id!==btn.dataset.removeFuture); renderFuture(); renderRunway(); afterMutate(); }));

      const start = liquidBalance(); let running = start;
      const shortfallItem = sorted.find(it => { running += it.amount; return running < 0; });
      const banner=$('runway-banner'), icon=$('runway-icon'), text=$('runway-text');
      if (shortfallItem){ banner.className='runway-banner warn'; icon.textContent='!'; text.innerHTML = `<strong>Potential shortfall</strong> — your liquid balance runs negative around "${shortfallItem.desc}" unless something changes before then.`; }
      else { const finalTotal = sorted.reduce((s,it)=>s+it.amount, start); banner.className='runway-banner good'; icon.textContent='✓'; text.innerHTML = `<strong>${fmt(finalTotal-start)} surplus</strong> — your liquid balance of ${fmt(start)} covers everything currently listed below.`; }
    }
    $('add-future-btn').addEventListener('click', () => { const f=$('add-future-form'); f.style.display=f.style.display==='none'?'flex':'none'; });
    $('confirm-add-future').addEventListener('click', () => {
      const date=$('new-future-date').value, desc=$('new-future-desc').value, amount=+$('new-future-amount').value;
      if (!date||!desc||!amount) return;
      state.futureItems.push({ id: uid(), date, desc, amount });
      $('new-future-date').value=''; $('new-future-desc').value=''; $('new-future-amount').value=''; $('add-future-form').style.display='none';
      renderFuture(); renderRunway(); afterMutate();
    });
    function renderRunway(){
      const sorted = [...state.futureItems].sort((a,b)=>a.date.localeCompare(b.date));
      const start = liquidBalance(); let running = start;
      const points = [{label:'Today', v:running}];
      sorted.forEach(it => { running += it.amount; points.push({ label: new Date(it.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}), v: running }); });
      const w=640,h=140,padL=50,padR=10,padT=14,padB=24;
      const vals = points.map(p=>p.v);
      const minV = Math.min(0,...vals)-500, maxV = Math.max(...vals)*1.1 || 1000;
      const x = i => padL + (i/(points.length-1||1))*(w-padL-padR);
      const y = v => padT + (1-(v-minV)/(maxV-minV))*(h-padT-padB);
      const zeroY = y(0);
      const path = points.map((p,i)=>(i===0?'M':'L')+x(i).toFixed(1)+','+y(p.v).toFixed(1)).join(' ');
      const dots = points.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.2" fill="var(--cat-1)" class="rw-pt" data-label="${p.label}" data-v="${p.v}" style="cursor:pointer"/>`).join('');
      const labels = points.map((p,i)=>`<text x="${x(i).toFixed(1)}" y="${h-6}" font-size="9" text-anchor="middle">${p.label}</text>`).join('');
      const el = $('chart-runway');
      el.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}"><line class="grid-line" x1="${padL}" x2="${w-padR}" y1="${zeroY}" y2="${zeroY}" stroke-dasharray="2 3"/><text x="${padL-6}" y="${zeroY+3}" font-size="9.5" text-anchor="end">£0</text><path d="${path}" fill="none" stroke="var(--cat-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
      bindPointEvents(el, '.rw-pt', (pt) => showTip(+pt.getAttribute('cx'), +pt.getAttribute('cy'), `${pt.dataset.label}: ${fmt(+pt.dataset.v)}`, el));
    }

    // ================= HOUSE PROJECT =================
    function renderHouse(){
      const spendTotal = state.houseCats.reduce((s,c)=>s+c.v,0) + state.furnishings.reduce((s,f)=>s+f.total,0);
      $('house-funds-total').value = state.houseFundsTotal||0;
      $('house-spend-total').textContent = fmt(spendTotal);
      $('house-remaining').textContent = fmt((state.houseFundsTotal||0) - spendTotal);

      const sorted = [...state.houseCats].sort((a,b)=>b.v-a.v);
      const w=640, rowH=28, padL=112, padR=56, padT=6;
      const maxV = Math.max(...sorted.map(c=>c.v),1)*1.15;
      const h = sorted.length*rowH + padT*2;
      const scale = (w-padL-padR)/maxV;
      let rows = sorted.map((c,i)=>{ const cy=padT+i*rowH+rowH/2, bw=c.v*scale; return `<text x="${padL-10}" y="${cy+4}" font-size="11" text-anchor="end">${c.name}</text><rect x="${padL}" y="${(cy-8).toFixed(1)}" width="${bw.toFixed(1)}" height="16" rx="3" fill="var(--cat-1)" class="house-seg" data-name="${c.name}" data-v="${c.v}" style="cursor:pointer"/><text x="${(padL+bw+8).toFixed(1)}" y="${cy+4}" font-size="10.5" font-family="var(--font-mono)" fill="var(--ink-2)">${fmt(c.v)}</text>`; }).join('');
      const houseEl = $('chart-house');
      houseEl.innerHTML = sorted.length ? `<svg class="chart" viewBox="0 0 ${w} ${h}">${rows}</svg>` : '<div class="sub">No categories yet</div>';
      bindPointEvents(houseEl, '.house-seg', (seg) => { const box=seg.getBBox(); showTip(box.x+box.width/2, box.y, `${seg.dataset.name}: ${fmt(+seg.dataset.v)}`, houseEl); });

      const listEl = $('house-cats-list');
      listEl.innerHTML = state.houseCats.map(c => `<div class="row-flex"><input class="inline-input txt" style="flex:1 1 100px;" value="${c.name}" data-hid="${c.id}" data-hfield="name"><input class="inline-input num" type="number" value="${c.v}" data-hid="${c.id}" data-hfield="v"><button class="icon-btn" data-remove-house="${c.id}">✕</button></div>`).join('');
      listEl.querySelectorAll('[data-hfield]').forEach(inp => inp.addEventListener('change', () => { const c=state.houseCats.find(x=>x.id===inp.dataset.hid); c[inp.dataset.hfield]= inp.dataset.hfield==='v'?(+inp.value||0):inp.value; renderHouse(); afterMutate(); }));
      listEl.querySelectorAll('[data-remove-house]').forEach(btn => btn.addEventListener('click', () => { state.houseCats = state.houseCats.filter(c=>c.id!==btn.dataset.removeHouse); renderHouse(); afterMutate(); }));

      const fEl = $('furnishings-list');
      fEl.innerHTML = state.furnishings.map(f => `<div class="row-flex"><input class="inline-input txt" style="flex:1 1 100px;" value="${f.room}" data-fid="${f.id}" data-ffield="room"><input class="inline-input num" type="number" value="${f.total}" data-fid="${f.id}" data-ffield="total"><button class="icon-btn" data-remove-furn="${f.id}">✕</button></div>`).join('') + `<div class="row-flex" style="font-weight:700;"><div style="flex:1;">Total</div><div class="inline-input num" style="text-align:right;">${fmt(state.furnishings.reduce((s,f)=>s+f.total,0))}</div></div>`;
      fEl.querySelectorAll('[data-ffield]').forEach(inp => inp.addEventListener('change', () => { const f=state.furnishings.find(x=>x.id===inp.dataset.fid); f[inp.dataset.ffield]= inp.dataset.ffield==='total'?(+inp.value||0):inp.value; renderHouse(); afterMutate(); }));
      fEl.querySelectorAll('[data-remove-furn]').forEach(btn => btn.addEventListener('click', () => { state.furnishings = state.furnishings.filter(f=>f.id!==btn.dataset.removeFurn); renderHouse(); afterMutate(); }));
    }
    $('house-funds-total').addEventListener('change', (e) => { state.houseFundsTotal = +e.target.value || 0; renderHouse(); afterMutate(); });
    $('add-house-btn').addEventListener('click', () => { const name=prompt('Category name'); if (!name) return; state.houseCats.push({ id: uid(), name, v:0 }); renderHouse(); afterMutate(); });
    $('add-room-btn').addEventListener('click', () => {
      const room = $('new-room-name').value, amt = +$('new-room-amt').value||0;
      if (!room) return;
      state.furnishings.push({ id: uid(), room, total: amt });
      $('new-room-name').value=''; $('new-room-amt').value='';
      renderHouse(); afterMutate();
    });

    // ================= RENDER ALL / INIT =================
    window.renderAll = renderAll;
    function renderAll(){
      $('balances-asof').value = state.balancesAsOf;
      renderHero(); renderOneOffs(); renderAccounts(); renderIlliquid(); renderAssumptions(); renderKeyDates(); renderExplore(); renderFuture(); renderRunway(); renderHouse();
    }
    renderAll();
  }

  // module-level month rollover (called before initAppUI and available to it via closure re-declaration above)
  function ensureMonthRolled(){
    if (!state) return;
    const key = todayISO().slice(0,7);
    if (state.currentTrackedMonth !== key){
      state.accounts.forEach(a => a.prevBalance = a.balance);
      state.illiquidAssets.forEach(a => a.prevBalance = a.balance);
      state.currentTrackedMonth = key;
    }
  }
})();
