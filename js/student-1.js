import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, onSnapshot, query, orderBy, deleteDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut,
         EmailAuthProvider, reauthenticateWithCredential, deleteUser }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";
import { fullDeleteUser } from "./delete-account.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Auth Guard ────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const params    = new URLSearchParams(location.search);
  const studentId = params.get('id');
  if (!studentId) { window.location.href = '../html/login.html'; return; }

  const userSnap = await getDoc(doc(db, 'users', user.uid));
  if (!userSnap.exists()) { window.location.href = '../html/login.html'; return; }

  const userData = userSnap.data();
  const role     = userData.role   || '';
  const status   = userData.status || '';

  // ممنوع: حسابات معلّقة أو pending
  if (status === 'pending' || status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  // الطالبة العادية: تشوف بس صفحتها (uid = studentId)
  if (role === 'student') {
    if (user.uid !== studentId) {
      window.location.href = '../html/home.html'; return;
    }
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initPage(studentId);
    return;
  }

  // بنات متين: تشوف صفحتها المربوطة (linkedStudentId)
  if (role === 'mateen') {
    const linkedId = userData.linkedStudentId || '';
    if (!linkedId || linkedId !== studentId) {
      window.location.href = '../html/home.html'; return;
    }
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initPage(studentId);
    return;
  }

  // الإدارة فقط: تشوف الكل
  if (role === 'admin') {
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initPage(studentId);
    return;
  }

  // المعلمة: تشوف بس طالباتها (teacherId في doc الطالبة = subject المعلمة)
  if (role === 'teacher') {
    const teacherSubject = userData.subject || '';
    const studentSnap    = await getDoc(doc(db, 'students', studentId));
    if (!studentSnap.exists() || studentSnap.data().teacherId !== teacherSubject) {
      window.location.href = '../html/home.html'; return;
    }
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initPage(studentId, teacherSubject);
    return;
  }

  // أي role تاني — ممنوع
  window.location.href = '../html/login.html';
});

// ── Logout ────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', () => {
  signOut(auth).then(() => window.location.href = '../html/login.html');
});

// ── حذف الحساب ───────────────────────────────
document.getElementById('deleteAccBtn').addEventListener('click', () => {
  document.getElementById('delPassInput').value = '';
  document.getElementById('delError').classList.remove('show');
  document.getElementById('delModal').classList.add('open');
});

document.getElementById('delCancelBtn').addEventListener('click', () => {
  document.getElementById('delModal').classList.remove('open');
});

