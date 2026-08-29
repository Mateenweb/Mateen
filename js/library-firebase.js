import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc,
         deleteDoc, doc, getDoc, orderBy, query, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";
import { renderAssignmentsSection } from "./assignments-ui.js";
import { deleteAssignmentsForMaterial } from "./assignments.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentRole = null;
let allLibMats  = [];   // Library متين (من libraryMaterials collection — منفصل تمامًا عن materials المواد العلمية)
let allLibExtra = {};   // الأقسام المسطّحة (كروت) { enrichment:[], podcast:[] }
// allGroups: حاويات (courses/rawdat) — كل حاوية عندها موادها في libraryMaterials عبر matsField، انظر GROUP_CONFIG تحت

const isAdmin = () => currentRole === 'admin' || currentRole === 'supervisor';

window.refreshAssignmentsFor = (materialId, course) => {
  document.querySelectorAll(`[data-asg-container="${materialId}"]`).forEach(el => {
    renderAssignmentsSection(materialId, course, el.id);
  });
};

// ══ أيقونات اBecauseواع ══
const TYPE_ICONS = { 'فيديو':'🎬','ملف PDF':'📄','مقال':'📝','حلقة صوتية':'🎙️','دورة':'🎓','أخرى':'📎' };

// ترتيب ثابت لعناصر المحاضرة الواحدة: اختبار/واجب أولًا (لو موجودين)، ثم محاضرة، ثم ملخص، ثم الباقي
function libMatPriority(m) {
  if (m.exam?.title || m.assignment?.title) return 0;
  if (m.type === 'محاضرة') return 1;
  if (m.type === 'ملخص') return 2;
  return 3;
}
function sortLibMatsForLecture(mats) {
  return [...mats].sort((a, b) => libMatPriority(a) - libMatPriority(b));
}

// ── تجميع مواد حسب رقم المحاضرة (نفس فكرة courses.html) ─────────
function libMatsGroupedHTML(mats, section) {
  const withLecture = mats.filter(m => m.lectureNumber != null);
  const without = mats.filter(m => m.lectureNumber == null);
  const lectureNums = [...new Set(withLecture.map(m => m.lectureNumber))].sort((a, b) => a - b);

  let html = '';
  lectureNums.forEach(n => {
    const group = sortLibMatsForLecture(withLecture.filter(m => m.lectureNumber === n));
    html += `
      <div style="border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:14px;grid-column:1/-1">
        <div onclick="const b=this.nextElementSibling;const open=b.style.display!=='none';b.style.display=open?'none':'flex';this.querySelector('.lec-chevron').style.transform=open?'rotate(-90deg)':'rotate(0deg)'"
          style="background:rgba(201,162,39,0.1);padding:10px 14px;font-size:13px;font-weight:700;color:var(--gold-dark,#b8860b);display:flex;align-items:center;justify-content:space-between;cursor:pointer">
          <span><i class="ti ti-bookmark"></i> المحاضرة ${n}</span>
          <i class="ti ti-chevron-down lec-chevron" style="transition:.2s"></i>
        </div>
        <div class="lib-cards-grid" style="padding:12px;background:var(--beige,#faf6ee)">${group.map(m => cardHTML(m, section)).join('')}</div>
      </div>`;
  });
  if (without.length) {
    const withoutHTML = `<div class="lib-cards-grid" style="padding:0">${sortLibMatsForLecture(without).map(m => cardHTML(m, section)).join('')}</div>`;
    html += lectureNums.length ? `
      <div style="margin-bottom:14px;grid-column:1/-1">
        <div style="font-size:12px;font-weight:600;color:var(--text-mid);margin:10px 0 8px">📎 مواد غير مرتبطة بمحاضرة</div>
        ${withoutHTML}
      </div>` : withoutHTML;
  }
  return html;
}

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

  const asgContainer = section === 'mateen-lib'
    ? `<div id="asg-${item.id}" data-asg-container="${item.id}"></div>`
    : '';

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
      ${asgContainer}
      ${editBtns}
    </div>`;
}

// ══ رسم تابات فلتر المواد — ديناميكي حسب المواد المُضافة فعليًا ══
function renderLibFilters() {
  const row = document.getElementById('libFiltersRow');
  if (!row) return;
  const filter = window.currentLibFilter || 'all';

  // أسماء المواد الفريدة الموجودة فعليًا في المحتوى المُضاف، بترتيب ظهورها
  const subjects = [...new Set(allLibMats.map(m => m.course).filter(Boolean))];

  // لو المادة النشطة اتشالت (اتمسح آخر محتوى ليها)، رجّعي الفلتر لـ"الكل"
  if (filter !== 'all' && !subjects.includes(filter)) {
    window.currentLibFilter = 'all';
  }
  const activeFilter = window.currentLibFilter || 'all';

  row.innerHTML = `<button class="lib-btn${activeFilter === 'all' ? ' active' : ''}" onclick="filterLibMats(this,'all')">الكل</button>` +
    subjects.map(s => `<button class="lib-btn${activeFilter === s ? ' active' : ''}" onclick="filterLibMats(this,'${s.replace(/'/g,"\\'")}')">${s}</button>`).join('');
}

