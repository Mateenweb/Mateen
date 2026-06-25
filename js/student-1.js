// ===========================
//  ملف الطالبة — student-1.js
// ===========================
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, query,
         orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut,
         EmailAuthProvider, reauthenticateWithCredential, deleteUser }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from './config.js';

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Tab switcher (global) ─────────────────────
window.switchTab = name => {
  document.querySelectorAll('.stu-tab').forEach(t =>
    t.classList.toggle('active', t.getAttribute('onclick').includes(`'${name}'`)));
  document.querySelectorAll('.stu-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${name}`));
};

// ── Auth Guard ────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const userSnap = await getDoc(doc(db, 'users', user.uid));
  if (!userSnap.exists()) { window.location.href = '../html/login.html'; return; }

  const userData = userSnap.data();
  const role     = userData.role   || '';
  const status   = userData.status || '';

  if (status === 'pending' || status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  // تحديد studentId
  let studentId = new URLSearchParams(location.search).get('id');

  if (role === 'student' || role === 'mateen') {
    // الطالبة تشوف بس صفحتها — نجيب linkedStudentId من users doc
    studentId = userData.linkedStudentId || null;
    if (!studentId) {
      showNoData();
      showPage();
      document.getElementById('studentName').textContent = user.email?.split('@')[0] || 'الطالبة';
      document.getElementById('studentEmail').textContent = user.email || '';
      return;
    }
  } else if (role === 'admin' || role === 'teacher' || role === 'supervisor') {
    if (!studentId) { window.location.href = '../html/home.html'; return; }
  } else {
    window.location.href = '../html/login.html'; return;
  }

  showPage();
  document.getElementById('studentEmail').textContent = user.email || '';
  initPage(studentId, user, role);
});

function showPage() {
  document.getElementById('authGate').style.display  = 'none';
  document.getElementById('mainContent').style.display = 'block';
}

function showNoData() {
  ['attendanceList','gradesList'].forEach(id => {
    document.getElementById(id).innerHTML =
      '<div class="stu-empty"><i class="ti ti-alert-circle"></i><span>لم يتم ربط حسابك ببيانات طالبة بعد. تواصلي مع الإدارة.</span></div>';
  });
}

