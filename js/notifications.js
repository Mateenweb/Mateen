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
      position:fixed;top:24px;left:24px;z-index:99999;
      background:#1a4a2e;color:#fff;border-radius:14px;
      padding:14px 18px;min-width:260px;max-width:320px;
      box-shadow:0 6px 24px rgba(0,0,0,.35);
      font-family:'Noto Naskh Arabic',serif;direction:rtl;cursor:pointer;
      animation:notifIn .3s ease">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">💬 ${title}</div>
      <div style="font-size:13px;opacity:.85">${body}</div>
      <div style="font-size:11px;opacity:.55;margin-top:6px">اضغطي للفتح</div>
    </div>
    <style>@keyframes notifIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>`;
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
      icon: 'https://mateenweb.github.io/Mateen/logo.png',
      badge: 'https://mateenweb.github.io/Mateen/favicon.ico',
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
      console.log('[Notif] conv change:', change.type, convId, 'unread:', unread, 'lastAt:', lastAt, 'lastSeen:', lastSeen[convId], 'sender:', lastSenderId);

      // إشعار لو آخر رسالة جديدة ومش من المستخدم الحالي
      const isNewMsg   = lastAt > (lastSeen[convId] || 0);
      const notFromMe  = lastSenderId !== userId && lastSenderId !== '';

      if (isNewMsg && notFromMe) {
        lastSeen[convId] = lastAt;
        console.log('[Notif] 🔔 NEW MESSAGE! showing notification');
        const onMsgsPage = window.location.pathname.includes('messages.html');
        playSound();
        if (!onMsgsPage) {
          showNotifToast('رسالة جديدة 💬', lastMsg, '/Mateen/html/messages.html');
          showBrowserNotif('رسالة جديدة — متين 💬', lastMsg);
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
    console.log('[Notif] user logged in:', user.uid);
    startListening(user.uid);
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => Notification.requestPermission().then(p => {
        console.log('[Notif] permission:', p);
      }), 3000);
    } else {
      console.log('[Notif] notification permission:', Notification.permission);
    }
  } else {
    console.log('[Notif] no user');
    if (notifUnsub) { notifUnsub(); notifUnsub = null; }
    if (newsUnsub)  { newsUnsub();  newsUnsub  = null; }
  }
});

// ── export للاستخدام الخارجي لو محتاج ───────────────────────────────────
export function initNotifications() {}
export { showNotifToast as showToast };

