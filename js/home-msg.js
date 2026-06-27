import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, orderBy }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async user => {
  if (!user) return;

  const navBadge     = document.getElementById('navMsgBadge');
  const sidebarBadge = document.getElementById('sidebarMsgBadge');
  if (!navBadge && !sidebarBadge) return;

  try {
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
    const convSnap = await getDocs(q);

    let total = 0;
    convSnap.forEach(d => {
      const data   = d.data();
      const unread = data.unread && data.unread[user.uid] ? data.unread[user.uid] : 0;
      total += unread;
    });

    [navBadge, sidebarBadge].forEach(badge => {
      if (!badge) return;
      if (total > 0) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.classList.remove('d-none');
      } else {
        badge.classList.add('d-none');
      }
    });

  } catch (err) {
    console.error('home-msg:', err);
  }
});

// ── أيقونة الNews — عد الNews الجthisدة منذ آخر زيارة ──────
onAuthStateChanged(auth, async user => {
  if (!user) return;
  const navBadge     = document.getElementById('navNewsBadge');
  const sidebarBadge = document.getElementById('sidebarNewsBadge');
  if (!navBadge && !sidebarBadge) return;
  try {
    const lastSeenKey = `news_last_seen_${user.uid}`;
    const lastSeen    = parseInt(localStorage.getItem(lastSeenKey) || '0');
    const snap = await getDocs(
      query(collection(db, 'news'), orderBy('createdAt', 'desc'))
    );
    let count = 0;
    snap.forEach(d => {
      const ts = d.data().createdAt;
      if (ts && ts.toMillis() > lastSeen) count++;
    });
    [navBadge, sidebarBadge].forEach(badge => {
      if (!badge) return;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('d-none');
      } else {
        badge.classList.add('d-none');
      }
    });
  } catch(e) { console.error('news-badge:', e); }
});
