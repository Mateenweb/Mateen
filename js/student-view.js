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

function showError(msg = 'الرابط غير صحيح') {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;">
      <div style="background:white;border-radius:16px;padding:40px;text-align:center;font-family:Cairo,sans-serif;">
        <div style="font-size:40px;margin-bottom:16px">⚠️</div>
        <div style="font-size:18px;color:#1a3a5c;font-weight:700">${msg}</div>
      </div>
    </div>`;
}

if (!studentNum || isNaN(studentNum)) { showError(); throw new Error('No student number'); }

// ── Load Student ─────────────────────────────
async function loadAll() {
  const allSnap = await getDocs(query(collection(db, 'students'), orderBy('order')));
  if (allSnap.empty || studentNum > allSnap.docs.length) { showError(); return; }
  const studentId = allSnap.docs[studentNum - 1].id;

  history.replaceState(null, '', location.pathname);

  const studentRef = doc(db, 'students', studentId);
  const [snap, sessSnap, gradeSnap] = await Promise.all([
    getDoc(studentRef),
    getDocs(query(collection(db, 'students', studentId, 'sessions'), orderBy('date', 'desc'))),
    getDocs(query(collection(db, 'students', studentId, 'grades'),   orderBy('createdAt', 'desc')))
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
    document.getElementById('studentName').textContent = 'طالبة غير موجودة';
    return;
  }

  const s       = snap.data();
  const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const grades   = gradeSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Name & status
  document.getElementById('studentName').textContent = s.name || 'بدون اسم';
  document.title = (s.name || 'صفحتي') + ' — برنامج متين';
  const statusMap = { mateen: '📖 بنات متين', new: '✨ المستجدات', '': '' };
  document.getElementById('studentStatus').textContent = statusMap[s.status] || '';

  // Notes
  if (s.notes && s.notes.trim()) {
    document.getElementById('notesCard').style.display = 'block';
    document.getElementById('notesContent').textContent = s.notes;
  }

  renderStats(sessions, grades);
  renderSessions(sessions);
  renderGrades(grades);
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
