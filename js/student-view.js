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
  setupAttendanceForm(studentId);
}

// ── فورم تسجيل الغياب ────────────────────────────────────────────────────
const SUBJECTS_LIST = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];

function setupAttendanceForm(studentId) {
  const toggleBtn = document.getElementById('newSessionBtn');
  const form      = document.getElementById('newSessionForm');
  const subjWrap  = document.getElementById('sessSubjects');
  const dateInput = document.getElementById('sessDate');
  const dayInput  = document.getElementById('sessDay');
  const saveBtn   = document.getElementById('saveSessionBtn');
  if (!toggleBtn || !form) return;

  // تاريخ اليوم تلقائياً
  const todayISO = new Date().toISOString().split('T')[0];
  dateInput.value = todayISO;
  const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  dayInput.value = dayNames[new Date().getDay()];

  const subjState = {};
  SUBJECTS_LIST.forEach(s => subjState[s] = 'present');

  function renderSubjRow() {
    const allPresent = SUBJECTS_LIST.every(s => subjState[s] === 'present');
    const allAbsent  = SUBJECTS_LIST.every(s => subjState[s] === 'absent');
    const allExcused = SUBJECTS_LIST.every(s => subjState[s] === 'excused');
    const bs = (active, color) =>
      `flex:1;padding:6px 4px;border-radius:7px;font-size:11px;cursor:pointer;font-family:inherit;
       border:1.5px solid ${color};background:${active?color:'transparent'};color:${active?'#fff':color};`;

    subjWrap.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <button type="button" onclick="svSetAll('present')" style="${bs(allPresent,'#1a6a3a')}">✓ كل حاضرة</button>
        <button type="button" onclick="svSetAll('absent')"  style="${bs(allAbsent,'#c0392b')}">✗ كل غائبة</button>
        <button type="button" onclick="svSetAll('excused')" style="${bs(allExcused,'#b8860b')}">~ كل بعذر</button>
      </div>
      ${SUBJECTS_LIST.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600">${s}</span>
        <div style="display:flex;gap:4px">
          <button type="button" data-subj="${s}" data-val="present"
            style="padding:3px 10px;font-size:11px;border-radius:6px;cursor:pointer;font-family:inherit;
              border:1.5px solid #1a6a3a;background:${subjState[s]==='present'?'#1a6a3a':'transparent'};
              color:${subjState[s]==='present'?'#fff':'#1a6a3a'}">حاضرة</button>
          <button type="button" data-subj="${s}" data-val="absent"
            style="padding:3px 10px;font-size:11px;border-radius:6px;cursor:pointer;font-family:inherit;
              border:1.5px solid #c0392b;background:${subjState[s]==='absent'?'#c0392b':'transparent'};
              color:${subjState[s]==='absent'?'#fff':'#c0392b'}">غائبة</button>
          <button type="button" data-subj="${s}" data-val="excused"
            style="padding:3px 10px;font-size:11px;border-radius:6px;cursor:pointer;font-family:inherit;
              border:1.5px solid #b8860b;background:${subjState[s]==='excused'?'#b8860b':'transparent'};
              color:${subjState[s]==='excused'?'#fff':'#b8860b'}">بعذر</button>
        </div>
      </div>`).join('')}`;

    subjWrap.querySelectorAll('button[data-subj]').forEach(btn => {
      btn.onclick = () => { subjState[btn.dataset.subj] = btn.dataset.val; renderSubjRow(); };
    });
  }

  window.svSetAll = (val) => { SUBJECTS_LIST.forEach(s => subjState[s] = val); renderSubjRow(); };
  renderSubjRow();

  // فتح/إغلاق الفورم
  toggleBtn.onclick = () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    toggleBtn.innerHTML = form.style.display === 'none'
      ? '<i class="ti ti-plus"></i> تسجيل غياب'
      : '<i class="ti ti-x"></i> إلغاء';
  };

  // حفظ
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ...';
    try {
      await addDoc(collection(db, 'students', studentId, 'sessions'), {
        date:     dateInput.value,
        day:      dayInput.value,
        subjects: { ...subjState },
        createdAt: serverTimestamp(),
      });
      form.style.display = 'none';
      toggleBtn.innerHTML = '<i class="ti ti-plus"></i> تسجيل غياب';
      // إعادة تحميل الصفحة لتحديث السجل
      location.reload();
    } catch(e) {
      alert('حدث خطأ، حاولي مرة أخرى');
      console.error(e);
    }
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  };
}

