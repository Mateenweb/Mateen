// ===========================
//  Student page — Width/Display only
// ===========================

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from './config.js';
import { effectiveRole, mountTestModeSwitcher } from './test-mode.js';

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// كود المادة (المخزّن في حساب المعلمة) → الاسم العربي (المخزّن في enrolledSubjects بتاع الطالبة)
const SUBJECT_MAP = {
  'tafseer': 'التفسير',
  'fiqh':    'الفقه',
  'aqeedah': 'العقيدة',
  'hadith':  'الحديث',
  'hadeeth': 'الحديث',
  'quran':   'مقرأة متين',
  'quran1':  'مقرأة متين',
  'quran2':  'مقرأة متين',
};

// ── Auth Guard ───────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = '../html/login.html'; return; }

  const userData = snap.data();
  const role     = effectiveRole(userData, user.email);
  const status   = userData.status || '';
  mountTestModeSwitcher(userData, user.email);

  if (status === 'pending' || status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  // الإدارة والمشرفة: يشوفوا كل الطالبات
  if (role === 'admin' || role === 'supervisor') {
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initStudentView(userData, role);
    return;
  }

  // المعلمة: تشوف طالباتها بس — التحقق يتم جوه initStudentView بعد ما يتحمّل الـ student
  if (role === 'teacher') {
    document.getElementById('authGate').style.display    = 'none';
    document.getElementById('mainContent').style.display = 'block';
    initStudentView(userData, role);
    return;
  }

  // الطالبات وأي حد تاني — ممنوع
  window.location.href = '../html/home.html';
});

