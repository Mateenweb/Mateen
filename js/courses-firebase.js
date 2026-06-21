import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, getDoc, doc, updateDoc, deleteDoc, arrayUnion, getDocs, setDoc }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ═══════════════════════════════════════════════════════
// Seed: أضف المواد الأساسية لـ Firebase لو مش موجودة
// ═══════════════════════════════════════════════════════
const SEED_SUBJECTS = [
  { id:'tafseer', name:'التفسير', icon:'📖', color:'linear-gradient(135deg,#5c3d2e,#8a5e3c)', desc:'دراسة معاني كتاب الله وفهم آياته والاستنباط منها وفق منهج السلف الصالح.', meetings:'٣ لقاءات أسبوعياً', weeks:'٦ أسابيع', level:'المستوى الثاني', topics:['مقدمات في علم التفسير','أسباب النزول','الناسخ والمنسوخ','تفسير المفردات','الاستنباط الفقهي','التدبر والتطبيق'], addedAt:1000 },
  { id:'fiqh',    name:'الفقه',    icon:'⚖️',  color:'linear-gradient(135deg,#1a3a5c,#2a5298)', desc:'تعلّم أحكام العبادات والمعاملات وفق المذهب الفقهي مع الأدلة الشرعية والتطبيق العملي.', meetings:'٣ لقاءات أسبوعياً', weeks:'٦ أسابيع', level:'المستوى الثاني', topics:['الطهارة والصلاة','الزكاة والصيام','الحج والعمرة','فقه الأسرة','المعاملات المالية','الفقه المعاصر'], addedAt:1001 },
  { id:'aqeedah', name:'العقيدة',  icon:'🕌',  color:'linear-gradient(135deg,#4a2e1a,#8b5e3c)', desc:'تأصيل عقيدة أهل السنة والجماعة في أسماء الله وصفاته والإيمان بالغيب وأصول الدين.',    meetings:'لقاءان أسبوعياً',    weeks:'٦ أسابيع', level:'المستوى الثاني', topics:['أصول الإيمان الستة','التوحيد وأقسامه','الأسماء والصفات','القضاء والقدر','الولاء والبراء','الفرق والمذاهب'],   addedAt:1002 },
  { id:'hadith',  name:'الحديث',   icon:'📜',  color:'linear-gradient(135deg,#2e1a4a,#5e3c8b)', desc:'دراسة الأحاديث النبوية وشرحها واستنباط الأحكام منها مع تعلّم أصول علم المصطلح.',     meetings:'لقاءان أسبوعياً',    weeks:'٦ أسابيع', level:'المستوى الثاني', topics:['مصطلح الحديث','أقسام الحديث','شرح الأربعين النووية','الجرح والتعديل','فقه الحديث','التخريج والدراسة'],       addedAt:1003 },
  { id:'quran',   name:'مقرأة متين',icon:'🌿', color:'linear-gradient(135deg,#5c3d2e,#8a5e3c)', desc:'تلاوة مقرأة متين بالتجويد وحفظ المقرر مع الإتقان والمراجعة المنتظمة.',               meetings:'يومياً',             weeks:'٦ أسابيع', level:'المستوى الثاني', topics:['أحكام التجويد','المخارج والصفات','حفظ المقرر','المراجعة الأسبوعية','التلاوة الجماعية','الإجازة والسند'],       addedAt:1004 },
];

async function seedSubjects() {
  for (const s of SEED_SUBJECTS) {
    const ref = doc(db, 'subjects', s.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { ...s });
      console.log('[Seed] أضفت:', s.name);
    }
  }
}
seedSubjects().catch(e => console.warn('[Seed] خطأ:', e));

let allMats = [];
let currentUserRole = null;
let currentUserSubjects = [];
const MAIN_SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];

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

// المعلمة تقدر تعدل/تحذف مواد مادتها بس
const canEditMat = (m) => {
  if (isAdmin()) return true;
  if (currentUserRole === 'teacher') {
    return currentUserSubjects.some(s => m.course === s);
  }
  return false;
};

