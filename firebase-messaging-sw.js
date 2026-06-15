// ═══════════════════════════════════════════════════════
//  firebase-messaging-sw.js
//  Service Worker — إشعارات Mateen بدون سيرفر خارجي
// ═══════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBIVtK3tNHSnQW6Pfq-cZgSvLmTX6kaeTk",
  authDomain:        "mateen-a122d.firebaseapp.com",
  projectId:         "mateen-a122d",
  storageBucket:     "mateen-a122d.firebasestorage.app",
  messagingSenderId: "90050379590",
  appId:             "1:90050379590:web:a10d71638f09837cef2f47"
});

const db = firebase.firestore();
let unsubscribe = null;
let currentUid  = null;

// ── استقبال الـ UID من الصفحة الرئيسية ────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SET_USER' && event.data.uid) {
    if (event.data.uid !== currentUid) {
      currentUid = event.data.uid;
      setupFirestoreListener();
    }
  }
  if (event.data?.type === 'CLEAR_USER') {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    currentUid = null;
  }
});

// ── الاستماع لمجموعة الإشعارات في Firestore ──────────────────────────────
function setupFirestoreListener() {
  if (unsubscribe) unsubscribe();
  if (!currentUid) return;

  const pendingRef = db.collection('notifications')
                       .doc(currentUid)
                       .collection('pending')
                       .orderBy('createdAt', 'asc');

  unsubscribe = pendingRef.onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      if (change.type !== 'added') return;

      const d   = change.doc.data();
      const ref = change.doc.ref;

      // عرض الإشعار
      self.registration.showNotification(d.title || 'رسالة جديدة 💬', {
        body:     d.body  || 'لديك رسالة جديدة في متين',
        icon:     '/Mateen/logo.png',
        badge:    '/Mateen/favicon.ico',
        dir:      'rtl',
        lang:     'ar',
        vibrate:  [200, 100, 200],
        tag:      'mateen-msg',
        renotify: true,
        data:     { url: d.url || 'https://mateenweb.github.io/Mateen/html/messages.html' }
      });

      // امسح الإشعار من Firestore بعد عرضه
      ref.delete().catch(() => {});
    });
  }, err => {
    console.error('[SW] Firestore listener error:', err);
  });
}

// ── لما المستخدم يضغط الإشعار ────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://mateenweb.github.io/Mateen/html/messages.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('mateenweb.github.io') && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── FCM Background (احتياطي لو في Cloud Function مستقبلاً) ───────────────
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'رسالة جديدة 💬', {
    body:    body || 'لديك رسالة جديدة في متين',
    icon:    '/Mateen/logo.png',
    dir:     'rtl',
    lang:    'ar',
    vibrate: [200, 100, 200],
    tag:     'mateen-msg',
    renotify: true,
    data:    payload.data || {}
  });
});
