var CACHE = 'fixmy-v2';

// Pre-cache the shell on install
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(['/portal.html', '/manifest.json', '/og-image.jpg']);
    }).then(function() { return self.skipWaiting(); })
  );
});

// Clean old caches on activate
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

// Fetch strategy:
//   - Supabase + Netlify functions → network-only (never cache live data)
//   - portal.html → stale-while-revalidate (instant load, updates in background)
//   - Everything else → cache-first with network fallback
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Never intercept non-GET or API calls
  if (e.request.method !== 'GET') return;
  if (url.includes('supabase.co') || url.includes('.netlify/functions') || url.includes('googleapis.com/maps/api')) return;

  if (url.includes('portal.html') || url === self.location.origin + '/') {
    // Stale-while-revalidate for the app shell
    e.respondWith(
      caches.open(CACHE).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var fetchPromise = fetch(e.request).then(function(resp) {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Cache-first for assets (images, CDN scripts, fonts)
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(resp) {
        if (resp.ok && resp.type !== 'opaque') {
          var clone = resp.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate') return caches.match('/portal.html');
      });
    })
  );
});

// Push notifications (existing logic preserved)
self.addEventListener('push', function(e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch(x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'FixMy.Energy', {
    body: d.body || 'New activity in your pipeline.',
    icon: '/og-image.jpg',
    badge: '/og-image.jpg',
    tag: d.tag || 'fixmy-alert',
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
