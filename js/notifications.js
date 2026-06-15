// ═══════════════════════════════════════════════════════
//  notifications.js — إشعارات فورية بـ Firestore onSnapshot
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, query, where, orderBy,
         onSnapshot, doc, updateDoc }
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

// ── Toast إشعار ──────────────────────────────────────────────────────────
function showNotifToast(title, body, url) {
  document.getElementById('mateen-notif-toast')?.remove();
  const t = document.createElement('div');
  t.id = 'mateen-notif-toast';
  t.innerHTML = `
    <div onclick="window.location.href='${url || '/Mateen/html/messages.html'}'" style="
      position:fixed;bottom:24px;left:24px;z-index:99999;
      background:#1a4a2e;color:#fff;border-radius:14px;
      padding:14px 18px;min-width:260px;max-width:320px;
      box-shadow:0 6px 24px rgba(0,0,0,.35);
      font-family:'Noto Naskh Arabic',serif;direction:rtl;cursor:pointer;
      animation:notifIn .3s ease">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">💬 ${title}</div>
      <div style="font-size:13px;opacity:.85">${body}</div>
      <div style="font-size:11px;opacity:.55;margin-top:6px">اضغطي للفتح</div>
    </div>
    <style>@keyframes notifIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
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
      icon: '/Mateen/logo.png',
      badge: '/Mateen/favicon.ico',
      dir: 'rtl',
      lang: 'ar',
      tag: 'mateen-msg',
      renotify: true
    });
  }
}

// ── الاستماع لرسائل جديدة ────────────────────────────────────────────────
function startListening(userId) {
  if (notifUnsub) { notifUnsub(); notifUnsub = null; }

  // استمع للمحادثات اللي المستخدم طرف فيها
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId)
  );

  // لا نبعت إشعار أول تحميل — بس للرسائل الجديدة بعد كده
  let firstLoad = true;
  // حفظ آخر lastAt لكل محادثة
  const lastSeen = {};

  notifUnsub = onSnapshot(q, snap => {
    if (firstLoad) {
      // سجّل الحالة الحالية بدون إشعار
      snap.docs.forEach(d => {
        lastSeen[d.id] = d.data().lastAt?.seconds || 0;
      });
      firstLoad = false;
      return;
    }

    snap.docChanges().forEach(async change => {
      if (change.type !== 'modified' && change.type !== 'added') return;
      const data = change.doc.data();
      const convId = change.doc.id;

      // تجاهل لو الرسالة من المستخدم نفسه
      const lastMsg = data.lastMsg || '';
      const lastAt  = data.lastAt?.seconds || 0;
      const unread  = data.unread?.[userId] || 0;

      // إشعار بس لو في unread وآخر رسالة أحدث من اللي شفناه
      if (unread > 0 && lastAt > (lastSeen[convId] || 0)) {
        lastSeen[convId] = lastAt;

        // مش في صفحة الرسائل
        const onMsgsPage = window.location.pathname.includes('messages.html');

        playSound();
        if (!onMsgsPage) {
          showNotifToast('رسالة جديدة 💬', lastMsg, '/Mateen/html/messages.html');
          showBrowserNotif('رسالة جديدة — متين 💬', lastMsg);
        }
      }
    });
  });
}

// ── تفعيل تلقائي عند لوجين ───────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    startListening(user.uid);
    // طلب إذن الإشعارات بعد تفاعل المستخدم
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => Notification.requestPermission(), 3000);
    }
  } else {
    if (notifUnsub) { notifUnsub(); notifUnsub = null; }
  }
});

// ── export للاستخدام الخارجي لو محتاج ───────────────────────────────────
export function initNotifications() {}
export { showNotifToast as showToast };
