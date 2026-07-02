// ═══════════════════════════════════════════════════════════════
//  home.js — File مدمج لكل منطق home.html
//  (كان مقسّم على: home-1.js, home-2.js, home-3.js, home-4.js, home-msg.js)
//  تم الدمج لتقليل عدد network requests وتكرار onAuthStateChanged
//  كل الشروط  and the منطق محفوظة بالضبط كما كانت in the Fileات الأصلية.
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { initNotifications } from "./notifications.js";
import { getFirestore, doc, getDoc, getDocs, addDoc, setDoc,
         collection, query, where, orderBy, serverTimestamp, onSnapshot, limit }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── المواعيد المهمة (تظهر للجميع بدون تسجيل دخول) ──────────────
onSnapshot(query(collection(db, 'events'), orderBy('order')), snap => {
  const el = document.getElementById('homeEventsList');
  if (!el) return;
  if (snap.empty) {
    el.innerHTML = '<div class="tl-item"><div class="tl-dot"></div><div><div class="tl-label" style="color:#aaa">لا توجد مواعيد</div></div></div>';
    return;
  }
  el.innerHTML = snap.docs.map(d => {
    const e = d.data();
    return `<div class="tl-item">
      <div class="tl-dot ${e.highlight ? 'gold' : ''}"></div>
      <div>
        <div class="tl-label">${e.label || e.title || ''}</div>
        <div class="tl-date">${e.date || ''}</div>
      </div>
    </div>`;
  }).join('');
});