// ══ رسم Library متين ══
window.renderLibMats = () => {
  const grid = document.getElementById('libMatsGrid');
  if (!grid) return;
  renderLibFilters();
  const filter = window.currentLibFilter || 'all';
  const mats = filter === 'all' ? allLibMats : allLibMats.filter(m => m.course === filter);

  if (!mats.length) {
    grid.innerHTML = '<div class="lib-empty"><i class="ti ti-files-off" style="font-size:28px;"></i><div>لا يوجد محتوى</div></div>';
  } else if (filter === 'all') {
    // مافيش تجميع بالمحاضرة لما يكون العرض "الكل" (مواد من مواد مختلفة)
    grid.innerHTML = mats.map(m => cardHTML(m, 'mateen-lib')).join('');
  } else {
    grid.innerHTML = libMatsGroupedHTML(mats, 'mateen-lib');
  }

  const addBtn = document.getElementById('libAddBtn');
  if (addBtn) addBtn.style.display = isAdmin() ? 'block' : 'none';

  mats.forEach(m => renderAssignmentsSection(m.id, m.course, 'asg-' + m.id));
};

// ══ رسم الأقسام الأخرى ══
function renderSection(section) {
  if (GROUP_CONFIG[section]) { renderGroupsGrid(section); return; }
  const gridId  = { enrichment: 'enrichmentGrid', podcast: 'podcastGrid' }[section];
  const addBtnId = { enrichment: 'enrichmentAddBtn', podcast: 'podcastAddBtn' }[section];
  const grid   = document.getElementById(gridId);
  const addBtn = document.getElementById(addBtnId);
  if (!grid) return;

  const items = allLibExtra[section] || [];
  grid.innerHTML = items.length
    ? items.map(m => cardHTML(m, section)).join('')
    : '<div class="lib-empty"><i class="ti ti-files-off" style="font-size:28px;"></i><div>لا يوجد محتوى بعد</div></div>';

  if (addBtn) addBtn.style.display = isAdmin() ? 'block' : 'none';
}

