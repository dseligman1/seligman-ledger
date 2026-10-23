// Sends the monthly check-in reminder. Run by .github/workflows/reminders.yml.
// Decrypts ledger.json with the PIN secret, works out whether this month's check-in is done using the
// app's own model.js, and pushes a notification to every device saved in Settings → Phone notifications.
// The repo is public, so this never logs anything from the ledger beyond counts.
import fs from 'node:fs';
import vm from 'node:vm';
import webpush from 'web-push';

const { LEDGER_PIN, VAPID_PRIVATE_KEY, MODE = 'scheduled', SCHEDULE = '' } = process.env;
const VAPID_PUBLIC = 'BMbsd0OxaCI31bmYOBD8yF3KUwX3UPqKhV5QipwDPcJWepLOg_8Lq-U1gKAfj6Nz_NutHu5cQmMgWl9ksXzR5Eg';
const APP_URL = 'https://dseligman1.github.io/seligman-ledger/';
if (!LEDGER_PIN || !VAPID_PRIVATE_KEY) { console.log('Missing LEDGER_PIN or VAPID_PRIVATE_KEY secret.'); process.exit(1); }

// Two cron slots (08:00 and 09:00 UTC) cover GMT and BST; only the one that is 9am in London sends.
const london = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23', day: 'numeric' }).formatToParts(new Date());
const part = t => Number(london.find(p => p.type === t).value);
const offset = (part('hour') - new Date().getUTCHours() + 24) % 24; // 0 in winter, 1 in summer
if (MODE === 'scheduled' && SCHEDULE){
  const slot = Number(SCHEDULE.split(' ')[1]);
  if (slot + offset !== 9) { console.log(`Skipping the ${slot}:00 UTC slot: it isn't 9am in London today.`); process.exit(0); }
}

// --- decrypt (same format as js/core.js) ---
const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));
const payload = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));
const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(LEDGER_PIN), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(payload.salt), iterations: 210000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const s = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(payload.iv) }, key, b64(payload.data))));

// --- the app's own check-in logic ---
const sandbox = { window: { Ledger: {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/model.js', 'utf8'), sandbox);
const M = sandbox.window.Ledger.model;
s.snapshots = s.snapshots || []; s.accounts = s.accounts || []; s.checklist = s.checklist || {};
const subs = (process.env.FAKE_SUBS ? JSON.parse(process.env.FAKE_SUBS) : null) || (s.push && s.push.subs) || [];
if (!subs.length) { console.log('No devices have notifications turned on.'); process.exit(0); }

const ym = M.thisMonth(), c = M.checkin(s, ym), day = part('day');
let msg;
if (MODE === 'test') msg = { title: 'The Seligman Ledger', body: 'Test from GitHub: reminders are working on this device.', tag: 'ledger-test' };
else if (c.complete) { console.log('This month\'s check-in is complete. No reminder sent.'); process.exit(0); }
else {
  const left = c.total - c.done;
  const todo = c.items.filter(i => !i.done).map(i => i.id === 'balances' ? `${left} of ${c.total} balances` : ({ change: 'check the monthly change', oneoffs: 'log one-offs', budget: 'review the budget' })[i.id]);
  const month = M.lbl(ym, 'month');
  msg = day === 1 && !c.started
    ? { title: `${month} check-in`, body: `New month: time to update your account balances for ${month}.` }
    : { title: `${month} check-in`, body: `Still to do: ${todo.join(', ')}.` };
  msg.badge = c.items.filter(i => !i.done).length;
}
msg.url = APP_URL + '#checkin'; msg.tag = msg.tag || 'ledger-checkin';

webpush.setVapidDetails(APP_URL, VAPID_PUBLIC, VAPID_PRIVATE_KEY);
let sent = 0, gone = 0, failed = 0;
for (const sub of subs){
  try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg), { TTL: 6 * 3600, urgency: 'normal' }); sent++; }
  catch(e){ if (e.statusCode === 404 || e.statusCode === 410) gone++; else { failed++; console.log('Push service returned', e.statusCode || e.message); } }
}
console.log(`${MODE === 'test' ? 'Test' : 'Reminder'} sent to ${sent} of ${subs.length} device(s).` + (gone ? ` ${gone} device(s) no longer accept notifications: remove them in Settings and turn notifications on again there.` : ''));
if (failed && !sent) process.exit(1);