// ── آخر الإعلانات العامة (تظهر للجميع بدون تسجيل دخول) ──────────────
onSnapshot(query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(6)), snap => {
  const section = document.getElementById('publicNewsSection');
  const list    = document.getElementById('publicNewsList');
  if (!section || !list) return;
  const publicDocs = snap.docs.filter(d => (d.data().visibility || 'all') !== 'members');
  if (publicDocs.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = publicDocs.map(d => {
    const n = d.data();
    const date = n.createdAt ? new Date(n.createdAt.seconds * 1000).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }) : '';
    return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="news-card" style="background:white;border-radius:14px;border:1px solid var(--border);padding:18px 20px;height:100%;">
          ${n.tag ? `<span style="font-size:11px;background:var(--beige);color:var(--green-dark);padding:3px 10px;border-radius:10px;">${n.tag}</span>` : ''}
          <h3 style="font-family:Amiri,serif;font-size:16px;color:var(--green-dark);margin:10px 0 6px;">${n.title || ''}</h3>
          <p style="font-size:13px;color:var(--text-mid);line-height:1.6;margin-bottom:10px;">${(n.body || '').slice(0,100)}${(n.body||'').length>100?'…':''}</p>
          <div style="font-size:11px;color:#aaa;">${date}</div>
        </div>
      </div>`;
  }).join('');
});

/* ═══════════════════════════════════════════════════════════════
   مستمع واحد موحّد لـ onAuthStateChanged
   (كان فيه 4 مستمعات منفصلة في home-1 + home-2 + home-msg×2)
   notifications.js له مستمعه الخاص Becauseه File not/don'tترك بين 23 Page
   ═══════════════════════════════════════════════════════════════ */

// ── Onboarding ─────────────────────────────────────────────────────────────
function showOnboarding() {
  if (document.getElementById('onboardingModal')) return;

  const modal = document.createElement('div');
  modal.id = 'onboardingModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:white;border-radius:24px;padding:36px 28px;max-width:380px;width:92%;text-align:center;font-family:inherit;direction:rtl;">
      <img src="../logo.png" style="width:72px;height:72px;border-radius:50%;border:3px solid var(--gold);margin-bottom:16px;">
      <div style="font-family:Amiri,serif;font-size:24px;color:var(--green-dark);font-weight:700;margin-bottom:6px;">أهلاً بكِ في متين 🌿</div>
      <p style="color:var(--text-mid);font-size:14px;line-height:1.8;margin-bottom:24px;">فعّلي الإشعارات وأضيفي التطبيق لشاشتك الرئيسية</p>

      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
        <button id="ob-notif-btn" onclick="obEnableNotif()" style="display:flex;align-items:center;justify-content:center;gap:10px;background:var(--green-dark);color:white;border:none;padding:13px 20px;border-radius:12px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;">
          <i class="ti ti-bell"></i> تفعيل الإشعارات
        </button>
        <button id="ob-install-btn" onclick="obInstallApp()" style="display:flex;align-items:center;justify-content:center;gap:10px;background:var(--beige);border:2px solid var(--gold);color:var(--green-dark);padding:13px 20px;border-radius:12px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;">
          <i class="ti ti-download"></i> إضافة لشاشتك الرئيسية
        </button>
      </div>

      <button onclick="closeOnboarding()" style="background:none;border:none;color:var(--text-mid);font-family:inherit;font-size:13px;cursor:pointer;text-decoration:underline;">تخطّي الآن</button>
    </div>`;
  document.body.appendChild(modal);
}

window.closeOnboarding = () => {
  document.getElementById('onboardingModal')?.remove();
  // أظهر Buttons في Sidebar
  showSidebarSetup();
};

window.showSidebarSetup = function showSidebarSetup() {
  const wrap = document.getElementById('notifBtnWrap');
  if (!wrap) return;
  wrap.classList.remove('d-none');
  wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;padding:0 4px 8px;">
      <button id="sb-notif-btn" onclick="obEnableNotif('sb')" style="width:100%;padding:10px;border:none;background:var(--gold);color:#2c1a0e;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
        <i class="ti ti-bell"></i> تفعيل الإشعارات
      </button>
      <button onclick="showInstallChoiceModal()" style="width:100%;padding:10px;border:1.5px solid var(--green-mid);background:var(--white);color:var(--green-dark);border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
        <i class="ti ti-download"></i> تثبيت التطبيق
      </button>
    </div>`;
  // If الNotificationات مفعلة بالفعل
  if (Notification.permission === 'granted') {
    const btn = document.getElementById('sb-notif-btn');
    if (btn) {
      btn.innerHTML = '<i class="ti ti-check"></i> الإشعارات مفعّلة';
      btn.disabled = true;
      btn.style.background = 'var(--beige2)';
      btn.style.color = 'var(--green-dark)';
    }
  }
}

window.obEnableNotif = async (src) => {
  if (!('Notification' in window)) {
    document.getElementById(src==='sb'?'sb-notif-btn':'ob-notif-btn')?.setAttribute('innerHTML','<i class="ti ti-x"></i> غير مدعوم');
    return;
  }
  if (Notification.permission === 'denied') { showNotifDeniedToast(); return; }
  if (Notification.permission === 'granted') { updateSidebarNotifBtn(); return; }
  const result = await Notification.requestPermission();
  if (result === 'granted' && window._saveFCMToken) window._saveFCMToken();
  updateSidebarNotifBtn();
};

function showNotifDeniedToast() {
  document.getElementById('notifDeniedToast')?.remove();
  const t = document.createElement('div');
  t.id = 'notifDeniedToast';
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#2c1a0e;color:#e8c96a;border:1px solid #e8c96a;border-radius:12px;padding:14px 20px;font-size:13px;font-family:inherit;z-index:9999;text-align:center;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,0.3);direction:rtl;';
  t.innerHTML = `<div style="margin-bottom:8px;font-weight:600">🔕 الإشعارات محجوبة</div>
    <div style="font-size:12px;color:rgba(232,201,106,0.8);margin-bottom:12px">لتفعيلها: اضغطي على 🔒 في شريط العنوان ← الإشعارات ← سماح</div>
    <button onclick="this.closest('#notifDeniedToast').remove()" style="background:#e8c96a;color:#2c1a0e;border:none;border-radius:8px;padding:6px 16px;font-family:inherit;font-size:12px;cursor:pointer;font-weight:600;">حسناً</button>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 8000);
}

