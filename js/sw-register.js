// ── تسجيل Service Worker ──────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/Mateen/firebase-messaging-sw.js', {
    scope: '/Mateen/'
  }).then(reg => {
    console.log('[SW] registered:', reg.scope);
  }).catch(err => {
    console.warn('[SW] registration failed:', err);
  });
}
