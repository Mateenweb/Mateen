/**
 * home-msg.js — عدادات الرسائل والأخبار الجديدة
 * يُحمَّل في home.html بعد home.js
 * يعمل على: navMsgBadge, sidebarMsgBadge, navNewsBadge, navNewsBadge2, sidebarNewsBadge
 */

import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, query, where,
         orderBy, getDocs, onSnapshot }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── دالة مساعدة تحدّث كل الـ badges بنفس القيمة ──────────────
function setBadge(ids, count) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.classList.remove('d-none');
    } else {
      el.classList.add('d-none');
    }
  });
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    // تصفير العدادات لو مش مسجلة دخول
    setBadge(['navMsgBadge','sidebarMsgBadge'], 0);
    setBadge(['navNewsBadge','navNewsBadge2','sidebarNewsBadge'], 0);
    return;
  }

  // ── 1. عداد الرسائل (Real-time) ─────────────────────────────
  try {
    const convQ = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
    onSnapshot(convQ, snap => {
      let total = 0;
      snap.forEach(d => {
        const data = d.data();
        // قراءة بكل الصيغ الممكنة
        const nested = data.unread?.[user.uid];
        const flat   = data[`unread.${user.uid}`];
        total += Math.max(Number(nested || 0), Number(flat || 0));
      });
      setBadge(['navMsgBadge', 'sidebarMsgBadge'], total);
    });
  } catch(e) {
    console.warn('[home-msg] messages badge error:', e);
  }

  // ── 2. عداد الأخبار الجديدة (One-time) ─────────────────────
  try {
    const lastSeenKey = `news_last_seen_${user.uid}`;
    const lastSeen    = parseInt(localStorage.getItem(lastSeenKey) || '0');

    const newsSnap = await getDocs(
      query(collection(db, 'news'), orderBy('createdAt', 'desc'))
    );
    let count = 0;
    newsSnap.forEach(d => {
      const ts = d.data().createdAt;
      if (ts && ts.toMillis() > lastSeen) count++;
    });
    setBadge(['navNewsBadge', 'navNewsBadge2', 'sidebarNewsBadge'], count);
  } catch(e) {
    console.warn('[home-msg] news badge error:', e);
  }
});