function updateSidebarNotifBtn() {
  const btn = document.getElementById('sb-notif-btn');
  if (!btn) return;
  const p = Notification.permission;
  if (p === 'granted') {
    btn.innerHTML = '<i class="ti ti-bell-ringing"></i> الإشعارات مفعّلة';
    btn.style.cssText += 'color:#4ade80;border-color:#4ade80;';
    btn.disabled = true;
  } else if (p === 'denied') {
    btn.innerHTML = '<i class="ti ti-bell-off"></i> الإشعارات محجوبة — اضغطي للمساعدة';
    btn.style.cssText += 'color:#f87171;border-color:#f87171;';
    btn.disabled = false;
  } else {
    btn.innerHTML = '<i class="ti ti-bell"></i> تفعيل الإشعارات';
    btn.style.cssText += 'color:#e8c96a;border-color:#e8c96a;';
    btn.disabled = false;
  }
}

window.obInstallApp = async (src) => {
  const btn = src === 'sb'
    ? document.querySelector('#notifBtnWrap button:last-child')
    : document.getElementById('ob-install-btn');
  const isAndroid = /android/i.test(navigator.userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isAndroid) {
    const a = document.createElement('a');
    a.href = 'https://mateenweb.github.io/Mateen/mateen.apk';
    a.download = 'mateen.apk';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (btn) btn.innerHTML = '<i class="ti ti-download"></i> جارٍ التحميل...';
  } else if (isIOS) {
    alert('لتثبيت التطبيق على iPhone:\n1. افتحي الموقع في Safari\n2. اضغطي زرار المشاركة (□↑)\n3. اختاري "أضف إلى الشاشة الرئيسية"');
  } else if (window.deferredInstallPrompt) {
    window.deferredInstallPrompt.prompt();
    const { outcome } = await window.deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> تم التثبيت ✅'; btn.disabled = true; }
    }
    window.deferredInstallPrompt = null;
  } else {
    if (btn) btn.innerHTML = '<i class="ti ti-check"></i> مثبت بالفعل';
  }
};

