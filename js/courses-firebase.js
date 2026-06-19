import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, getDoc, doc, updateDoc, deleteDoc, arrayUnion }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let allMats = [];
let currentUserRole = null;
let currentUserSubjects = [];
const MAIN_SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'القرآن الكريم'];

const TYPE_ICONS = {
  محاضرة: '🎙️', ملخص: '📄', واجب: '📝', اختبار: '✅',
  مرجع: '📚', فيديو: '🎬', أخرى: '📎'
};

function detectLinkType(url) {
  if (!url) return 'default';
  if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('drive.google')) return 'drive';
  if (url.includes('dropbox')) return 'dropbox';
  return 'default';
}

const LINK_LABELS = { youtube: '▶️ يوتيوب', drive: '📁 درايف', dropbox: '☁️ دروبوكس', default: '🔗 فتح الرابط' };

const isAdmin = () => currentUserRole === 'admin' || currentUserRole === 'supervisor';

function matCardHTML(m) {
  const adminBtns = isAdmin() ? `
    <div style="display:flex;gap:8px;margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">
      <button onclick="event.preventDefault();event.stopPropagation();openEditModal('${m.id}')"
        style="flex:1;padding:6px;border:1px solid var(--green-dark);background:transparent;color:var(--green-dark);border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
        <i class="ti ti-pencil"></i> تعديل
      </button>
      <button onclick="event.preventDefault();event.stopPropagation();confirmDeleteMat('${m.id}','${m.title.replace(/'/g,"\\'")}' )"
        style="flex:1;padding:6px;border:1px solid #c0392b;background:transparent;color:#c0392b;border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
        <i class="ti ti-trash"></i> حذف
      </button>
    </div>` : '';

  return `
    <div style="text-decoration:none;">
      <div class="mat-card-item">
        <a href="${m.url}" target="_blank" rel="noopener" style="text-decoration:none;display:block;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <span style="font-size:20px">${TYPE_ICONS[m.type] || '📎'}</span>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--green-dark)">${m.title}</div>
              <div style="font-size:11px;color:var(--text-mid);margin-top:2px">${m.type || ''}</div>
            </div>
          </div>
          ${m.notes ? `<div style="font-size:12px;color:var(--text-mid);background:var(--beige);padding:7px 10px;border-radius:8px;margin-bottom:8px">${m.notes}</div>` : ''}
          <div style="font-size:12px;color:var(--gold-dark)">${LINK_LABELS[detectLinkType(m.url)]}</div>
        </a>
        ${adminBtns}
      </div>
    </div>`;
}

function renderMats(mats) {
  const container = document.getElementById('matsContainer');
  const section   = document.getElementById('dynamicMatsSection');
  if (!container) return;

  if (mats.length === 0) {
    if (isAdmin()) {
      section.style.display = 'block';
      container.innerHTML = `<div style="text-align:center;color:var(--text-mid);padding:40px;grid-column:1/-1;">
        <i class="ti ti-files-off" style="font-size:28px;"></i>
        <div style="margin-top:8px">لا توجد مواد مضافة بعد</div>
      </div>`;
    } else {
      section.style.display = 'none';
    }
  } else {
    section.style.display = 'block';
    container.innerHTML = mats.map(matCardHTML).join('');
  }
}

function renderModalMats() {
  const modalMap = {
    'التفسير': 'tafseer', 'الفقه': 'fiqh', 'العقيدة': 'aqeedah',
    'الحديث': 'hadith', 'القرآن الكريم': 'quran'
  };
  Object.entries(modalMap).forEach(([subj, modalId]) => {
    const el = document.getElementById('modal-mats-' + modalId);
    if (!el) return;
    const subjMats = allMats.filter(m => m.course === subj);

    const addBtnHTML = isAdmin() ? `
      <button onclick="document.getElementById('newCourseCat').value='${subj}';document.getElementById('addCourseModal').style.display='flex'"
        style="display:flex;align-items:center;gap:6px;background:var(--green-dark);color:white;border:none;padding:8px 14px;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer;margin-bottom:10px;margin-top:12px;">
        <i class="ti ti-plus"></i> إضافة مادة لـ${subj}
      </button>` : '';

    if (subjMats.length === 0) {
      el.innerHTML = addBtnHTML;
      return;
    }
    el.innerHTML = `
      <div style="margin:14px 0 6px;">
        <div style="font-size:13px;font-weight:700;color:var(--green-dark);margin-bottom:8px;">
          <i class="ti ti-files" style="margin-left:4px;"></i> المواد المضافة (${subjMats.length})
        </div>
        ${addBtnHTML}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${subjMats.map(matCardHTML).join('')}
      </div>`;
  });
}

window.filterMats = () => {
  const val = document.getElementById('filterCourse').value;
  let mats = allMats;

  if (currentUserRole === 'student') {
    mats = mats.filter(m => currentUserSubjects.includes(m.course));
  }

  renderMats(val ? mats.filter(m => m.course === val) : mats);
};

// ===== تعديل المادة =====
window.openEditModal = (id) => {
  const m = allMats.find(x => x.id === id);
  if (!m) return;

  document.getElementById('editMatId').value    = id;
  document.getElementById('editCourseTitle').value = m.title;
  document.getElementById('editCourseCat').value   = m.course;
  document.getElementById('editCourseType').value  = m.type || 'محاضرة';
  document.getElementById('editCourseUrl').value   = m.url;
  document.getElementById('editCourseNotes').value = m.notes || '';
  document.getElementById('editCourseErr').style.display = 'none';
  document.getElementById('editCourseModal').style.display = 'flex';
};

