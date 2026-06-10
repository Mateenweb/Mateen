
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async user => {
  const guest = document.getElementById('sidebar-guest');
  const userDiv = document.getElementById('sidebar-user');

  if (!user) {
    guest.style.display   = 'block';
    userDiv.style.display = 'none';
    return;
  }

  // إخفاء زراير الـ hero لما تسجل دخول
  const heroBtns = document.getElementById('heroBtns');
  if (heroBtns) heroBtns.style.display = 'none';

  // إخفاء زراير الـ navbar
  const navBtns = document.getElementById('navBtns');
  if (navBtns) navBtns.style.display = 'none';
  const mobNavBtns = document.getElementById('mobNavBtns');
  if (mobNavBtns) mobNavBtns.style.display = 'none';

  // مسجلة دخول — اجلب بيانات المستخدمة
  guest.style.display   = 'none';
  userDiv.style.display = 'block';

  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  const name = user.displayName || user.email.split('@')[0];

  document.getElementById('sidebarName').textContent = 'مرحباً، ' + name;
  document.getElementById('sidebarRole').textContent =
    role === 'admin' ? 'إدارية' : 'الطالبة';

  // لو إدارية — امسح كل الروابط وأضيف بس لوحة الإدارة
  if (role === 'admin') {
    const nav = userDiv.querySelector('.sidebar-nav');
    if (nav) {
      nav.innerHTML = `
        <a href="../html/admin.html" class="admin-link" style="display:flex;align-items:center;gap:12px;padding:10px 14px;color:var(--text-mid);text-decoration:none;border-radius:6px;transition:all 0.2s;">
          <i class="ti ti-shield"></i> لوحة الإداريات
        </a>`;
    }
    return;
  }

  // إخفاء زرار "عرض صفحات المعلمات" من الطالبات
  if (role === 'student' || role === 'mateen') {
    const teachersLink = document.querySelector('a[href="teachers.html"]');
    if (teachersLink) teachersLink.closest('.contact-card').style.display = 'none';
  }

  // إخفاء "ملفي الشخصي" من غير طالبات متين
  const profileLink = document.getElementById('profileLink');
  if (profileLink && role !== 'mateen') {
    profileLink.style.display = 'none';
  }
});

window.doLogout = () =>
  signOut(auth).then(() => window.location.href = '../html/login.html');
