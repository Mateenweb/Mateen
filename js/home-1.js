
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
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

  // تحديث زراير الـ hero لما المستخدمة تسجّل دخول
  const heroBtns = document.getElementById('heroBtns');
  if (heroBtns) {
    heroBtns.innerHTML = `
      <button class="hero-btn-gold" onclick="document.getElementById('reg-modal').classList.add('open')">التسجيل في البرنامج</button>
      <button class="hero-btn-white">المزيد عن البرنامج ←</button>`;
  }

  // مسجلة دخول — اجلب بيانات المستخدمة
  guest.style.display   = 'none';
  userDiv.style.display = 'block';

  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  const name = user.displayName || user.email.split('@')[0];

  document.getElementById('sidebarName').textContent = 'مرحباً، ' + name;
  document.getElementById('sidebarRole').textContent =
    role === 'admin' ? 'مشرفة / معلمة' : 'الطالبة';

  // إخفاء زرار "عرض صفحات المعلمات" من الطالبات
  if (role === 'student' || role === 'mateen') {
    const teachersLink = document.querySelector('a[href="teachers.html"]');
    if (teachersLink) teachersLink.closest('.contact-card').style.display = 'none';
  }

  // زرار "ملفي الشخصي"
  const profileLink = document.getElementById('profileLink');
  if (profileLink) {
    if (role === 'mateen' || role === 'student') {
      const userData = snap.data();
      const linkedId = userData.linkedStudentId || null;
      if (linkedId) {
        profileLink.href = 'student.html?id=' + linkedId;
      } else {
        profileLink.href = 'student-general.html';
      }
      profileLink.style.display = '';
    } else {
      profileLink.style.display = 'none';
    }
  }
  // لو إدارية — أضيف رابط لوحة الإدارة
  if (role === 'admin') {
    const nav = userDiv.querySelector('.sidebar-nav');
    if (nav && !nav.querySelector('.admin-link')) {
      const divider = document.createElement('div');
      divider.className = 'sidebar-divider';
      const link = document.createElement('a');
      link.href = 'admin.html';
      link.className = 'admin-link';
      link.innerHTML = '<i class="ti ti-shield"></i> لوحة الإداريات';
      nav.appendChild(divider);
      nav.appendChild(link);
    }
  }
});

window.doLogout = () =>
  signOut(auth).then(() => window.location.href = 'login.html');