window.submitEditCourse = async () => {
  const id    = document.getElementById('editMatId').value;
  const title = document.getElementById('editCourseTitle').value.trim();
  const course= document.getElementById('editCourseCat').value;
  const type  = document.getElementById('editCourseType').value;
  const url   = document.getElementById('editCourseUrl').value.trim();
  const notes = document.getElementById('editCourseNotes').value.trim();
  const err   = document.getElementById('editCourseErr');

  if (!title || !course || !url) {
    err.style.display = 'block';
    err.textContent = 'يرجى تعبئة الحقول المطلوبة (الاسم، المادة، الرابط)';
    return;
  }
  err.style.display = 'none';

  const btn = document.getElementById('editCourseSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> جاري الحفظ...';

  try {
    await updateDoc(doc(db, 'materials', id), { title, course, type, url, notes });
    document.getElementById('editCourseModal').style.display = 'none';
  } catch(e) {
    err.style.display = 'block';
    err.textContent = 'حدث خطأ، حاولي مرة أخرى';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ التعديلات';
};

// ===== حذف المادة =====
window.confirmDeleteMat = (id, title) => {
  document.getElementById('deleteMatId').value = id;
  document.getElementById('deleteMatTitle').textContent = title;
  document.getElementById('deleteConfirmModal').style.display = 'flex';
};

window.executeDeleteMat = async () => {
  const id  = document.getElementById('deleteMatId').value;
  const btn = document.getElementById('deleteConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> جاري الحذف...';

  try {
    await deleteDoc(doc(db, 'materials', id));
    document.getElementById('deleteConfirmModal').style.display = 'none';
  } catch(e) {
    alert('حدث خطأ أثناء الحذف، حاولي مرة أخرى');
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-trash"></i> تأكيد الحذف';
};

// تحديد دور المستخدمة
onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUserRole = null;
    currentUserSubjects = [];
    window.filterMats();
    renderModalMats();
    return;
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const data = snap.exists() ? snap.data() : {};
  const role = data.role || '';
  currentUserRole = role;
  currentUserSubjects = Array.isArray(data.enrolledSubjects) ? data.enrolledSubjects : [];

  if (isAdmin()) {
    const btn = document.getElementById('adminAddBtn');
    if (btn) btn.style.display = 'flex';
  }

  updateEnrollButtons();
  window.filterMats();
  renderModalMats();
});

const SUBJ_MODAL_IDS = {
  'التفسير': 'tafseer', 'الفقه': 'fiqh', 'العقيدة': 'aqeedah',
  'الحديث': 'hadith', 'القرآن الكريم': 'quran'
};

function updateEnrollButtons() {
  MAIN_SUBJECTS.forEach(subj => {
    const modalId = SUBJ_MODAL_IDS[subj];
    const btn = document.getElementById('enrollBtn-' + modalId);
    if (!btn) return;

    const joined = currentUserSubjects.includes(subj);

    if (!auth.currentUser) {
      btn.textContent = 'سجّلي / اشتركي للالتحاق بالمادة';
      btn.disabled = false;
      btn.onclick = () => location.href = 'login.html';
    } else if (currentUserRole === 'mateen') {
      btn.textContent = joined ? '✓ ملتحقة بالفعل' : 'بانتظار قبول حسابك';
      btn.disabled = true;
    } else if (joined) {
      btn.textContent = '✓ ملتحقة بهذه المادة';
      btn.disabled = true;
    } else {
      btn.textContent = 'التسجيل في المادة';
      btn.disabled = false;
      btn.onclick = () => joinSubject(subj);
    }
  });
}

window.joinSubject = async (subj) => {
  if (!auth.currentUser) { location.href = 'login.html'; return; }
  await updateDoc(doc(db, 'users', auth.currentUser.uid), {
    enrolledSubjects: arrayUnion(subj)
  });
  if (!currentUserSubjects.includes(subj)) currentUserSubjects.push(subj);
  updateEnrollButtons();
  window.filterMats();
};

window.submitNewCourse = async () => {
  const title = document.getElementById('newCourseTitle').value.trim();
  const course = document.getElementById('newCourseCat').value;
  const type  = document.getElementById('newCourseType').value;
  const url   = document.getElementById('newCourseUrl').value.trim();
  const notes = document.getElementById('newCourseNotes').value.trim();
  const err   = document.getElementById('addCourseErr');

  if (!title || !course || !url) {
    err.style.display = 'block';
    err.textContent = 'يرجى تعبئة الحقول المطلوبة (الاسم، المادة، الرابط)';
    return;
  }
  err.style.display = 'none';

  const btn = document.getElementById('addCourseSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> جاري الإضافة...';

  try {
    await addDoc(collection(db, 'materials'), {
      title, course, type, url, notes,
      addedAt: Date.now(),
      addedBy: auth.currentUser.email,
    });
    ['newCourseTitle','newCourseCat','newCourseUrl','newCourseNotes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('addCourseModal').style.display = 'none';
  } catch(e) {
    err.style.display = 'block';
    err.textContent = 'حدث خطأ، حاولي مرة أخرى';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-circle-plus"></i> إضافة المادة';
};

onSnapshot(query(collection(db, 'materials'), orderBy('addedAt', 'desc')), snap => {
  allMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window.filterMats();
  renderModalMats();
});