// ── نظام الحاويات (الدورات / رياض متين): تايلات قابلة للنقر تفتح تفاصيلها ─────
// كل "kind" هنا (courses/rawdat) له collection خاص بالحاويات، وموادها في
// libraryMaterials مربوطة عن طريق matsField (courseId / rawdatGroupId).
const GROUP_CONFIG = {
  courses: {
    collection: 'courses', matsField: 'courseId',
    gridId: 'coursesGrid', addBtnId: 'coursesAddBtn', icon: 'ti-certificate',
    emptyMsg: 'لا توجد دورات مضافة بعد',
    modalTitle: '🎓 إضافة دورة جديدة', nameLabel: 'اسم الدورة',
    submitLabel: 'إضافة الدورة', addContentLabel: 'إضافة محتوى لهذه الدورة',
    deleteLabel: 'حذف الدورة بالكامل', deleteConfirm: n => `هل أنتِ متأكدة من حذف دورة "${n}"؟ هيتم حذف كل محتواها كمان.`,
  },
  rawdat: {
    collection: 'rawdatGroups', matsField: 'rawdatGroupId',
    gridId: 'rawdatGrid', addBtnId: 'rawdatAddBtn', icon: 'ti-flower',
    emptyMsg: 'لا توجد أقسام مضافة بعد',
    modalTitle: '🌸 إضافة قسم جديد', nameLabel: 'اسم القسم',
    submitLabel: 'إضافة القسم', addContentLabel: 'إضافة محتوى لهذا القسم',
    deleteLabel: 'حذف القسم بالكامل', deleteConfirm: n => `هل أنتِ متأكدة من حذف قسم "${n}"؟ هيتم حذف كل محتواه كمان.`,
  },
};
let allGroups = { courses: [], rawdat: [] };

