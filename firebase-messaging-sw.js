// Firebase Messaging SW para covapp.online
// Este archivo es necesario para que Firebase pueda mostrar
// notificaciones en background en el dominio raíz
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA65EkSVN41YsH40MHNgYOtFYGVX1aOeFY',
  authDomain: 'appcov-7c5e4.firebaseapp.com',
  projectId: 'appcov-7c5e4',
  messagingSenderId: '277781643808',
  appId: '1:277781643808:web:e392198ab6ceece314f245'
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
