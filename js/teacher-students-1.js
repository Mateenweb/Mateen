
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
  ithraiyat: 'الإثرائيات',
};

// الدرجة الكلية الافتراضية لكل نوع — قابلة للتعديل من هنا لو احتجتِ أرقام تانية
const PARTICIPATION_TOTAL = 20;

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

// بتطبّع الاسم الكامل عشان تقدر تقارن أسماء بينها اختلافات بسيطة (مسافات/همزات/تاء مربوطة)
function normalizeStuName(name) {
  return (name || '')
    .replace(/[أإآا]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[يى]/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// بتجيب درجة موجودة بالفعل (لو اتسجلت قبل كده) عشان تتعرض في الخانة كقيمة مبدئية
async function getExistingGrade(sid, gradeId) {
  try {
    const gSnap = await getDoc(doc(db, 'students', sid, 'grades', gradeId));
    return gSnap.exists() ? { score: gSnap.data().score, total: gSnap.data().total } : { score: '', total: '' };
  } catch (e) {
    return { score: '', total: '' };
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
    // الأولوية: ربط uid الرسمي (لو موجود) — وإلا مطابقة بالاسم تلقائيًا كبديل
    const allStudentsSnap = await getDocs(collection(db, 'students'));
    const byUid = new Map();
    const byName = new Map();
    allStudentsSnap.docs.forEach(sd => {
      const sData = sd.data();
      if (sData.archived) return;
      if (sData.uid) byUid.set(sData.uid, sd.id);
      const norm = normalizeStuName(sData.name || '');
      if (norm && !byName.has(norm)) byName.set(norm, sd.id);
    });

    const withStudentDoc = await Promise.all(snap.docs.map(async d => {
      const s = d.data();
      let sid = byUid.get(d.id) || byName.get(normalizeStuName(s.name || '')) || null;
      let archived = false;
      if (sid) {
        try {
          const sDoc = await getDoc(doc(db, 'students', sid));
          archived = sDoc.exists() ? !!sDoc.data().archived : false;
        } catch (e) { /* تجاهل — تعرض بدون درجات */ }
      }
      return { uid: d.id, name: s.name || '—', email: s.email || '', sid, archived };
    }));

    // استبعاد الطالبات المؤرشفات — الأرشفة بتتم في مجموعة students، مش users،
    // فمينفعش نستبعدهم من نفس استعلام Firestore الأول، لازم فلترة إضافية هنا
    const activeStudents = withStudentDoc.filter(s => !s.archived);

    if (!activeStudents.length) {
      listEl.innerHTML = '<div class="stu-empty"><i class="ti ti-users-group"></i><span>لا توجد طالبات ملتحقات بهذه المادة بعد.</span></div>';
      return;
    }

    const gradeIdParticipation = 'participation_' + subjLabel;

    const rowsHtml = await Promise.all(activeStudents.map(async s => {
      let existing = { score: '', total: '' };
      if (s.sid) {
        existing = await getExistingGrade(s.sid, gradeIdParticipation);
      }
      const gradeInputs = s.sid ? `
          <div style="display:flex;gap:10px;margin-top:8px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-mid)">
              مشاركة
              <input type="number" min="0" id="partScore-${s.sid}-${subjLabel}" value="${existing.score}" placeholder="الدرجة"
                onchange="savePartGrade('${s.sid}','${subjLabel}')"
                style="width:56px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px;text-align:center">
              <span style="color:var(--text-mid)">من</span>
              <input type="number" min="1" id="partTotal-${s.sid}-${subjLabel}" value="${existing.total}" placeholder="${PARTICIPATION_TOTAL}"
                onchange="savePartGrade('${s.sid}','${subjLabel}')"
                style="width:56px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px;text-align:center">
            </label>
          </div>`
        : `<div style="margin-top:6px;font-size:11px;color:#c9852b">⚠️ مقدرناش نلاقي سجل طالبة بنفس الاسم بالظبط في قايمة الإدارة — تأكدي إن الاسم مطابق تمامًا، أو كلّمي الإدارة تربطه يدويًا</div>`;

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

// بتتنادى لما المعلمة تكتب درجة المشاركة أو "من كام" وتخرج من الخانة — بتحفظ/تحدّث نفس الدرجة (مش تضيف درجة جديدة كل مرة)
window.savePartGrade = async (sid, subject) => {
  const scoreInput = document.getElementById(`partScore-${sid}-${subject}`);
  const totalInput = document.getElementById(`partTotal-${sid}-${subject}`);
  if (!scoreInput || !totalInput) return;

  const rawScore = scoreInput.value.trim();
  const rawTotal = totalInput.value.trim();
  if (rawScore === '' || rawTotal === '') return; // لسه محتاجة القيمتين مع بعض

  const total = Math.max(1, Number(rawTotal));
  const score = Math.max(0, Math.min(total, Number(rawScore)));
  scoreInput.value = score;
  totalInput.value = total;

  scoreInput.disabled = true; totalInput.disabled = true;
  try {
    const ref = doc(db, 'students', sid, 'grades', 'participation_' + subject);
    // لازم نتأكد إن createdAt متسجل (ولو أول مرة بس) — من غيره الدرجة
    // بتتستبعد تلقائيًا من استعلام orderBy('createdAt') في صفحة الطالبة
    // فتفضل درجة المشاركة مش ظاهرة ليها خالص
    const existing = await getDoc(ref);
    const payload = { label: 'المشاركة', subject, score, total, updatedAt: serverTimestamp() };
    if (!existing.exists() || !existing.data().createdAt) {
      payload.createdAt = serverTimestamp();
    }
    await setDoc(ref, payload, { merge: true });
    [scoreInput, totalInput].forEach(el => {
      el.style.borderColor = '#2e8b57';
      setTimeout(() => { el.style.borderColor = ''; }, 1200);
    });
  } catch (e) {
    console.error('savePartGrade:', e);
    alert('حصل خطأ أثناء حفظ الدرجة، حاولي تاني');
  } finally {
    scoreInput.disabled = false; totalInput.disabled = false;
  }
};

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');