function groupTileHTML(item, kind) {
  const cfg = GROUP_CONFIG[kind];
  const icon = item.iconData || item.iconUrl
    ? `<img src="${item.iconData || item.iconUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`
    : `<i class="ti ${cfg.icon}" style="font-size:26px;color:white"></i>`;
  return `
    <div class="lib-card" onclick="openGroupDetailModal('${item.id}','${kind}')" style="cursor:pointer;padding:0;overflow:hidden">
      <div style="height:70px;background:${item.color || 'linear-gradient(135deg,#5c3d2e,#8a5e3c)'};display:flex;align-items:center;padding:0 14px;gap:10px">
        <div style="width:44px;height:44px;border-radius:10px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${icon}</div>
        <div style="color:white;font-weight:700;font-size:14px">${item.name}</div>
      </div>
      <div class="lib-card-body" style="padding:12px">
        <div class="lib-card-notes" style="margin:0">${item.desc || ''}</div>
        <div style="font-size:11px;color:var(--text-mid);margin-top:6px;display:flex;gap:10px">
          ${item.meetings ? `<span><i class="ti ti-calendar-event"></i> ${item.meetings}</span>` : ''}
          ${item.weeks ? `<span><i class="ti ti-hourglass"></i> ${item.weeks}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function renderGroupsGrid(kind) {
  const cfg = GROUP_CONFIG[kind];
  const grid = document.getElementById(cfg.gridId);
  const addBtn = document.getElementById(cfg.addBtnId);
  if (!grid) return;
  const items = allGroups[kind] || [];
  grid.innerHTML = items.length
    ? items.map(it => groupTileHTML(it, kind)).join('')
    : `<div class="lib-empty"><i class="ti ti-files-off" style="font-size:28px;"></i><div>${cfg.emptyMsg}</div></div>`;
  if (addBtn) addBtn.style.display = isAdmin() ? 'block' : 'none';
}

// ══ مستمعات Firestore ══

// 1. Library متين — من libraryMaterials collection (منفصل تمامًا عن materials المواد العلمية)
onSnapshot(query(collection(db, 'libraryMaterials'), orderBy('addedAt', 'desc')), snap => {
  allLibMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window.renderLibMats();
  if (window._openGroupId) window.openGroupDetailModal(window._openGroupId, window._openGroupKind, true);
});

// 2. الأقسام الأخرى — من libraryItems collection
onSnapshot(query(collection(db, 'libraryItems'), orderBy('addedAt', 'desc')), snap => {
  allLibExtra = { enrichment: [], podcast: [] };
  snap.docs.forEach(d => {
    const data = { id: d.id, ...d.data() };
    if (allLibExtra[data.section] !== undefined) allLibExtra[data.section].push(data);
  });
  ['enrichment', 'podcast'].forEach(renderSection);
});

// 3. حاويات الدورات ورياض متين
Object.keys(GROUP_CONFIG).forEach(kind => {
  onSnapshot(query(collection(db, GROUP_CONFIG[kind].collection), orderBy('addedAt', 'asc')), snap => {
    allGroups[kind] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGroupsGrid(kind);
  });
});

// ══ Auth ══
onAuthStateChanged(auth, async user => {
  if (!user) { currentRole = null; }
  else {
    const snap = await getDoc(doc(db, 'users', user.uid));
    currentRole = snap.exists() ? (snap.data().role || null) : null;
  }
  window.renderLibMats();
  ['enrichment', 'podcast'].forEach(renderSection);
  Object.keys(GROUP_CONFIG).forEach(renderGroupsGrid);
});

// ── رقم المحاضرة: تحديث القايمة حسب المادة/الحاوية المختارة ────
window.updateLibLectureOptions = () => {
  const section = document.getElementById('addLibSection')?.value;
  const sel = document.getElementById('addLibLecture');
  if (!sel) return;

  let relevantMats = [];
  if (section === 'mateen-lib') {
    const subj = document.getElementById('addLibSubject')?.value;
    relevantMats = allLibMats.filter(m => m.course === subj && m.lectureNumber != null);
  } else if (GROUP_CONFIG[section]) {
    const groupId = document.getElementById('addLibCourseId')?.value;
    const field = GROUP_CONFIG[section].matsField;
    relevantMats = allLibMats.filter(m => m[field] === groupId && m.lectureNumber != null);
  }
  const nums = [...new Set(relevantMats.map(m => m.lectureNumber))].sort((a, b) => a - b);

  sel.innerHTML = '<option value="">بدون محاضرة محددة</option>' +
    nums.map(n => `<option value="${n}">المحاضرة ${n}</option>`).join('') +
    `<option value="__new__">+ محاضرة جديدة</option>`;

  sel.onchange = () => {
    const wrap = document.getElementById('libLectureNumWrap');
    if (sel.value === '__new__') {
      wrap.style.display = 'block';
      document.getElementById('libLectureNumInput').value = (nums.length ? Math.max(...nums) : 0) + 1;
    } else {
      wrap.style.display = 'none';
    }
  };
};

// ── حاويات الدورات/رياض متين: إنشاء حاوية جديدة ────────────────
window.openAddCourseContainerModal = (kind = 'courses') => {
  const cfg = GROUP_CONFIG[kind];
  document.getElementById('crsKind').value = kind;
  document.getElementById('addCourseContainerTitle').textContent = cfg.modalTitle;
  document.getElementById('crsNameLabel').innerHTML = `${cfg.nameLabel} <span style="color:#c0392b">*</span>`;
  document.getElementById('addCourseContainerSubmitLabel').textContent = cfg.submitLabel;
  ['crsName','crsIconData','crsIconUrl','crsDesc','crsMeetings','crsWeeks','crsLevel'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('crsIconPreview').innerHTML = '<i class="ti ti-photo" style="font-size:24px;color:var(--text-mid);"></i>';
  document.getElementById('addCourseContainerErr').style.display = 'none';
  document.getElementById('addCourseContainerModal').style.display = 'flex';
};

window.submitNewCourseContainer = async () => {
  const kind = document.getElementById('crsKind').value || 'courses';
  const cfg  = GROUP_CONFIG[kind];
  const name = document.getElementById('crsName').value.trim();
  const desc = document.getElementById('crsDesc').value.trim();
  const err  = document.getElementById('addCourseContainerErr');
  if (!name || !desc) {
    err.style.display = 'block'; err.textContent = `يرجى تعبئة ${cfg.nameLabel} والوصف على الأقل`;
    return;
  }
  err.style.display = 'none';
  const btn = document.getElementById('addCourseContainerSubmit');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> جاري الإضافة...';

  try {
    await addDoc(collection(db, cfg.collection), {
      name,
      desc,
      iconData: document.getElementById('crsIconData').value || '',
      iconUrl:  document.getElementById('crsIconUrl').value.trim() || '',
      color:    document.getElementById('crsColorVal').value,
      meetings: document.getElementById('crsMeetings').value.trim(),
      weeks:    document.getElementById('crsWeeks').value.trim(),
      level:    document.getElementById('crsLevel').value.trim(),
      addedAt: Date.now(),
      addedBy: auth.currentUser?.email || '',
    });
    document.getElementById('addCourseContainerModal').style.display = 'none';
  } catch (e) {
    err.style.display = 'block'; err.textContent = 'حدث خطأ، حاولي مرة أخرى';
  }
  btn.disabled = false; btn.innerHTML = `<i class="ti ti-plus"></i> <span id="addCourseContainerSubmitLabel">${cfg.submitLabel}</span>`;
};

// ── فتح تفاصيل حاوية معينة وموادها مقسّمة لمحاضرات ────
window.openGroupDetailModal = (groupId, kind = 'courses', keepOpenSilent) => {
  const cfg = GROUP_CONFIG[kind];
  const item = (allGroups[kind] || []).find(c => c.id === groupId);
  if (!item) return;
  window._openGroupId = groupId;
  window._openGroupKind = kind;

  const mats = allLibMats.filter(m => m[cfg.matsField] === groupId);
  const icon = item.iconData || item.iconUrl
    ? `<img src="${item.iconData || item.iconUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`
    : `<i class="ti ${cfg.icon}" style="font-size:30px;color:white"></i>`;

  const matsHTML = mats.length
    ? libMatsGroupedHTML(mats, kind)
    : '<div class="lib-empty"><i class="ti ti-files-off" style="font-size:24px;"></i><div>لا يوجد محتوى هنا بعد</div></div>';

  document.getElementById('courseDetailModalBody').innerHTML = `
    <div style="background:${item.color || 'linear-gradient(135deg,#5c3d2e,#8a5e3c)'};padding:20px;border-radius:16px 16px 0 0;display:flex;align-items:center;gap:14px;position:relative">
      <button onclick="document.getElementById('courseDetailModal').style.display='none';window._openGroupId=null" style="position:absolute;top:12px;left:12px;background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>
      <div style="width:56px;height:56px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${icon}</div>
      <div>
        <div style="color:white;font-weight:700;font-size:17px;font-family:Amiri,serif">${item.name}</div>
        <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px">${item.desc || ''}</div>
      </div>
    </div>
    <div style="padding:18px">
      ${isAdmin() ? `
        <button onclick="openAddLibModal('${kind}','${groupId}')" class="btn-add-lib" style="margin-bottom:16px">
          <i class="ti ti-plus"></i> ${cfg.addContentLabel}
        </button>` : ''}
      ${matsHTML}
      ${isAdmin() ? `
        <button onclick="confirmDeleteGroup('${groupId}','${item.name.replace(/'/g,"\\'")}','${kind}')" style="margin-top:16px;width:100%;padding:8px;border:1px solid #c0392b;background:transparent;color:#c0392b;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer">
          <i class="ti ti-trash"></i> ${cfg.deleteLabel}
        </button>` : ''}
    </div>`;

  if (!keepOpenSilent) document.getElementById('courseDetailModal').style.display = 'flex';
};

window.confirmDeleteGroup = async (groupId, name, kind = 'courses') => {
  const cfg = GROUP_CONFIG[kind];
  if (!confirm(cfg.deleteConfirm(name))) return;
  try {
    const mats = allLibMats.filter(m => m[cfg.matsField] === groupId);
    for (const m of mats) {
      await deleteAssignmentsForMaterial(m.id);
      await deleteDoc(doc(db, 'libraryMaterials', m.id));
    }
    await deleteDoc(doc(db, cfg.collection, groupId));
    document.getElementById('courseDetailModal').style.display = 'none';
    window._openGroupId = null;
  } catch (e) {
    alert('حدث خطأ أثناء الحذف: ' + e.message);
  }
};

// ══ Add Content ══
window.submitAddLib = async () => {
  const section = document.getElementById('addLibSection').value;
  const title   = document.getElementById('addLibTitle').value.trim();
  const type    = document.getElementById('addLibType').value;
  const url     = document.getElementById('addLibUrl').value.trim();
  const notes   = document.getElementById('addLibNotes').value.trim();
  const err     = document.getElementById('addLibErr');
  const btn     = document.getElementById('addLibSubmit');

  if (!title || !url) { err.style.display='block'; err.textContent='العنوان والرابط مطلوبان'; return; }
  if (section === 'mateen-lib' && !document.getElementById('addLibSubject').value) {
    err.style.display='block'; err.textContent='اختاري المادة'; return;
  }
  err.style.display = 'none';
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> جاري الإضافة...';

  // رقم المحاضرة (لو الحقل ظاهر)
  let lectureNumber = null;
  const lecSel = document.getElementById('addLibLecture');
  if (lecSel && document.getElementById('libLectureWrap').style.display !== 'none') {
    if (lecSel.value === '__new__') {
      const n = parseInt(document.getElementById('libLectureNumInput')?.value, 10);
      lectureNumber = isNaN(n) ? null : n;
    } else if (lecSel.value) {
      lectureNumber = parseInt(lecSel.value, 10);
    }
  }

  try {
    if (section === 'mateen-lib') {
      await addDoc(collection(db, 'libraryMaterials'), {
        title, type, url, notes,
        course: document.getElementById('addLibSubject').value,
        ...(lectureNumber != null ? { lectureNumber } : {}),
        addedAt: Date.now(),
      });
    } else if (GROUP_CONFIG[section]) {
      const groupId = document.getElementById('addLibCourseId').value;
      const field = GROUP_CONFIG[section].matsField;
      await addDoc(collection(db, 'libraryMaterials'), {
        title, type, url, notes, [field]: groupId,
        ...(lectureNumber != null ? { lectureNumber } : {}),
        addedAt: Date.now(),
      });
    } else {
      await addDoc(collection(db, 'libraryItems'), { title, type, url, notes, section, addedAt: Date.now() });
    }
    document.getElementById('addLibModal').style.display = 'none';
  } catch(e) {
    err.style.display = 'block'; err.textContent = 'خطأ: ' + e.message;
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-plus"></i> إضافة';
};

// ══ Edit ══
const editCache = {};
window.openEditLib = async (id, section) => {
  let item = [...allLibMats, ...(allLibExtra.enrichment||[]), ...(allLibExtra.podcast||[])].find(m => m.id === id);
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
    const colName = (editCache.section === 'mateen-lib' || GROUP_CONFIG[editCache.section]) ? 'libraryMaterials' : 'libraryItems';
    await updateDoc(doc(db, colName, id), { title, type, url, notes });
    document.getElementById('editLibModal').style.display = 'none';
  } catch(e) {
    err.style.display = 'block'; err.textContent = 'خطأ: ' + e.message;
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ';
};

// ══ Delete ══
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
  const col = (deleteCache.section === 'mateen-lib' || GROUP_CONFIG[deleteCache.section]) ? 'libraryMaterials' : 'libraryItems';
  const btn = document.getElementById('deleteLibConfirm');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i>';
  try {
    await deleteAssignmentsForMaterial(id);
    await deleteDoc(doc(db, col, id));
    document.getElementById('deleteLibModal').style.display = 'none';
  } catch(e) { alert('خطأ في الحذف: ' + e.message); }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-trash"></i> حذف';
};
