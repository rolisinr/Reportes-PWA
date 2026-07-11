const CACHE = 'reportes-tga-v5';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});

// Notificaciones programadas desde la app
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE') {
    const { title, body, delay, tag } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: tag || 'tga-notif',
        vibrate: [200, 100, 200],
        requireInteraction: true
      });
    }, delay);
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) { if (c.focus) return c.focus(); }
    return clients.openWindow('./');
  }));
});
