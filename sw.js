// =====================================================
// Service Worker - Reportes TGA v10
// =====================================================
importScripts('./js/config.js');
importScripts('./js/db.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE = 'cov-reportes-swr-v106';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.json', './icon-192.png', './icon-512.png',
  './js/config.js', './js/state.js', './js/db.js', './js/utils.js', './js/navigation.js', './js/profile.js', './js/history.js',
  './js/templates.js', './js/app.js', './js/programacion.js', './js/ui.js',
  './js/admin.js', './js/ia.js', './js/sheets.js', './js/firebase.js', './js/custom-tpl.js'
];

// Firebase init en SW
firebase.initializeApp(CONFIG.FIREBASE);

const messaging = firebase.messaging();

// Notificaciones en background (app cerrada)
messaging.onBackgroundMessage(function (payload) {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Reportes TGA', {
    body: n.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'tga-push',
    requireInteraction: false,
    data: payload.data || {}
  });
});

// Clic en notificación - abre la app
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ((list[i].url.includes('covapp.online') || list[i].url.includes('covapp')) && 'focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow('./');
    })
  );
});

// Cache
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      // Forzar recarga de todas las pestañas abiertas
      return self.clients.matchAll({ type: 'window' }).then(function(clientList) {
        clientList.forEach(function(client) {
          client.navigate(client.url);
        });
      });
    })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then(function (cachedResponse) {
      const fetchPromise = fetch(e.request).then(function (networkResponse) {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(function () {
        // Ignorar errores de red en background
      });
      return cachedResponse || fetchPromise;
    })
  );
});

// Mensajes desde la app
self.addEventListener('message', function (e) {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE') {
    var d = e.data;
    setTimeout(function () {
      self.registration.showNotification(d.title || 'TGA', {
        body: d.body || '',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200, 100, 200],
        tag: d.tag || 'tga-local'
      });
    }, d.delay || 0);
  }
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// =====================================================
// BACKGROUND SYNC
// =====================================================
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-reportes') {
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  const all = await DB.getAll('pending_sync');
  const keys = Object.keys(all).sort();
  for (let k of keys) {
    const req = all[k];
    try {
      const res = await fetch(req.url, req.opts);
      const data = await res.json();
      if (data && data.ok) {
        await DB.del('pending_sync', k);
      }
    } catch (err) {
      console.error('Background sync falló temporalmente para', k, err);
      // Lanzamos error para que el browser intente más tarde
      throw err;
    }
  }
  
  // Si terminamos de enviar todo, avisar a los clientes (las pestañas abiertas de la app)
  const clientsList = await self.clients.matchAll();
  for (const client of clientsList) {
    client.postMessage({ type: 'SYNC_COMPLETE' });
  }
}