// ── Main init ─────────────────────────────────
async function initPage(studentId, user, role) {

  // Load student info
  const stuSnap = await getDoc(doc(db, 'students', studentId));
  if (!stuSnap.exists()) { showNoData(); return; }
  const s = stuSnap.data();

  // Fill profile header
  document.getElementById('studentName').textContent = s.name || 'بدون اسم';
  document.title = (s.name || 'الطالبة') + ' — متين';

  const statusMap = { mateen: '📖 بنات متين', new: '✨ المستجدات' };
  const badge = document.getElementById('studentStatus');
  badge.textContent = statusMap[s.status] || '';
  if (!statusMap[s.status]) badge.style.display = 'none';

  // Fill info tab
  document.getElementById('infoName').textContent     = s.name || '—';
  document.getElementById('infoStatus').textContent   = statusMap[s.status] || '—';
  const accMap = { accepted: '✅ مقبولة', rejected: '❌ غير مقبولة', na: '⏳ لم يحدد' };
  document.getElementById('infoAccepted').textContent  = accMap[s.accepted] || '—';
  document.getElementById('infoDay').textContent       = formatDayDate(s.day, s.month) || '—';
  document.getElementById('infoTime').textContent      = formatTime(s.hour, s.ampm) || '—';
  const intMap = { done: '✅ تمت', pending: '⏳ لم تتم' };
  document.getElementById('infoInterview').textContent = intMap[s.interview] || '—';

  // Notes
  document.getElementById('notesContent').textContent = s.notes || 'لا توجد ملاحظات بعد.';

  // Attendance
  const sessQ = query(collection(db,'students',studentId,'sessions'), orderBy('date','desc'));
  onSnapshot(sessQ, snap => {
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSessions(sessions);
    updateStats(sessions);
  });

  // Grades
  const gradeQ = query(collection(db,'students',studentId,'grades'), orderBy('createdAt','desc'));
  onSnapshot(gradeQ, snap => {
    const grades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGrades(grades);
    updateGradeAvg(grades);
  });

  // إخفاء زرار حذف الحساب للأدمن/المعلمة/المشرفة
  if (role !== 'student' && role !== 'mateen') {
    document.getElementById('deleteAccBtn')?.closest('.delete-acc-section')?.remove();
  }

  // المشرفة: تشوف بس تبويبي "حضوري" و"ملاحظات" — وتقدر تسجل حضور وتكتب ملاحظات
  if (role === 'supervisor') {
    document.getElementById('tabBtn-info')?.remove();
    document.getElementById('tabBtn-grades')?.remove();
    document.getElementById('newSessionWrap').style.display = 'block';
    document.getElementById('notesEditWrap').style.display  = 'block';
    document.getElementById('notesTextarea').value = s.notes || '';
    setupSupervisorAttendance(studentId);
    setupSupervisorNotes(studentId);
    switchTab('attend');
  }

  // الإدارة: صلاحية كاملة — تشوف كل التبويبات وتقدر تعدّل حضور + درجات + ملاحظات
  if (role === 'admin') {
    document.getElementById('newSessionWrap').style.display = 'block';
    document.getElementById('newGradeWrap').style.display   = 'block';
    document.getElementById('notesEditWrap').style.display  = 'block';
    document.getElementById('notesTextarea').value = s.notes || '';
    setupSupervisorAttendance(studentId);
    setupAdminGrades(studentId);
    setupSupervisorNotes(studentId);
  }

  // Logout
  document.getElementById('logoutBtn').onclick = () =>
    signOut(auth).then(() => window.location.href = '../html/login.html');

  // Delete account
  setupDeleteAccount(user);
}

// ── المشرفة: تسجيل حضور جديد ──────────────────
// مواد كل يوم — من student.js
const DAY_SUBJECTS_MAP = {
  'الأحد':    ['الفقه', 'التفسير', 'مقرأة متين'],
  'الاثنين':  ['التفسير', 'الفقه', 'مقرأة متين'],
  'الثلاثاء': ['العقيدة', 'الحديث', 'مقرأة متين'],
  'الأربعاء': ['الفقه', 'الحديث', 'مقرأة متين'],
  'الخميس':   ['التفسير', 'العقيدة', 'مقرأة متين'],
};
function getSupervisorSubjects(day) {
  return DAY_SUBJECTS_MAP[day] || ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];
}

