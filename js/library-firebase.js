import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc,
         deleteDoc, doc, getDoc, orderBy, query, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentRole = null;
let allLibMats  = [];   // مكتبة متين (من materials collection)
let allLibExtra = {};   // الأقسام الأخرى { enrichment:[], podcast:[], courses:[] }

const isAdmin = () => currentRole === 'admin' || currentRole === 'supervisor';

// ══ أيقونات الأنواع ══
const TYPE_ICONS = { 'فيديو':'🎬','ملف PDF':'📄','مقال':'📝','حلقة صوتية':'🎙️','دورة':'🎓','أخرى':'📎' };

// ══ رسم كارد ══
function cardHTML(item, section) {
  const editBtns = isAdmin() ? `
    <div style="display:flex;gap:8px;margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">
      <button onclick="openEditLib('${item.id}','${section}')"
        style="flex:1;padding:6px;border:1px solid var(--green-dark);background:transparent;color:var(--green-dark);border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
        <i class="ti ti-pencil"></i> تعديل
      </button>
      <button onclick="openDeleteLib('${item.id}','${item.title.replace(/'/g,"\\'")}','${section}')"
        style="flex:1;padding:6px;border:1px solid #c0392b;background:transparent;color:#c0392b;border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
        <i class="ti ti-trash"></i> حذف
      </button>
    </div>` : '';

  return `
    <div class="lib-card">
      <a href="${item.url}" target="_blank" rel="noopener" style="text-decoration:none;display:block;">
        <div class="lib-card-icon">${TYPE_ICONS[item.type] || '📎'}</div>
        <div class="lib-card-body">
          <div class="lib-card-title">${item.title}</div>
          <div class="lib-card-type">${item.type || ''} ${item.course ? '· ' + item.course : ''}</div>
          ${item.notes ? `<div class="lib-card-notes">${item.notes}</div>` : ''}
        </div>
      </a>
      ${editBtns}
    </div>`;
}

// ══ رسم مكتبة متين ══
window.renderLibMats = () => {
  const grid = document.getElementById('libMatsGrid');
  if (!grid) return;
  const filter = window.currentLibFilter || 'all';
  const mats = filter === 'all' ? allLibMats : allLibMats.filter(m => m.course === filter);
  grid.innerHTML = mats.length
    ? mats.map(m => cardHTML(m, 'mateen-lib')).join('')
    : '<div class="lib-empty"><i class="ti ti-files-off" style="font-size:28px;"></i><div>لا يوجد محتوى</div></div>';

  const addBtn = document.getElementById('libAddBtn');
  if (addBtn) addBtn.style.display = isAdmin() ? 'block' : 'none';
};

// ══ رسم الأقسام الأخرى ══
function renderSection(section) {
  const gridId  = { enrichment: 'enrichmentGrid', podcast: 'podcastGrid', courses: 'coursesGrid' }[section];
  const addBtnId = { enrichment: 'enrichmentAddBtn', podcast: 'podcastAddBtn', courses: 'coursesAddBtn' }[section];
  const grid   = document.getElementById(gridId);
  const addBtn = document.getElementById(addBtnId);
  if (!grid) return;

  const items = allLibExtra[section] || [];
  grid.innerHTML = items.length
    ? items.map(m => cardHTML(m, section)).join('')
    : '<div class="lib-empty"><i class="ti ti-files-off" style="font-size:28px;"></i><div>لا يوجد محتوى بعد</div></div>';

  if (addBtn) addBtn.style.display = isAdmin() ? 'block' : 'none';
}

// ══ مستمعات Firestore ══

// 1. مكتبة متين — من materials collection
onSnapshot(query(collection(db, 'materials'), orderBy('addedAt', 'desc')), snap => {
  allLibMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window.renderLibMats();
});

// 2. الأقسام الأخرى — من libraryItems collection
onSnapshot(query(collection(db, 'libraryItems'), orderBy('addedAt', 'desc')), snap => {
  allLibExtra = { enrichment: [], podcast: [], courses: [] };
  snap.docs.forEach(d => {
    const data = { id: d.id, ...d.data() };
    if (allLibExtra[data.section] !== undefined) allLibExtra[data.section].push(data);
  });
  ['enrichment', 'podcast', 'courses'].forEach(renderSection);
});

