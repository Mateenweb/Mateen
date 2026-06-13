import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

const ROLE_BG = {
  student:    '#d8f3dc',
  mateen:     '#b7e4c7',
  teacher:    '#e9f5db',
  supervisor: '#fff3cd',
  admin:      '#f8d7da'
};

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `منذ ${hrs} س`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `منذ ${days} ي`;
  return d.toLocaleDateString('ar-SA', { day:'numeric', month:'short' });
}

function initials(name) {
  if (!name) return '؟';
  const parts = name.trim().split(' ');
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name[0];
}

onAuthStateChanged(auth, async user => {
  if (!user) return;

  const section = document.getElementById('homeMessagesSection');
  const listEl  = document.getElementById('homeConvList');
  if (!section || !listEl) return;

  section.style.display = 'block';

  try {
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastAt', 'desc'),
      limit(5)
    );

    const convSnap = await getDocs(q);

    if (convSnap.empty) {
      listEl.innerHTML = `
        <div class="home-conv-empty">
          <i class="ti ti-message-off" style="font-size:26px;display:block;margin-bottom:6px;color:#ccc"></i>
          لا توجد محادثات بعد —
          <a href="messages.html?compose=1" style="color:var(--green-dark);font-weight:600">ابدئي محادثة جديدة</a>
        </div>`;
      return;
    }

    // collect other user IDs
    const otherIds = [];
    convSnap.forEach(d => {
      const other = (d.data().participants || []).find(p => p !== user.uid);
      if (other && !otherIds.includes(other)) otherIds.push(other);
    });

    // fetch profiles
    const userCache = {};
    await Promise.all(otherIds.map(async uid => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) userCache[uid] = snap.data();
      } catch (_) {}
    }));

    let html = '';
    convSnap.forEach(d => {
      const data    = d.data();
      const otherId = (data.participants || []).find(p => p !== user.uid);
      const other   = userCache[otherId] || {};
      const name    = other.name || 'مستخدم';
      const role    = other.role || 'student';
      const lastMsg = data.lastMsg || '...';
      const unread  = data.unread && data.unread[user.uid] ? data.unread[user.uid] : 0;
      const bg      = ROLE_BG[role] || '#e8f4ea';

      html += `
        <a class="home-conv-item" href="messages.html?conv=${d.id}">
          <div class="home-conv-avatar" style="background:${bg}">${initials(name)}</div>
          <div class="home-conv-body">
            <div class="home-conv-name">${name}</div>
            <div class="home-conv-preview">${lastMsg}</div>
          </div>
          <div class="home-conv-meta">
            <span class="home-conv-time">${timeAgo(data.lastAt)}</span>
            ${unread > 0 ? `<span class="home-conv-unread">${unread}</span>` : ''}
          </div>
        </a>`;
    });

    listEl.innerHTML = html;

  } catch (err) {
    console.error('home-msg:', err);
    listEl.innerHTML = `<div class="home-conv-empty">تعذّر تحميل الرسائل</div>`;
  }
});
