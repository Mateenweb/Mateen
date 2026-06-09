import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

let teacherSubject = '';
let allResources   = [];
let currentFilter  = 'all';

const RES_ICONS = { pdf: '📄', link: '🔗', note: '📝' };
const RES_LABELS = { pdf: 'PDF', link: 'رابط', note: 'ملاحظة' };

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) { window.location.href = 'login.html'; return; }

  const data   = snap.data();
  const role   = data.role   || '';
  const status = data.status || '';

  if (role !== 'teacher' && role !== 'admin' && role !== 'supervisor') {
    window.location.href = 'home.html'; return;
  }
  if (status === 'pending' || status === 'suspended') {
    window.location.href = 'home.html'; return;
  }

  teacherSubject = data.subject || user.uid;
  document.getElementById('teacherName').textContent = data.name || user.email;
  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'block';

  loadResources();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = 'login.html');

async function loadResources() {
  const el = document.getElementById('resourcesList');
  try {
    const q = query(collection(db, 'teachers', teacherSubject, 'library'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allResources = [];
    snap.forEach(d => allResources.push({ id: d.id, ...d.data() }));
    renderResources();
  } catch(e) {
    el.innerHTML = '<div class="empty-state">حدث خطأ أثناء التحميل</div>';
  }
}

function renderResources() {
  const el = document.getElementById('resourcesList');
  const list = currentFilter === 'all' ? allResources : allResources.filter(r => r.type === currentFilter);

  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-books-off"></i><span>لا توجد مراجع بعد</span></div>';
    return;
  }

  el.innerHTML = list.map(r => `
    <div class="res-row">
      <div class="res-icon">${RES_ICONS[r.type] || '📄'}</div>
      <div style="flex:1">
        <div class="res-title">${r.title || '—'}</div>
        <div class="res-type">${RES_LABELS[r.type] || r.type}</div>
        ${r.content ? `<div class="res-link">${r.type === 'link' ? `<a href="${r.content}" target="_blank">${r.content}</a>` : r.content}</div>` : ''}
      </div>
      <button class="res-del-btn" onclick="deleteResource('${r.id}')"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');
}

window.filterRes = (btn, type) => {
  document.querySelectorAll('.lib-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = type;
  renderResources();
};

window.showAddResource = () => {
  document.getElementById('addResourceForm').style.display = 'block';
};

window.saveResource = async () => {
  const title   = document.getElementById('resTitle').value.trim();
  const type    = document.getElementById('resType').value;
  const content = document.getElementById('resContent').value.trim();

  if (!title) { alert('يرجى إدخال العنوان'); return; }

  try {
    await addDoc(collection(db, 'teachers', teacherSubject, 'library'), {
      title, type, content, createdAt: serverTimestamp()
    });
    document.getElementById('addResourceForm').style.display = 'none';
    document.getElementById('resTitle').value   = '';
    document.getElementById('resContent').value = '';
    loadResources();
  } catch(e) {
    alert('حدث خطأ أثناء الحفظ');
  }
};

window.deleteResource = async id => {
  if (!confirm('حذف هذا المرجع؟')) return;
  await deleteDoc(doc(db, 'teachers', teacherSubject, 'library', id));
  loadResources();
};
