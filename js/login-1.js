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

// ضمان حفظ الجلسة في localStorage
setPersistence(auth, browserLocalPersistence);

// لو المستخدمة مسجلة دخول بالفعل — حوّليها بعيداً عن صفحة الدخول
onAuthStateChanged(auth, async user => {
  if (!user) return;
  if (window.location.hash === '#noredirect') return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.exists() ? snap.data() : {};
    const status = data.status || 'active';
    // لو الحساب معلق — لا تعمل redirect (بيتم signOut تلقائي في doRegister)
    if (status === 'pending') return;
    const role = data.role || 'student';
    let redirect = 'home.html';

    if (role === 'student' || role === 'mateen') {
      redirect = 'home.html';
    } else if (role === 'teacher') {
      const subjectId = data.subject || '';
      redirect = subjectId ? `teacher-${subjectId}.html` : 'home.html';
    } else if (role === 'admin' || role === 'supervisor') {
      redirect = 'home.html';
    }

    window.location.replace(redirect);
  } catch(e) {
    window.location.replace('home.html');
  }
});

let loginRole = 'student';
let regRole   = 'mateen';

/* ── إعدادات كل Role ── */
const ROLE_CONFIG = {
  // معطّل مؤقتاً: حساب "أصدقاء متين" (student) — لا يُسمح بالتسجيل بهذا الدور حالياً
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
  // إظهار حقل المادة فقط للمعلمة
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
   تسجيل الدخول
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

    /* التحقق إن الصفة المختارة تطابق الـ role الفعلي */
    if (loginRole !== role) {
      await auth.signOut();
      const roleNames = { student:'أصدقاء متين', mateen:'بنات متين', teacher:'معلمة', supervisor:'مشرفة', admin:'إدارة' };
      showError(`هذا الحساب مسجّل كـ "${roleNames[role] || role}"، يرجى اختيار الصفة الصحيحة`);
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }

    /* التحقق من حالة الحساب */
    if (status === 'pending') {
      await auth.signOut();
      showError('حسابك قيد المراجعة، انتظري الموافقة من الإدارة');
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }
    if (status === 'rejected') {
      await auth.signOut();
      showError('تم رفض طلبك، تواصلي مع الإدارة للاستفسار');
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }
    if (status === 'suspended') {
      await auth.signOut();
      showError('حسابك موقوف، تواصلي مع الإدارة');
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }

    /* التوجيه حسب الـ role */
    let redirect = ROLE_CONFIG[role]?.redirect || 'home.html';

    /* الطالبة العادية (student): ابحث عنها في students collection */
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

    /* المعلمة: توجيه لصفحتها بناءً على subject المحفوظ */
    if (role === 'teacher') {
      const subjectId = data.subject || '';
      redirect = subjectId ? `teacher-${subjectId}.html` : 'home.html';
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

    /* إرسال إشعار لكل الأدمن والمشرفات لو الحساب محتاج موافقة */
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

    /* ملحوظة: الالتحاق بالمواد لبنات متين بيحصل أوتوماتيك
       لما المشرفة توافق على الحساب وتربطها بسجل الطالبة (admin-1.js) */

    /* تسجيل خروج تلقائي للحسابات المعلقة */
    if (cfg.needsApproval) {
      await auth.signOut();
    }

    const roleLabels = {
      student:    { title:'مرحباً! 🎉',           msg:'تم إنشاء حسابك بنجاح، يمكنك الدخول الآن.' },
      mateen:     { title:'أهلاً ببنت متين! 📖',  msg:'تم إنشاء حسابك بنجاح.\nسيتم مراجعته من قِبَل الإدارة وتفعيله قريباً إن شاء الله.' },
      teacher:    { title:'أهلاً معلمتنا الحبيبة! 👩‍🏫',    msg:'تم إنشاء حسابك بنجاح.\nسيتم مراجعته من قِبَل الإدارة وتفعيله قريباً إن شاء الله.' },
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
  } catch(e) {
    showError(ERRORS[e.code] || 'تعذر الإرسال');
    setLoading('resetBtn', false, '<i class="ti ti-send"></i> إرسال رابط الاستعادة');
  }
};


/* ══════════════════════════════════════
   حذف الحساب من صفحة الدخول
══════════════════════════════════════ */
window.doDeleteAccount = async () => {
  hideError();
  const email = document.getElementById('emailInput').value.trim();
  const pass  = document.getElementById('passInput').value;

  if (!email || !pass) {
    showError('أدخلي البريد الإلكتروني وكلمة المرور أولاً لتأكيد هويتك');
    return;
  }

  const confirmed = confirm('هل أنتِ متأكدة من حذف حسابك نهائياً؟\nهذا الإجراء لا يمكن التراجع عنه.');
  if (!confirmed) return;

  setLoading('deleteAccountBtn', true);
  try {
    // تسجيل الدخول أولاً للتحقق من الهوية
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const uid  = cred.user.uid;
    const db2  = getFirestore(app);

    // حذف بيانات المستخدم من Firestore
    await deleteDoc(doc(db2, 'users', uid));

    // حذف الحساب من Firebase Auth
    await deleteUser(cred.user);

    showSuccess('تم الحذف ✅', 'تم حذف حسابك بنجاح.');
  } catch(e) {
    showError(ERRORS[e.code] || 'تعذر حذف الحساب، تأكدي من البيانات وحاولي مجدداً');
  } finally {
    const btn = document.getElementById('deleteAccountBtn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-trash"></i> حذف حسابي';
    }
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

/* ── فتح تبويب التسجيل تلقائياً لو الرابط فيه #register ── */
if (window.location.hash === '#register') {
  window.switchTab('register');
}
