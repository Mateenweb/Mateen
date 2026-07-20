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
import { loadSubjects } from './subjects.js';
import { exportAttendanceExcel, exportAttendanceWord, exportAttendancePdf, exportGenericExcel, exportGenericWord, exportGenericPdf } from './export.js';

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
  const rawDocs = studSnap.docs
    .map(d => ({ id: d.id, ...d.data(), sessions: [], grades: [] }))
    .filter(s => !s.archived); // استبعاد المؤرشفات من الإحصائيات

  // Load sessions + grades for all students in parallel
  await Promise.all(rawDocs.map(async s => {
    const [sessSnap, gradeSnap] = await Promise.all([
      getDocs(collection(db, 'students', s.id, 'sessions')),
      getDocs(collection(db, 'students', s.id, 'grades'))
    ]);
    s.sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    s.grades   = gradeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }));

  // دمج أي مستندات مكررة مرتبطة بنفس الحساب (uid) عشان نفس الطالبة ماتتحسبش
  // مرتين، ولا تضيع حضور/درجات مسجلة على النسخة التانية من مستندها
  const byIdentity = new Map();
  rawDocs.forEach(s => {
    const key = s.uid || s.id;
    if (!byIdentity.has(key)) {
      byIdentity.set(key, s);
    } else {
      const existing = byIdentity.get(key);
      existing.sessions.push(...s.sessions);
      existing.grades.push(...s.grades);
    }
  });
  const students = [...byIdentity.values()];

  allStudents = students;
  document.getElementById('loadingMsg').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';

  // ملء فلتر مادة الدرجات من نفس مصدر المواد الحقيقي — كل المواد بدون فلترة inExams،
  // عشان يتطابق مع مودال "إضافة اختبار" في لوحة الأدمن اللي بياخد كل المواد بدون قيد
  loadSubjects().then(subjects => {
    const sel = document.getElementById('gradeSubjectFilter');
    if (sel && subjects.length) {
      sel.innerHTML = '<option value="">كل المواد</option>' +
        subjects.map(s => `<option>${s}</option>`).join('');
    }
  }).catch(e => console.error('loadSubjects:', e));

  renderAll();
}

// ── Render All ───────────────────────────────
function renderAll() {
  window.renderSummary();
  renderAttTab();
  renderGradesTab();
  renderSubjectsTab();
  renderRankingTab();
}

// ── Summary Cards ────────────────────────────
window.renderSummary = function renderSummary() {
  const totalSessions = allStudents.reduce((s, st) => s + st.sessions.length, 0);

  // avg attendance
  const attPcts = allStudents.map(getAttPct).filter(v => v !== null);
  const avgAtt  = attPcts.length ? Math.round(attPcts.reduce((a,b) => a+b, 0) / attPcts.length) : null;

  // avg grades — بتحترم فلتر المادة (لو محددة) زي تبويب الدرجات بالظبط
  const subjectFilter = document.getElementById('gradeSubjectFilter')?.value || '';
  const gradePcts = allStudents.map(s => getGradeAvg(s, subjectFilter)).filter(v => v !== null);
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
  let present = 0, absent = 0, excused = 0;
  s.sessions.forEach(sess => {
    Object.values(sess.subjects || {}).forEach(v => {
      if (v === 'present') present++;
      else if (v === 'absent') absent++;
      else if (v === 'excused') excused++;
    });
  });
  return { present, absent, excused };
}

// مطابقة مرنة لاسم المادة — بتتجاهل بادئة "ال" واختلافات الألف/التاء المربوطة/الياء
// عشان درجات قديمة اتسجلت بأسماء مختلفة شوية (زي "تفسير" بدل "التفسير") تفضل تظهر صح في الفلتر
function normalizeSubjectName(s) {
  return (s || '')
    .trim()
    .replace(/^ال/, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/ى/g, 'ي');
}

