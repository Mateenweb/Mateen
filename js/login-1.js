import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail,
         createUserWithEmailAndPassword, setPersistence, browserLocalPersistence,
         onAuthStateChanged, deleteUser }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, serverTimestamp,
         collection, getDocs, query, orderBy, where, deleteDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ضمان حفظ Session في localStorage
setPersistence(auth, browserLocalPersistence);

// ══════════════════════════════════════════════════════════════
// دالتين مشتركتين بين إعادة التوجيه التلقائي (auto-redirect) وتسجيل
// الدخول اليدوي — عشان الاتنين يفضلوا متطابقين دايمًا ومايحصلش
// تعارض بينهم زي المشكلة اللي حصلت قبل كده (حساب موقوف كان بيتحول
// للـ home.html بدل ما يتوقف).
// ══════════════════════════════════════════════════════════════
function checkAccountStatus(status) {
  if (status === 'pending')   return { blocked: true, pending: true, message: 'حسابك قيد المراجعة، انتظري الموافقة من الإدارة' };
  if (status === 'rejected')  return { blocked: true, message: 'تم رفض طلبك، تواصلي مع الإدارة للاستفسار' };
  if (status === 'suspended') return { blocked: true, message: 'حسابك موقوف، تواصلي مع الإدارة' };
  return { blocked: false };
}

function computeBaseRedirect(role, subject) {
  if (role === 'teacher') {
    if (subject === 'ithraiyat') return 'teacher-students.html'; // مالهاش صفحة محتوى مخصصة زي باقي المواد
    return subject ? `teacher-${subject}.html` : 'home.html';
  }
  return 'home.html'; // student, mateen, admin, supervisor
}

// If Userة مسجلة دخول بالفعل — حوّليها بعيداً عن Page الدخول
onAuthStateChanged(auth, async user => {
  if (!user) return;
  if (window.location.hash === '#noredirect') return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.exists() ? snap.data() : {};
    const status = data.status || 'active';

    const check = checkAccountStatus(status);
    if (check.blocked) {
      // pending: سيبيها زي ما هي من غير signOut ولا redirect (بيتم التعامل معاها في doRegister)
      // rejected/suspended: سجّلي خروجها فورًا عشان محدش يوصل للـ home.html بالغلط
      if (!check.pending) await auth.signOut();
      return;
    }

    const role = data.role || 'student';
    const redirect = computeBaseRedirect(role, data.subject || '');

    // وجّهيه for the  onboarding دايماً بعد Login
    localStorage.setItem('userRole', role);
    localStorage.setItem('userSubject', data.subject || '');
    localStorage.setItem('ob_redirect', redirect);
    window.location.replace('onboarding.html');
  } catch(e) {
    window.location.replace('home.html');
  }
});

let loginRole = 'student';
let regRole   = 'mateen';

/* ── إعدادات كل Role ── */
const ROLE_CONFIG = {
  // معطّل مؤقتاً: حساب "أصدقاء متين" (student) — لا يُسمح بالتسجيل بهذا Role حالياً
  // student:    { redirect: 'home.html', status: 'active',  needsApproval: false },
  mateen:     { redirect: 'home.html', status: 'pending', needsApproval: true,  approvedBy: 'supervisor' },
  teacher:    { redirect: 'home.html', status: 'pending', needsApproval: true,  approvedBy: 'admin' },
  supervisor: { redirect: 'home.html', status: 'pending', needsApproval: true,  approvedBy: 'admin' },
  admin:      { redirect: 'home.html', status: 'active',  needsApproval: false },
};

const ERRORS = {
  'auth/invalid-credential':     'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'auth/user-not-found':         'لا يوجد حساب بهذا البريد الإلكتروني',
  'auth/wrong-password':         'كلمة المرور غير صحيحة',
  'auth/invalid-email':          'صيغة البريد الإلكتروني غير صحيحة',
  'auth/too-many-requests':      'الحساب مُعلَّق مؤقتاً، حاولي لاحقاً',
  'auth/network-request-failed': 'تعذر الاتصال، تحققي من الإنترنت',
  'auth/email-already-in-use':   'هذا البريد الإلكتروني مسجّل بالفعل',
  'auth/weak-password':          'كلمة المرور ضعيفة، يجب أن تكون ٦ أحرف على الأقل',
};

/* ── مساعدات ── */
function showError(msg) {
  document.getElementById('errorText').textContent = msg;
  document.getElementById('errorMsg').classList.add('show');
}
function hideError() { document.getElementById('errorMsg').classList.remove('show'); }

function setLoading(btnId, on, label) {
  const btn = document.getElementById(btnId);
  btn.disabled = on;
  btn.innerHTML = on ? '<i class="ti ti-loader ti-spin"></i> جارٍ المعالجة...' : label;
}

