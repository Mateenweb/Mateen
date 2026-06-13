import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where }
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