function getGradeAvg(s, subjectFilter = '') {
  const filterNorm = normalizeSubjectName(subjectFilter);
  const grades = subjectFilter
    ? s.grades.filter(g => normalizeSubjectName(g.subject) === filterNorm)
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
    .map(s => ({ s, pct: getAttPct(s), excused: getAttCounts(s).excused }))
    .filter(x => x.pct !== null)
    .sort((a, b) => b.pct - a.pct);

  if (!data.length) {
    list.innerHTML = '<div class="empty-bar">لا توجد بيانات حضور بعد</div>';
    return;
  }

  list.innerHTML = data.map(({ s, pct, excused }) => {
    const color = pct >= 75 ? 'green' : pct >= 50 ? 'blue' : 'red';
    return `
      <div class="bar-item">
        ${barNameLink(s)}
        ${excused > 0 ? `<span title="${excused} اعتذار" style="font-size:11px;color:#c9852b;margin-inline-end:6px">🔸 ${excused}</span>` : ''}
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
  const SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];
  const grid = document.getElementById('subjectsList');

  const subjStats = {};
  SUBJECTS.forEach(sub => subjStats[normalizeSubjectName(sub)] = { present: 0, absent: 0 });

  allStudents.forEach(s => {
    s.sessions.forEach(sess => {
      Object.entries(sess.subjects || {}).forEach(([subj, val]) => {
        const key = subjStats[normalizeSubjectName(subj)] ? normalizeSubjectName(subj) : null;
        if (key) {
          if (val === 'present') subjStats[key].present++;
          else if (val === 'absent') subjStats[key].absent++;
        }
      });
    });
  });

  grid.innerHTML = SUBJECTS.map(sub => {
    const { present, absent } = subjStats[normalizeSubjectName(sub)];
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
    .map(s => ({ s, pct: getAttPct(s), excused: getAttCounts(s).excused }))
    .filter(x => x.pct !== null)
    // الترتيب الأساسي بالنسبة، وعند التعادل اللي عندها اعتذار أقل تتقدّم
    .sort((a, b) => b.pct - a.pct || a.excused - b.excused);
  // (من غير حد أقصى — كل الطالبات، مش أفضل 10 بس)

  document.getElementById('rankAttList').innerHTML = byAtt.length
    ? byAtt.map(({ s, pct, excused }, i) => `
        <div class="rank-item">
          <div class="rank-num ${medalClass(i)}">${i + 1}</div>
          ${studentLink(s)}
          ${excused > 0 ? `<span title="${excused} اعتذار" style="font-size:11px;color:#c9852b;margin-inline-end:6px">🔸 ${excused} اعتذار</span>` : ''}
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

// ── تصدير بيانات الحضور المعروضة في الصفحة (Excel / Word / PDF) ──
window.toggleStatsExportMenu = function () {
  const menu = document.getElementById('statsExportMenu');
  const btn  = document.getElementById('statsExportBtn');
  if (!menu || !btn) return;
  const willOpen = menu.style.display === 'none' || !menu.style.display;
  if (willOpen) {
    // position:fixed محسوبة من موضع الزرار الفعلي، عشان القايمة متتقطعش
    // بسبب overflow:hidden على هيدر الصفحة (اللي لازم يفضل موجود عشان الزخرفة)
    const r = btn.getBoundingClientRect();
    menu.style.top  = (r.bottom + 6) + 'px';
    menu.style.left = Math.max(8, r.left) + 'px';
    // إقفال أي submenu مفتوحة من قبل
    document.querySelectorAll('.stats-export-sub').forEach(s => s.style.display = 'none');
  }
  menu.style.display = willOpen ? 'block' : 'none';
};

window.toggleStatsExportSub = function (key, ev) {
  ev.stopPropagation();
  document.querySelectorAll('.stats-export-sub').forEach(s => {
    if (s.id !== 'sub_' + key) s.style.display = 'none';
  });
  const sub = document.getElementById('sub_' + key);
  if (sub) sub.style.display = sub.style.display === 'block' ? 'none' : 'block';
};

document.addEventListener('click', (e) => {
  const menu = document.getElementById('statsExportMenu');
  const btn  = document.getElementById('statsExportBtn');
  if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
    document.querySelectorAll('.stats-export-sub').forEach(s => s.style.display = 'none');
  }
});

// ── الحضور التفصيلي (زي ما كان) ──
window.statsExport = async function (type) {
  document.getElementById('statsExportMenu').style.display = 'none';
  if (!allStudents.length) { alert('لا توجد بيانات للتصدير بعد'); return; }
  if (type === 'excel') await exportAttendanceExcel(allStudents);
  else if (type === 'word') await exportAttendanceWord(allStudents);
  else if (type === 'pdf') await exportAttendancePdf(allStudents);
};

// ── الدرجات ──
function buildGradesRows() {
  return allStudents
    .map(s => ({ name: s.name || '—', avg: getGradeAvg(s, '') }))
    .filter(x => x.avg !== null)
    .sort((a, b) => b.avg - a.avg)
    .map((x, i) => [i + 1, x.name, x.avg + '%']);
}
window.statsExportGrades = async function (format) {
  document.getElementById('statsExportMenu').style.display = 'none';
  const rows = buildGradesRows();
  const headers = ['#', 'الطالبة', 'المتوسط'];
  if (!rows.length) { alert('لا توجد درجات للتصدير بعد'); return; }
  if (format === 'excel') await exportGenericExcel('الدرجات', 'الدرجات', headers, rows);
  else if (format === 'word') await exportGenericWord('الدرجات', 'ترتيب الدرجات', headers, rows);
  else if (format === 'pdf') await exportGenericPdf('الدرجات', 'ترتيب الدرجات', headers, rows);
};

// ── الأعلى حضورًا ──
function buildTopAttendanceRows() {
  return allStudents
    .map(s => ({ name: s.name || '—', pct: getAttPct(s), excused: getAttCounts(s).excused }))
    .filter(x => x.pct !== null)
    .sort((a, b) => b.pct - a.pct || a.excused - b.excused)
    .map((x, i) => [i + 1, x.name, x.pct + '%']);
}
window.statsExportTopAttendance = async function (format) {
  document.getElementById('statsExportMenu').style.display = 'none';
  const rows = buildTopAttendanceRows();
  const headers = ['#', 'الطالبة', 'نسبة الحضور'];
  if (!rows.length) { alert('لا توجد بيانات حضور للتصدير بعد'); return; }
  if (format === 'excel') await exportGenericExcel('الأعلى_حضورا', 'الأعلى حضورًا', headers, rows);
  else if (format === 'word') await exportGenericWord('الأعلى_حضورا', 'ترتيب الأعلى حضورًا', headers, rows);
  else if (format === 'pdf') await exportGenericPdf('الأعلى_حضورا', 'ترتيب الأعلى حضورًا', headers, rows);
};

// ── الأكثر غيابًا ──
function buildMostAbsentRows() {
  return allStudents
    .map(s => ({ name: s.name || '—', absent: getAttCounts(s).absent }))
    .filter(x => x.absent > 0)
    .sort((a, b) => b.absent - a.absent)
    .map((x, i) => [i + 1, x.name, x.absent]);
}
window.statsExportMostAbsent = async function (format) {
  document.getElementById('statsExportMenu').style.display = 'none';
  const rows = buildMostAbsentRows();
  const headers = ['#', 'الطالبة', 'عدد أيام الغياب'];
  if (!rows.length) { alert('لا توجد غيابات مسجلة للتصدير'); return; }
  if (format === 'excel') await exportGenericExcel('الأكثر_غيابا', 'الأكثر غيابًا', headers, rows);
  else if (format === 'word') await exportGenericWord('الأكثر_غيابا', 'ترتيب الأكثر غيابًا', headers, rows);
  else if (format === 'pdf') await exportGenericPdf('الأكثر_غيابا', 'ترتيب الأكثر غيابًا', headers, rows);
};

// ── إحصائيات المواد ──
function buildSubjectsRows() {
  const SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];
  const subjStats = {};
  SUBJECTS.forEach(sub => subjStats[normalizeSubjectName(sub)] = { present: 0, absent: 0 });
  allStudents.forEach(s => {
    s.sessions.forEach(sess => {
      Object.entries(sess.subjects || {}).forEach(([subj, val]) => {
        const key = subjStats[normalizeSubjectName(subj)] ? normalizeSubjectName(subj) : null;
        if (key) {
          if (val === 'present') subjStats[key].present++;
          else if (val === 'absent') subjStats[key].absent++;
        }
      });
    });
  });
  return SUBJECTS.map(sub => {
    const { present, absent } = subjStats[normalizeSubjectName(sub)];
    const total = present + absent;
    const pct = total ? Math.round(present / total * 100) : null;
    return [sub, present, absent, pct !== null ? pct + '%' : '—'];
  });
}
window.statsExportSubjects = async function (format) {
  document.getElementById('statsExportMenu').style.display = 'none';
  const rows = buildSubjectsRows();
  const headers = ['المادة', 'حضور', 'غياب', 'نسبة الحضور'];
  if (format === 'excel') await exportGenericExcel('إحصائيات_المواد', 'المواد', headers, rows);
  else if (format === 'word') await exportGenericWord('إحصائيات_المواد', 'إحصائيات المواد', headers, rows);
  else if (format === 'pdf') await exportGenericPdf('إحصائيات_المواد', 'إحصائيات المواد', headers, rows);
};
