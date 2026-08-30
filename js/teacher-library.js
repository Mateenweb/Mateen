import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { FIREBASE_CONFIG } from "./config.js";
import { uploadToCloudinary } from "./cloud-upload.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

let teacherSubject = '';
let allResources   = [];
let currentFilter  = 'all';

const RES_ICONS = { pdf: '📄', link: '🔗', note: '📝' };
const RES_LABELS = { pdf: 'PDF', link: 'رابط', note: 'ملاحظة' };

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

  teacherSubject = data.subject || user.uid;
  document.getElementById('teacherName').textContent = data.name || user.email;
  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'block';

  loadResources();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

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
  window.onResTypeChange();
};

// نوع "PDF" بيديها اختيار رفع ملف مباشر بالإضافة للرابط
window.onResTypeChange = () => {
  const type = document.getElementById('resType').value;
  const fileWrap = document.getElementById('resFileUploadWrap');
  const contentLabel = document.querySelector('#resContentFieldWrap label');
  if (type === 'pdf') {
    fileWrap.style.display = 'block';
    contentLabel.textContent = 'أو الصقي رابط الملف (اختياري لو رفعتِ ملف)';
  } else {
    fileWrap.style.display = 'none';
    contentLabel.textContent = 'الرابط أو المحتوى';
  }
};

window.handleResFileUpload = async (input) => {
  const file = input.files[0];
  if (!file) return;
  const progressWrap = document.getElementById('resFileUploadProgress');
  const progressBar  = document.getElementById('resFileProgressBar');
  const doneMsg      = document.getElementById('resFileUploadDone');
  const uploadBox    = document.getElementById('resFileUploadBox');

  progressWrap.style.display = 'block';
  doneMsg.style.display = 'none';
  uploadBox.style.display = 'none';
  progressBar.style.width = '0%';

  try {
    let pct = 0;
    const tick = setInterval(() => {
      pct = Math.min(pct + 8, 90);
      progressBar.style.width = pct + '%';
    }, 200);

    const url = await uploadToCloudinary(file);
    clearInterval(tick);
    progressBar.style.width = '100%';

    document.getElementById('resContent').value = url;
    progressWrap.style.display = 'none';
    doneMsg.style.display = 'block';
    doneMsg.textContent = '✅ تم الرفع — ' + file.name;
  } catch (e) {
    progressWrap.style.display = 'none';
    uploadBox.style.display = 'block';
    alert('فشل رفع الملف: ' + e.message);
  }
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
    const doneMsg = document.getElementById('resFileUploadDone');
    const uploadBox = document.getElementById('resFileUploadBox');
    const fileInput = document.getElementById('resContentFileInput');
    if (doneMsg)   doneMsg.style.display = 'none';
    if (uploadBox) uploadBox.style.display = 'block';
    if (fileInput) fileInput.value = '';
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