function showLoginPrompt() {
  if (document.getElementById('loginPromptModal')) return;
  const modal = document.createElement('div');
  modal.id = 'loginPromptModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:36px 32px;max-width:360px;width:90%;text-align:center;font-family:inherit;">
      <div style="font-size:40px;margin-bottom:12px;">🔒</div>
      <div style="font-family:Amiri,serif;font-size:22px;color:var(--green-dark);font-weight:700;margin-bottom:10px;">يلزم تسجيل الدخول</div>
      <p style="color:var(--text-mid);font-size:14px;line-height:1.7;margin-bottom:24px;">هذا القسم متاح للطالبات المسجلات فقط. سجّلي دخولك للاستمرار.</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <a href="login.html" style="background:var(--green-dark);color:white;padding:10px 24px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">تسجيل الدخول</a>
        <button onclick="document.getElementById('loginPromptModal').remove()" style="background:var(--beige);border:1px solid var(--border);color:var(--text-mid);padding:10px 20px;border-radius:10px;font-family:inherit;font-size:14px;cursor:pointer;">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

onAuthStateChanged(auth, async user => {

  /* ───────────────────────────────────────────────────────────
     [من home-1.js] — Sidebar، الروابط حسب Role، Logout
     ─────────────────────────────────────────────────────────── */
  const guest   = document.getElementById('sidebar-guest');
  const userDiv = document.getElementById('sidebar-user');
  const layout  = document.querySelector('.page-layout');

  // Hide Screen "جاري Validation..." فوراً بعد ما Firebase يحدد حالة User
  const sidebarLoading = document.getElementById('sidebar-loading');
  if (sidebarLoading) sidebarLoading.style.display = 'none';

  if (!user) {
    if (guest)   guest.classList.remove('d-none');
    if (userDiv) userDiv.classList.add('sidebar-user-hidden');
    if (layout)  layout.classList.add('guest-layout');

    const protectedLinks = ['courses.html','messages.html','news.html',
      'library.html','schedule.html','student.html','admin.html','supervisor.html',
      'teacher-quran1.html','teacher-quran2.html','teacher-aqeedah.html',
      'teacher-fiqh.html','teacher-hadeeth.html','teacher-tafseer.html'];

    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      let href = a?.getAttribute('href') || '';
      if (!href) {
        const parent = e.target.closest('[onclick]');
        if (parent) {
          const onclickVal = parent.getAttribute('onclick') || '';
          const match = onclickVal.match(/location\.href='([^']+)'/) || onclickVal.match(/href='([^']+)'/);
          if (match) href = match[1];
        }
      }
      if (href && protectedLinks.some(p => href.includes(p))) {
        e.preventDefault();
        e.stopPropagation();
        showLoginPrompt();
      }
    }, true);

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

  // مسجلة دخول — اجلب بيانات Userة
  if (guest)   guest.classList.add('d-none');
  if (userDiv) { userDiv.classList.remove('sidebar-user-hidden'); userDiv.classList.add('show-user'); }

  // Hide كل الروابط الspecific فوراً — قبل ما نعرف Role
  ['profileLink','linkCerts','linkAwards','linkGrades','linkSchedule',
   'linkAdmin','linkNews','linkTeacher'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('d-none');
  });

  // Enable Notificationات الموقع
  initNotifications(user.uid);
  showSidebarSetup();
  // طلب إذن الإشعارات تلقائياً عند أول دخول
  if (Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission().then(() => {
      if (window._saveFCMToken) window._saveFCMToken();
      updateSidebarNotifBtn();
    }), 2000);
  }

  const snap = await getDoc(doc(db, 'users', user.uid));
  const role    = snap.exists() ? snap.data().role    : 'student';
  const subject = snap.exists() ? snap.data().subject || '' : '';
  console.log('👤 User Role:', role); // DEBUG
  const name = (snap.exists() && snap.data().name) || user.displayName || user.email.split('@')[0];

  const sidebarNameEl = document.getElementById('sidebarName');
  if (sidebarNameEl) sidebarNameEl.textContent = 'مرحباً، ' + name;

  const sidebarRoleEl = document.getElementById('sidebarRole');
  if (sidebarRoleEl) sidebarRoleEl.textContent =
    role === 'admin'      ? 'إدارية' :
    role === 'supervisor' ? 'مشرفة' :
    role === 'teacher'    ? 'معلمة' :
    role === 'support'    ? 'الدعم الفني' :
    role === 'mateen'     ? 'بنات متين' : 'الطالبة';

  // ── Show الـ links حسب الـ role ──────────────────────────
  function show(id) { const el = document.getElementById(id); if(el) el.classList.remove('d-none'); }
  function hide(id)  { const el = document.getElementById(id); if(el) el.classList.add('d-none'); }

  // روابط specific ببنات متين but/only — Hide لأي دور تاني
  const studentOnlyLinks = ['profileLink','linkCerts','linkAwards','linkGrades','linkSchedule'];
  if (role !== 'mateen') {
    studentOnlyLinks.forEach(hide);
  }

  // روابط طالباتي — تخفى من Admin
  if (role === 'admin' || role === 'supervisor') {
    hide('linkTeacher');
  }

  if (role === 'admin') {
    console.log('✅ Showing links for ADMIN');
    show('linkAdmin');
    show('linkNews');
  } else if (role === 'supervisor') {
    console.log('✅ Showing links for SUPERVISOR');
    const linkAdminEl = document.getElementById('linkAdmin');
    if (linkAdminEl) {
      linkAdminEl.href = 'supervisor.html';
      linkAdminEl.innerHTML = '<i class="ti ti-shield"></i> لوحة المشرفة';
    }
    show('linkAdmin');
    show('linkNews');
  } else if (role === 'support') {
    const linkAdminEl = document.getElementById('linkAdmin');
    if (linkAdminEl) {
      linkAdminEl.href = 'support.html';
      linkAdminEl.innerHTML = '<i class="ti ti-headset"></i> لوحة الدعم';
    }
    show('linkAdmin');
    show('linkNews');
  } else if (role === 'teacher') {
    console.log('✅ Showing links for TEACHER');
    show('linkNews');
    show('linkTeacher');
    show('linkSchedule');
    const schedLink = document.getElementById('linkSchedule');
    if (schedLink) schedLink.href = 'teacher-schedule.html';
  } else if (role === 'mateen') {
    console.log('✅ Showing links for MATEEN');
    show('linkCerts');
    show('linkAwards');
    show('linkGrades');
    show('linkSchedule');
    show('linkNews');
  } else {
    console.log('✅ Showing links for STUDENT (default)');
  }

  // ── أيقونة الProfile وFileي الشخصي — بنات متين only ──────
  const profileLink   = document.getElementById('profileLink');
  const navProfileBtn = document.getElementById('navProfileBtn');

  // أيقونة الProfile — تظهر لكل Roles
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
  } else if (role === 'support') {
    if (navProfileBtn) { navProfileBtn.href = 'support.html'; navProfileBtn.classList.remove('d-none'); }
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

  /* ───────────────────────────────────────────────────────────
     [من home-2.js] — ملء اسم Userة تلقائياً في Form التواصل
     ─────────────────────────────────────────────────────────── */
  const ctName = document.getElementById('ctName');
  if (ctName) {
    const ctRole = snap.exists() ? snap.data().role : '';
    ctName.value = ctRole === 'admin' ? 'إدارة متين' : ((snap.exists() && snap.data().name) ? snap.data().name : name);
    ctName.readOnly = ctRole === 'admin';
  }

  // عداد الأخبار والرسائل → home-msg.js يتولى الأمر
});

