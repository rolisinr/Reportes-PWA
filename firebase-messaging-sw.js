// Firebase Messaging SW para covapp.online
// Este archivo es necesario para que Firebase pueda mostrar
// notificaciones en background en el dominio raíz
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBIj8aYFt-vkVc55atTgfYVtZI2iWVvTI4',
  authDomain: 'covapp-3fe9d.firebaseapp.com',
  projectId: 'covapp-3fe9d',
  messagingSenderId: '1056777477300',
  appId: '1:1056777477300:web:d4b64af6fb85f8a7e54be1'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  self.registration.showNotification(n.title || 'Aviso TGA', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200]
  });
});
