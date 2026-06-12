
import { initializeApp, getApps, getApp }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Sidebar auth state ────────────────────────
onAuthStateChanged(auth, async user => {
  const guest   = document.getElementById('sidebar-guest');
  const userDiv = document.getElementById('sidebar-user');
  if (!user) { guest.style.display='block'; userDiv.style.display='none'; return; }
  guest.style.display='none'; userDiv.style.display='flex'; userDiv.classList.add('show-user');

  // إخفاء زراير تسجيل الدخول/التسجيل لما تكون مسجلة دخول
  ['heroBtns','navBtns','mobNavBtns'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('d-flex','d-lg-flex'); el.classList.add('d-none'); }
  });
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('sidebarName').textContent = 'مرحباً، ' + name;
  document.getElementById('sidebarRole').textContent = role === 'admin' ? 'مشرفة / معلمة' : 'الطالبة';
  if (role === 'admin') {
    const nav = userDiv.querySelector('.sidebar-nav');
    if (nav && !nav.querySelector('.admin-link')) {
      const d = document.createElement('div'); d.className='sidebar-divider'; nav.appendChild(d);
      const a = document.createElement('a'); a.href='admin.html'; a.className='admin-link';
      a.innerHTML='<i class="ti ti-shield"></i> لوحة الإداريات'; nav.appendChild(a);
    }
  }
});
window.doLogout = () => signOut(auth).then(() => window.location.href='../html/login.html');

// Contact form removed — messages now handled via messages.html
