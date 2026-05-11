self.addEventListener('push', function(e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch(x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'FixMy.Energy', {
    body: d.body || 'New agent reports are ready.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'agent-report',
    renotify: true,
    data: { url: d.url || '/portal.html' }
  }));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(ws) {
    var url = (e.notification.data && e.notification.data.url) || '/portal.html';
    for (var i = 0; i < ws.length; i++) {
      if (ws[i].url.indexOf('portal') !== -1 && 'focus' in ws[i]) return ws[i].focus();
    }
    return clients.openWindow(url);
  }));
});
