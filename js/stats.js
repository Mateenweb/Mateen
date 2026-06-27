// ===========================
//  Page الStatistics
// ===========================

import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from './config.js';

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── AUTH GUARD — للإدارة/الnot/don'tرفة/Teacher (f) only ───────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : '';
  if (!['admin', 'supervisor', 'teacher'].includes(role)) {
    window.location.href = '../html/home.html'; return;
  }
  loadAll();
});

// ── Global Data ──────────────────────────────
let allStudents = [];   // [{ id, name, sessions:[], grades:[] }]

// ── Load All Data ────────────────────────────
async function loadAll() {
  const studSnap = await getDocs(query(collection(db, 'students'), orderBy('order')));
  const students = studSnap.docs.map(d => ({ id: d.id, ...d.data(), sessions: [], grades: [] }));

  // Load sessions + grades for all students in parallel
  await Promise.all(students.map(async s => {
    const [sessSnap, gradeSnap] = await Promise.all([
      getDocs(collection(db, 'students', s.id, 'sessions')),
      getDocs(collection(db, 'students', s.id, 'grades'))
    ]);
    s.sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    s.grades   = gradeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }));

  allStudents = students;
  document.getElementById('loadingMsg').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';

  renderAll();
}

// ── Render All ───────────────────────────────
function renderAll() {
  renderSummary();
  renderAttTab();
  renderGradesTab();
  renderSubjectsTab();
  renderRankingTab();
}

// ── Summary Cards ────────────────────────────
function renderSummary() {
  const totalSessions = allStudents.reduce((s, st) => s + st.sessions.length, 0);

  // avg attendance
  const attPcts = allStudents.map(getAttPct).filter(v => v !== null);
  const avgAtt  = attPcts.length ? Math.round(attPcts.reduce((a,b) => a+b, 0) / attPcts.length) : null;

  // avg grades
  const gradePcts = allStudents.map(getGradeAvg).filter(v => v !== null);
  const avgGrade  = gradePcts.length ? Math.round(gradePcts.reduce((a,b) => a+b, 0) / gradePcts.length) : null;

  document.getElementById('sumStudents').textContent = allStudents.length;
  document.getElementById('sumSessions').textContent = totalSessions;
  document.getElementById('sumAvgAtt').textContent   = avgAtt   !== null ? avgAtt + '%'   : '—';
  document.getElementById('sumAvgGrade').textContent = avgGrade !== null ? avgGrade + '%' : '—';
}

// ── Helpers ──────────────────────────────────
function getAttPct(s) {
  let present = 0, total = 0;
  s.sessions.forEach(sess => {
    Object.values(sess.subjects || {}).forEach(v => {
      if (v === 'present' || v === 'absent') {
        total++;
        if (v === 'present') present++;
      }
    });
  });
  return total > 0 ? Math.round(present / total * 100) : null;
}

function getAttCounts(s) {
  let present = 0, absent = 0;
  s.sessions.forEach(sess => {
    Object.values(sess.subjects || {}).forEach(v => {
      if (v === 'present') present++;
      else if (v === 'absent') absent++;
    });
  });
  return { present, absent };
}

function getGradeAvg(s, subjectFilter = '') {
  const grades = subjectFilter
    ? s.grades.filter(g => g.subject === subjectFilter)
    : s.grades;
  const valid = grades.filter(g => g.total > 0);
  if (!valid.length) return null;
  return Math.round(valid.reduce((acc, g) => acc + (g.score / g.total * 100), 0) / valid.length);
}

function medalClass(i) {
  return i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'other';
}

function studentLink(s, label) {
  return `<a class="rank-name" href="student.html?id=${s.id}">${label || s.name || 'بدون اسم'}</a>`;
}

function barNameLink(s) {
  return `<a class="bar-name" href="student.html?id=${s.id}">${s.name || 'بدون اسم'}</a>`;
}

// ── Tab: Attendance ──────────────────────────
function renderAttTab() {
  const list = document.getElementById('attList');
  const data = allStudents
    .map(s => ({ s, pct: getAttPct(s) }))
    .filter(x => x.pct !== null)
    .sort((a, b) => b.pct - a.pct);

  if (!data.length) {
    list.innerHTML = '<div class="empty-bar">لا توجد بيانات حضور بعد</div>';
    return;
  }

  list.innerHTML = data.map(({ s, pct }) => {
    const color = pct >= 75 ? 'green' : pct >= 50 ? 'blue' : 'red';
    return `
      <div class="bar-item">
        ${barNameLink(s)}
        <div class="bar-track">
          <div class="bar-fill ${color}" style="width:${pct}%"></div>
        </div>
        <div class="bar-pct">${pct}%</div>
      </div>`;
  }).join('');
}

