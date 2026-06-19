import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, getDoc, doc, updateDoc, arrayUnion }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let allMats = [];
let currentUserRole = null;        // null = زائر
let currentUserSubjects = [];      // المواد اللي الطالبة العادية ملتحقة بيها
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

function matCardHTML(m) {
  return `
    <a href="${m.url}" target="_blank" rel="noopener" style="text-decoration:none;">
      <div class="mat-card-item">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:20px">${TYPE_ICONS[m.type] || '📎'}</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--green-dark)">${m.title}</div>
            <div style="font-size:11px;color:var(--text-mid);margin-top:2px">${m.type || ''}</div>
          </div>
        </div>
        ${m.notes ? `<div style="font-size:12px;color:var(--text-mid);background:var(--beige);padding:7px 10px;border-radius:8px;margin-bottom:8px">${m.notes}</div>` : ''}
        <div style="font-size:12px;color:var(--gold-dark)">${LINK_LABELS[detectLinkType(m.url)]}</div>
      </div>
    </a>`;
}

function renderMats(mats) {
  const container = document.getElementById('matsContainer');
  const section   = document.getElementById('dynamicMatsSection');
  if (!container) return;

  if (mats.length === 0) {
    section.style.display = 'none';
  } else {
    section.style.display = 'block';
    container.innerHTML = mats.map(matCardHTML).join('');
  }

  // حشو المودالات بمواد كل مادة
  Object.entries(SUBJ_MODAL_IDS).forEach(([subj, modalId]) => {
    const el = document.getElementById('modal-mats-' + modalId);
    if (!el) return;
    const subjMats = allMats.filter(m => m.course === subj);
    if (subjMats.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div style="margin:14px 0 4px;font-size:13px;font-weight:700;color:var(--green-dark);">
        <i class="ti ti-files" style="margin-left:4px;"></i> المواد المضافة (${subjMats.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${subjMats.map(matCardHTML).join('')}
      </div>`;
  });
}

window.filterMats = () => {
  const val = document.getElementById('filterCourse').value;
  let mats = allMats;

  // الطالبة العادية تشوف بس مواد هي ملتحقة بيها
  if (currentUserRole === 'student') {
    mats = mats.filter(m => currentUserSubjects.includes(m.course));
  }

  renderMats(val ? mats.filter(m => m.course === val) : mats);
};

// تحديد دور المستخدمة + موادها الملتحقة بيها
onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUserRole = null;
    currentUserSubjects = [];
    renderEnrollBar();
    window.filterMats();
    return;
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const data = snap.exists() ? snap.data() : {};
  const role = data.role || '';
  currentUserRole = role;
  currentUserSubjects = Array.isArray(data.enrolledSubjects) ? data.enrolledSubjects : [];

  if (role === 'admin') {
    const btn = document.getElementById('adminAddBtn');
    if (btn) btn.style.display = 'flex';
  }

  updateEnrollButtons();
  window.filterMats();
});

// تحديث أزرار "التسجيل في المادة" داخل المودالات حسب حالة الالتحاق
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
      // بنات متين ملتحقات أوتوماتيك بكل المواد بعد القبول
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

// التحاق الطالبة العادية بمادة بنفسها
window.joinSubject = async (subj) => {
  if (!auth.currentUser) { location.href = 'login.html'; return; }
  await updateDoc(doc(db, 'users', auth.currentUser.uid), {
    enrolledSubjects: arrayUnion(subj)
  });
  if (!currentUserSubjects.includes(subj)) currentUserSubjects.push(subj);
  updateEnrollButtons();
  window.filterMats();
};

// Submit new course
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
    // Reset form
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

// Load materials from Firestore
onSnapshot(query(collection(db, 'materials'), orderBy('addedAt', 'desc')), snap => {
  allMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window.filterMats();
});
