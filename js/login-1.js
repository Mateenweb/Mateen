
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./js/config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let selectedRole = 'student';

const ERRORS = {
  'auth/invalid-credential':     'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'auth/user-not-found':         'لا يوجد حساب بهذا البريد الإلكتروني',
  'auth/wrong-password':         'كلمة المرور غير صحيحة',
  'auth/invalid-email':          'صيغة البريد الإلكتروني غير صحيحة',
  'auth/too-many-requests':      'الحساب مُعلَّق مؤقتاً، حاولي لاحقاً',
  'auth/network-request-failed': 'تعذر الاتصال، تحققي من الإنترنت',
};

const REDIRECT = {
  admin:   'admin.html',
  teacher: 'admin.html',
  student: 'student.html',
};

window.selectRole = (role, btn) => {
  selectedRole = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.switchTab = (tab) => {
  document.getElementById('loginForm').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('forgotForm').style.display = tab === 'forgot' ? 'block' : 'none';
  document.getElementById('successScreen').classList.remove('show');
  document.getElementById('tabLogin').classList.toggle('active',  tab === 'login');
  document.getElementById('tabForgot').classList.toggle('active', tab === 'forgot');
  hideError();
};

window.togglePass = () => {
  const inp  = document.getElementById('passInput');
  const icon = document.getElementById('eyeIcon');
  const show = inp.type === 'password';
  inp.type       = show ? 'text' : 'password';
  icon.className = show ? 'ti ti-eye-off' : 'ti ti-eye';
};

function showError(msg) {
  document.getElementById('errorText').textContent = msg;
  document.getElementById('errorMsg').classList.add('show');
}
function hideError() { document.getElementById('errorMsg').classList.remove('show'); }

function setLoading(btnId, on, label) {
  const btn = document.getElementById(btnId);
  btn.disabled = on;
  btn.innerHTML = on ? '<i class="ti ti-loader ti-spin"></i> جارٍ التحقق...' : label;
}

window.doLogin = async () => {
  hideError();
  const email = document.getElementById('emailInput').value.trim();
  const pass  = document.getElementById('passInput').value;
  if (!email || !pass) { showError('يرجى تعبئة جميع الحقول'); return; }

  setLoading('loginBtn', true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    const role = snap.exists() ? snap.data().role : 'student';

    // التحقق أن الدور المختار يتوافق مع الدور الحقيقي
    if (selectedRole === 'student' && role !== 'student') {
      await auth.signOut();
      showError('هذا الحساب ليس حساب طالبة');
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }
    if ((selectedRole === 'admin' || selectedRole === 'teacher') && role === 'student') {
      await auth.signOut();
      showError('هذا الحساب ليس له صلاحية الدخول كمشرفة أو معلمة');
      setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
      return;
    }

    // نجاح
    document.getElementById('loginForm').style.display = 'none';
    document.querySelector('.login-tabs').style.display = 'none';
    const sc = document.getElementById('successScreen');
    sc.classList.add('show');
    document.getElementById('successTitle').textContent = 'أهلاً بكِ! 🎉';
    document.getElementById('successMsg').textContent   = 'تم الدخول بنجاح، جارٍ التحويل...';
    setTimeout(() => window.location.href = REDIRECT[role] || 'home.html', 1500);

  } catch(e) {
    showError(ERRORS[e.code] || 'حدث خطأ، حاولي مجدداً');
    setLoading('loginBtn', false, '<i class="ti ti-login"></i> دخول');
  }
};

window.doReset = async () => {
  hideError();
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) { showError('أدخلي بريدك الإلكتروني'); return; }
  setLoading('resetBtn', true);
  try {
    await sendPasswordResetEmail(auth, email);
    document.getElementById('forgotForm').style.display = 'none';
    document.querySelector('.login-tabs').style.display = 'none';
    const sc = document.getElementById('successScreen');
    sc.classList.add('show');
    document.getElementById('successTitle').textContent = 'تم الإرسال ✅';
    document.getElementById('successMsg').textContent   = `أُرسل رابط الاستعادة إلى ${email}`;
  } catch(e) {
    showError(ERRORS[e.code] || 'تعذر الإرسال');
    setLoading('resetBtn', false, '<i class="ti ti-send"></i> إرسال رابط الاستعادة');
  }
};

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (document.getElementById('loginForm').style.display  !== 'none') window.doLogin();
  if (document.getElementById('forgotForm').style.display !== 'none') window.doReset();
});
