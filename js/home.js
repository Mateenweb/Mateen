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
         collection, query, where, orderBy, serverTimestamp, onSnapshot }
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
function showLoginPrompt() {
  // شوف لو في modal موجود بالفعل
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

// ── أخبار عامة للزوار غير المسجلين ──────────────────────────────
(async () => {
  try {
    const { getFirestore, collection, query, where, orderBy, limit, getDocs } =
      await import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js');
    const _db = getFirestore();
    const snap = await getDocs(
      query(collection(_db, 'news'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(6))
    );
    if (!snap.empty) {
      const section = document.getElementById('publicNewsSection');
      const list    = document.getElementById('publicNewsList');
      if (section && list) {
        list.innerHTML = snap.docs.map(d => {
          const n = d.data();
          const date = n.createdAt?.toDate?.()?.toLocaleDateString('ar', { day:'numeric', month:'long', year:'numeric' }) || '';
          return `
            <div class="col-12 col-md-4">
              <div class="ann-card h-100">
                <div style="font-size:12px;color:var(--gold-dark);margin-bottom:6px;">${n.tag || '📝 خبر'}</div>
                <h4>${n.title || ''}</h4>
                <p>${(n.body || '').slice(0, 100)}${n.body?.length > 100 ? '...' : ''}</p>
                <div class="ann-date"><i class="ti ti-calendar"></i> ${date}</div>
              </div>
            </div>`;
        }).join('');
        section.style.display = '';
      }
    }
  } catch(e) { console.error('public news:', e); }
})();

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

    // اعترض كل الروابط الداخلية وأظهر رسالة تسجيل الدخول
    const protectedLinks = ['courses.html','messages.html','news.html',
      'library.html','schedule.html','student.html','admin.html','supervisor.html',
      'teacher-quran1.html','teacher-quran2.html','teacher-aqeedah.html',
      'teacher-fiqh.html','teacher-hadeeth.html','teacher-tafseer.html'];

    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      const btn = e.target.closest('[onclick]');
      let href = a?.getAttribute('href') || '';

      // تحقق من path-card onclick
      if (!href && btn) {
        const onclickVal = btn.getAttribute('onclick') || '';
        const match = onclickVal.match(/href='([^']+)'/);
        if (match) href = match[1];
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

  // إخفاء كل الروابط الخاصة فوراً — قبل ما نعرف الدور
  ['profileLink','linkCerts','linkAwards','linkGrades','linkSchedule',
   'linkAdmin','linkNews','linkTeacher'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('d-none');
  });

  // تفعيل إشعارات الموقع
  initNotifications(user.uid);

  const snap = await getDoc(doc(db, 'users', user.uid));
  const role    = snap.exists() ? snap.data().role    : 'student';
  const subject = snap.exists() ? snap.data().subject || '' : '';
  console.log('👤 User Role:', role); // DEBUG
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

  // روابط خاصة ببنات متين بس — إخفاء لأي دور تاني
  const studentOnlyLinks = ['profileLink','linkCerts','linkAwards','linkGrades','linkSchedule'];
  if (role !== 'mateen') {
    studentOnlyLinks.forEach(hide);
  }

  // روابط طالباتي — تخفى من الأدمن
  if (role === 'admin' || role === 'supervisor') {
    hide('linkTeacher');
  }

  // أظهر زرار الإشعارات للمسجلين
  const notifWrap = document.getElementById('notifBtnWrap');
  if (notifWrap && Notification.permission !== 'granted') notifWrap.classList.remove('d-none');
  else if (notifWrap && Notification.permission === 'granted') notifWrap.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--green-dark);padding:4px 0;"><i class="ti ti-check"></i> الإشعارات مفعّلة</div>';

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
      show('linkAdmin');
    }
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

  // ── أيقونة البروفايل وملفي الشخصي — بنات متين فقط ──────
  const profileLink   = document.getElementById('profileLink');
  const navProfileBtn = document.getElementById('navProfileBtn');

  // أيقونة البروفايل — تظهر لكل الأدوار
  const navAvatar = document.getElementById('navProfileAvatar');
  const avatarEmoji =
    role === 'admin'      ? '👑' :
    role === 'supervisor' ? '🎓' :
    role === 'teacher'    ? '📚' :
    role === 'mateen'     ? '🧕' : '🌸';
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

  /* ───────────────────────────────────────────────────────────
     [من home-2.js] — ملء اسم المستخدمة تلقائياً في نموذج التواصل
     ─────────────────────────────────────────────────────────── */
  const ctName = document.getElementById('ctName');
  if (ctName) {
    ctName.value = (snap.exists() && snap.data().name) ? snap.data().name : name;
  }

  /* ── عداد الرسائل — real-time ── */
  const updateMsgBadges = (total) => {
    ['navMsgBadge','sidebarMsgBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (total > 0) {
        // نقطة صغيرة بدل الرقم
        el.textContent = '';
        el.style.cssText = 'width:9px;height:9px;padding:0;border-radius:50%;min-width:unset;';
        el.classList.remove('d-none');
      } else {
        el.classList.add('d-none');
      }
    });
  };
  onSnapshot(
    query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid)),
    snap => {
      let total = 0;
      snap.forEach(d => {
        const data = d.data();
        // اقرأ الـ flat field أولاً، لو مش موجود جرب الـ nested
        const fv = data[`unread.${user.uid}`];
        const nv = data.unread?.[user.uid];
        const val = fv !== undefined ? Number(fv) : (nv !== undefined ? Number(nv) : 0);
        total += val;
      });
      updateMsgBadges(total);
    },
    err => console.error('msg-badge:', err)
  );

  /* ── عداد الأخبار — real-time ── */
  const updateNewsBadges = (count) => {
    ['navNewsBadge','navNewsBadge2','sidebarNewsBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (count > 0) { el.textContent = count > 99 ? '99+' : String(count); el.classList.remove('d-none'); }
      else el.classList.add('d-none');
    });
  };
  const lastSeenKey = `news_last_seen_${user.uid}`;
  let lastNewsSnap = null;

  // لما الطالبة ترجع للصفحة نحدث الكاونتر
  const refreshNewsBadge = () => {
    if (!lastNewsSnap) return;
    const ls = parseInt(localStorage.getItem(lastSeenKey) || '0');
    let count = 0;
    lastNewsSnap.forEach(d => { const ts = d.data().createdAt; if (ts && ts.toMillis() > ls) count++; });
    updateNewsBadges(count);
  };
  window.addEventListener('focus', refreshNewsBadge);
  window.addEventListener('pageshow', refreshNewsBadge);

  onSnapshot(
    query(collection(db, 'news'), orderBy('createdAt', 'desc')),
    snap => {
      lastNewsSnap = snap;
      refreshNewsBadge();
    },
    err => console.error('news-badge:', err)
  );

  // حدّث الكاونتر كل مرة يرجع المستخدم للصفحة
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshNewsBadge();
  });
});

// ── فعّلي الإشعارات ────────────────────────────────────────────────────────
window.enableNotifications = async () => {
  if (!('Notification' in window)) {
    alert('متصفحك لا يدعم الإشعارات');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const btn = document.getElementById('notifBtnWrap');
    if (btn) btn.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--green-dark);padding:4px 0;"><i class="ti ti-check"></i> الإشعارات مفعّلة</div>';
    // استدعاء saveFCMToken من notifications.js
    if (window._saveFCMToken) window._saveFCMToken();
  } else {
    alert('لم يتم السماح بالإشعارات. يمكنك تفعيلها من إعدادات المتصفح.');
  }
};

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


