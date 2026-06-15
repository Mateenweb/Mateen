
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
  const guest   = document.getElementById('sidebar-guest');
  const userDiv = document.getElementById('sidebar-user');
  const layout  = document.querySelector('.page-layout');

  if (!user) {
    guest.style.display   = 'block';
    userDiv.style.display = 'none';
    if (layout) layout.classList.add('guest-layout');
    return;
  }

  if (layout) layout.classList.remove('guest-layout');

  // إخفاء زراير الـ hero لما تسجل دخول
  const heroBtns = document.getElementById('heroBtns');
  if (heroBtns) { heroBtns.classList.remove('d-flex','d-lg-flex'); heroBtns.classList.add('d-none'); }

  // إخفاء زراير الـ navbar
  const navBtns = document.getElementById('navBtns');
  if (navBtns) { navBtns.classList.remove('d-flex','d-lg-flex'); navBtns.classList.add('d-none'); }
  const mobNavBtns = document.getElementById('mobNavBtns');
  if (mobNavBtns) { mobNavBtns.classList.remove('d-flex','d-lg-flex'); mobNavBtns.classList.add('d-none'); }

  // إظهار زرار "رسائلي" في النافبار
  const navMsgBtn = document.getElementById('navMsgBtn');
  if (navMsgBtn) navMsgBtn.classList.remove('d-none');

  // أيقونة البروفايل — هتتحدد بعد ما نجيب الـ role

  // مسجلة دخول — اجلب بيانات المستخدمة
  guest.style.display   = 'none';
  userDiv.style.display = 'block'; userDiv.classList.add('show-user');

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
        <a href="admin.html" class="admin-link" style="display:flex;align-items:center;gap:12px;padding:10px 14px;color:var(--text-mid);text-decoration:none;border-radius:6px;transition:all 0.2s;">
          <i class="ti ti-shield"></i> لوحة الإداريات
        </a>`;
    }
    return;
  }

  // ضبط رابط "ملفي الشخصي" وأيقونة البروفايل — لبنات متين فقط
  const profileLink   = document.getElementById('profileLink');
  const navProfileBtn = document.getElementById('navProfileBtn');

  if (role === 'mateen') {
    const linkedId = snap.data().linkedStudentId;
    if (linkedId) {
      if (profileLink)   profileLink.href = `student.html?id=${linkedId}`;
      if (navProfileBtn) { navProfileBtn.href = `student.html?id=${linkedId}`; navProfileBtn.classList.remove('d-none'); }
    } else {
      if (profileLink)   profileLink.style.display = 'none';
      if (navProfileBtn) navProfileBtn.classList.add('d-none');
    }
  } else {
    if (profileLink)   profileLink.style.display = 'none';
    if (navProfileBtn) navProfileBtn.classList.add('d-none');
  }
});

window.doLogout = () =>
  signOut(auth).then(() => window.location.href = '../html/login.html');
