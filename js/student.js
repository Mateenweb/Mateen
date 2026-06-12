// ===========================
//  صفحة متابعة الطالبة
// ===========================

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc, collection,
         addDoc, onSnapshot, deleteDoc, query, orderBy }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from './config.js';

// ── Firebase Init ────────────────────────────
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Auth Guard ───────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap   = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = '../html/login.html'; return; }

  const userData = snap.data();
  const role     = userData.role   || '';
  const status   = userData.status || '';

  if (status === 'pending' || status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  const params    = new URLSearchParams(location.search);
  const studentId = params.get('id');

  // الطالبة: تشوف بس صفحتها هي
  if (role === 'student' || role === 'mateen') {
    if (!studentId || user.uid !== studentId) {
      window.location.href = '../html/home.html'; return;
    }
    initPage();
    return;
  }

  // الإدارة فقط: تشوف الكل
  if (role === 'admin') {
    if (!studentId) { window.location.href = '../html/home.html'; return; }
    initPage();
    return;
  }

  // المعلمة: بس طالباتها
  if (role === 'teacher') {
    if (!studentId) { window.location.href = '../html/home.html'; return; }
    const teacherSubject = userData.subject || '';
    const studentSnap    = await getDoc(doc(db, 'students', studentId));
    if (!studentSnap.exists() || studentSnap.data().teacherId !== teacherSubject) {
      window.location.href = '../html/home.html'; return;
    }
    initPage();
    return;
  }

  window.location.href = '../html/login.html';
});

// ── جدول المواد لكل يوم ──────────────────────
const DAY_SUBJECTS = {
  'الأحد':    ['تفسير', 'قرآن', 'فقه'],
  'الاثنين':  ['فقه',   'قرآن', 'حديث'],
  'الثلاثاء': ['عقيدة', 'قرآن', 'تفسير'],
  'الأربعاء': ['تفسير', 'قرآن', 'فقه'],
  'الخميس':   ['حديث',  'قرآن', 'عقيدة'],
};