function setupSupervisorAttendance(studentId) {
  const toggleBtn = document.getElementById('newSessionBtn');
  const form       = document.getElementById('newSessionForm');
  const subjWrap   = document.getElementById('sessSubjects');
  const dateInput  = document.getElementById('sessDate');
  const dayInput   = document.getElementById('sessDay');

  // قيم افتراضية: تاريخ اليوم + اسم اليوم بالعربي
  const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  function updateDayFromDate(dateStr) {
    if (!dateStr) return;
    // نضيف T00:00:00 عشان نتجنب مشكلة timezone
    const d = new Date(dateStr + 'T00:00:00');
    dayInput.value = dayNames[d.getDay()];
  }

  const todayISO = new Date().toISOString().split('T')[0];
  dateInput.value = todayISO;
  updateDayFromDate(todayISO);

  // لما تغيري التاريخ — اسم اليوم يتحدث تلقائياً
  dateInput.addEventListener('change', () => {
    updateDayFromDate(dateInput.value);
    renderSubjRow();
  });

  // حالة كل مادة (present/absent) — افتراضياً غائبة لحد ما تتحدد
  const subjState = {};
  getSupervisorSubjects(dayInput.value).forEach(s => subjState[s] = null);

  function renderSubjRow() {
    const todaySubjs = getSupervisorSubjects(dayInput.value);
    const allPresent = todaySubjs.every(s => subjState[s] === 'present');
    const allAbsent  = todaySubjs.every(s => subjState[s] === 'absent');
    const allExcused = todaySubjs.every(s => subjState[s] === 'excused');

    const btnStyle = (active, color) => `
      flex:1;padding:6px 4px;border-radius:7px;font-size:12px;cursor:pointer;font-family:inherit;
      border:1.5px solid ${color};
      background:${active ? color : 'transparent'};
      color:${active ? '#fff' : color};`;

    subjWrap.innerHTML = `
      <!-- أزرار تحديد الكل -->
      <div style="display:flex;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:2px solid var(--border)">
        <button type="button" onclick="setAllSubj('present')"  style="${btnStyle(allPresent,'#1a6a3a')}">✓ كل حاضرة</button>
        <button type="button" onclick="setAllSubj('absent')"   style="${btnStyle(allAbsent,'#c0392b')}">✗ كل غائبة</button>
        <button type="button" onclick="setAllSubj('excused')"  style="${btnStyle(allExcused,'#b8860b')}">~ كل بعذر</button>
      </div>
      ${getSupervisorSubjects(dayInput.value).map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;min-width:50px">${s}</span>
        <div style="display:flex;gap:5px">
          <button type="button" data-subj="${s}" data-val="present"
            style="padding:4px 10px;font-size:11px;border-radius:6px;cursor:pointer;font-family:inherit;
              border:1.5px solid #1a6a3a;
              background:${subjState[s]==='present' ? '#1a6a3a' : 'transparent'};
              color:${subjState[s]==='present' ? '#fff' : '#1a6a3a'};">حاضرة</button>
          <button type="button" data-subj="${s}" data-val="absent"
            style="padding:4px 10px;font-size:11px;border-radius:6px;cursor:pointer;font-family:inherit;
              border:1.5px solid #c0392b;
              background:${subjState[s]==='absent' ? '#c0392b' : 'transparent'};
              color:${subjState[s]==='absent' ? '#fff' : '#c0392b'};">غائبة</button>
          <button type="button" data-subj="${s}" data-val="excused"
            style="padding:4px 10px;font-size:11px;border-radius:6px;cursor:pointer;font-family:inherit;
              border:1.5px solid #b8860b;
              background:${subjState[s]==='excused' ? '#b8860b' : 'transparent'};
              color:${subjState[s]==='excused' ? '#fff' : '#b8860b'};">بعذر</button>
        </div>
      </div>`).join('')}`;

    subjWrap.querySelectorAll('button[data-subj]').forEach(btn => {
      btn.onclick = () => { subjState[btn.dataset.subj] = btn.dataset.val; renderSubjRow(); };
    });
  }

  window.setAllSubj = (val) => { getSupervisorSubjects(dayInput.value).forEach(s => subjState[s] = val); renderSubjRow(); };

  // افتراضياً: كل المواد حاضرة
  getSupervisorSubjects(dayInput.value).forEach(s => subjState[s] = 'present');
  renderSubjRow();

  toggleBtn.onclick = () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };
  document.getElementById('cancelSessionBtn').onclick = () => {
    form.style.display = 'none';
  };

  document.getElementById('saveSessionBtn').onclick = async () => {
    const subjects = {};
    getSupervisorSubjects(dayInput.value).forEach(s => { if (subjState[s]) subjects[s] = subjState[s]; });

    if (!Object.keys(subjects).length) {
      alert('حددي حضور أو غياب لمادة واحدة على الأقل');
      return;
    }

    try {
      await addDoc(collection(db, 'students', studentId, 'sessions'), {
        date: dateInput.value,
        day:  dayInput.value,
        subjects,
        createdAt: serverTimestamp(),
      });
      form.style.display = 'none';
      getSupervisorSubjects(dayInput.value).forEach(s => subjState[s] = null);
      renderSubjRow();
    } catch (e) {
      alert('حدث خطأ أثناء حفظ الحضور');
      console.error(e);
    }
  };
}

// ── الإدارة: إضافة درجة جديدة ──────────────────
function setupAdminGrades(studentId) {
  const toggleBtn = document.getElementById('newGradeBtn');
  const form       = document.getElementById('newGradeForm');

  toggleBtn.onclick = () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };
  document.getElementById('cancelGradeBtn').onclick = () => {
    form.style.display = 'none';
  };

  document.getElementById('saveGradeBtn').onclick = async () => {
    const label   = document.getElementById('gradeLabel').value.trim();
    const subject = document.getElementById('gradeSubject').value;
    const score   = Number(document.getElementById('gradeScore').value);
    const total   = Number(document.getElementById('gradeTotal').value);

    if (!label || !total) {
      alert('من فضلك أدخلي اسم الاختبار والدرجة الكلية');
      return;
    }

    try {
      await addDoc(collection(db, 'students', studentId, 'grades'), {
        label, subject, score, total,
        createdAt: serverTimestamp(),
      });
      form.style.display = 'none';
      document.getElementById('gradeLabel').value = '';
      document.getElementById('gradeScore').value = '';
      document.getElementById('gradeTotal').value = '';
      showSavedToast();
    } catch (e) {
      alert('حدث خطأ أثناء حفظ الدرجة');
      console.error(e);
    }
  };
}

// ── المشرفة: كتابة/تعديل الملاحظات ────────────
function setupSupervisorNotes(studentId) {
  document.getElementById('saveNotesBtn').onclick = async () => {
    const val = document.getElementById('notesTextarea').value.trim();
    try {
      await updateDoc(doc(db, 'students', studentId), { notes: val });
      document.getElementById('notesContent').textContent = val || 'لا توجد ملاحظات بعد.';
      showSavedToast();
    } catch (e) {
      alert('حدث خطأ أثناء حفظ الملاحظات');
      console.error(e);
    }
  };
}

function showSavedToast() {
  const t = document.createElement('div');
  t.textContent = '✓ تم الحفظ';
  t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--green-dark);color:#fff;padding:10px 20px;border-radius:30px;font-size:13px;z-index:9999';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

// ── Render Sessions ───────────────────────────
function renderSessions(sessions) {
  const list = document.getElementById('attendanceList');
  if (!sessions.length) {
    list.innerHTML = '<div class="stu-empty"><i class="ti ti-calendar-off"></i><span>لا توجد جلسات مسجلة بعد</span></div>';
    return;
  }
  list.innerHTML = sessions.map(s => {
    const subjects = s.subjects || {};
    const keys     = Object.keys(subjects);
    const present  = keys.filter(k => subjects[k] === 'present').length;
    const subjRows = keys.map(k => {
      const v = subjects[k];
      const chip = v === 'present' ? 'present' : v === 'absent' ? 'absent' : 'empty';
      const label = v === 'present' ? 'حاضرة' : v === 'absent' ? 'غائبة' : '—';
      return `<div class="subj-row">
        <span class="subj-name">${k}</span>
        <span class="att-chip ${chip}">${label}</span>
      </div>`;
    }).join('');

    return `<div class="session-card">
      <div class="session-head" onclick="toggleSession('${s.id}')">
        <div>
          <div class="session-day-date">${s.day || ''} — ${formatDate(s.date)}</div>
          <div class="session-summary">${present}/${keys.length} مواد حاضرة</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="event.stopPropagation();deleteSession('${s.id}')"
            style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:15px;padding:4px;border-radius:6px;"
            title="حذف الجلسة">
            <i class="ti ti-trash"></i>
          </button>
          <i class="ti ti-chevron-down session-arrow" id="arr_${s.id}"></i>
        </div>
      </div>
      <div class="session-body" id="subj_${s.id}">${subjRows || '<div class="stu-empty" style="padding:12px"><span>لا توجد مواد</span></div>'}</div>
    </div>`;
  }).join('');
}

window.toggleSession = id => {
  document.getElementById(`subj_${id}`)?.classList.toggle('open');
  const arr = document.getElementById(`arr_${id}`);
  if (arr) arr.style.transform = arr.style.transform === 'rotate(180deg)' ? '' : 'rotate(180deg)';
};

window.deleteSession = async (sessionId) => {
  if (!confirm('هل أنتِ متأكدة من حذف هذه الجلسة؟')) return;
  try {
    const studentId = new URLSearchParams(location.search).get('id');
    await deleteDoc(doc(db, 'students', studentId, 'sessions', sessionId));
  } catch(e) {
    alert('حدث خطأ أثناء الحذف');
    console.error(e);
  }
};

// ── Render Grades ─────────────────────────────
function renderGrades(grades) {
  const list = document.getElementById('gradesList');
  if (!grades.length) {
    list.innerHTML = '<div class="stu-empty"><i class="ti ti-school-off"></i><span>لا توجد درجات مسجلة</span></div>';
    return;
  }
  list.innerHTML = grades.map(g => {
    const pct   = g.total ? Math.round(g.score / g.total * 100) : null;
    const cls   = pct === null ? '' : pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
    const pctEl = pct !== null ? `<span class="grade-pct ${cls}">${pct}%</span>` : '';
    return `<div class="grade-card">
      <div class="grade-label-wrap">
        <div class="grade-label-text">${g.label || 'اختبار'}</div>
        ${g.subject ? `<span class="grade-subject-tag">${g.subject}</span>` : ''}
      </div>
      <div class="grade-score-wrap">
        ${pctEl}
        <span class="grade-num">${g.score}</span>
        <span class="grade-total">/ ${g.total}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Stats ─────────────────────────────────────
