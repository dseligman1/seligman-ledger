/* Core: encryption, GitHub storage, preview mode, v1 -> v2 migration.
   Encryption format is unchanged from v1 (AES-256-GCM, PBKDF2 210k from the PIN).
   v2 data lives in ledger.json; the v1 data.json is left untouched as a backup. */
(function(){
  'use strict';
  const L = window.Ledger = window.Ledger || {};

  const CFG = L.CFG = {
    owner: 'dseligman1', repo: 'seligman-ledger',
    file: 'ledger.json', legacyFile: 'data.json',
    api: 'https://api.github.com',
    patKey: 'ledger_pat', uiKey: 'ledger_ui_v2', previewKey: 'ledger_preview_state_v2',
  };
  L.PREVIEW = new URLSearchParams(location.search).has('preview');

  L.uid = (p='id') => p + Math.random().toString(36).slice(2, 9);
  L.safeLS = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch(e){} },
    del(k){ try { localStorage.removeItem(k); } catch(e){} },
  };

  // ---------------- crypto ----------------
  const bufToB64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToBuf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  async function deriveKey(pin, salt){
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:210000, hash:'SHA-256' }, km, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  }
  async function encrypt(obj, pin){
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, await deriveKey(pin, salt), new TextEncoder().encode(JSON.stringify(obj)));
    return { v:1, salt: bufToB64(salt), iv: bufToB64(iv), data: bufToB64(ct) };
  }
  async function decrypt(payload, pin){
    const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv: b64ToBuf(payload.iv) }, await deriveKey(pin, b64ToBuf(payload.salt)), b64ToBuf(payload.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ---------------- GitHub contents API ----------------
  const authErr = () => { const e = new Error('auth'); e.name = 'GhAuthError'; return e; };
  const ghUrl = path => `${CFG.api}/repos/${CFG.owner}/${CFG.repo}/contents/${path}`;
  const headers = () => ({ Authorization: `Bearer ${store.pat}`, Accept: 'application/vnd.github+json' });
  async function ghGet(path){
    const res = await fetch(ghUrl(path) + '?t=' + Date.now(), { headers: headers(), cache: 'no-store' });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw authErr();
    if (!res.ok) throw new Error('GitHub read failed: ' + res.status);
    const j = await res.json();
    let text;
    if (j.content) text = new TextDecoder().decode(b64ToBuf(j.content.replace(/\n/g, '')));
    else { // files over 1MB come back without inline content
      const raw = await fetch(j.download_url + '?t=' + Date.now(), { cache: 'no-store' });
      text = await raw.text();
    }
    return { content: JSON.parse(text), sha: j.sha };
  }
  async function ghPut(path, payload, sha, message){
    const body = { message, content: bufToB64(new TextEncoder().encode(JSON.stringify(payload))) };
    if (sha) body.sha = sha;
    const res = await fetch(ghUrl(path), { method:'PUT', headers: { ...headers(), 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) throw authErr();
    if (res.status === 409 || res.status === 422){ const e = new Error('conflict'); e.name = 'GhConflict'; throw e; }
    if (!res.ok) throw new Error('GitHub write failed: ' + res.status);
    return res.json();
  }

  // ---------------- store ----------------
  const store = L.store = {
    pat: L.safeLS.get(CFG.patKey),
    pin: null, sha: null, saveTimer: null, saving: false, dirty: false,
    onStatus: () => {}, onRemote: () => {},

    setPat(v){ this.pat = v; L.safeLS.set(CFG.patKey, v); },
    clearPat(){ this.pat = null; L.safeLS.del(CFG.patKey); },

    // Returns { state, migrated } or { state:null } when there is no data at all.
    async unlock(pin){
      const remote = await ghGet(CFG.file);
      if (remote){
        const state = await decrypt(remote.content, pin);
        this.pin = pin; this.sha = remote.sha;
        return { state: L.normalise(state) };
      }
      const legacy = await ghGet(CFG.legacyFile);
      if (legacy){
        const v1 = await decrypt(legacy.content, pin);
        this.pin = pin; this.sha = null;
        return { state: L.normalise(v1.meta && v1.meta.schemaVersion === 2 ? v1 : migrateV1(v1)), migrated: true };
      }
      this.pin = pin;
      return { state: null };
    },

    queue(state){
      this.dirty = true;
      if (L.PREVIEW){ L.safeLS.set(CFG.previewKey, JSON.stringify(state)); this.dirty = false; this.onStatus('preview', 'Preview · saved in this browser'); return; }
      clearTimeout(this.saveTimer);
      this.onStatus('saving', 'Saving…');
      this.saveTimer = setTimeout(() => this.flush(state), 1100);
    },

    async flush(state){
      if (L.PREVIEW || !this.pin) return;
      if (this.saving){ this.saveTimer = setTimeout(() => this.flush(state), 600); return; }
      this.saving = true;
      try {
        const latest = await ghGet(CFG.file);
        const payload = await encrypt(state, this.pin);
        let res;
        try { res = await ghPut(CFG.file, payload, latest ? latest.sha : null, 'Update ledger — ' + new Date().toISOString()); }
        catch(e){
          if (e.name !== 'GhConflict') throw e;
          const again = await ghGet(CFG.file);
          res = await ghPut(CFG.file, payload, again ? again.sha : null, 'Update ledger — ' + new Date().toISOString());
        }
        this.sha = res.content.sha; this.dirty = false;
        this.onStatus('saved', 'Synced ' + new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }));
      } catch(e){
        this.onStatus('error', e.name === 'GhAuthError' ? 'Token rejected — open Settings' : 'Not synced — retrying on next edit');
      } finally { this.saving = false; }
    },

    // Pull the other person's edits when the app comes back into focus.
    async pullIfChanged(){
      if (L.PREVIEW || !this.pin || this.dirty || this.saving) return;
      try {
        const remote = await ghGet(CFG.file);
        if (remote && remote.sha !== this.sha){
          const state = L.normalise(await decrypt(remote.content, this.pin));
          this.sha = remote.sha;
          this.onRemote(state);
          this.onStatus('saved', 'Updated with latest changes');
        }
      } catch(e){ /* stay on local copy */ }
    },

    lock(){ this.pin = null; location.reload(); },
  };

  // Fill any missing collections so older or hand-built files never crash the UI.
  L.normalise = function(s){
    s.meta = s.meta || {}; s.meta.schemaVersion = 2;
    s.settings = Object.assign({ planYear: new Date().getFullYear() }, s.settings || {});
    ['tags','accounts','snapshots','gaps','scenarios','events','upcoming','keyDates'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    s.budget = s.budget || {}; ['years','groups','lines','salaries'].forEach(k => { if (!Array.isArray(s.budget[k])) s.budget[k] = []; });
    if (!s.budget.years.length) s.budget.years = [new Date().getFullYear()];
    s.coverage = Object.assign({ includeExtras:false, fundAdjustments:[], costAdjustments:[], slowTagId: null }, s.coverage || {});
    s.house = Object.assign({ summary:[], building:[], furnishings:[], buildingPaid: null }, s.house || {});
    if (typeof s.notes !== 'string') s.notes = '';
    s.accounts.forEach(a => { if (!Array.isArray(a.tags)) a.tags = []; });
    s.snapshots.sort((a, b) => a.month < b.month ? -1 : 1);
    return s;
  };

  // v1 (Aug 2026 app) -> v2. Only used if ledger.json doesn't exist yet.
  function migrateV1(v1){
    const year = new Date().getFullYear();
    const accounts = (v1.accounts || []).map(a => ({ id: a.id || L.uid('a'), name: a.name, bucket: a.group === 'savings' ? 'savings' : 'current', tags: [], note: '', archived: false }));
    const snapshots = (v1.history || []).filter(h => h.savings != null).map(h => ({ month: h.month, date: null, totals: { savings: h.savings, current: h.current }, balances: null, note: '' }));
    const asOf = (v1.balancesAsOf || '').slice(0, 7) || (snapshots.length ? snapshots[snapshots.length - 1].month : null);
    if (asOf && accounts.length){
      const bal = {}; (v1.accounts || []).forEach((a, i) => bal[accounts[i].id] = a.balance);
      const i = snapshots.findIndex(x => x.month === asOf);
      const snap = { month: asOf, date: v1.balancesAsOf || null, totals: null, balances: bal, note: '' };
      if (i >= 0) snapshots[i] = snap; else snapshots.push(snap);
    }
    const groups = (v1.groups || []).map(g => ({ id: g.id, name: g.name }));
    const gType = Object.fromEntries((v1.groups || []).map(g => [g.id, g.type]));
    const lines = (v1.categories || []).map(c => ({ id: c.id, groupId: c.groupId, name: c.name, kind: gType[c.groupId] === 'income' ? 'income' : 'living', amounts: { [year]: c.amount || 0 }, note: c.notes || '' }));
    return {
      meta: { schemaVersion: 2, migratedFromV1: new Date().toISOString() }, settings: { planYear: year },
      tags: [], accounts, snapshots, gaps: [],
      budget: { years: [year], groups, lines, salaries: [] },
      coverage: {}, house: {
        summary: v1.houseFundsTotal ? [{ id: L.uid('h'), label: 'Total funds', amount: v1.houseFundsTotal }] : [],
        building: (v1.houseCats || []).map(c => ({ id: c.id || L.uid('w'), name: c.name, amount: Math.abs(c.amount || 0) })),
        furnishings: (v1.furnishings || []).map(f => ({ id: f.id || L.uid('i'), name: f.room || f.name, amount: f.amount || 0, status: '' })),
      },
      scenarios: [], events: (v1.oneOffEvents || []).map(e => ({ id: e.id || L.uid('e'), month: (e.date || '').slice(0, 7), label: e.desc, amount: e.amount })),
      upcoming: (v1.futureItems || []).map(f => ({ id: f.id || L.uid('u'), date: f.date, label: f.desc, amount: f.amount })),
      keyDates: v1.keyDates || [],
    };
  }
  L.migrateV1 = migrateV1;

  L.createInitial = async function(state){
    const payload = await encrypt(state, store.pin);
    const res = await ghPut(CFG.file, payload, null, 'Create ledger v2 data');
    store.sha = res.content.sha;
  };

  // Preview mode: data comes from ../data/ledger-preview.js (never committed); edits stay in localStorage.
  L.loadPreview = function(){
    const saved = L.safeLS.get(CFG.previewKey);
    if (saved){ try { return L.normalise(JSON.parse(saved)); } catch(e){} }
    if (window.LEDGER_PREVIEW_STATE) return L.normalise(JSON.parse(JSON.stringify(window.LEDGER_PREVIEW_STATE)));
    return null;
  };
  L.resetPreview = function(){ L.safeLS.del(CFG.previewKey); location.reload(); };
})();