// ── Stats ────────────────────────────────────
function renderStats(sessions, grades) {
  let present = 0, absent = 0, total = 0;
  sessions.forEach(s => {
    Object.values(s.subjects || {}).forEach(v => {
      if (v === 'present') { present++; total++; }
      else if (v === 'absent') { absent++; total++; }
    });
  });

  const valid = grades.filter(g => g.total > 0);
  const avgGrade = valid.length
    ? Math.round(valid.reduce((s, g) => s + (g.score / g.total * 100), 0) / valid.length)
    : null;

  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent  = absent;
  document.getElementById('statPct').textContent     = total ? Math.round(present / total * 100) + '%' : '—';
  document.getElementById('statGrade').textContent   = avgGrade !== null ? avgGrade + '%' : '—';
}

// ── Sessions ─────────────────────────────────
function renderSessions(sessions) {
  const list = document.getElementById('attendanceList');
  if (!sessions.length) {
    list.innerHTML = '<div class="empty-msg">لا توجد جلسات مسجلة بعد</div>';
    return;
  }

  list.innerHTML = sessions.map(s => {
    const subjects   = s.subjects || {};
    const keys       = Object.keys(subjects);
    const presentCnt = keys.filter(k => subjects[k] === 'present').length;
    const summary    = keys.length ? `${presentCnt}/${keys.length} مواد حاضرة` : '';

    const subjRows = keys.map(subj => {
      const val = subjects[subj];
      const badgeClass = val === 'present' ? 'present' : val === 'absent' ? 'absent' : 'unknown';
      const badgeText  = val === 'present' ? '✔ حاضرة' : val === 'absent' ? '✖ غائبة' : '—';
      return `
        <div class="subject-row">
          <span class="subject-name">${subj}</span>
          <span class="att-badge ${badgeClass}">${badgeText}</span>
        </div>`;
    }).join('');

    return `
      <div class="session-item">
        <div class="session-header" onclick="this.nextElementSibling.classList.toggle('open')">
          <div>
            <div class="session-day-date">${s.day || ''} — ${formatDate(s.date)}</div>
            ${summary ? `<div class="session-summary">${summary}</div>` : ''}
          </div>
          <span class="session-toggle">▼</span>
        </div>
        <div class="session-subjects">
          ${subjRows || '<div style="color:#bbb;font-size:13px">لا توجد مواد</div>'}
        </div>
      </div>`;
  }).join('');
}

// ── Grades ───────────────────────────────────
function renderGrades(grades) {
  const list = document.getElementById('gradesList');
  if (!grades.length) {
    list.innerHTML = '<div class="empty-msg">لا توجد درجات مسجلة</div>';
    return;
  }

  list.innerHTML = grades.map(g => {
    const pct = g.total ? Math.round(g.score / g.total * 100) : null;
    const pctClass = pct === null ? '' : pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
    return `
      <div class="grade-item">
        <div class="grade-info">
          <span class="grade-label">${g.label || 'اختبار'}</span>
          <span class="grade-subj-tag">${g.subject || ''}</span>
        </div>
        <div class="grade-score-wrap">
          ${pct !== null ? `<span class="grade-pct ${pctClass}">${pct}%</span>` : ''}
          <span class="grade-score">${g.score}</span>
          <span class="grade-total">/ ${g.total}</span>
        </div>
      </div>`;
  }).join('');
}

// ── Helper ───────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

loadAll();

} // end initStudentView