function updateStats(sessions) {
  let present = 0, absent = 0, total = 0;
  sessions.forEach(s => Object.values(s.subjects || {}).forEach(v => {
    if (v === 'present') { present++; total++; }
    else if (v === 'absent') { absent++; total++; }
  }));
  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent  = absent;
  document.getElementById('statPct').textContent     = total ? Math.round(present/total*100) + '%' : '—';
}

function updateGradeAvg(grades) {
  const valid = grades.filter(g => g.total > 0);
  if (!valid.length) { document.getElementById('statGrade').textContent = '—'; return; }
  const avg = valid.reduce((s, g) => s + g.score/g.total*100, 0) / valid.length;
  document.getElementById('statGrade').textContent = Math.round(avg) + '%';
}

// ── Delete Account ────────────────────────────
function setupDeleteAccount(user) {
  const btn = document.getElementById('deleteAccBtn');
  if (!btn) return;
  btn.onclick = () => document.getElementById('delModal').classList.add('open');
  document.getElementById('delCancelBtn').onclick = () => {
    document.getElementById('delModal').classList.remove('open');
    document.getElementById('delError').textContent = '';
    document.getElementById('delPassInput').value = '';
  };
  document.getElementById('delConfirmBtn').onclick = async () => {
    const pass = document.getElementById('delPassInput').value;
    const errEl = document.getElementById('delError');
    if (!pass) { errEl.textContent = 'أدخلي كلمة المرور'; return; }
    try {
      const cred = EmailAuthProvider.credential(user.email, pass);
      await reauthenticateWithCredential(user, cred);
      await deleteUser(user);
      window.location.href = '../html/login.html';
    } catch(e) {
      errEl.textContent = e.code === 'auth/wrong-password' ? 'كلمة المرور غير صحيحة' : 'حدث خطأ، حاولي مرة أخرى';
    }
  };
}

// ── Helpers ───────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

function formatDayDate(day, month) {
  if (!day) return null;
  const months = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
  return `${day}${month ? ' — ' + (months[month-1] || '') : ''}`;
}

function formatTime(hour, ampm) {
  if (!hour) return null;
  return `${hour}:00 ${ampm === 'am' ? 'صباحاً' : ampm === 'pm' ? 'مساءً' : ''}`;
}
