// ===================================================
//  notifications.js
//  يطلب إذن الإشعار ويحفظ توكن FCM في Firestore
// ===================================================

import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getMessaging, getToken, onMessage }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js";
import { getFirestore, doc, updateDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

// ── مفتاح VAPID من Firebase Console ──────────────────────────────────────
// ⬇ استبدلي هذا بمفتاح VAPID الخاص بمشروعك من:
//   Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = "BMlwnqkDtZAFIh2KxrfUAe08_7JfplwzssWX2X0PZbCofaQgkzQqOOhJ1VE2OdFQdxokwmqxgi9AHnS0XzonFmU";

const app       = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const messaging = getMessaging(app);
const db        = getFirestore(app);

// ── تسجيل الـ Service Worker ──────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/Mateen/firebase-messaging-sw.js');
    console.log('[FCM] Service Worker مسجّل:', reg.scope);
    return reg;
  } catch (err) {
    console.error('[FCM] فشل تسجيل Service Worker:', err);
    return null;
  }
}

// ── طلب إذن الإشعارات وحفظ التوكن ──────────────────────────────────────
export async function initNotifications(userId) {
  if (!userId) return;

  // لو المتصفح مش بيدعم الإشعارات
  if (!('Notification' in window)) {
    console.log('[FCM] المتصفح لا يدعم الإشعارات');
    return;
  }

  // لو الإشعارات مرفوضة مسبقاً، مش هنزعج المستخدم
  if (Notification.permission === 'denied') return;

  const swReg = await registerSW();
  if (!swReg) return;

  try {
    // طلب الإذن
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] المستخدم رفض الإشعارات');
      return;
    }

    // جيب التوكن
    const token = await getToken(messaging, {
      vapidKey:        VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      console.log('[FCM] التوكن:', token);
      // احفظ التوكن في Firestore جنب بيانات المستخدم
      await updateDoc(doc(db, 'users', userId), {
        fcmTokens: { [token]: true },   // ممكن يبقى عنده أكتر من جهاز
        notificationsEnabled: true
      });
    }
  } catch (err) {
    console.error('[FCM] خطأ في جلب التوكن:', err);
  }

  // ── رسائل وصلت والموقع مفتوح (Foreground) ─────────────────────────────
  onMessage(messaging, (payload) => {
    console.log('[FCM] رسالة في الـ foreground:', payload);
    const { title, body } = payload.notification || {};

    // لو الصفحة مش صفحة الرسائل — عرض إشعار داخلي
    if (!window.location.pathname.includes('messages.html')) {
      showInAppToast(title || 'رسالة جديدة', body || '');
    }
    // لو المستخدم داخل صفحة الرسائل — الـ listener عنده أصلاً يحدّث الشات
  });
}

// ── Toast داخلي بسيط لما يكون الموقع مفتوح ──────────────────────────────
function showInAppToast(title, body) {
  // امسح أي توست موجود
  document.getElementById('fcm-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'fcm-toast';
  toast.innerHTML = `
    <div style="
      position:fixed; bottom:20px; right:20px; z-index:99999;
      background:#1b4332; color:#fff; border-radius:12px;
      padding:14px 18px; min-width:260px; max-width:320px;
      box-shadow:0 4px 20px rgba(0,0,0,.3);
      font-family:inherit; direction:rtl; cursor:pointer;
      animation: slideIn .3s ease;
    " onclick="window.location.href='/Mateen/html/messages.html'">
      <div style="font-weight:700; margin-bottom:4px;">💬 ${title}</div>
      <div style="font-size:13px; opacity:.85;">${body}</div>
    </div>
    <style>
      @keyframes slideIn { from { transform:translateX(100px); opacity:0; } to { transform:translateX(0); opacity:1; } }
    </style>
  `;

  document.body.appendChild(toast);

  // اختفي تلقائياً بعد 5 ثواني
  setTimeout(() => toast.remove(), 5000);
}
