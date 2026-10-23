/* Service worker: only shows push reminders. No caching, so the app is always the latest version. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch(_) { d = { body: e.data ? e.data.text() : '' }; }
  const jobs = [self.registration.showNotification(d.title || 'The Seligman Ledger', {
    body: d.body || 'Time for the monthly check-in.',
    icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || 'ledger', renotify: true,
    data: { url: d.url || './#checkin' },
  })];
  if (d.badge && self.navigator && 'setAppBadge' in self.navigator) jobs.push(self.navigator.setAppBadge(d.badge).catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // focus an open copy rather than reloading it (a reload would ask for the PIN again)
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open){ open.postMessage({ type: 'checkin' }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