window.doLogout = () =>
  signOut(auth).then(() => window.location.href = '../html/login.html');

// ── طلب حذف الحساب — بيبعت إشعار للإدارة بدل الحذف المباشر ──
window.requestAccountDeletion = async () => {
  const user = auth.currentUser;
  if (!user) return;

  if (!confirm('سيتم إرسال طلب حذف حسابك للإدارة للموافقة عليه. هل تريدين المتابعة؟')) return;

  const btn = document.getElementById('sidebarDeleteAccBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader spin"></i> جارٍ الإرسال...'; }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const userData = snap.exists() ? snap.data() : {};
    const userName = userData.name || user.email;

    // إرسال طلب الحذف في collection منفصلة عشان الإدارة تراجعها
    await addDoc(collection(db, 'deletionRequests'), {
      uid:        user.uid,
      name:       userName,
      email:      user.email,
      role:       userData.role || '',
      status:     'pending',
      requestedAt: serverTimestamp(),
    });

    // إشعار لكل الإدارة
    const adminSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
    const notifPromises = adminSnap.docs.map(adminDoc =>
      addDoc(collection(db, 'userNotifications', adminDoc.id, 'items'), {
        type:      'deletion_request',
        title:     '🗑️ طلب حذف حساب',
        body:      `${userName} طلبت حذف حسابها — بانتظار موافقتك`,
        url:       'admin.html',
        read:      false,
        createdAt: serverTimestamp(),
      })
    );
    await Promise.all(notifPromises);

    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> تم إرسال الطلب'; }
    alert('✅ تم إرسال طلب حذف حسابك للإدارة. سيتم التواصل معكِ قريباً إن شاء الله.');
  } catch (e) {
    console.error('requestAccountDeletion error:', e);
    alert('حدث خطأ أثناء إرسال الطلب، حاولي مرة أخرى');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-trash"></i> طلب حذف الحساب'; }
  }
};


/* ═══════════════════════════════════════════════════════════════
   [من home-2.js] — Form التواصل: Load المستلمين + Send/Submit الMessage
   ═══════════════════════════════════════════════════════════════ */

// ── Load المستلمين من Firebase ──────────────
async function loadRecipients() {
  const select = document.getElementById('ctRecipient');
  if (!select) return;

  try {
    // جيبي الإدارة وData/Info النشطين only
    const [adminSnap, teacherSnap] = await Promise.all([
      getDocs(query(collection(db,'users'), where('role','==','admin'))),
      getDocs(query(collection(db,'users'), where('role','==','teacher'), where('status','==','active')))
    ]);

    let html = '<option value="">اختاري الجهة</option>';

    // الإدارة
    if (!adminSnap.empty) {
      html += '<optgroup label="── الإدارة ──">';
      adminSnap.forEach(d => {
        html += `<option value="${d.id}">${d.data().name || 'الإدارة العامة'}</option>`;
      });
      html += '</optgroup>';
    }

    // Data/Info
    if (!teacherSnap.empty) {
      html += '<optgroup label="── المعلمات ──">';
      teacherSnap.forEach(d => {
        const data = d.data();
        html += `<option value="${d.id}">${data.name || 'معلمة'}</option>`;
      });
      html += '</optgroup>';
    }

    if (adminSnap.empty && teacherSnap.empty) {
      html = '<option value="">لا يوجد مستلمون متاحون</option>';
    }

    select.innerHTML = html;
  } catch(e) {
    console.error('loadRecipients error:', e);
    select.innerHTML = '<option value="">تعذر التحميل</option>';
  }
}

