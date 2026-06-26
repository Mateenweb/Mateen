
// ── كشف البيئة ──────────────────────────────────────────────────────────
const BASE = window.location.hostname.includes('github.io') ? '/Mateen' : '';
// ═══════════════════════════════════════════════════════
//  notifications.js — إشعارات فورية بـ Firestore onSnapshot
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, query, where, orderBy,
         onSnapshot, doc, getDoc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDocs }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

let notifUnsub = null;
let initialized = false;

// ── صوت إشعار ────────────────────────────────────────────────────────────
function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch(e) {}
}

// ── كتابة إشعار للـ Service Worker (للموبايل PWA) ───────────────────────
async function pushToSW(userId, title, body, url) {
  try {
    await addDoc(
      collection(db, 'notifications', userId, 'pending'),
      { title, body, url, createdAt: serverTimestamp() }
    );
  } catch(e) { }
}

// ── Toast إشعار ──────────────────────────────────────────────────────────
// container واحد لكل الـ toasts
function getToastContainer() {
  let c = document.getElementById('mateen-toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'mateen-toast-container';
    c.style.cssText = 'position:fixed;top:16px;left:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:320px';
    document.body.appendChild(c);
  }
  return c;
}

function showNotifToast(title, body, url) {
  const container = getToastContainer();

  const t = document.createElement('div');
  t.style.cssText = `
    background:#1a4a2e;color:#fff;border-radius:12px;
    padding:12px 16px;min-width:260px;max-width:320px;
    box-shadow:0 4px 20px rgba(0,0,0,.3);
    font-family:'Noto Naskh Arabic',serif;direction:rtl;cursor:pointer;
    animation:notifIn .3s ease;position:relative;
    transition:opacity .3s ease;`;

  t.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <div onclick="window.location.href='${url || BASE + '/html/messages.html'}'" style="flex:1">
        <div style="font-weight:700;font-size:14px;margin-bottom:3px">${title}</div>
        <div style="font-size:12.5px;opacity:.85">${body}</div>
      </div>
      <button style="background:none;border:none;color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;padding:0;line-height:1;flex-shrink:0"
        onclick="this.closest('[data-notif]').remove()">✕</button>
    </div>`;
  t.setAttribute('data-notif', '1');

  // إضافة style مرة واحدة
  if (!document.getElementById('notif-style')) {
    const s = document.createElement('style');
    s.id = 'notif-style';
    s.textContent = '@keyframes notifIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(s);
  }

  container.appendChild(t);
}

// ── Browser Notification ─────────────────────────────────────────────────
async function showBrowserNotif(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: window.location.origin + BASE + '/logo.png',
      badge: window.location.origin + BASE + '/favicon.ico',
      dir: 'rtl',
      lang: 'ar',
      tag: 'mateen-msg',
      renotify: true
    });
  }
}

// ── الاستماع لرسائل جديدة ────────────────────────────────────────────────
let newsUnsub = null;

function startListening(userId) {
  if (notifUnsub) { notifUnsub(); notifUnsub = null; }

  // ── رسائل ────────────────────────────────────────────
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId)
  );

  let firstLoad = true;
  const lastSeen = {};

  notifUnsub = onSnapshot(q, snap => {
    if (firstLoad) {
      snap.docs.forEach(d => {
        lastSeen[d.id] = d.data().lastAt?.seconds || 0;
      });
      firstLoad = false;
      return;
    }

    snap.docChanges().forEach(async change => {
      if (change.type !== 'modified' && change.type !== 'added') return;
      const data   = change.doc.data();
      const convId = change.doc.id;
      const lastMsg = data.lastMsg || '';
      const lastAt  = data.lastAt?.seconds || 0;
      const unread  = data.unread?.[userId] || 0;

      const lastSenderId = data.lastSenderId || '';

      // إشعار بس لو رسالة جديدة فعلاً ومن حد تاني وعنده محتوى
      const isNewMsg   = lastAt > (lastSeen[convId] || 0);
      const notFromMe  = lastSenderId !== '' && lastSenderId !== userId;
      const hasContent = lastMsg.trim() !== '';
      // تجاهل لو الـ unread بتاع المستخدم اتصفّر (يعني حد فتح الشات بس)
      const isReadEvent = data[`unread.${userId}`] === 0 && !isNewMsg;

      if (isNewMsg && notFromMe && hasContent && !isReadEvent) {
        lastSeen[convId] = lastAt;
        const onMsgsPage = window.location.pathname.includes('messages.html');
        playSound();

        // جيب اسم المرسل
        let senderName = 'رسالة جديدة';
        try {
          const senderSnap = await getDoc(doc(db, 'users', lastSenderId));
          if (senderSnap.exists()) senderName = senderSnap.data().name || senderName;
        } catch(e) {}

        const notifTitle = `💬 ${senderName}`;
        pushToSW(userId, notifTitle, lastMsg, window.location.origin + BASE + '/html/messages.html');
        if (!onMsgsPage) {
          showNotifToast(notifTitle, lastMsg, BASE + '/html/messages.html');
          showBrowserNotif(notifTitle, lastMsg);
        }
      }
    });
  });

  // ── أخبار جديدة ───────────────────────────────────────
  if (newsUnsub) { newsUnsub(); newsUnsub = null; }

  let newsFirstLoad = true;

  newsUnsub = onSnapshot(
    query(collection(db, 'news'), orderBy('createdAt', 'desc')),
    snap => {
      if (newsFirstLoad) { newsFirstLoad = false; return; }

      snap.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const n = change.doc.data();
        const onNewsPage = window.location.pathname.includes('news.html');
        playSound();
        // إشعار للـ SW للموبايل
        pushToSW(userId, '📢 ' + (n.title || 'خبر جديد'),
          n.body?.slice(0, 80) || '',
          'https://mateenweb.github.io/Mateen/html/news.html');
        if (!onNewsPage) {
          showNotifToast(
            '📢 ' + (n.title || 'خبر جديد'),
            n.body ? n.body.slice(0, 80) : '',
            '/Mateen/html/news.html'
          );
          showBrowserNotif('📢 ' + (n.title || 'خبر جديد — متين'), n.body?.slice(0, 80) || '');
        }
      });
    }
  );
}

// ── تفعيل تلقائي عند لوجين ───────────────────────────────────────────────
// unlock audio on first user interaction
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
  } catch(e) {}
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

onAuthStateChanged(auth, user => {
  if (user) {
    // أرسل الـ UID للـ Service Worker عشان يبدأ يستمع
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_USER', uid: user.uid
      });
    }
    startListening(user.uid);
    showMissedNotifications(user.uid);
    // ملاحظة: saveFCMToken() وطلب إذن الإشعارات التلقائي عُطّلا مؤقتاً.
    // السبب: VAPID key الحالية placeholder وبتفشل بـ 401 من Firebase،
    // وطلب الإذن تلقائياً عند تحميل الصفحة مخالف لمعايير الأداء وتجربة المستخدم.
    // لتفعيلهم مجدداً: ضعي VAPID key حقيقية من Firebase Console، وفعّلي
    // الإذن فقط عند ضغط المستخدم على زرار صريح (مثلاً "فعّلي الإشعارات").
  } else {
    if (notifUnsub) { notifUnsub(); notifUnsub = null; }
    if (newsUnsub)  { newsUnsub();  newsUnsub  = null; }
  }
});

// ── حفظ FCM Token في Firestore ───────────────────────────────────────────
async function saveFCMToken(userId) {
  try {
    // طلب إذن الإشعارات
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // جيب الـ VAPID key من Firebase Console
    // Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
    const VAPID_KEY = 'BAMZ2n5lXHUV_qZnniDhTbJZTAI2uqHnJai6ukrnNIZhIc-8-wgwci_CaDpcH25oacehhSYScFgk14XIp7aZJ2c';

    const swReg = await navigator.serviceWorker.ready;

    // استورد Firebase Messaging
    const { getMessaging, getToken } = await import(
      "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js"
    );
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      await updateDoc(doc(db, 'users', userId), {
        [`fcmTokens.${token}`]: true
      });
    }
  } catch(e) {
  }
}

// ── إشعارات الفائتة لما يفتح الموقع ─────────────────────────────────────
async function showMissedNotifications(userId) {
  try {
    const pendingSnap = await getDocs(
      query(collection(db, 'notifications', userId, 'pending'), orderBy('createdAt', 'asc'))
    );
    if (pendingSnap.empty) return;

    pendingSnap.forEach(d => {
      const n = d.data();
      showNotifToast(n.title || 'إشعار جديد', n.body || '', n.url || '');
      playSound();
      // امسح بعد العرض
      d.ref.delete().catch(() => {});
    });
  } catch(e) {
  }
}

// ── إشعارات الأدمن: حسابات جديدة بانتظار الموافقة ──────────────────────
function listenAdminNotifications(userId) {
  const q = query(
    collection(db, 'userNotifications', userId, 'items'),
    where('read', '==', false),
    orderBy('createdAt', 'asc')
  );
  onSnapshot(q, snap => {
    snap.docChanges().forEach(change => {
      if (change.type !== 'added') return;
      const n = change.doc.data();
      showNotifToast(n.title || 'إشعار جديد', n.body || '', n.url || '');
      playSound();
      // ضع علامة مقروء
      change.doc.ref.update({ read: true }).catch(() => {});
    });
  });
}

// ── export للاستخدام الخارجي لو محتاج ───────────────────────────────────
export async function initNotifications(userId) {
  if (!userId) return;
  // افحص role المستخدم
  try {
    const snap = await getDocs(query(collection(db, 'users')));
    // نجيب role من Firestore
  } catch(e) {}
}

export async function initAdminNotifications(userId, role) {
  if (!userId) return;
  if (role === 'admin' || role === 'supervisor') {
    listenAdminNotifications(userId);
  }
}

export { showNotifToast as showToast };