function matCardHTML(m) {
  const editBtns = canEditMat(m) ? `
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
        ${editBtns}
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
    'التفسير':    { id: 'tafseer',  staticId: 'static-tafseer'  },
    'الفقه':      { id: 'fiqh',     staticId: 'static-fiqh'     },
    'العقيدة':    { id: 'aqeedah',  staticId: 'static-aqeedah'  },
    'الحديث':    { id: 'hadith',   staticId: 'static-hadith'   },
    'مقرأة متين': { id: 'quran',    staticId: 'static-quran'    },
  };

  Object.entries(modalMap).forEach(([subj, { id: modalId }]) => {
    // ── أزرار تعديل/حذف المادة الرئيسية (للأدمن فقط) ──
    const adminActionsEl = document.getElementById('modal-admin-actions-' + modalId);
    if (adminActionsEl) {
      if (isAdmin()) {
        adminActionsEl.innerHTML = `
          <div style="display:flex;gap:8px;margin:12px 0 4px;">
            <button onclick="openEditStaticSubject('${subj}')"
              style="flex:1;padding:7px;border:1px solid var(--green-dark);background:transparent;color:var(--green-dark);border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="ti ti-pencil"></i> تعديل المادة
            </button>
          </div>`;
      } else {
        adminActionsEl.innerHTML = '';
      }
    }

    // ── المواد المضافة من Firebase ──
    const el = document.getElementById('modal-mats-' + modalId);
    if (!el) return;
    const subjMats = allMats.filter(m => m.course === subj);
    const canAdd = isAdmin() || (currentUserRole === 'teacher' && currentUserSubjects.includes(subj));
    const addBtnHTML = canAdd ? `
      <button onclick="document.getElementById('newCourseCat').value='${subj}';document.getElementById('addCourseModal').style.display='flex'"
        style="display:flex;align-items:center;gap:6px;background:var(--green-dark);color:white;border:none;padding:8px 14px;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer;margin-bottom:10px;margin-top:8px;">
        <i class="ti ti-plus"></i> إضافة محتوى لـ${subj}
      </button>` : '';

    if (subjMats.length === 0) { el.innerHTML = addBtnHTML; return; }
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

// ===== تعديل المواد الثابتة (التفسير، الفقه، إلخ) =====
const STATIC_SUBJECTS_DATA = {
  'التفسير':    { modalId: 'tafseer',  bannerClass: 'banner-tafseer'  },
  'الفقه':      { modalId: 'fiqh',     bannerClass: 'banner-fiqh'     },
  'العقيدة':    { modalId: 'aqeedah',  bannerClass: 'banner-aqeedah'  },
  'الحديث':    { modalId: 'hadith',   bannerClass: 'banner-hadith'   },
  'مقرأة متين': { modalId: 'quran',    bannerClass: 'banner-quran'    },
};

window.openEditStaticSubject = (subj) => {
  // اجمع البيانات الحالية من المودال
  const { modalId } = STATIC_SUBJECTS_DATA[subj];
  const modalEl = document.getElementById('modal-' + modalId);
  const title    = modalEl.querySelector('.modal-title')?.textContent || subj;
  const subtitle = modalEl.querySelector('.modal-subtitle')?.textContent || '';
  const desc     = modalEl.querySelector('.modal-desc')?.textContent?.trim() || '';
  const topicsEls = modalEl.querySelectorAll('.topics-list li');
  const topics   = Array.from(topicsEls).map(li => li.textContent).join('\n');

  // ابني مودال التعديل
  const old = document.getElementById('editStaticModal');
  if (old) old.remove();

  const m = document.createElement('div');
  m.id = 'editStaticModal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;align-items:center;justify-content:center;padding:20px;';
  m.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;width:90%;max-width:500px;direction:rtl;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="font-family:Amiri,serif;font-size:17px;color:var(--green-dark);font-weight:700;">
          <i class="ti ti-pencil"></i> تعديل مادة — ${subj}
        </div>
        <button onclick="document.getElementById('editStaticModal').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-mid);">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="font-size:13px;color:var(--text-dark);display:block;margin-bottom:6px;">العنوان الفرعي</label>
          <input id="esSubtitle" value="${subtitle}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:13px;color:var(--text-dark);display:block;margin-bottom:6px;">وصف المادة</label>
          <textarea id="esDesc" rows="4" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;box-sizing:border-box;resize:vertical;">${desc}</textarea>
        </div>
        <div>
          <label style="font-size:13px;color:var(--text-dark);display:block;margin-bottom:6px;">المحاور الرئيسية (سطر لكل محور)</label>
          <textarea id="esTopics" rows="6" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;box-sizing:border-box;resize:vertical;">${topics}</textarea>
        </div>
        <div id="esErr" style="display:none;color:#c0392b;font-size:13px;"></div>
        <div style="display:flex;gap:10px;margin-top:4px;">
          <button id="esSubmit" onclick="saveStaticSubject('${subj}')"
            style="flex:1;padding:11px;background:var(--green-dark);color:white;border:none;border-radius:8px;font-family:inherit;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="ti ti-device-floppy"></i> حفظ التعديلات
          </button>
          <button onclick="document.getElementById('editStaticModal').remove()"
            style="padding:11px 20px;background:var(--beige);color:var(--text-dark);border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;cursor:pointer;">
            إلغاء
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
};

window.saveStaticSubject = async (subj) => {
  const { modalId } = STATIC_SUBJECTS_DATA[subj];
  const subtitle = document.getElementById('esSubtitle').value.trim();
  const desc     = document.getElementById('esDesc').value.trim();
  const topics   = document.getElementById('esTopics').value.trim().split('\n').filter(Boolean);
  const err      = document.getElementById('esErr');
  const btn      = document.getElementById('esSubmit');

  if (!desc) { err.style.display='block'; err.textContent='الوصف مطلوب'; return; }
  err.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> جاري الحفظ...';

  try {
    // احفظ في Firestore collection staticSubjects
    const { setDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
    await setDoc(fsDoc(db, 'staticSubjects', modalId), { subj, subtitle, desc, topics, updatedAt: Date.now() }, { merge: true });

    // حدّث المودال مباشرة بدون reload
    const modalEl = document.getElementById('modal-' + modalId);
    if (modalEl.querySelector('.modal-subtitle')) modalEl.querySelector('.modal-subtitle').textContent = subtitle;
    if (modalEl.querySelector('.modal-desc'))     modalEl.querySelector('.modal-desc').textContent = desc;
    const topicsList = modalEl.querySelector('.topics-list');
    if (topicsList) topicsList.innerHTML = topics.map(t => `<li>${t}</li>`).join('');

    document.getElementById('editStaticModal').remove();
  } catch(e) {
    err.style.display = 'block';
    err.textContent = 'حدث خطأ: ' + e.message;
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ التعديلات';
};

// تحميل تعديلات المواد الثابتة من Firestore عند فتح الصفحة
onSnapshot(collection(db, 'staticSubjects'), snap => {
  snap.docs.forEach(d => {
    const data = d.data();
    const modalEl = document.getElementById('modal-' + d.id);
    if (!modalEl) return;
    if (data.subtitle && modalEl.querySelector('.modal-subtitle'))
      modalEl.querySelector('.modal-subtitle').textContent = data.subtitle;
    if (data.desc && modalEl.querySelector('.modal-desc'))
      modalEl.querySelector('.modal-desc').textContent = data.desc;
    if (data.topics?.length && modalEl.querySelector('.topics-list'))
      modalEl.querySelector('.topics-list').innerHTML = data.topics.map(t => `<li>${t}</li>`).join('');
  });
});

// ===== تعديل المادة (materials) =====
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
    authReady = true;
    window.filterMats();
    renderModalMats();
    return;
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const data = snap.exists() ? snap.data() : {};
  const role = data.role || '';
  currentUserRole = role;

  if (role === 'teacher') {
    const teacherSubject = data.subject || '';
    currentUserSubjects = teacherSubject ? [teacherSubject] : [];
  } else {
    currentUserSubjects = Array.isArray(data.enrolledSubjects) ? data.enrolledSubjects : [];
  }

  if (isAdmin()) {
    const btns = document.getElementById('adminBtns');
    if (btns) btns.style.display = 'flex';
  }

  authReady = true;
  updateEnrollButtons();
  window.filterMats();
  renderModalMats();

  // لو الـ snapshot وصل قبل الـ auth — اعمل render تاني
  if (pendingRender) {
    pendingRender = false;
    window.filterMats();
    renderModalMats();
  }
});

const SUBJ_MODAL_IDS = {
  'التفسير': 'tafseer', 'الفقه': 'fiqh', 'العقيدة': 'aqeedah',
  'الحديث': 'hadith', 'مقرأة متين': 'quran'
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

let authReady = false;
let pendingRender = false;

onSnapshot(query(collection(db, 'materials'), orderBy('addedAt', 'desc')), snap => {
  allMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (authReady) {
    window.filterMats();
    renderModalMats();
  } else {
    pendingRender = true;
  }
});

// =============================================
// إدارة المواد الرئيسية (subjects collection)
// =============================================

let allSubjects = [];

function subjectCardHTML(s) {
  const adminActions = isAdmin() ? `
    <div style="display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--border);" onclick="event.stopPropagation()">
      <button onclick="openEditSubjectModal('${s.id}')"
        style="flex:1;padding:7px;border:1px solid var(--green-dark);background:transparent;color:var(--green-dark);border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
        <i class="ti ti-pencil"></i> تعديل
      </button>
      <button onclick="confirmDeleteSubject('${s.id}','${s.name.replace(/'/g,"\\'")}' )"
        style="flex:1;padding:7px;border:1px solid #c0392b;background:transparent;color:#c0392b;border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
        <i class="ti ti-trash"></i> حذف
      </button>
    </div>` : '';

  const safeId = 'dyn-' + s.id;
  return `
    <div class="course-card" onclick="openDynModal('${s.id}')">
      <div class="card-banner" style="background:${s.color || 'linear-gradient(135deg,#5c3d2e,#8a5e3c)'}">
        <div class="card-badge">أساسية</div>
        <div class="card-icon" style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;">
          ${s.iconData || s.iconUrl
            ? `<img src="${s.iconData || s.iconUrl}" style="width:56px;height:56px;object-fit:contain;border-radius:8px;">`
            : `<span style="font-size:40px">${s.icon || '📚'}</span>`}
        </div>
      </div>
      <div class="card-body">
        <div class="card-title">${s.name}</div>
        <div class="card-desc">${s.desc || ''}</div>
        <div class="card-meta">
          ${s.meetings ? `<div class="meta-item"><i class="ti ti-clock"></i> ${s.meetings}</div>` : ''}
          ${s.weeks ? `<div class="meta-item"><i class="ti ti-calendar"></i> ${s.weeks}</div>` : ''}
        </div>
        <div class="card-footer">
          <div class="card-level"><i class="ti ti-award" style="color:var(--gold)"></i> ${s.level || ''}</div>
          <button class="btn-details">عرض التفاصيل</button>
        </div>
      </div>
      ${adminActions}
    </div>`;
}

function renderSubjects() {
  const grid = document.getElementById('dynamicSubjectsGrid');
  if (!grid) return;
  if (allSubjects.length === 0) { grid.innerHTML = ''; return; }
  grid.innerHTML = allSubjects.map(subjectCardHTML).join('');
}

// فتح مودال ديناميكي للمادة الرئيسية
window.openDynModal = (id) => {
  const s = allSubjects.find(x => x.id === id);
  if (!s) return;

  // احذف أي مودال قديم
  const old = document.getElementById('dynModal-' + id);
  if (old) old.remove();

  const topics = Array.isArray(s.topics) ? s.topics : (s.topics || '').split('\n').filter(Boolean);
  const mats = allMats.filter(m => m.course === s.name);

  const addBtnHTML = isAdmin() ? `
    <button onclick="document.getElementById('newCourseCat').value='${s.name}';document.getElementById('addCourseModal').style.display='flex'"
      style="display:flex;align-items:center;gap:6px;background:var(--green-dark);color:white;border:none;padding:8px 14px;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer;margin-bottom:10px;margin-top:12px;">
      <i class="ti ti-plus"></i> إضافة محتوى لـ${s.name}
    </button>` : '';

  const matsHTML = mats.length > 0 ? `
    <div style="margin-top:14px;">
      <div style="font-size:13px;font-weight:700;color:var(--green-dark);margin-bottom:8px;">
        <i class="ti ti-files" style="margin-left:4px;"></i> المواد المضافة (${mats.length})
      </div>
      ${addBtnHTML}
      <div style="display:flex;flex-direction:column;gap:8px;">${mats.map(matCardHTML).join('')}</div>
    </div>` : addBtnHTML ? `<div style="margin-top:8px">${addBtnHTML}</div>` : '';

  const modal = document.createElement('div');
  modal.id = 'dynModal-' + id;
  modal.className = 'modal-overlay';
  modal.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-banner" style="background:${s.color || 'linear-gradient(135deg,#5c3d2e,#8a5e3c)'}">
        <button class="modal-close" onclick="document.getElementById('dynModal-${id}').remove()">✕</button>
        <div class="modal-icon" style="display:flex;align-items:center;justify-content:center;width:72px;height:72px;">
          ${s.iconData || s.iconUrl
            ? `<img src="${s.iconData || s.iconUrl}" style="width:64px;height:64px;object-fit:contain;border-radius:10px;">`
            : `<span style="font-size:48px">${s.icon || '📚'}</span>`}
        </div>
      </div>
      <div class="modal-content">
        <div class="modal-title">${s.name}</div>
        <div class="modal-subtitle">مادة أساسية — ${s.level || ''}</div>
        <div class="modal-desc">${s.desc || ''}</div>
        ${topics.length > 0 ? `
          <div class="modal-topics-title">📌 المحاور الرئيسية:</div>
          <ul class="topics-list">${topics.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
        ${matsHTML}
        <div class="modal-actions">
          <button class="btn-close-modal" onclick="document.getElementById('dynModal-${id}').remove()">إغلاق</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
};

