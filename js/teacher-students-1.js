
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// كود المادة (من حساب المعلمة) → اسم المادة العربي (المستخدم في enrolledSubjects)
const SUBJ_LABELS = {
  quran1: 'القرآن الكريم',
  quran2: 'القرآن الكريم',
  hadeeth: 'الحديث',
  fiqh: 'الفقه',
  aqeedah: 'العقيدة',
  tafseer: 'التفسير',
};

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  const data = snap.exists() ? snap.data() : {};

  if (data.role !== 'teacher') { window.location.href = '../html/login.html'; return; }

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

    const rows = snap.docs.map(d => {
      const s = d.data();
      return `
        <div class="stu-row" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--white)">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--beige2);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--green-dark);font-family:'Noto Naskh Arabic',serif">
            ${(s.name || '؟')[0]}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Noto Naskh Arabic',serif;font-weight:600;color:var(--green-dark)">${s.name || '—'}</div>
            <div style="font-size:12px;color:var(--text-mid)">${s.email || ''}</div>
          </div>
        </div>`;
    }).join('');

    listEl.innerHTML = `<div style="margin-bottom:10px;font-size:13px;color:var(--text-mid)">عدد الطالبات: ${snap.size}</div>` + rows;

  } catch (err) {
    console.error('loadStudents:', err);
    listEl.innerHTML = '<div class="stu-empty"><i class="ti ti-alert-triangle"></i><span>حدث خطأ أثناء تحميل القائمة.</span></div>';
  }
}

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');