function showSuccess(title, msg) {
  ['loginForm','registerForm','forgotForm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.querySelector('.login-tabs').style.display = 'none';
  const sc = document.getElementById('successScreen');
  sc.classList.add('show');
  document.getElementById('successTitle').textContent = title;
  document.getElementById('successMsg').textContent   = msg;
}

/* ── Tabs ── */
window.switchTab = tab => {
  hideError();
  document.getElementById('loginForm').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('forgotForm').style.display   = tab === 'forgot'   ? 'block' : 'none';
  document.getElementById('successScreen').classList.remove('show');
  document.querySelector('.login-tabs').style.display = 'flex';
  ['tabLogin','tabRegister','tabForgot'].forEach(id => {
    document.getElementById(id).classList.toggle('active',
      id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  });
  const subs = { login:'سجّلي الدخول للوصول إلى حسابك', register:'أنشئي حسابك الجديد', forgot:'استعادة كلمة المرور' };
  document.getElementById('logoSub').textContent = subs[tab] || '';
};

/* ── Role selectors ── */
window.selectLoginRole = (role, btn) => {
  loginRole = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.selectRegRole = (role, btn) => {
  regRole = role;
  document.querySelectorAll('.reg-role-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Show Field اWhenدة only للمعلمة
  document.getElementById('regSubjectGroup').style.display = role === 'teacher' ? 'flex' : 'none';
  document.getElementById('regYearGroup').style.display = role === 'mateen' ? 'block' : 'none';
};

/* ── Eye toggle ── */
window.togglePass = (inputId, iconId) => {
  const inp  = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  const show = inp.type === 'password';
  inp.type       = show ? 'text' : 'password';
  icon.className = show ? 'ti ti-eye-off' : 'ti ti-eye';
};

/* ══════════════════════════════════════
   Login
══════════════════════════════════════ */
window.doLogin = async () => {
  hideError();
  const email = document.getElementById('emailInput').value.trim();
  const pass  = document.getElementById('passInput').value;
  if (!email || !pass) { showError('يرجى تعبئة جميع الحقول'); return; }

  setLoading('loginBtn', true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!snap.exists()) {
      await auth.signOut();
      showError('لا يوجد بيانات لهذا الحساب، تواصلي مع الإدارة');
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }

    const data   = snap.data();
    const role   = data.role   || 'student';
    const status = data.status || 'active';

    /* Validation إن الRowة المختارة تطابق الـ role الفعلي */
    if (loginRole !== role) {
      await auth.signOut();
      const roleNames = { student:'أصدقاء متين', mateen:'بنات متين', teacher:'معلمة', supervisor:'مشرفة', admin:'إدارة', support:'الدعم الفني' };
      showError(`هذا الحساب مسجّل كـ "${roleNames[role] || role}"، يرجى اختيار الصفة الصحيحة`);
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }

    /* Validation من حالة الحساب — نفس الدالة المستخدمة في إعادة التوجيه التلقائي */
    const check = checkAccountStatus(status);
    if (check.blocked) {
      await auth.signOut();
      showError(check.message);
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }

    /* التوجيه حسب الـ role — نفس الدالة المستخدمة في إعادة التوجيه التلقائي */
    let redirect = computeBaseRedirect(role, data.subject || '');

    /* Student (f) العاثية (student): البحث عنها في students collection */
    if (role === 'student') {
      const fullName  = (data.name || '').trim();
      const firstName = fullName.split(/\s+/)[0].toLowerCase();

      if (firstName) {
        const stuSnap = await getDocs(query(collection(db, 'students'), orderBy('order')));
        let foundId = null;
        stuSnap.forEach(d => {
          if (foundId) return;
          const stuFirstName = (d.data().name || '').trim().split(/\s+/)[0].toLowerCase();
          if (stuFirstName === firstName) foundId = d.id;
        });
        if (foundId) redirect = `student.html?id=${foundId}`;
      }
    }

    showSuccess('أهلاً بكِ! 🎉', 'تم الدخول بنجاح، جارٍ التحويل...');
    setTimeout(() => window.location.href = redirect, 1500);

  } catch(e) {
    showError(ERRORS[e.code] || 'حدث خطأ، حاولي مجدداً');
    setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
  }
};

/* ══════════════════════════════════════
   إنشاء الحساب
══════════════════════════════════════ */
window.doRegister = async () => {
  hideError();

  const name  = document.getElementById('regName').value.trim();
  const year  = document.getElementById('regYear').value;
  const phone = document.getElementById('regPhone').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;

  if (!name)            { showError('يرجى إدخال الاسم الكامل'); return; }
  if (!phone)           { showError('يرجى إدخال رقم الجوال'); return; }
  // معطّل مؤقتاً: حساب "أصدقاء متين" (student)
  if (regRole === 'student') { showError('هذا النوع من الحسابات غير متاح حالياً'); return; }
  if (regRole === 'teacher') {
    const subj = document.getElementById('regSubject').value;
    if (!subj) { showError('يرجى اختيار المادة التي تدرّسينها'); return; }
  }
  if (!email)           { showError('يرجى إدخال البريد الإلكتروني'); return; }
  if (!pass)            { showError('يرجى إدخال كلمة المرور'); return; }
  if (pass.length < 6)  { showError('كلمة المرور ضعيفة، يجب أن تكون ٦ أحرف على الأقل'); return; }
  if (pass !== pass2)   { showError('كلمتا المرور غير متطابقتين'); return; }

  const cfg = ROLE_CONFIG[regRole];

  setLoading('registerBtn', true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid  = cred.user.uid;

    await setDoc(doc(db, 'users', uid), {
      name,
      year:      year || '',
      phone,
      email,
      role:      regRole,
      ...(regRole === 'teacher' && { subject: document.getElementById('regSubject').value }),
      status:    cfg.status,
      createdAt: serverTimestamp(),
    });

    /* Send/Submit Notification لكل Admin وSupervisors If الحساب محتاج موافقة */
    if (cfg.needsApproval) {
      try {
        const roleLabelsNotif = { mateen:'بنت متين', teacher:'معلمة', supervisor:'مشرفة' };
        const adminSnap = await getDocs(query(
          collection(db, 'users'),
          where('role', 'in', ['admin', 'supervisor'])
        ));
        const notifPromises = adminSnap.docs.map(adminDoc =>
          addDoc(collection(db, 'userNotifications', adminDoc.id, 'items'), {
            type:      'new_account',
            title:     '📋 طلب حساب جديد',
            body:      `${name} تطلب انضمامها كـ ${roleLabelsNotif[regRole] || regRole} — بانتظار موافقتك`,
            url:       'admin.html',
            read:      false,
            createdAt: serverTimestamp(),
          })
        );
        await Promise.all(notifPromises);
      } catch(e) { console.warn('إشعار الأدمن فشل:', e); }
    }

    /* ملحوظة: الالتحاق بSubjects لبنات متين بيحصل أوتوماتيك
       When الnot/don'tرفة توافق on the حساب وتربطها but/onlyجل Student (f) (admin-1.js) */

    /* تسجيل خروج تلقائي للحسابات المعلقة */
    if (cfg.needsApproval) {
      await auth.signOut();
    }

    const roleLabels = {
      student:    { title:'مرحباً! 🎉',           msg:'تم إنشاء حسابك بنجاح، يمكنك الدخول الآن.' },
      mateen:     { title:'أهلاً ببنت متين! 📖',  msg:'تم إنشاء حسابك بنجاح.\nسيتم مراجعته من قِبَل الإدارة وتفعيله قريباً إن شاء الله.' },
      teacher:    { title:'أهلاً معلمتنا الحبيبة! 🧕‍🏫',    msg:'تم إنشاء حسابك بنجاح.\nسيتم مراجعته من قِبَل الإدارة وتفعيله قريباً إن شاء الله.' },
      supervisor: { title:'أهلاً مشرفنا الحبيبة ! 🛡️',    msg:'تم إنشاء حسابك بنجاح.\nسيتم مراجعته من قِبَل الإدارة وتفعيله قريباً إن شاء الله.' },
    };

    const lbl = roleLabels[regRole] || roleLabels.student;
    showSuccess(lbl.title, lbl.msg);

    if (!cfg.needsApproval) {
      setTimeout(() => window.location.href = cfg.redirect, 1800);
    }

  } catch(e) {
    showError(ERRORS[e.code] || 'حدث خطأ أثناء إنشاء الحساب');
    setLoading('registerBtn', false, '<i class="ti ti-user-plus"></i> إنشاء الحساب');
  }
};

/* ══════════════════════════════════════
   نسيت كلمة المرور
══════════════════════════════════════ */
window.doReset = async () => {
  hideError();
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) { showError('أدخلي بريدك الإلكتروني'); return; }
  setLoading('resetBtn', true);
  try {
    await sendPasswordResetEmail(auth, email);
    showSuccess('تم الإرسال ✅', `أُرسل رابط الاستعادة إلى\n${email}`);

    // إشعار للإدارة بطلب استعادة كلمة المرور
    try {
      const adminSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
      const notifPromises = adminSnap.docs.map(adminDoc =>
        addDoc(collection(db, 'userNotifications', adminDoc.id, 'items'), {
          type:      'password_reset_request',
          title:     '🔑 طلب استعادة كلمة المرور',
          body:      `تم إرسال رابط استعادة كلمة المرور إلى ${email}`,
          url:       'admin.html',
          read:      false,
          createdAt: serverTimestamp(),
        })
      );
      await Promise.all(notifPromises);
    } catch(notifErr) { console.error('reset notif error:', notifErr); }

  } catch(e) {
    showError(ERRORS[e.code] || 'تعذر الإرسال');
    setLoading('resetBtn', false, '<i class="ti ti-send"></i> إرسال رابط الاستعادة');
  }
};


/* Enter key */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const lf = document.getElementById('loginForm');
  const rf = document.getElementById('registerForm');
  const ff = document.getElementById('forgotForm');
  if (lf && lf.style.display !== 'none') window.doLogin();
  if (rf && rf.style.display !== 'none') window.doRegister();
  if (ff && ff.style.display !== 'none') window.doReset();
});

/* ── فتح تبويب التسجيل تلقائياً If الLink فيه #register ── */
if (window.location.hash === '#register') {
  window.switchTab('register');
}