function initPage() {
  // Show content, hide gate
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';

// ── Get student ID from URL ──────────────────
const params     = new URLSearchParams(location.search);
const studentId  = params.get('id');

if (!studentId) {
  document.body.innerHTML = '<div style="padding:40px;text-align:center;color:white;font-family:Cairo,sans-serif;font-size:20px;">معرف الطالبة غير موجود</div>';
  throw new Error('No student ID');
}

// ── Load Student Info ────────────────────────
const studentRef = doc(db, 'students', studentId);
getDoc(studentRef).then(snap => {
  if (!snap.exists()) {
    document.getElementById('studentName').textContent = 'طالبة غير موجودة';
    return;
  }
  const s = snap.data();
  document.getElementById('studentName').textContent = s.name || 'بدون اسم';
  document.title = s.name || 'صفحة الطالبة';

  const statusMap = { mateen: '📖 بنات متين', new: '✨ المستجدات', '': '' };
  document.getElementById('studentStatus').textContent = statusMap[s.status] || '';
});

// ── Sessions (Attendance) ────────────────────
const sessionsRef = collection(db, 'students', studentId, 'sessions');
const sessQuery   = query(sessionsRef, orderBy('date', 'desc'));

onSnapshot(sessQuery, snap => {
  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSessions(sessions);
  updateStats(sessions);
});

function renderSessions(sessions) {
  const list = document.getElementById('attendanceList');
  if (!sessions.length) {
    list.innerHTML = '<div class="empty-msg">لا توجد جلسات مسجلة بعد</div>';
    return;
  }

  list.innerHTML = sessions.map(s => {
    const subjects = s.subjects || {};
    const subjectKeys = Object.keys(subjects);
    const presentCount = subjectKeys.filter(k => subjects[k] === 'present').length;
    const totalCount   = subjectKeys.length;
    const summaryText  = totalCount
      ? `${presentCount}/${totalCount} مواد حاضرة`
      : 'لم تسجل مواد';

    const subjRows = subjectKeys.map(subj => {
      const att = subjects[subj];
      return `
        <div class="subject-row">
          <span class="subject-name">${subj}</span>
          <div class="att-btns">
            <button class="att-btn ${att === 'present' ? 'present' : ''}"
              onclick="toggleAtt('${s.id}','${subj}','present')">✔ حاضرة</button>
            <button class="att-btn ${att === 'absent' ? 'absent' : ''}"
              onclick="toggleAtt('${s.id}','${subj}','absent')">✖ غائبة</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="session-item" id="sess_${s.id}">
        <div class="session-header" onclick="toggleSession('${s.id}')">
          <div>
            <div class="session-day-date">${s.day || ''} — ${formatDate(s.date)}</div>
            <div class="session-summary">${summaryText}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="delete-session-btn" onclick="event.stopPropagation();deleteSession('${s.id}')">🗑</button>
            <span class="session-toggle">▼</span>
          </div>
        </div>
        <div class="session-subjects" id="subj_${s.id}">
          ${subjRows || '<div style="color:#bbb;font-size:13px;padding:6px 0">لا توجد مواد</div>'}
        </div>
      </div>`;
  }).join('');
}

window.toggleSession = id => {
  document.getElementById('subj_' + id)?.classList.toggle('open');
};

window.toggleAtt = async (sessId, subject, value) => {
  const ref = doc(db, 'students', studentId, 'sessions', sessId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const subjects = { ...(snap.data().subjects || {}) };
  subjects[subject] = subjects[subject] === value ? '' : value;
  await updateDoc(ref, { subjects });
};

window.deleteSession = async id => {
  if (!confirm('حذف هذه الجلسة؟')) return;
  await deleteDoc(doc(db, 'students', studentId, 'sessions', id));
};

// ── Grades ───────────────────────────────────
const gradesRef  = collection(db, 'students', studentId, 'grades');
const gradeQuery = query(gradesRef, orderBy('createdAt', 'desc'));

onSnapshot(gradeQuery, snap => {
  const grades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGrades(grades);
  updateGradeAvg(grades);
});

function renderGrades(grades) {
  const list = document.getElementById('gradesList');
  if (!grades.length) {
    list.innerHTML = '<div class="empty-msg">لا توجد درجات مسجلة</div>';
    return;
  }

  list.innerHTML = grades.map(g => {
    const pct  = g.total ? Math.round((g.score / g.total) * 100) : null;
    const pctClass = pct === null ? '' : pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
    const pctLabel = pct !== null ? `${pct}%` : '';
    return `
      <div class="grade-item">
        <div class="grade-info">
          <span class="grade-label">${g.label || 'اختبار'}</span>
          <span class="grade-subject-tag">${g.subject || ''}</span>
        </div>
        <div class="grade-score-wrap">
          ${pctLabel ? `<span class="grade-pct ${pctClass}">${pctLabel}</span>` : ''}
          <span class="grade-score">${g.score}</span>
          <span class="grade-total">/ ${g.total}</span>
          <button class="delete-grade-btn" onclick="deleteGrade('${g.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

window.deleteGrade = async id => {
  if (!confirm('حذف هذه الدرجة؟')) return;
  await deleteDoc(doc(db, 'students', studentId, 'grades', id));
};

// ── Notes ────────────────────────────────────
getDoc(studentRef).then(snap => {
  if (snap.exists()) {
    document.getElementById('notesArea').value = snap.data().notes || '';
  }
});

window.saveNotes = async () => {
  const notes = document.getElementById('notesArea').value;
  await updateDoc(studentRef, { notes });
  showToast('تم حفظ الملاحظات ✅');
};

// ── Stats ────────────────────────────────────
function updateStats(sessions) {
  let present = 0, absent = 0, total = 0;
  sessions.forEach(s => {
    Object.values(s.subjects || {}).forEach(v => {
      if (v === 'present') { present++; total++; }
      else if (v === 'absent') { absent++; total++; }
    });
  });
  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent  = absent;
  document.getElementById('statPct').textContent     = total ? Math.round(present/total*100) + '%' : '—';
}

function updateGradeAvg(grades) {
  const valid = grades.filter(g => g.total > 0);
  if (!valid.length) { document.getElementById('statGrade').textContent = '—'; return; }
  const avg = valid.reduce((s, g) => s + (g.score / g.total * 100), 0) / valid.length;
  document.getElementById('statGrade').textContent = Math.round(avg) + '%';
}

// ── Add Session Modal ────────────────────────
const sessAttMap = {}; // subject → 'present'|'absent'|''

window.openAddSession = () => {
  document.getElementById('sessDay').value  = '';
  document.getElementById('sessDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('subjectsSection').innerHTML = '';
  Object.keys(sessAttMap).forEach(k => delete sessAttMap[k]);
  document.getElementById('sessionModal').classList.add('open');
};

document.getElementById('sessDay').addEventListener('change', function () {
  const day      = this.value;
  const subjects = DAY_SUBJECTS[day] || [];
  subjects.forEach(s => sessAttMap[s] = '');
  renderSubjectPicker(subjects);
});

function renderSubjectPicker(subjects) {
  const sec = document.getElementById('subjectsSection');
  if (!subjects.length) { sec.innerHTML = ''; return; }
  sec.innerHTML = `
    <div class="subjects-section-title">تسجيل الحضور لكل مادة</div>
    ${subjects.map(s => `
      <div class="subj-row">
        <span>${s}</span>
        <div class="subj-btns">
          <button class="subj-btn" id="btn_p_${s}" onclick="setSubjAtt('${s}','present')">✔ حاضرة</button>
          <button class="subj-btn" id="btn_a_${s}" onclick="setSubjAtt('${s}','absent')">✖ غائبة</button>
        </div>
      </div>`).join('')}`;
}

window.setSubjAtt = (subj, val) => {
  sessAttMap[subj] = sessAttMap[subj] === val ? '' : val;
  const pBtn = document.getElementById('btn_p_' + subj);
  const aBtn = document.getElementById('btn_a_' + subj);
  if (pBtn) pBtn.className = 'subj-btn' + (sessAttMap[subj] === 'present' ? ' present' : '');
  if (aBtn) aBtn.className = 'subj-btn' + (sessAttMap[subj] === 'absent'  ? ' absent'  : '');
};

window.saveSession = async () => {
  const day  = document.getElementById('sessDay').value;
  const date = document.getElementById('sessDate').value;
  if (!day || !date) { showToast('اختاري اليوم والتاريخ'); return; }

  await addDoc(sessionsRef, {
    day,
    date,
    subjects: { ...sessAttMap },
    createdAt: Date.now()
  });
  closeModal('sessionModal');
  showToast('تم حفظ الجلسة ✅');
};

// ── Add Grade Modal ──────────────────────────
window.openAddGrade = () => {
  document.getElementById('gradeLabel').value   = '';
  document.getElementById('gradeScore').value   = '';
  document.getElementById('gradeTotal').value   = '100';
  document.getElementById('gradeModal').classList.add('open');
};

window.saveGrade = async () => {
  const label   = document.getElementById('gradeLabel').value.trim();
  const subject = document.getElementById('gradeSubject').value;
  const score   = parseFloat(document.getElementById('gradeScore').value);
  const total   = parseFloat(document.getElementById('gradeTotal').value) || 100;
  if (!label) { showToast('اكتبي اسم الاختبار'); return; }
  if (isNaN(score)) { showToast('اكتبي الدرجة'); return; }

  await addDoc(gradesRef, { label, subject, score, total, createdAt: Date.now() });
  closeModal('gradeModal');
  showToast('تم حفظ الدرجة ✅');
};

// ── Helpers ──────────────────────────────────
window.closeModal = id => document.getElementById(id)?.classList.remove('open');

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = [
    'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
    'background:#1a3a5c','color:white','padding:10px 22px',
    'border-radius:12px','z-index:99999',
    'font-family:Cairo,sans-serif','font-size:14px',
    'box-shadow:0 4px 15px rgba(0,0,0,.3)'
  ].join(';');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) el.classList.remove('open');
  });
});

} // end initPage
