// ═══════════════════════════════════════════════════════════════
//  home.js — ملف مدمج لكل منطق home.html
//  (كان مقسّم على: home-1.js, home-2.js, home-3.js, home-4.js, home-msg.js)
//  تم الدمج لتقليل عدد network requests وتكرار onAuthStateChanged
//  كل الشروط والمنطق محفوظة بالضبط كما كانت في الملفات الأصلية.
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { initNotifications } from "./notifications.js";
import { getFirestore, doc, getDoc, getDocs, addDoc, setDoc,
         collection, query, where, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ═══════════════════════════════════════════════════════════════
   مستمع واحد موحّد لـ onAuthStateChanged
   (كان فيه 4 مستمعات منفصلة في home-1 + home-2 + home-msg×2)
   notifications.js له مستمعه الخاص لأنه ملف مشترك بين 23 صفحة
   ═══════════════════════════════════════════════════════════════ */
onAuthStateChanged(auth, async user => {

  /* ───────────────────────────────────────────────────────────
     [من home-1.js] — السايدبار، الروابط حسب الدور، تسجيل الخروج
     ─────────────────────────────────────────────────────────── */
  const guest   = document.getElementById('sidebar-guest');
  const userDiv = document.getElementById('sidebar-user');
  const layout  = document.querySelector('.page-layout');

  // إخفاء شاشة "جاري التحقق..." فوراً بعد ما Firebase يحدد حالة المستخدم
  const sidebarLoading = document.getElementById('sidebar-loading');
  if (sidebarLoading) sidebarLoading.style.display = 'none';

  if (!user) {
    if (guest)   guest.classList.remove('d-none');
    if (userDiv) userDiv.classList.add('sidebar-user-hidden');
    if (layout)  layout.classList.add('guest-layout');
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

  // إظهار navUserActions (أيقونة البروفايل + رسائلي)
  const navUserActions = document.getElementById('navUserActions');
  if (navUserActions) { navUserActions.classList.remove('d-none'); navUserActions.classList.add('d-flex'); }

  // إظهار زرار "رسائلي" في النافبار
  const navMsgBtn = document.getElementById('navMsgBtn');
  if (navMsgBtn) navMsgBtn.classList.remove('d-none');

  // مسجلة دخول — اجلب بيانات المستخدمة
  if (guest)   guest.classList.add('d-none');
  if (userDiv) { userDiv.classList.remove('sidebar-user-hidden'); userDiv.classList.add('show-user'); }

  // تفعيل إشعارات الموقع
  initNotifications(user.uid);

  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  const name = user.displayName || user.email.split('@')[0];

  const sidebarNameEl = document.getElementById('sidebarName');
  if (sidebarNameEl) sidebarNameEl.textContent = 'مرحباً، ' + name;

  const sidebarRoleEl = document.getElementById('sidebarRole');
  if (sidebarRoleEl) sidebarRoleEl.textContent =
    role === 'admin'      ? 'إدارية' :
    role === 'supervisor' ? 'مشرفة' :
    role === 'teacher'    ? 'معلمة' :
    role === 'mateen'     ? 'بنات متين' : 'الطالبة';

  // ── إظهار الـ links حسب الـ role ──────────────────────────
  function show(id) { const el = document.getElementById(id); if(el) el.classList.remove('d-none'); }
  function hide(id)  { const el = document.getElementById(id); if(el) el.classList.add('d-none'); }

  // روابط خاصة ببنات متين بس — إخفاء إجباري لأي دور تاني (إجراء احترازي)
  if (role !== 'mateen') {
    hide('profileLink');
    hide('linkCerts');
    hide('linkAwards');
    hide('linkGrades');
    hide('linkSchedule');
  }

  if (role === 'admin') {
    show('linkAdmin');
    show('linkNews');
  } else if (role === 'supervisor') {
    // المشرفة توديها لصفحتها المخصصة، مش لوحة الأدمن
    const linkAdminEl = document.getElementById('linkAdmin');
    if (linkAdminEl) {
      linkAdminEl.href = 'supervisor.html';
      linkAdminEl.innerHTML = '<i class="ti ti-shield"></i> لوحة المشرفة';
    }
    show('linkAdmin');
    show('linkNews');
  } else if (role === 'teacher') {
    show('linkTeacher');
  } else if (role === 'mateen') {
    show('linkCerts');
    show('linkAwards');
    show('linkGrades');
    show('linkSchedule');
  }
  // student: مش بيظهرله روابط إضافية

  // ── أيقونة البروفايل وملفي الشخصي — بنات متين فقط ──────
  const profileLink   = document.getElementById('profileLink');
  const navProfileBtn = document.getElementById('navProfileBtn');

  // أيقونة البروفايل — تظهر لكل الأدوار
  const navAvatar = document.getElementById('navProfileAvatar');
  const avatarEmoji =
    role === 'admin'      ? '👑' :
    role === 'supervisor' ? '🎓' :
    role === 'teacher'    ? '📚' :
    role === 'mateen'     ? '👩' : '🌸';
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
    if (navProfileBtn) { navProfileBtn.href = 'teacher-aqeedah.html'; navProfileBtn.classList.remove('d-none'); }
  } else {
    if (navProfileBtn) navProfileBtn.classList.remove('d-none');
  }

  /* ───────────────────────────────────────────────────────────
     [من home-2.js] — ملء اسم المستخدمة تلقائياً في نموذج التواصل
     ─────────────────────────────────────────────────────────── */
  const ctName = document.getElementById('ctName');
  if (ctName) {
    ctName.value = (snap.exists() && snap.data().name) ? snap.data().name : name;
  }

  /* ───────────────────────────────────────────────────────────
     [من home-msg.js] — عداد الرسائل غير المقروءة
     ─────────────────────────────────────────────────────────── */
  const navMsgBadge     = document.getElementById('navMsgBadge');
  const sidebarMsgBadge = document.getElementById('sidebarMsgBadge');
  if (navMsgBadge || sidebarMsgBadge) {
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

      [navMsgBadge, sidebarMsgBadge].forEach(badge => {
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
  }

  /* ───────────────────────────────────────────────────────────
     [من home-msg.js] — عداد الأخبار الجديدة منذ آخر زيارة
     ─────────────────────────────────────────────────────────── */
  const navNewsBadge     = document.getElementById('navNewsBadge');
  const sidebarNewsBadge = document.getElementById('sidebarNewsBadge');
  if (navNewsBadge || sidebarNewsBadge) {
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
      [navNewsBadge, sidebarNewsBadge].forEach(badge => {
        if (!badge) return;
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : String(count);
          badge.classList.remove('d-none');
        } else {
          badge.classList.add('d-none');
        }
      });
    } catch(e) { console.error('news-badge:', e); }
  }
});

window.doLogout = () =>
  signOut(auth).then(() => window.location.href = '../html/login.html');


/* ═══════════════════════════════════════════════════════════════
   [من home-2.js] — نموذج التواصل: تحميل المستلمين + إرسال الرسالة
   ═══════════════════════════════════════════════════════════════ */

// ── تحميل المستلمين من Firebase ──────────────
async function loadRecipients() {
  const select = document.getElementById('ctRecipient');
  if (!select) return;

  try {
    // جيبي الإدارة والمعلمات النشطين فقط
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

    // المعلمات
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

// تحميل المستلمين عند فتح الصفحة
loadRecipients();

// ── إرسال الرسالة ─────────────────────────────
window.submitContactNew = async () => {
  const nameEl      = document.getElementById('ctName');
  const recipientEl = document.getElementById('ctRecipient');
  const topicEl     = document.getElementById('ctTopic');
  const bodyEl      = document.getElementById('ctBody');
  const btn         = document.getElementById('ctBtn');
  const successEl   = document.getElementById('ctSuccess');

  // تحقق من الحقول المطلوبة
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
      : (nameEl.value.trim() || user.email || '');
    const senderRole = (senderSnap.exists() && senderSnap.data().role) || 'student';

    // إنشاء أو تحديث المحادثة
    const cid = [user.uid, recipientUid].sort().join('__');
    await setDoc(doc(db,'conversations',cid), {
      participants: [user.uid, recipientUid],
      lastMsg:  bodyText.slice(0,60) || '',
      lastAt:   serverTimestamp(),
      [`unread.${recipientUid}`]: 1,
      [`unread.${user.uid}`]:     0,
    }, { merge: true });

    // إضافة الرسالة
    await addDoc(collection(db,'conversations',cid,'messages'), {
      text:       bodyText     || '',
      senderId:   user.uid     || '',
      senderName: senderName   || '',
      senderRole: senderRole   || '',
      sentAt:     serverTimestamp(),
    });

    // إشعار Firestore للمستلم
    if (recipientUid) {
      await addDoc(collection(db,'notifications',recipientUid,'pending'), {
        title:     `💬 ${senderName}`,
        body:      bodyText.slice(0, 80),
        url:       'https://mateenweb.github.io/Mateen/html/messages.html',
        senderId:  user.uid,
        createdAt: serverTimestamp(),
      });
    }

    // نجاح
    btn.innerHTML = '<i class="ti ti-check"></i> تم الإرسال بنجاح!';
    btn.style.background = 'var(--green-mid)';
    if (successEl) successEl.style.display = 'block';
    [nameEl, recipientEl, topicEl, bodyEl].forEach(el => { if(el) el.value=''; });
    // إعادة تحميل الخيارات
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
   [من home-3.js] — submitContact (نموذج تواصل قديم — dead code،
   محتفظ به كما هو لأنه لا يستخدم Firebase ولا يضر بالأداء)
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
   [من home-3.js] — submitReg (مودال طلب التسجيل — مستخدمة فعلياً)
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

// هذه الدوال متاحة عالمياً لأن HTML بينده عليها بـ onclick="..."
window.submitContact = submitContact;
window.submitReg     = submitReg;


/* ═══════════════════════════════════════════════════════════════
   [من home-4.js] — إغلاق قائمة التنقل عند الضغط على رابط أو خارجها
   ═══════════════════════════════════════════════════════════════ */
document.querySelectorAll(".nav-links a").forEach(function(l){
  l.addEventListener("click",function(){ document.querySelector(".nav-links").classList.remove("open"); });
});
document.addEventListener("click",function(e){
  var nav=document.querySelector("nav");
  if(nav && !nav.contains(e.target)){ var nl=document.querySelector(".nav-links"); if(nl) nl.classList.remove("open"); }
});

