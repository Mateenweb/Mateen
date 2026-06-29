
// ── كشف البيئة ──────────────────────────────────────────────────────────
const BASE = window.location.hostname.includes('github.io') ? '/Mateen' : '';
// ═══════════════════════════════════════════════════════
//  notifications.js — Notificationات فورية بـ Firestore onSnapshot
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

// ── صوت Notification ────────────────────────────────────────────────────────────
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

// ── كتابة Notification for the  Service Worker (للMobile PWA) ───────────────────────
async function pushToSW(userId, title, body, url) {
  try {
    await addDoc(
      collection(db, 'notifications', userId, 'pending'),
      { title, body, url, createdAt: serverTimestamp() }
    );
  } catch(e) { console.warn('[Notif] SW push failed:', e); }
}

// ── Toast Notification ──────────────────────────────────────────────────────────
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

  // Add style مرة واحدة
  if (!document.getElementById('notif-style')) {
    const s = document.createElement('style');
    s.id = 'notif-style';
    s.textContent = '@keyframes notifIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(s);
  }

  t.dataset.convUrl = url || '';
  const toastId = Date.now().toString() + Math.random().toString(36).slice(2);
  t.dataset.toastId = toastId;

  // احفظ في localStorage (لو مش موجود بالفعل بنفس الـ url+title)
  const stored = JSON.parse(localStorage.getItem('pendingToasts') || '[]');
  const isDup = stored.some(s => s.url === url && s.title === title);
  if (!isDup) {
    stored.push({ title, body, url, id: toastId });
    localStorage.setItem('pendingToasts', JSON.stringify(stored));
  }

  // لما يتقفل بالـ ✕ — امسحه من localStorage
  t.querySelector('button').addEventListener('click', () => {
    const arr = JSON.parse(localStorage.getItem('pendingToasts') || '[]');
    localStorage.setItem('pendingToasts', JSON.stringify(arr.filter(s => s.id !== toastId)));
  });

  container.appendChild(t);
}