document.getElementById('delModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

document.getElementById('delConfirmBtn').addEventListener('click', async () => {
  const pass    = document.getElementById('delPassInput').value;
  const errEl   = document.getElementById('delError');
  const btn     = document.getElementById('delConfirmBtn');
  errEl.classList.remove('show');

  if (!pass) {
    errEl.textContent = 'أدخلي كلمة المرور أولاً';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جارٍ الحذف...';

  try {
    const user       = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, pass);

    // إعادة المصادقة
    await reauthenticateWithCredential(user, credential);

    // حذف كل بيانات المستخدم من Firestore (users, students, conversations, messages)
    await fullDeleteUser(user.uid);

    // حذف حساب Auth
    await deleteUser(user);

    // توجيه لصفحة الرئيسية
    window.location.href = '../html/home.html';

  } catch(e) {
    const msgs = {
      'auth/wrong-password':         'كلمة المرور غير صحيحة',
      'auth/invalid-credential':     'كلمة المرور غير صحيحة',
      'auth/too-many-requests':      'الحساب مُعلَّق مؤقتاً، حاولي لاحقاً',
      'auth/network-request-failed': 'تعذر الاتصال، تحققي من الإنترنت',
    };
    errEl.textContent = msgs[e.code] || 'حدث خطأ، حاولي مجدداً';
    errEl.classList.add('show');
    btn.disabled    = false;
    btn.textContent = 'تأكيد الحذف';
  }
});

// ── Init Page ─────────────────────────────────
function initPage(studentId) {

  // معلومات الطالبة
  getDoc(doc(db, 'students', studentId)).then(snap => {
    if (!snap.exists()) {
      document.getElementById('studentName').textContent = 'طالبة غير موجودة';
      return;
    }
    const s = snap.data();
    document.getElementById('studentName').textContent  = s.name  || 'بدون اسم';
    document.getElementById('studentStatus').textContent =
      s.status === 'mateen' ? '📖 بنات متين' :
      s.status === 'new'    ? '✨ مستجدة' : '';
    if (s.notes) document.getElementById('notesArea').value = s.notes;
  });

  // الحضور
  const sessQ = query(collection(db, 'students', studentId, 'sessions'), orderBy('date', 'desc'));
  onSnapshot(sessQ, snap => {
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAttendance(sessions);
    updateStats(sessions);
  });

  // الدرجات
  const gradesQ = query(collection(db, 'students', studentId, 'grades'), orderBy('createdAt', 'desc'));
  onSnapshot(gradesQ, snap => {
    renderGrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── إحصاءات ───────────────────────────────────
function updateStats(sessions) {
  let present = 0, absent = 0, totalScores = 0, gradeCount = 0;
  sessions.forEach(s => {
    Object.values(s.subjects || {}).forEach(v => {
      if (v === 'present') present++;
      else if (v === 'absent') absent++;
    });
  });
  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent  = absent;
  const total = present + absent;
  document.getElementById('statPct').textContent = total
    ? Math.round(present / total * 100) + '%' : '—';
}

// ── الحضور ────────────────────────────────────
function renderAttendance(sessions) {
  const el = document.getElementById('attendanceList');
  if (!sessions.length) {
    el.innerHTML = '<div class="empty-msg">لا توجد جلسات مسجلة بعد</div>';
    return;
  }
  el.innerHTML = sessions.map(s => {
    const subjRows = Object.entries(s.subjects || {}).map(([subj, val]) => `
      <div class="subject-row">
        <span class="subject-name">${subj}</span>
        <span class="att-badge ${val === 'present' ? 'present' : 'absent'}">
          ${val === 'present' ? '✅ حاضرة' : '❌ غائبة'}
        </span>
      </div>`).join('');
    return `
      <div class="session-card">
        <div class="session-header" onclick="this.nextElementSibling.classList.toggle('open')">
          <div>
            <span class="session-day">${s.day || ''}</span>
            <span class="session-date">${s.date || ''}</span>
          </div>
          <span class="session-toggle">▼</span>
        </div>
        <div class="session-subjects" style="display:none">
          ${subjRows || '<div style="color:#bbb;font-size:13px;padding:6px 0">لا توجد مواد</div>'}
        </div>
      </div>`;
  }).join('');

  // toggle
  el.querySelectorAll('.session-subjects').forEach((sub, i) => {
    sub.style.display = i === 0 ? 'block' : 'none';
  });
}

// ── الدرجات ───────────────────────────────────
function renderGrades(grades) {
  const el = document.getElementById('gradesList');
  if (!grades.length) {
    el.innerHTML = '<div class="empty-msg">لا توجد درجات مسجلة</div>';
    return;
  }
  let total = 0;
  el.innerHTML = grades.map(g => {
    const pct = g.total ? Math.round(g.score / g.total * 100) : null;
    if (pct !== null) total += pct;
    const cls = pct >= 80 ? 'high' : pct >= 60 ? 'mid' : 'low';
    return `
      <div class="grade-row">
        <div class="grade-info">
          <span class="grade-label">${g.label || '—'}</span>
          <span class="grade-subject">${g.subject || ''}</span>
        </div>
        <div class="grade-score ${cls}">
          ${g.score}/${g.total}
          ${pct !== null ? `<span class="grade-pct">(${pct}%)</span>` : ''}
        </div>
      </div>`;
  }).join('');

  const avg = grades.length ? Math.round(total / grades.length) : null;
  document.getElementById('statGrade').textContent = avg !== null ? avg + '%' : '—';
}
