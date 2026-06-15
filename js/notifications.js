// ═══════════════════════════════════════════════════════
//  notifications.js — تفعيل الإشعارات
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getMessaging, getToken, onMessage }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js";
import { getFirestore, doc, updateDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const VAPID_KEY = "BMlwnqkDtZAFIh2KxrfUAe08_7JfplwzssWX2X0PZbCofaQgkzQqOOhJ1VE2OdFQdxokwmqxgi9AHnS0XzonFmU";

const app       = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const messaging = getMessaging(app);
const db        = getFirestore(app);

// ── تسجيل Service Worker ──────────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/Mateen/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.error('[FCM] SW registration failed:', err);
    return null;
  }
}

// ── بعت الـ UID للـ Service Worker ────────────────────────────────────────
function notifySW(uid) {
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'SET_USER', uid });
}

// ── تفعيل الإشعارات (يتستدعى بعد لوجين) ─────────────────────────────────
export async function initNotifications(userId) {
  if (!userId || !('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  const swReg = await registerSW();
  if (!swReg) return;

  // ابعت الـ UID للـ SW فوراً (الـ Firestore listener)
  notifySW(userId);

  // لما يتبدل controller (reload)، ابعت تاني
  navigator.serviceWorker.addEventListener('controllerchange', () => notifySW(userId));

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // جيب FCM token (للـ Cloud Function لو اتضافت مستقبلاً)
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      await updateDoc(doc(db, 'users', userId), {
        [`fcmTokens.${token}`]: true,
        notificationsEnabled: true
      });
    }
  } catch (err) {
    console.error('[FCM] token error:', err);
  }

  // ── Foreground: الموقع مفتوح ─────────────────────────────────────────
  onMessage(messaging, payload => {
    const { title, body } = payload.notification || {};
    if (!window.location.pathname.includes('messages.html')) {
      showToast(title || 'رسالة جديدة', body || '');
    }
  });
}

// ── Toast داخلي ───────────────────────────────────────────────────────────
export function showToast(title, body) {
  document.getElementById('fcm-toast')?.remove();
  const t = document.createElement('div');
  t.id = 'fcm-toast';
  t.innerHTML = `
    <div onclick="window.location.href='/Mateen/html/messages.html'" style="
      position:fixed;bottom:20px;right:20px;z-index:99999;
      background:#1b4332;color:#fff;border-radius:12px;
      padding:14px 18px;min-width:260px;max-width:320px;
      box-shadow:0 4px 20px rgba(0,0,0,.3);
      font-family:inherit;direction:rtl;cursor:pointer;
      animation:slideIn .3s ease">
      <div style="font-weight:700;margin-bottom:4px">💬 ${title}</div>
      <div style="font-size:13px;opacity:.85">${body}</div>
    </div>
    <style>@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}</style>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}