function initStudentView(userData = {}, effRole = userData.role || '') {

// ── Get number from URL ───────────────────────
const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
const params     = new URLSearchParams(location.search);
const studentNum = parseInt(hashParams.get('n') || params.get('n'));
const studentDocId = params.get('id') || hashParams.get('id'); // دعم ?id= من صفحة الإدارة

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
    // فتح مباشرة بالـ document ID (من صفحة الإدارة)
    studentId = studentDocId;
    history.replaceState(null, '', location.pathname);
  } else {
    // فتح بالرقم التسلسلي (الطريقة القديمة)
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

  // المعلمة: تشوف طالباتها بس (اللي مسجلة في مادتها فعليًا)
  if (effRole === 'teacher') {
    const teacherSubjectAr = SUBJECT_MAP[userData.subject || ''] || userData.subject || '';
    const enrolled = Array.isArray(snap.data()?.enrolledSubjects) ? snap.data().enrolledSubjects : [];
    if (!snap.exists() || !enrolled.includes(teacherSubjectAr)) {
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

  // الاسم والحالة - مخفية (البيانات الشخصية لا تظهر للمشرفة)
  document.title = 'سجل الطالبة — برنامج متين';

  // Notes
  if (s.notes && s.notes.trim()) {
    document.getElementById('notesCard').style.display = 'block';
    document.getElementById('notesContent').textContent = s.notes;
  }

  renderStats(sessions, grades);
  renderSessions(sessions);
  renderGrades(grades, s, studentId, effRole);
}

function renderStats(sessions, grades) {
  const entries = [];
  [...sessions]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach(se => Object.values(se.subjects || {}).forEach(v => entries.push(v)));

  let excusedSeen = 0, present = 0, absent = 0, total = 0;
  entries.forEach(v => {
    const effective = v === 'excused' ? (++excusedSeen <= 3 ? 'excused' : 'absent') : v;
    if (effective === 'present') { present++; total++; }
    else if (effective === 'absent') { absent++; total++; }
  });

  const totalLate = sessions.reduce((acc, se) => acc + Number(se.lateMinutes || 0), 0);

  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent  = absent;
  document.getElementById('statPct').textContent = total ? Math.round(present / total * 100) + '%' : '—';
  const lateEl = document.getElementById('statLate');
  if (lateEl) lateEl.textContent = totalLate;
}

function renderSessions(sessions) {
  const list = document.getElementById('attendanceList');
  if (!sessions.length) {
    list.innerHTML = '<div class="empty-msg">لا توجد جلسات مسجلة بعد</div>';
    return;
  }
  const icon = { present: '✔', absent: '✖', excused: '⭕' };
  list.innerHTML = sessions.map(se => {
    const subjRows = Object.entries(se.subjects || {}).map(([subj, st]) =>
      `<span style="font-size:11px;margin-inline-end:8px">${subj}: ${icon[st] || st}</span>`
    ).join('');
    return `<div class="attendance-item" style="padding:8px 0;border-bottom:1px dashed var(--border,#eee)">
      <div style="font-size:12px;font-weight:700">${se.day || ''} — ${se.date || ''}</div>
      <div style="margin-top:4px">${subjRows}</div>
    </div>`;
  }).join('');
}

// نفس منطق خانة "مشاركة" الموجودة في صفحة المعلمة (طالباتي) — بتظهر للأدمن/المشرفة/معلمة المادة
// عشان يقدروا يضيفوا أو يعدّلوا درجة المشاركة لكل مادة الطالبة مسجلة فيها
async function getExistingScore(sid, gradeId) {
  try {
    const gSnap = await getDoc(doc(db, 'students', sid, 'grades', gradeId));
    return gSnap.exists() ? gSnap.data().score : '';
  } catch (e) { return ''; }
}

window.savePartGrade = async (sid, subject) => {
  const scoreInput = document.getElementById(`partScore-${sid}-${subject}`);
  if (!scoreInput) return;
  const raw = scoreInput.value.trim();
  if (raw === '') return;
  const score = Math.max(0, Math.min(10, Number(raw)));
  scoreInput.value = score;
  scoreInput.disabled = true;
  try {
    await setDoc(doc(db, 'students', sid, 'grades', 'participation_' + subject), {
      label: 'المشاركة', subject, score, total: 10,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    scoreInput.style.borderColor = '#2e8b57';
    setTimeout(() => { scoreInput.style.borderColor = ''; }, 1200);
  } catch (e) {
    console.error('savePartGrade:', e);
    alert('حصل خطأ أثناء حفظ الدرجة، حاولي تاني');
  } finally {
    scoreInput.disabled = false;
  }
};

// ── نشر درجات المشاركة على مستوى المادة كلها (زرار واحد لكل مادة، مش لكل طالبة) ──
async function getPublishState(subjectAr) {
  try {
    const snap = await getDoc(doc(db, 'subjectSettings', subjectAr));
    return snap.exists() ? !!snap.data().participationPublished : false;
  } catch (e) { return false; }
}

window.togglePublishParticipation = async (subjectAr) => {
  const checkbox = document.getElementById(`publishToggle-${subjectAr}`);
  const label    = document.getElementById(`publishLabel-${subjectAr}`);
  if (!checkbox) return;
  const newState = checkbox.checked;
  checkbox.disabled = true;
  try {
    await setDoc(doc(db, 'subjectSettings', subjectAr), {
      participationPublished: newState,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    label.textContent = newState ? 'منشورة للطالبات' : 'نشر للطالبات';
  } catch (e) {
    console.error('togglePublishParticipation:', e);
    checkbox.checked = !newState;
    alert('حصل خطأ أثناء تحديث حالة النشر، حاولي تاني');
  } finally {
    checkbox.disabled = false;
  }
};

async function renderGrades(grades, s, studentId, effRole) {
  const card = document.getElementById('gradesCard');
  card.style.display = 'block';

  // خانة المشاركة القابلة للتعديل — لكل مادة الطالبة مسجلة فيها
  const canEdit = ['admin', 'supervisor', 'teacher'].includes(effRole);
  const partWrap = document.getElementById('participationWrap');
  const enrolledSubjects = Array.isArray(s.enrolledSubjects) ? s.enrolledSubjects : [];
  const subjects = effRole === 'teacher'
    ? (() => {
        const teacherSubjectAr = SUBJECT_MAP[userData.subject || ''] || userData.subject || '';
        return enrolledSubjects.includes(teacherSubjectAr) ? [teacherSubjectAr] : [];
      })()
    : enrolledSubjects;

  if (canEdit && subjects.length) {
    const rows = await Promise.all(subjects.map(async subj => {
      const [val, published] = await Promise.all([
        getExistingScore(studentId, 'participation_' + subj),
        getPublishState(subj),
      ]);
      return `<div style="border:1px solid var(--border,#eee);border-radius:10px;padding:10px 12px;background:#fafafa">
        <label style="display:flex;align-items:center;justify-content:space-between;font-size:13px;margin-bottom:8px">
          <span>مشاركة — ${subj}</span>
          <input type="number" min="0" id="partScore-${studentId}-${subj}" value="${val}" placeholder="0"
            onchange="savePartGrade('${studentId}','${subj}')"
            style="width:70px;border:1px solid var(--border,#ccc);border-radius:6px;padding:4px 8px;text-align:center">
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;font-size:12px;color:#5c3d2e">
          <input type="checkbox" id="publishToggle-${subj}" ${published ? 'checked' : ''}
            onchange="togglePublishParticipation('${subj}')" style="width:14px;height:14px;cursor:pointer">
          <span id="publishLabel-${subj}">${published ? 'منشورة للطالبات' : 'نشر للطالبات'}</span>
        </label>
      </div>`;
    }));
    partWrap.innerHTML = rows.join('');
  } else {
    partWrap.innerHTML = '';
  }

  // باقي الدرجات (اختبارات/واجبات مسجلة) — عرض فقط
  const list = document.getElementById('gradesList');
  const otherGrades = grades.filter(g => !g.id.startsWith('participation_'));
  if (!otherGrades.length) {
    list.innerHTML = '<div class="empty-msg">لا توجد درجات اختبارات مسجلة</div>';
    return;
  }
  list.innerHTML = otherGrades.map(g => {
    const pct = g.total ? Math.round((g.score / g.total) * 100) : null;
    return `<div class="grade-item" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border,#eee)">
      <div>
        <span style="font-size:13px;font-weight:700">${g.label || 'اختبار'}</span>
        <span style="font-size:11px;color:var(--text-mid,#8a6a52);margin-inline-start:6px">${g.subject || ''}</span>
      </div>
      <div style="font-size:13px">${g.score}${g.total ? ' / ' + g.total : ''}${pct !== null ? ` (${pct}%)` : ''}</div>
    </div>`;
  }).join('');
}

loadAll();
}
