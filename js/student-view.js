// ===========================
//  صفحة الطالبة — عرض فقط
// ===========================

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from './config.js';

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Auth Guard ───────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = '../html/login.html'; return; }

  const userData = snap.data();
  const role     = userData.role   || '';
  const status   = userData.status || '';

  if (status === 'pending' || status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  // الإدارة والمشرفة: تشوف الكل
  if (role === 'admin' || role === 'supervisor') {
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initStudentView(userData);
    return;
  }

  // المعلمة: بس طالباتها — التحقق يتم جوه initStudentView بعد ما يتحمّل الـ student
  if (role === 'teacher') {
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initStudentView(userData);
    return;
  }

  // الطالبات وأي حد تاني — ممنوع
  window.location.href = '../html/home.html';
});

function initStudentView(userData = {}) {

// ── Get number from URL ───────────────────────
const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
const params     = new URLSearchParams(location.search);
const studentNum = parseInt(hashParams.get('n') || params.get('n'));
const studentDocId = params.get('id') || hashParams.get('id'); // دعم ?id= من لوحة الإدارة

function showError(msg = 'الرابط غير صحيح') {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;">
      <div style="background:white;border-radius:16px;padding:40px;text-align:center;font-family:Cairo,sans-serif;">
        <div style="font-size:40px;margin-bottom:16px">⚠️</div>
        <div style="font-size:18px;color:#1a3a5c;font-weight:700">${msg}</div>
      </div>
    </div>`;
}

if (!studentNum && !studentDocId) { showError(); return; }

// ── Load Student ─────────────────────────────
async function loadAll() {
  let studentId;

  if (studentDocId) {
    // فتح مباشرة بالـ document ID (من لوحة الإدارة)
    studentId = studentDocId;
    history.replaceState(null, '', location.pathname);
  } else {
    // فتح بالرقم الترتيبي (الطريقة القديمة)
    const allSnap = await getDocs(query(collection(db, 'students'), orderBy('order')));
    if (allSnap.empty || studentNum > allSnap.docs.length) { showError(); return; }
    studentId = allSnap.docs[studentNum - 1].id;
    history.replaceState(null, '', location.pathname);
  }

  const studentRef = doc(db, 'students', studentId);
  const [snap, sessSnap, gradeSnap] = await Promise.all([
    getDoc(studentRef),
    getDocs(query(collection(db, 'students', studentId, 'sessions'), orderBy('date', 'desc'))).catch(()=>({docs:[]})),
    getDocs(query(collection(db, 'students', studentId, 'grades'),   orderBy('createdAt', 'desc'))).catch(()=>({docs:[]}))
  ]);

  // المعلمة: تشوف بس طالباتها فقط
  if (userData.role === 'teacher') {
    const teacherSubject = userData.subject || '';
    if (!snap.exists() || snap.data().teacherId !== teacherSubject) {
      showError('ليس لديكِ صلاحية لعرض هذه الصفحة');
      return;
    }
  }

  if (!snap.exists()) {
    // الطالبة غير مربوطة بعد — نجيب بياناتها من users collection
    if (studentDocId) {
      const userSnap = await getDoc(doc(db, 'users', studentId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        document.getElementById('studentName').textContent = u.name || u.email || '—';
        const infoEl = document.getElementById('studentInfo');
        if (infoEl) infoEl.innerHTML = `
          <div style="background:#fff8e1;border:1px solid #f9a825;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
            <div style="font-size:28px;margin-bottom:10px;">📋</div>
            <div style="font-size:15px;font-weight:700;color:#5c3d2e;margin-bottom:6px;">الطالبة لم تُربط بسجل بعد</div>
            <div style="font-size:13px;color:#8a6a3c;">يمكن ربطها من لوحة الإدارة لعرض كامل بياناتها</div>
            <div style="margin-top:14px;font-size:13px;color:var(--text-mid);">
              <b>الاسم:</b> ${u.name || '—'} &nbsp;|&nbsp;
              <b>البريد:</b> ${u.email || '—'} &nbsp;|&nbsp;
              <b>الهاتف:</b> ${u.phone || '—'}
            </div>
          </div>`;
        return;
      }
    }
    document.getElementById('studentName').textContent = 'طالبة غير موجودة';
    return;
  }

  const s       = snap.data();
  const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const grades   = gradeSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Name & status - مخفية (البيانات الشخصية لا تظهر للمشرفة)
  document.title = 'سجل الطالبة — برنامج متين';

  // Notes
  if (s.notes && s.notes.trim()) {
    document.getElementById('notesCard').style.display = 'block';
    document.getElementById('notesContent').textContent = s.notes;
  }

  renderStats(sessions, grades);
  renderSessions(sessions);
  renderGrades(grades);
}
