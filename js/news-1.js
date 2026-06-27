renderNav('news.html')

// ── Update "آخر not/don'tاهدة" عند فتح Page الNews ────────────────
import { getAuth, onAuthStateChanged as _onAuth }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getApps, getApp, initializeApp as _init }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { FIREBASE_CONFIG as _CFG } from "./config.js";

(function markNewsSeen() {
  const _app  = getApps().length ? getApp() : _init(_CFG);
  const _auth = getAuth(_app);
  _onAuth(_auth, user => {
    if (!user) return;
    localStorage.setItem(`news_last_seen_${user.uid}`, Date.now().toString());
  });
})();
