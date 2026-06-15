// ===================================================
//  Firebase Cloud Messaging - Service Worker
//  يشتغل في الخلفية ويستقبل الإشعارات حتى لو الموقع مغلق
// ===================================================

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBIVtK3tNHSnQW6Pfq-cZgSvLmTX6kaeTk",
  authDomain:        "mateen-a122d.firebaseapp.com",
  projectId:         "mateen-a122d",
  storageBucket:     "mateen-a122d.firebasestorage.app",
  messagingSenderId: "90050379590",
  appId:             "1:90050379590:web:a10d71638f09837cef2f47"
});

const messaging = firebase.messaging();

// ── استقبال الإشعارات في الخلفية (الموقع مش مفتوح) ──
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] رسالة في الخلفية:', payload);

  const { title, body, icon } = payload.notification || {};

  self.registration.showNotification(title || 'رسالة جديدة 💬', {
    body:    body  || 'لديك رسالة جديدة في متين',
    icon:    icon  || '/logo.png',
    badge:   '/favicon.ico',
    dir:     'rtl',
    lang:    'ar',
    vibrate: [200, 100, 200],
    tag:     'mateen-msg',          // يحل محل الإشعار القديم بدل ما يراكم
    renotify: true,
    data:    payload.data || {}
  });
});

// ── لما المستخدم يضغط الإشعار يفتح صفحة الرسائل ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data?.url || '/html/messages.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // لو الموقع مفتوح أصلاً، افتحله التاب ده
      for (const client of clientList) {
        if (client.url.includes('mateenweb.github.io') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // لو مش مفتوح، افتح نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow('https://mateenweb.github.io/Mateen/' + url.replace(/^\//, ''));
      }
    })
  );
});