// Load المستلمين عند فتح Page
loadRecipients();

// ── Send/Submit الMessage ─────────────────────────────
window.submitContactNew = async () => {
  const nameEl      = document.getElementById('ctName');
  const recipientEl = document.getElementById('ctRecipient');
  const topicEl     = document.getElementById('ctTopic');
  const bodyEl      = document.getElementById('ctBody');
  const btn         = document.getElementById('ctBtn');
  const successEl   = document.getElementById('ctSuccess');

  // تحقق from the حقول المطIfبة
  let valid = true;
  [nameEl, recipientEl, topicEl, bodyEl].forEach(el => {
    if (!el || !el.value.trim()) { if(el) el.style.borderColor='#c0392b'; valid=false; }
    else el.style.borderColor='';
  });

  const recipientUid = recipientEl.value;
  const bodyText     = `[${topicEl.value}]\n${bodyEl.value.trim()}`;

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';

  try {
    const user = auth.currentUser;
    if (!user) { alert('يجب تسجيل الدخول أولاً'); btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة'; return; }

    // جيبي اسم المرسلة من Firestore أو استخدمي ما كتبته
    const senderSnap = await getDoc(doc(db,'users',user.uid));
    const senderName = (senderSnap.exists() && senderSnap.data().name)
      ? senderSnap.data().name
      : (nameEl.value.trim() || '');
    const senderRole = (senderSnap.exists() && senderSnap.data().role) || 'student';

    // إنشاء أو Update المحادثة
    const cid = [user.uid, recipientUid].sort().join('__');
    await setDoc(doc(db,'conversations',cid), {
      participants: [user.uid, recipientUid],
      lastMsg:  bodyText.slice(0,60) || '',
      lastAt:   serverTimestamp(),
      [`unread.${recipientUid}`]: 1,
      [`unread.${user.uid}`]:     0,
    }, { merge: true });

    // Add الMessage
    await addDoc(collection(db,'conversations',cid,'messages'), {
      text:       bodyText     || '',
      senderId:   user.uid     || '',
      senderName: senderName   || '',
      senderRole: senderRole   || '',
      sentAt:     serverTimestamp(),
    });

    // Notification Firestore للمستلم
    if (recipientUid) {
      await addDoc(collection(db,'notifications',recipientUid,'pending'), {
        title:     `💬 ${senderName}`,
        body:      bodyText.slice(0, 80),
        url:       'https://mateenweb.github.io/Mateen/html/messages.html',
        senderId:  user.uid,
        createdAt: serverTimestamp(),
      });
    }

    // Success
    btn.innerHTML = '<i class="ti ti-check"></i> تم الإرسال بنجاح!';
    btn.style.background = 'var(--green-mid)';
    if (successEl) successEl.style.display = 'block';
    [nameEl, recipientEl, topicEl, bodyEl].forEach(el => { if(el) el.value=''; });
    // إعادة Load الخيارات
    loadRecipients();

    setTimeout(() => {
      btn.disabled=false;
      btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة';
      btn.style.background='';
      if (successEl) successEl.style.display='none';
    }, 3500);

  } catch(e) {
    console.error(e);
    btn.disabled=false;
    btn.innerHTML='<i class="ti ti-send"></i> إرسال الرسالة';
    alert('حدث خطأ أثناء الإرسال: ' + e.message);
  }
};


/* ═══════════════════════════════════════════════════════════════
   [من home-3.js] — submitContact (Form تواصل قthisم — dead code،
   محتفظ به كما هو Becauseه لا يستخدم Firebase ولا يضر بالأداء)
   ═══════════════════════════════════════════════════════════════ */
function submitContact(btn) {
  const inputs = btn.closest('.contact-form').querySelectorAll('input, select, textarea');
  let valid = true;
  inputs.forEach(el => { if (!el.value.trim()) { el.style.borderColor = '#c0392b'; valid = false; } else el.style.borderColor = ''; });
  if (!valid) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';
  setTimeout(() => {
    btn.innerHTML = '<i class="ti ti-check"></i> تم الإرسال بنجاح!';
    btn.style.background = 'var(--green-mid)';
    inputs.forEach(el => el.value = '');
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> إرسال الرسالة';
      btn.style.background = '';
    }, 3000);
  }, 1200);
}