// إضافة مادة رئيسية
window.submitNewSubject = async () => {
  const name  = document.getElementById('sbjName').value.trim();
  const desc  = document.getElementById('sbjDesc').value.trim();
  const meetings = document.getElementById('sbjMeetings').value.trim();
  const weeks    = document.getElementById('sbjWeeks').value.trim();
  const level    = document.getElementById('sbjLevel').value.trim();
  const topics   = document.getElementById('sbjTopics').value.trim();
  const err = document.getElementById('addSubjectErr');

  if (!name || !desc) {
    err.style.display = 'block';
    err.textContent = 'يرجى تعبئة اسم المادة والوصف على الأقل';
    return;
  }
  err.style.display = 'none';

  const btn = document.getElementById('addSubjectSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> جاري الإضافة...';

  try {
    const iconData = document.getElementById('sbjIconData').value || '';
    const iconUrl  = document.getElementById('sbjIconUrl').value.trim() || '';
    const colorVal = document.getElementById('sbjColorVal').value;
    await addDoc(collection(db, 'subjects'), {
      name, iconData, iconUrl, color: colorVal, desc, meetings, weeks, level,
      topics: topics.split('\n').filter(Boolean),
      addedAt: Date.now(),
      addedBy: auth.currentUser.email,
    });
    ['sbjName','sbjIconData','sbjIconUrl','sbjDesc','sbjMeetings','sbjWeeks','sbjLevel','sbjTopics'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('sbjIconPreview').innerHTML = '<i class="ti ti-photo" style="font-size:24px;color:var(--text-mid);"></i>';
    document.getElementById('addSubjectModal').style.display = 'none';
  } catch(e) {
    err.style.display = 'block';
    err.textContent = 'حدث خطأ، حاولي مرة أخرى';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-circle-plus"></i> إضافة المادة';
};

// تعديل مادة رئيسية
window.openEditSubjectModal = (id) => {
  const s = allSubjects.find(x => x.id === id);
  if (!s) return;
  document.getElementById('editSbjId').value = id;
  document.getElementById('editSbjName').value = s.name;
  document.getElementById('editSbjIconUrl').value = s.iconUrl || '';
  document.getElementById('editSbjIconData').value = s.iconData || '';
  // عرض الصورة الحالية
  const editPrev = document.getElementById('editSbjIconPreview');
  const imgSrc = s.iconData || s.iconUrl;
  editPrev.innerHTML = imgSrc
    ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;">`
    : '<i class="ti ti-photo" style="font-size:24px;color:var(--text-mid);"></i>';
  // ضبط الألوان
  const colorMatch = (s.color || '').match(/#[0-9a-fA-F]{6}/g);
  if (colorMatch && colorMatch.length >= 2) {
    document.getElementById('editSbjColor1').value = colorMatch[0];
    document.getElementById('editSbjColor2').value = colorMatch[1];
  }
  document.getElementById('editSbjColorVal').value = s.color || 'linear-gradient(135deg,#5c3d2e,#8a5e3c)';
  document.getElementById('editSbjColorPreview').style.background = s.color || 'linear-gradient(135deg,#5c3d2e,#8a5e3c)';
  document.getElementById('editSbjDesc').value = s.desc || '';
  document.getElementById('editSbjMeetings').value = s.meetings || '';
  document.getElementById('editSbjWeeks').value = s.weeks || '';
  document.getElementById('editSbjLevel').value = s.level || '';
  const topics = Array.isArray(s.topics) ? s.topics.join('\n') : (s.topics || '');
  document.getElementById('editSbjTopics').value = topics;
  document.getElementById('editSubjectErr').style.display = 'none';
  document.getElementById('editSubjectModal').style.display = 'flex';
};

window.submitEditSubject = async () => {
  const id    = document.getElementById('editSbjId').value;
  const name  = document.getElementById('editSbjName').value.trim();
  const desc  = document.getElementById('editSbjDesc').value.trim();
  const meetings = document.getElementById('editSbjMeetings').value.trim();
  const weeks    = document.getElementById('editSbjWeeks').value.trim();
  const level    = document.getElementById('editSbjLevel').value.trim();
  const topics   = document.getElementById('editSbjTopics').value.trim();
  const err = document.getElementById('editSubjectErr');

  if (!name) { err.style.display='block'; err.textContent='اسم المادة مطلوب'; return; }
  err.style.display = 'none';

  const btn = document.getElementById('editSubjectSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> جاري الحفظ...';

  try {
    const iconData = document.getElementById('editSbjIconData').value || '';
    const iconUrl  = document.getElementById('editSbjIconUrl').value.trim() || '';
    const colorVal = document.getElementById('editSbjColorVal').value;
    await updateDoc(doc(db, 'subjects', id), {
      name, iconData, iconUrl, color: colorVal, desc, meetings, weeks, level,
      topics: topics.split('\n').filter(Boolean),
    });
    document.getElementById('editSubjectModal').style.display = 'none';
  } catch(e) {
    err.style.display='block'; err.textContent='حدث خطأ، حاولي مرة أخرى';
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ التعديلات';
};

// حذف مادة رئيسية
window.confirmDeleteSubject = (id, name) => {
  document.getElementById('deleteSbjId').value = id;
  document.getElementById('deleteSbjTitle').textContent = name;
  document.getElementById('deleteSubjectModal').style.display = 'flex';
};

window.executeDeleteSubject = async () => {
  const id  = document.getElementById('deleteSbjId').value;
  const btn = document.getElementById('deleteSbjConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> جاري الحذف...';
  try {
    await deleteDoc(doc(db, 'subjects', id));
    document.getElementById('deleteSubjectModal').style.display = 'none';
  } catch(e) {
    alert('حدث خطأ أثناء الحذف');
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-trash"></i> تأكيد الحذف';
};

// تحميل المواد الرئيسية من Firebase
onSnapshot(query(collection(db, 'subjects'), orderBy('addedAt', 'asc')), snap => {
  allSubjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSubjects();
});

// إظهار أزرار الأدمن
function showAdminBtns() {
  const btns = document.getElementById('adminBtns');
  if (btns && isAdmin()) btns.style.display = 'flex';
}
