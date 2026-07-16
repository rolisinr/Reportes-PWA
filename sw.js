// =====================================================
// Service Worker - Reportes TGA v10
// =====================================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE = 'cov-reportes-v55';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// Firebase init en SW
firebase.initializeApp({
  apiKey: 'AIzaSyA65EkSVN41YsH40MHNgYOtFYGVX1aOeFY',
  authDomain: 'appcov-7c5e4.firebaseapp.com',
  projectId: 'appcov-7c5e4',
  messagingSenderId: '277781643808',
  appId: '1:277781643808:web:e392198ab6ceece314f245'
});

const messaging = firebase.messaging();

// Notificaciones en background (app cerrada)
messaging.onBackgroundMessage(function(payload) {
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
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list) {
      for(var i=0; i<list.length; i++) {
        if((list[i].url.includes('covapp.online')||list[i].url.includes('covapp')) && 'focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow('./');
    })
  );
});

// Cache
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  e.respondWith(caches.match(e.request).then(function(c){return c||fetch(e.request);}));
});

// Notificaciones locales programadas
self.addEventListener('message', function(e) {
  if(e.data && e.data.type==='SCHEDULE') {
    var d = e.data;
    setTimeout(function() {
      self.registration.showNotification(d.title||'TGA', {
        body: d.body||'',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200,100,200],
        tag: d.tag||'tga-local'
      });
    }, d.delay||0);
  }
});

self.addEventListener('message', function(e) {
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