// استعادة الـ toasts بعد refresh بدون إعادة حفظ
function restorePendingToasts() {
  const stored = JSON.parse(localStorage.getItem('pendingToasts') || '[]');
  stored.forEach(item => {
    const container = getToastContainer();
    const t = document.createElement('div');
    t.style.cssText = `background:#1a4a2e;color:#fff;border-radius:12px;padding:12px 16px;min-width:260px;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.3);font-family:'Noto Naskh Arabic',serif;direction:rtl;cursor:pointer;animation:notifIn .3s ease;position:relative;transition:opacity .3s ease;`;
    t.innerHTML = `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><div onclick="window.location.href='${item.url||''}'" style="flex:1"><div style="font-weight:700;font-size:14px;margin-bottom:3px">${item.title}</div><div style="font-size:12.5px;opacity:.85">${item.body}</div></div><button style="background:none;border:none;color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;padding:0;line-height:1;flex-shrink:0" id="close-${item.id}">✕</button></div>`;
    t.setAttribute('data-notif','1');
    t.dataset.convUrl = item.url || '';
    t.dataset.toastId = item.id;
    container.appendChild(t);
    document.getElementById('close-'+item.id)?.addEventListener('click', () => {
      const arr = JSON.parse(localStorage.getItem('pendingToasts')||'[]');
      localStorage.setItem('pendingToasts', JSON.stringify(arr.filter(s=>s.id!==item.id)));
      t.remove();
    });
  });
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

// ── الاستماع لMessages جthisدة ────────────────────────────────────────────────
let newsUnsub = null;

function startListening(userId) {
  if (notifUnsub) { notifUnsub(); notifUnsub = null; }

  // ── Messages ────────────────────────────────────────────
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId)
  );

  let firstLoad = true;
  const lastSeen = {};

  // ── تحديث دوت الرسائل في الناف ─────────────────────
  function updateMsgBadge(snap) {
    const readIds = new Set(JSON.parse(sessionStorage.getItem('readConvIds') || '[]'));
    console.log('[Notif] readIds:', [...readIds], '| conv IDs:', snap.docs.map(d => d.id));
    snap.docs.forEach(d => console.log('[Notif] conv:', d.id.slice(0,8), '| unread flat:', d.data()[`unread.${userId}`], '| unread nested:', d.data().unread?.[userId], '| inReadIds:', readIds.has(d.id)));
    const hasUnread = snap.docs.some(d => {
      if (readIds.has(d.id)) return false;
      // اعتمد على الـ nested map فقط — الـ flat field قديم وغير موثوق
      const unread = d.data().unread?.[userId] ?? 0;
      return Number(unread) > 0;
    });
    ['navMsgBadge','sidebarMsgBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      hasUnread ? el.classList.remove('d-none') : el.classList.add('d-none');
    });
  }

  notifUnsub = onSnapshot(q, snap => {
    updateMsgBadge(snap);
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
      const nested  = data.unread?.[userId];
      const flat    = data[`unread.${userId}`];
      const unread  = Math.max(Number(nested || 0), Number(flat || 0));

      const lastSenderId = data.lastSenderId || '';

      // Notification but/only If Message جthisدة فعلاً ومن حد تاني وعنthis Content
      const isNewMsg   = lastAt > (lastSeen[convId] || 0);
      const notFromMe  = lastSenderId !== '' && lastSenderId !== userId;
      const hasContent = lastMsg.trim() !== '';
      // تجاهل If الـ unread بتاع User اتRowّر (يعني حد فتح الشات but/only)
      const isReadEvent = (Number(data[`unread.${userId}`] || 0) === 0 && Number(data.unread?.[userId] || 0) === 0) && !isNewMsg;

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

  // ── News جthisدة ───────────────────────────────────────
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
        // Notification for the  SW للMobile
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

// ── Enable تلقائي عند Ifجين ───────────────────────────────────────────────
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
    console.log('[Notif] user logged in:', user.uid);
    // أرسل الـ UID for the  Service Worker So that يبدأ يستمع
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_USER', uid: user.uid
      });
    }
    startListening(user.uid);
    showMissedNotifications(user.uid);
    // ملاحظة: saveFCMToken() وطلب إذن الNotificationات التلقائي عُطّلا مؤقتاً.
    // السبب: VAPID key الحالية placeholder وبتفشل بـ 401 من Firebase،
    // وطلب الإذن تلقائياً عند Page load مخالف لمعايير الأداء وتجربة User.
    // لEnableهم مجدداً: ضعي VAPID key حقيقية من Firebase Console، وفعّلي
    // الإذن only عند ضغط User على Button صريح (مثلاً "فعّلي الNotificationات").
  } else {
    console.log('[Notif] no user');
    if (notifUnsub) { notifUnsub(); notifUnsub = null; }
    if (newsUnsub)  { newsUnsub();  newsUnsub  = null; }
  }
});

// ── حفظ FCM Token في Firestore ───────────────────────────────────────────
async function saveFCMToken(userId) {
  try {
    // طلب إذن الNotificationات
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
      console.log('[Notif] FCM token saved');
      await updateDoc(doc(db, 'users', userId), {
        [`fcmTokens.${token}`]: true
      });
    }
  } catch(e) {
    console.warn('[Notif] FCM token error:', e);
  }
}

// ── Notificationات الفائتة When يفتح الموقع ─────────────────────────────────────
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
      // امسح بعد الWidth/Display
      d.ref.delete().catch(() => {});
    });
  } catch(e) {
    console.warn('[Notif] missed notifications error:', e);
  }
}

// ── Notificationات Admin: حسابات جthisدة بانتظار الموافقة ──────────────────────
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

// ── export للاستخدام الخارجي If محتاج ───────────────────────────────────
export async function initNotifications(userId) {
  restorePendingToasts();
  if (!userId) return;
  // افحص role User
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

// تتنادى لما المستخدم يفتح شات معين — تشيل الـ toast المرتبط بيه
export function dismissToastForConv(url) {
  document.querySelectorAll('[data-notif][data-conv-url]').forEach(t => {
    if (t.dataset.convUrl && t.dataset.convUrl.includes(url)) {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }
  });
  const stored = JSON.parse(localStorage.getItem('pendingToasts') || '[]');
  localStorage.setItem('pendingToasts', JSON.stringify(stored.filter(s => !s.url.includes(url))));
}



