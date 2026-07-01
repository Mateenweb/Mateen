// ── Mateen PWA Service Worker ──────────────────────────────────
const CACHE_NAME = 'mateen-v1';
const ASSETS = [
  '/Mateen/html/home.html',
  '/Mateen/html/login.html',
  '/Mateen/css/home.css',
  '/Mateen/js/home.js',
  '/Mateen/logo.png',
  '/Mateen/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore') || e.request.url.includes('firebase')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// Firebase Messaging
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBIVtK3tNHSnQW6Pfq-cZgSvLmTX6kaeTk",
  authDomain: "mateen-a122d.firebaseapp.com",
  projectId: "mateen-a122d",
  storageBucket: "mateen-a122d.firebasestorage.app",
  messagingSenderId: "900503795090",
  appId: "1:900503795090:web:a10d71638f09837cef2f47"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  self.registration.showNotification(payload.notification?.title || 'متين', {
    body: payload.notification?.body || '',
    icon: '/Mateen/logo.png',
    badge: '/Mateen/favicon.ico',
    dir: 'rtl',
    lang: 'ar',
    data: payload.data
  });
});
