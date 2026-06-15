import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

const SUBJECT_LABELS = {
  aqeedah: 'العقيدة', fiqh: 'الفقه', hadeeth: 'الحديث',
  tafseer: 'التفسير', quran1: 'القرآن (١)', quran2: 'القرآن (٢)',
};
const ROLE_AVATARS = { student: '👧', mateen: '🌸', teacher: '👩‍🏫', supervisor: '👩‍💼', admin: '🛡️' };

let allMateenStudents = [];

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = '../html/login.html'; return; }

  const data   = snap.data();
  const role   = data.role   || '';
  const status = data.status || '';

  if (role !== 'teacher' && role !== 'admin' && role !== 'supervisor') {
    window.location.href = '../html/home.html'; return;
  }
  if (status === 'pending' || status === 'suspended') {
    window.location.href = '../html/home.html'; return;
  }

  // Fill info
  const subjectAr = SUBJECT_LABELS[data.subject] || data.subject || '—';
  document.getElementById('teacherName').textContent  = data.name  || user.email;
  document.getElementById('teacherSubj').textContent  = subjectAr;
  document.getElementById('infoName').textContent     = data.name  || '—';
  document.getElementById('infoEmail').textContent    = user.email || '—';
  document.getElementById('infoPhone').textContent    = data.phone || '—';
  document.getElementById('infoSubject').textContent  = subjectAr;

  // My page link
  if (data.subject) {
    document.getElementById('myPageLink').href = `teacher-${data.subject}.html`;
  }

  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'block';

  loadMateenStudents();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

// ── Load mateen students ──────────────────────
async function loadMateenStudents() {
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'mateen'));
    const snap = await getDocs(q);
    allMateenStudents = [];
    snap.forEach(d => allMateenStudents.push({ id: d.id, ...d.data() }));
    allMateenStudents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    document.getElementById('mateenCount').textContent = allMateenStudents.length;
    renderMateenList(allMateenStudents);
  } catch(e) {
    document.getElementById('mateenList').innerHTML = '<div class="empty-state">حدث خطأ أثناء التحميل</div>';
  }
}

function renderMateenList(list) {
  const el = document.getElementById('mateenList');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-users-off"></i><span>لا توجد طالبات مسجلات بعد</span></div>';
    return;
  }
  el.innerHTML = list.map(u => `
    <div class="mateen-row">
      <div class="mateen-avatar">🌸</div>
      <div>
        <div class="mateen-name">${u.name || '—'}</div>
        <div class="mateen-email">${u.email || '—'}</div>
      </div>
      <span class="mateen-status ${u.status === 'active' ? 'active' : ''}">${u.status === 'active' ? 'مفعّلة' : 'معلقة'}</span>
    </div>
  `).join('');
}

window.filterMateenStudents = () => {
  const q = document.getElementById('mateenSearch').value.trim().toLowerCase();
  renderMateenList(q ? allMateenStudents.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').includes(q)) : allMateenStudents);
};
