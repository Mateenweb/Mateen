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
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function playSound() {
  try {
    const ctx = getAudioCtx();
    const doPlay = () => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(doPlay).catch(() => {});
    } else {
      doPlay();
    }
  } catch(e) {}
}
// ── Toast إشعار ──────────────────────────────────────────────────────────
let msgCount  = 0;
let newsCount = 0;

function updateBadges() {
  ['navMsgBadge','sidebarMsgBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (msgCount > 0) { el.textContent = msgCount > 99 ? '99+' : msgCount; el.classList.remove('d-none'); }
    else el.classList.add('d-none');
  });
  ['navNewsBadge','sidebarNewsBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (newsCount > 0) { el.textContent = newsCount > 99 ? '99+' : newsCount; el.classList.remove('d-none'); }
    else el.classList.add('d-none');
  });
}

function showNotifToast(title, body, url, type = 'msg') {
  const toastId = 'mateen-notif-toast-' + Date.now();
  const t = document.createElement('div');
  t.id = toastId;
  t.innerHTML = `
    <div style="
      position:fixed;left:24px;z-index:99999;
      background:#1a4a2e;color:#fff;border-radius:14px;
      padding:14px 18px;min-width:260px;max-width:320px;
      box-shadow:0 6px 24px rgba(0,0,0,.35);
      font-family:'Noto Naskh Arabic',serif;direction:rtl;
      animation:notifIn .3s ease">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div onclick="window.location.href='${url || '/Mateen/html/messages.html'}';document.getElementById('${toastId}')?.remove();" style="cursor:pointer;flex:1">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">💬 ${title}</div>
          <div style="font-size:13px;opacity:.85">${body}</div>
          <div style="font-size:11px;opacity:.55;margin-top:6px">اضغطي للفتح</div>
        </div>
        <button onclick="document.getElementById('${toastId}')?.remove();${type==='msg'?'msgCount=Math.max(0,msgCount-1)':'newsCount=Math.max(0,newsCount-1)'};updateBadges();"
          style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:18px;cursor:pointer;padding:0 0 0 8px;line-height:1">✕</button>
      </div>
    </div>
    <style>@keyframes notifIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>`;
     const existing = document.querySelectorAll('[id^="mateen-notif-toast-"]');
    let offset = 0;
    existing.forEach(el => { offset += el.offsetHeight + 10; });
    t.querySelector('div').style.top = (24 + offset) + 'px';
  document.body.appendChild(t);
  // مش بيختفي تلقائي — بس لما تضغطي ✕ أو تفتحيه
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
      // لو lastSenderId فاضي (رسائل قديمة) نكتفي بـ isNewMsg
      const notFromMe = lastSenderId === '' ? true : lastSenderId !== userId;

      if (isNewMsg && notFromMe) {
        lastSeen[convId] = lastAt;
        console.log('[Notif] 🔔 NEW MESSAGE! showing notification');
        const onMsgsPage = window.location.pathname.includes('messages.html');
        playSound();
        if (!onMsgsPage) {
          msgCount++;
          updateBadges();
          showNotifToast('رسالة جديدة 💬', lastMsg, '/Mateen/html/messages.html', 'msg');
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
          newsCount++;
          updateBadges();
          showNotifToast(
            '📢 ' + (n.title || 'خبر جديد'),
            n.body ? n.body.slice(0, 80) : '',
            '/Mateen/html/news.html',
            'news'
          );
          showBrowserNotif('📢 ' + (n.title || 'خبر جديد — متين'), n.body?.slice(0, 80) || '');
        }
      });
    }
  );
}

// ── تفعيل تلقائي عند لوجين ───────────────────────────────────────────────
// unlock audio on first user interaction
function unlockAudio() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch(e) {}
}
document.addEventListener('click',      unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('touchend',   unlockAudio, { once: true });

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