// ── Tab: Grades ──────────────────────────────
window.renderGradesTab = function () {
  const filter = document.getElementById('gradeSubjectFilter').value;
  const list   = document.getElementById('gradesList');

  const data = allStudents
    .map(s => ({ s, avg: getGradeAvg(s, filter) }))
    .filter(x => x.avg !== null)
    .sort((a, b) => b.avg - a.avg);

  if (!data.length) {
    list.innerHTML = '<div class="empty-bar">لا توجد درجات بعد</div>';
    return;
  }

  list.innerHTML = data.map(({ s, avg }) => {
    const color = avg >= 75 ? 'green' : avg >= 50 ? 'orange' : 'red';
    return `
      <div class="bar-item">
        ${barNameLink(s)}
        <div class="bar-track">
          <div class="bar-fill ${color}" style="width:${avg}%"></div>
        </div>
        <div class="bar-pct">${avg}%</div>
      </div>`;
  }).join('');
};

// ── Tab: Subjects ────────────────────────────
function renderSubjectsTab() {
  const SUBJECTS = ['تفسير', 'فقه', 'عقيدة', 'حديث', 'قرآن'];
  const grid = document.getElementById('subjectsList');

  const subjStats = {};
  SUBJECTS.forEach(sub => subjStats[sub] = { present: 0, absent: 0 });

  allStudents.forEach(s => {
    s.sessions.forEach(sess => {
      Object.entries(sess.subjects || {}).forEach(([subj, val]) => {
        if (subjStats[subj]) {
          if (val === 'present') subjStats[subj].present++;
          else if (val === 'absent') subjStats[subj].absent++;
        }
      });
    });
  });

  grid.innerHTML = SUBJECTS.map(sub => {
    const { present, absent } = subjStats[sub];
    const total = present + absent;
    const pct   = total ? Math.round(present / total * 100) : null;
    return `
      <div class="subj-card">
        <div class="subj-card-name">${sub}</div>
        <div class="subj-stat">
          <span class="subj-stat-label">حضور</span>
          <span class="subj-stat-val green">${present}</span>
        </div>
        <div class="subj-stat">
          <span class="subj-stat-label">غياب</span>
          <span class="subj-stat-val red">${absent}</span>
        </div>
        <div class="subj-stat">
          <span class="subj-stat-label">نسبة الحضور</span>
          <span class="subj-stat-val">${pct !== null ? pct + '%' : '—'}</span>
        </div>
      </div>`;
  }).join('');
}

// ── Tab: Ranking ─────────────────────────────
function renderRankingTab() {
  // Top attendance
  const byAtt = allStudents
    .map(s => ({ s, pct: getAttPct(s) }))
    .filter(x => x.pct !== null)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);

  document.getElementById('rankAttList').innerHTML = byAtt.length
    ? byAtt.map(({ s, pct }, i) => `
        <div class="rank-item">
          <div class="rank-num ${medalClass(i)}">${i + 1}</div>
          ${studentLink(s)}
          <div class="rank-val">${pct}%</div>
        </div>`).join('')
    : '<div class="empty-rank">لا توجد بيانات</div>';

  // Top grades
  const byGrade = allStudents
    .map(s => ({ s, avg: getGradeAvg(s) }))
    .filter(x => x.avg !== null)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  document.getElementById('rankGradeList').innerHTML = byGrade.length
    ? byGrade.map(({ s, avg }, i) => `
        <div class="rank-item">
          <div class="rank-num ${medalClass(i)}">${i + 1}</div>
          ${studentLink(s)}
          <div class="rank-val">${avg}%</div>
        </div>`).join('')
    : '<div class="empty-rank">لا توجد بيانات</div>';

  // Most absent
  const byAbsent = allStudents
    .map(s => ({ s, ...getAttCounts(s) }))
    .filter(x => x.absent > 0)
    .sort((a, b) => b.absent - a.absent)
    .slice(0, 10);

  document.getElementById('rankAbsentList').innerHTML = byAbsent.length
    ? byAbsent.map(({ s, absent }, i) => `
        <div class="rank-item">
          <div class="rank-num ${medalClass(i)}">${i + 1}</div>
          ${studentLink(s)}
          <div class="rank-val">${absent} غياب</div>
        </div>`).join('')
    : '<div class="empty-rank">لا توجد غيابات مسجلة</div>';
}

// ── Tabs Switching ────────────────────────────
window.switchTab = function (name) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    const names = ['attendance', 'grades', 'subjects', 'ranking'];
    t.classList.toggle('active', names[i] === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab_' + name);
  });
  if (name === 'grades') window.renderGradesTab();
};

// ── Start ─────────────────────────────────────
// (loadAll() بيتناthis من جوه onAuthStateChanged above بعد Validation from the صلاحية)
