
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { initNotifications, initAdminNotifications } from "./notifications.js";
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
  const loading = document.getElementById('sidebar-loading');

  // أخفي loading
  if (loading) loading.style.display = 'none';

  if (!user) {
    guest.style.display = 'block';
    userDiv.classList.add('sidebar-user-hidden');
    if (layout) layout.classList.add('guest-layout');
    const heroBtnsGuest = document.getElementById('heroBtns');
    if (heroBtnsGuest) { heroBtnsGuest.classList.remove('d-none'); heroBtnsGuest.classList.add('d-flex'); }
    return;
  }

  if (layout) layout.classList.remove('guest-layout');

  // Hide زراير the hero When تسجل دخول
  const heroBtns = document.getElementById('heroBtns');
  if (heroBtns) { heroBtns.classList.remove('d-flex','d-lg-flex'); heroBtns.classList.add('d-none'); }

  // Hide زراير the navbar
  const navBtns = document.getElementById('navBtns');
  if (navBtns) { navBtns.classList.remove('d-flex','d-lg-flex'); navBtns.classList.add('d-none'); }
  const mobNavBtns = document.getElementById('mobNavBtns');
  if (mobNavBtns) { mobNavBtns.classList.remove('d-flex','d-lg-flex'); mobNavBtns.classList.add('d-none'); }

  // Show navUserActions (أيقونة الProfile + Messagesي)
  const navUserActions = document.getElementById('navUserActions');
  if (navUserActions) { navUserActions.classList.remove('d-none'); navUserActions.classList.add('d-flex'); }

  // Show Button "Messagesي" in the نافبار
  const navMsgBtn = document.getElementById('navMsgBtn');
  if (navMsgBtn) navMsgBtn.classList.remove('d-none');

  // أيقونة الProfile — هتتحدد بعد ما نجيب الـ role

  // مسجلة دخول — اجلب بيانات Userة
  guest.classList.add('d-none');
  userDiv.classList.remove('sidebar-user-hidden'); userDiv.classList.add('show-user');

  // Enable Notificationات الموقع
  initNotifications(user.uid);

  const snap   = await getDoc(doc(db, 'users', user.uid));
  const role    = snap.exists() ? snap.data().role    : 'student';
  const status  = snap.exists() ? snap.data().status  : 'pending';
  const subject = snap.exists() ? snap.data().subject || '' : '';
  const name   = user.displayName || user.email.split('@')[0];

  document.getElementById('sidebarName').textContent = 'مرحباً، ' + name;
  document.getElementById('sidebarRole').textContent =
    role === 'admin'      ? 'إدارية' :
    role === 'supervisor' ? 'مشرفة' :
    role === 'teacher'    ? 'معلمة' :
    role === 'mateen'     ? 'بنات متين' :
    role === 'support'    ? 'الدعم الفني' : 'الطالبة';

  // ── Show الـ links حسب الـ role ──────────────────────────
  function show(id) { const el = document.getElementById(id); if(el) el.classList.remove('d-none'); }
  function hide(id)  { const el = document.getElementById(id); if(el) el.classList.add('d-none'); }

  // روابط specific ببنات متين but/only — Hide لأي دور تاني
  if (role !== 'mateen') {
    hide('profileLink');
    hide('linkCerts');
    hide('linkAwards');
    hide('linkGrades');
    hide('linkSchedule');
  }

  // طالباتي — تخفى من Admin  and the not/don'tرفة
  if (role === 'admin' || role === 'supervisor') {
    hide('linkTeacher');
  }

  if (role === 'admin') {
    show('linkAdmin');
    show('linkNews');
  } else if (role === 'supervisor') {
    const linkAdminEl = document.getElementById('linkAdmin');
    if (linkAdminEl) {
      linkAdminEl.href = 'supervisor.html';
      linkAdminEl.innerHTML = '<i class="ti ti-shield"></i> لوحة المشرفة';
    }
    show('linkAdmin');
    show('linkNews');
  } else if (role === 'teacher') {
    show('linkNews');
    show('linkTeacher');
  } else if (role === 'mateen') {
    show('linkCerts');
    show('linkAwards');
    show('linkGrades');
    show('linkSchedule');
    show('linkNews');
  }
  // student: الرئيسية وMessagesي but/only

  // ── أيقونة الProfile وFileي الشخصي — تظهر only بعد Enable الحساب ──
  const profileLink   = document.getElementById('profileLink');
  const navProfileBtn = document.getElementById('navProfileBtn');

  if (status !== 'active') {
    // الحساب لسه pending أو suspended — اخفِ الأيقونة تماماً
    if (profileLink)   profileLink.classList.add('d-none');
    if (navProfileBtn) navProfileBtn.classList.add('d-none');
  } else {
    // أيقونة الProfile — تظهر لكل Roles المفعّلة
    const navAvatar = document.getElementById('navProfileAvatar');
    const avatarEmoji =
      role === 'admin'      ? '👑' :
      role === 'supervisor' ? '🎓' :
      role === 'teacher'    ? '📚' :
      role === 'mateen'     ? '🧕' :
      role === 'support'    ? '🛠️' : '🌸';
    if (navAvatar) navAvatar.textContent = avatarEmoji;

    if (role === 'mateen') {
      const linkedId = snap.data().linkedStudentId;
      if (linkedId) {
        if (profileLink)   { profileLink.href = `student.html?id=${linkedId}`; profileLink.classList.remove('d-none'); }
        if (navProfileBtn) { navProfileBtn.href = `student.html?id=${linkedId}`; navProfileBtn.classList.remove('d-none'); }
      } else {
        if (navProfileBtn) navProfileBtn.classList.remove('d-none');
      }
    } else if (role === 'admin') {
      if (navProfileBtn) { navProfileBtn.href = 'admin.html'; navProfileBtn.classList.remove('d-none'); }
    } else if (role === 'supervisor') {
      if (navProfileBtn) { navProfileBtn.href = 'supervisor.html'; navProfileBtn.classList.remove('d-none'); }
    } else if (role === 'teacher') {
      const teacherPageMap = {
        'tafseer':'teacher-tafseer.html','fiqh':'teacher-fiqh.html',
        'aqeedah':'teacher-aqeedah.html','hadith':'teacher-hadeeth.html',
        'quran':'teacher-quran1.html','quran1':'teacher-quran1.html','quran2':'teacher-quran2.html'
      };
      const teacherPage = teacherPageMap[subject] || 'teacher-profile.html';
      if (navProfileBtn) { navProfileBtn.href = teacherPage; navProfileBtn.classList.remove('d-none'); }
    } else {
      if (navProfileBtn) navProfileBtn.classList.remove('d-none');
    }
  }
});

window.doLogout = () =>
  signOut(auth).then(() => window.location.href = '../html/login.html');