// ══ Auth ══
onAuthStateChanged(auth, async user => {
  if (!user) { currentRole = null; }
  else {
    const snap = await getDoc(doc(db, 'users', user.uid));
    currentRole = snap.exists() ? (snap.data().role || null) : null;
  }
  window.renderLibMats();
  ['enrichment', 'podcast', 'courses'].forEach(renderSection);
});

// ══ إضافة محتوى ══
window.submitAddLib = async () => {
  const section = document.getElementById('addLibSection').value;
  const title   = document.getElementById('addLibTitle').value.trim();
  const type    = document.getElementById('addLibType').value;
  const url     = document.getElementById('addLibUrl').value.trim();
  const notes   = document.getElementById('addLibNotes').value.trim();
  const err     = document.getElementById('addLibErr');
  const btn     = document.getElementById('addLibSubmit');

  if (!title || !url) { err.style.display='block'; err.textContent='العنوان والرابط مطلوبان'; return; }
  err.style.display = 'none';
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> جاري الإضافة...';

  try {
    // مكتبة متين تتضاف في materials
    if (section === 'mateen-lib') {
      await addDoc(collection(db, 'materials'), { title, type, url, notes, course: window.currentLibFilter === 'all' ? '' : window.currentLibFilter, addedAt: Date.now() });
    } else {
      await addDoc(collection(db, 'libraryItems'), { title, type, url, notes, section, addedAt: Date.now() });
    }
    document.getElementById('addLibModal').style.display = 'none';
  } catch(e) {
    err.style.display = 'block'; err.textContent = 'خطأ: ' + e.message;
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-plus"></i> إضافة';
};

// ══ تعديل ══
const editCache = {};
window.openEditLib = async (id, section) => {
  let item = [...allLibMats, ...(allLibExtra.enrichment||[]), ...(allLibExtra.podcast||[]), ...(allLibExtra.courses||[])].find(m => m.id === id);
  if (!item) return;
  editCache.section = section;
  document.getElementById('editLibId').value    = id;
  document.getElementById('editLibTitle').value = item.title || '';
  document.getElementById('editLibType').value  = item.type  || 'أخرى';
  document.getElementById('editLibUrl').value   = item.url   || '';
  document.getElementById('editLibNotes').value = item.notes || '';
  document.getElementById('editLibErr').style.display = 'none';
  document.getElementById('editLibModal').style.display = 'flex';
};

window.submitEditLib = async () => {
  const id    = document.getElementById('editLibId').value;
  const title = document.getElementById('editLibTitle').value.trim();
  const type  = document.getElementById('editLibType').value;
  const url   = document.getElementById('editLibUrl').value.trim();
  const notes = document.getElementById('editLibNotes').value.trim();
  const err   = document.getElementById('editLibErr');
  const btn   = document.getElementById('editLibSubmit');

  if (!title || !url) { err.style.display='block'; err.textContent='العنوان والرابط مطلوبان'; return; }
  err.style.display = 'none';
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> جاري الحفظ...';

  try {
    const colName = editCache.section === 'mateen-lib' ? 'materials' : 'libraryItems';
    await updateDoc(doc(db, colName, id), { title, type, url, notes });
    document.getElementById('editLibModal').style.display = 'none';
  } catch(e) {
    err.style.display = 'block'; err.textContent = 'خطأ: ' + e.message;
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ';
};

// ══ حذف ══
const deleteCache = {};
window.openDeleteLib = (id, title, section) => {
  deleteCache.id      = id;
  deleteCache.section = section;
  document.getElementById('deleteLibId').value         = id;
  document.getElementById('deleteLibItemTitle').textContent = title;
  document.getElementById('deleteLibModal').style.display = 'flex';
};

window.executeDeleteLib = async () => {
  const id  = deleteCache.id;
  const col = deleteCache.section === 'mateen-lib' ? 'materials' : 'libraryItems';
  const btn = document.getElementById('deleteLibConfirm');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i>';
  try {
    await deleteDoc(doc(db, col, id));
    document.getElementById('deleteLibModal').style.display = 'none';
  } catch(e) { alert('خطأ في الحذف: ' + e.message); }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-trash"></i> حذف';
};
