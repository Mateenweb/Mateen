
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";
import { effectiveRole, mountTestModeSwitcher } from "./test-mode.js";
import { applyCustomTheme } from "./custom-theme.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// كود المادة (من حساب المعلمة) → اسم المادة العربي (المستخدم في enrolledSubjects)
const SUBJ_LABELS = {
  quran1: 'مقرأة متين',
  quran2: 'مقرأة متين',
  hadeeth: 'الحديث',
  fiqh: 'الفقه',
  aqeedah: 'العقيدة',
  tafseer: 'التفسير',
};

// الدرجة الكلية الافتراضية لكل نوع — قابلة للتعديل من هنا لو احتجتِ أرقام تانية
const PARTICIPATION_TOTAL = 20;
const FINAL_TOTAL = 100;

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  const data = snap.exists() ? snap.data() : {};
  const role = effectiveRole(data, user.email);

  if (role !== 'teacher') { window.location.href = '../html/login.html'; return; }
  mountTestModeSwitcher(data, user.email);
  applyCustomTheme(data);

  const name    = data.name || user.email.split('@')[0];
  const subjCode = data.subject || '';
  const subjLabel = SUBJ_LABELS[subjCode] || subjCode;

  document.getElementById('navUserName').textContent = name;
  document.getElementById('heroName').textContent     = `طالبات ${subjLabel}`;
  document.getElementById('heroSubj').textContent     = `المادة: ${subjLabel}`;
  document.getElementById('authGate').style.display    = 'none';
  document.getElementById('mainContent').style.display = 'flex';

  if (!subjLabel) {
    document.getElementById('studentsList').innerHTML =
      '<div class="stu-empty"><i class="ti ti-alert-circle"></i><span>لم يتم تحديد مادة لحسابك بعد.</span></div>';
    return;
  }

  await loadStudents(subjLabel);
});

// بتجيب درجة موجودة بالفعل (لو اتسجلت قبل كده) عشان تتعرض في الخانة كقيمة مبدئية
async function getExistingScore(sid, gradeId) {
  try {
    const gSnap = await getDoc(doc(db, 'students', sid, 'grades', gradeId));
    return gSnap.exists() ? gSnap.data().score : '';
  } catch (e) {
    return '';
  }
}

async function loadStudents(subjLabel) {
  const listEl = document.getElementById('studentsList');
  listEl.innerHTML = '<div style="text-align:center;padding:30px"><i class="ti ti-loader spin" style="font-size:28px;color:var(--border)"></i></div>';

  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'mateen'),
      where('status', '==', 'active'),
      where('enrolledSubjects', 'array-contains', subjLabel)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      listEl.innerHTML = '<div class="stu-empty"><i class="ti ti-users-group"></i><span>لا توجد طالبات ملتحقات بهذه المادة بعد.</span></div>';
      return;
    }

    // كل طالبة (مادة/متين) لازم نلاقي سجلها المرتبط في مجموعة students عشان نقدر نسجل درجتها
    const withStudentDoc = await Promise.all(snap.docs.map(async d => {
      const s = d.data();
      let sid = null;
      try {
        const stuQ = query(collection(db, 'students'), where('uid', '==', d.id));
        const stuSnap = await getDocs(stuQ);
        if (!stuSnap.empty) sid = stuSnap.docs[0].id;
      } catch (e) { /* تجاهل — تعرض بدون درجات */ }
      return { uid: d.id, name: s.name || '—', email: s.email || '', sid };
    }));

    const gradeIdParticipation = 'participation_' + subjLabel;
    const gradeIdFinal = 'final_' + subjLabel;

    const rowsHtml = await Promise.all(withStudentDoc.map(async s => {
      let partVal = '', finalVal = '';
      if (s.sid) {
        [partVal, finalVal] = await Promise.all([
          getExistingScore(s.sid, gradeIdParticipation),
          getExistingScore(s.sid, gradeIdFinal),
        ]);
      }
      const gradeInputs = s.sid ? `
          <div style="display:flex;gap:10px;margin-top:8px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-mid)">
              مشاركة
              <input type="number" min="0" max="${PARTICIPATION_TOTAL}" value="${partVal}" placeholder="0"
                data-sid="${s.sid}" data-grade-id="${gradeIdParticipation}" data-subject="${subjLabel}" data-total="${PARTICIPATION_TOTAL}"
                onchange="saveTeacherGrade(this)"
                style="width:56px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px;text-align:center">
              <span style="color:var(--text-mid)">/ ${PARTICIPATION_TOTAL}</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-mid)">
              النهائي
              <input type="number" min="0" max="${FINAL_TOTAL}" value="${finalVal}" placeholder="0"
                data-sid="${s.sid}" data-grade-id="${gradeIdFinal}" data-subject="${subjLabel}" data-total="${FINAL_TOTAL}"
                onchange="saveTeacherGrade(this)"
                style="width:64px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px;text-align:center">
              <span style="color:var(--text-mid)">/ ${FINAL_TOTAL}</span>
            </label>
          </div>`
        : `<div style="margin-top:6px;font-size:11px;color:#c9852b">⚠️ الحساب مش مربوط بسجل طالبة — كلّمي الإدارة عشان تربطه أول ما ترصدي درجتها</div>`;

      return `
        <div class="stu-row" style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--white)">
          <div style="width:40px;height:40px;flex-shrink:0;border-radius:50%;background:var(--beige2);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--green-dark);font-family:'Noto Naskh Arabic',serif">
            ${(s.name || '؟')[0]}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Noto Naskh Arabic',serif;font-weight:600;color:var(--green-dark)">${s.name || '—'}</div>
            <div style="font-size:12px;color:var(--text-mid)">${s.email || ''}</div>
            ${gradeInputs}
          </div>
        </div>`;
    }));

    listEl.innerHTML = `<div style="margin-bottom:10px;font-size:13px;color:var(--text-mid)">عدد الطالبات: ${snap.size}</div>` + rowsHtml.join('');

  } catch (err) {
    console.error('loadStudents:', err);
    listEl.innerHTML = '<div class="stu-empty"><i class="ti ti-alert-triangle"></i><span>حدث خطأ أثناء تحميل القائمة.</span></div>';
  }
}

// بتتنادى لما المعلمة تكتب درجة وتخرج من الخانة — بتحفظ/تحدّث نفس الدرجة (مش تضيف درجة جديدة كل مرة)
window.saveTeacherGrade = async (input) => {
  const sid     = input.dataset.sid;
  const gradeId = input.dataset.gradeId;
  const subject = input.dataset.subject;
  const total   = Number(input.dataset.total);
  const label   = gradeId.startsWith('participation_') ? 'المشاركة' : 'الدرجة النهائية';
  const raw     = input.value.trim();

  input.disabled = true;
  try {
    if (raw === '') {
      input.disabled = false;
      return;
    }
    const score = Math.max(0, Math.min(total, Number(raw)));
    input.value = score;
    await setDoc(doc(db, 'students', sid, 'grades', gradeId), {
      label, subject, score, total,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    input.style.borderColor = '#2e8b57';
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
  } catch (e) {
    console.error('saveTeacherGrade:', e);
    alert('حصل خطأ أثناء حفظ الدرجة، حاولي تاني');
  } finally {
    input.disabled = false;
  }
};

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');