/* ═══════════════════════════════════════════════════════════════
   [من home-3.js] — submitReg (Modal طلب التسجيل — مستخدمة فعلياً)
   ═══════════════════════════════════════════════════════════════ */
function submitReg(btn) {
  const modal = document.getElementById('reg-modal');
  const inputs = modal.querySelectorAll('input, select');
  let valid = true;
  inputs.forEach(el => { if (!el.value.trim()) { el.style.borderColor = '#c0392b'; valid = false; } else el.style.borderColor = ''; });
  if (!valid) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> جارٍ الإرسال...';
  setTimeout(() => {
    btn.innerHTML = '<i class="ti ti-check"></i> تم التسجيل بنجاح!';
    btn.style.background = 'var(--green-mid)';
    setTimeout(() => {
      modal.classList.remove('open');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> إرسال طلب التسجيل';
      btn.style.background = '';
      inputs.forEach(el => el.value = '');
    }, 2500);
  }, 1500);
}

// هذه الد and the  متاحة عالمياً Because HTML بينthis عليها بـ onclick="..."
window.submitContact = submitContact;
window.submitReg     = submitReg;


/* ═══════════════════════════════════════════════════════════════
   [من home-4.js] — إغلاق List/Menu الNavigation On click على Link أو خارجها
   ═══════════════════════════════════════════════════════════════ */
document.querySelectorAll(".nav-links a").forEach(function(l){
  l.addEventListener("click",function(){ document.querySelector(".nav-links").classList.remove("open"); });
});
document.addEventListener("click",function(e){
  var nav=document.querySelector("nav");
  if(nav && !nav.contains(e.target)){ var nl=document.querySelector(".nav-links"); if(nl) nl.classList.remove("open"); }
});

// ── زرار الجرس — تحكم في إشعارات الموقع ──────────────────────
async function updateNotifBtn() {
  const btn  = document.getElementById('notifToggleBtn');
  const icon = document.getElementById('notifBellIcon');
  const txt  = document.getElementById('notifBtnText');
  if (!btn) return;
  const perm = Notification.permission;
  if (perm === 'granted') {
    icon.className = 'ti ti-bell-ringing';
    txt.textContent = 'الإشعارات مفعّلة';
    btn.style.color = 'var(--green-dark)';
    btn.style.borderColor = 'var(--green-dark)';
  } else if (perm === 'denied') {
    icon.className = 'ti ti-bell-off';
    txt.textContent = 'الإشعارات محجوبة';
    btn.style.color = '#e74c3c';
    btn.style.borderColor = '#e74c3c';
  } else {
    icon.className = 'ti ti-bell';
    txt.textContent = 'تفعيل الإشعارات';
    btn.style.color = 'var(--green-dark)';
    btn.style.borderColor = 'var(--gold)';
  }
}

window.toggleNotifPermission = async function() {
  const perm = Notification.permission;
  if (perm === 'denied') {
    alert('الإشعارات محجوبة. افتحي إعدادات المتصفح وأذني الموقع يدوياً.');
    return;
  }
  if (perm === 'granted') {
    alert('الإشعارات مفعّلة بالفعل!');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted' && window._saveFCMToken) {
    await window._saveFCMToken();
  }
  updateNotifBtn();
};

// حدّث حالة الزرار عند التحميل
document.addEventListener('DOMContentLoaded', updateNotifBtn);
