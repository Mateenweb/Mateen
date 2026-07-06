
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc,
         onSnapshot, query, orderBy, where, getDoc, updateDoc, getDocs, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";
import { exportWord, exportPdf, exportAttendanceWord, exportAttendancePdf } from "./export.js";
import { fullDeleteUser } from "./delete-account.js";
import { loadSubjectsFor } from "./subjects.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);
let allMats = [];
let currentUserRole = null;
let _baAllSubjects = []; // كل المواد — تستخدم كـ fallback لو اليوم مش موجود في الجدول
// جدول مواد كل يوم — نفس الجدول المستخدم في مودال الطالبة (student.js) بالضبط
const BA_DAY_SUBJECTS = {
  'الأحد':    ['الفقه', 'التفسير', 'مقرأة متين'],
  'الاثنين':  ['التفسير', 'الفقه', 'مقرأة متين'],
  'الثلاثاء': ['العقيدة', 'الحديث', 'مقرأة متين'],
  'الأربعاء': ['الفقه', 'الحديث', 'مقرأة متين'],
  'الخميس':   ['التفسير', 'العقيدة', 'مقرأة متين'],
};
function baSubjectsForCurrentDay() {
  const day = document.getElementById('baDay')?.value || '';
  return BA_DAY_SUBJECTS[day] || _baAllSubjects;
}

// ── AUTH GUARD ────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  currentUserRole = role;
  if (role !== 'admin') {
    window.location.href = '../html/home.html'; return;
  }
  document.getElementById('navUserName').textContent  = user.displayName || 'الإدارة';
  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').classList.remove('main-content-hidden');

  if (role === 'admin' || role === 'supervisor') {
    document.getElementById('pendingSection').style.display = 'block';
    loadPendingAccounts();
    loadAllUsers();
    document.getElementById('allUsersSection').style.display = 'block';
    document.getElementById('deletionRequestsSection').style.display = 'block';
    loadDeletionRequests();
  }
  if (role !== 'admin') {
    document.getElementById('studentsSection').style.display = 'none';
  }
  // الأدمن لا يشوف قسم فحص الموقع
  const testerEl = document.getElementById('siteTesterSection');
  if (testerEl) testerEl.style.display = 'none';
  loadMats();
  loadSubjectOptions();
  // loadTeachers تتشتغل بس لما تاب المعلمات يتفتح
});


// ── عرض الأرشيف ────────────────────────────────────────
window.showArchive = async () => {
  const snap = await getDocs(query(
    collection(db, 'students'),
    where('archived', '==', true),
    orderBy('archivedAt', 'desc')
  ));

  if (snap.empty) {
    alert('لا توجد طالبات في الأرشيف');
    return;
  }

  const rows = snap.docs.map(d => {
    const s = { id: d.id, ...d.data() };
    const arDate = s.archivedAt ? new Date(s.archivedAt.seconds*1000).toLocaleDateString('ar-EG') : '—';
    return `<tr>
      <td style="font-weight:600">${esc(s.name||'—')}</td>
      <td style="font-size:12px;color:var(--text-mid)">${arDate}</td>
      <td>
        <button onclick="restoreStudent('${s.id}')"
          style="background:var(--green-dark);color:#e8c96a;border:none;border-radius:6px;padding:5px 12px;font-family:inherit;cursor:pointer;font-size:12px">
          <i class="ti ti-restore"></i> استعادة
        </button>
        <button onclick="stuDeletePermanent('${s.id}')"
          style="background:#fff0f0;color:#c0392b;border:1px solid #f5c6c6;border-radius:6px;padding:5px 12px;font-family:inherit;cursor:pointer;font-size:12px;margin-right:6px">
          <i class="ti ti-trash"></i> حذف نهائي
        </button>
      </td>
    </tr>`;
  }).join('');

  const archiveModal = document.getElementById('archiveModal');
  document.getElementById('archiveBody').innerHTML = rows;
  archiveModal.style.display = 'flex';
};

window.restoreStudent = async id => {
  await updateDoc(doc(db, 'students', id), { archived: false, archivedAt: null });
  showToast('✅ تمت استعادة الطالبة');
  document.getElementById('archiveModal').style.display = 'none';
};

window.closeArchiveModal = () => {
  document.getElementById('archiveModal').style.display = 'none';
};
window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

// ── ADD ───────────────────────────────────────────────
window.doAdd = async () => {
  hideErr();
  const url    = document.getElementById('fUrl').value.trim();
  const course = document.getElementById('fCourse').value;
  const title  = document.getElementById('fTitle').value.trim();
  if (!url)    { showErr('يرجى إدخال رابط الملف'); return; }
  if (!url.startsWith('http')) { showErr('الرابط يجب أن يبدأ بـ https://'); return; }
  if (!course) { showErr('يرجى اختيار المادة'); return; }
  if (!title)  { showErr('يرجى إدخال عنوان المادة'); return; }

  const btn = document.getElementById('addBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader spin"></i> جارٍ الحفظ...';

  try {
    await addDoc(collection(db, 'materials'), {
      url, course, title,
      type:     document.getElementById('fType').value,
      notes:    document.getElementById('fNotes').value.trim(),
      linkType: detectType(url),
      addedAt:  Date.now(),
      addedBy:  auth.currentUser.email,
    });
    showToast('✓ تمت إضافة المادة بنجاح');
    ['fUrl','fTitle','fNotes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fCourse').value = '';
  } catch(e) { showErr('خطأ: ' + e.message); }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-circle-plus"></i> إضافة المادة';
};

// ── LOAD ──────────────────────────────────────────────
// تتنادى لما تاب المعلمات يتفتح (مرة واحدة بس)
let _teachersLoaded = false;
window.loadTeachersTab = function() {
  if (_teachersLoaded) return;
  _teachersLoaded = true;
  loadTeachers();
};

function loadTeachers() {
  const SUBJECT_AR = {
    tafseer: 'التفسير', fiqh: 'الفقه', aqeedah: 'العقيدة',
    hadith: 'الحديث', hadeeth: 'الحديث', quran: 'مقرأة متين',
    quran1: 'مقرأة متين (١)', quran2: 'مقرأة متين (٢)'
  };
  const SUBJECT_PAGE = {
    tafseer: 'teacher-tafseer.html', fiqh: 'teacher-fiqh.html',
    aqeedah: 'teacher-aqeedah.html', hadith: 'teacher-hadeeth.html',
    hadeeth: 'teacher-hadeeth.html', quran: 'teacher-quran1.html',
    quran1: 'teacher-quran1.html', quran2: 'teacher-quran2.html'
  };

  getDocs(query(collection(db, 'users'), where('role', '==', 'teacher'))).then(snap => {
    const grid = document.getElementById('teachersList');
    if (!grid) return;
    if (snap.empty) { grid.innerHTML = '<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:20px;grid-column:1/-1">لا توجد معلمات مسجلات</div>'; return; }

    grid.innerHTML = snap.docs.map(d => {
      const t = d.data();
      const subjectAr = SUBJECT_AR[t.subject] || t.subject || '—';
      const page = SUBJECT_PAGE[t.subject];
      return `
        <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px;">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--green-dark);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📚</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:var(--text-dark);margin-bottom:2px">${t.name || '—'}</div>
            <div style="font-size:12px;color:var(--text-mid);margin-bottom:4px">${t.email || ''}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <span style="font-size:11px;background:rgba(45,110,69,0.1);color:var(--green-dark);border-radius:20px;padding:2px 10px;border:1px solid rgba(45,110,69,0.2)">${subjectAr}</span>
              <span style="font-size:11px;background:${t.status==='active'?'rgba(39,174,96,0.1)':'rgba(230,126,34,0.1)'};color:${t.status==='active'?'#1e8449':'#a04000'};border-radius:20px;padding:2px 10px;">${t.status==='active'?'نشطة':'موقوفة'}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
            ${page ? `<a href="${page}" style="color:var(--green-dark);font-size:20px;" title="صفحة المعلمة"><i class="ti ti-external-link"></i></a>` : ''}
            <a href="messages.html?uid=${d.id}" style="color:var(--gold);font-size:20px;" title="رسائلها"><i class="ti ti-message-circle"></i></a>
          </div>
        </div>`;
    }).join('');
  }).catch(e => console.error('loadTeachers:', e));
}

// ── تحميل المواد من Firestore وملء كل الـ selects ──────────────────
const DEFAULT_SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];

async function loadSubjectOptions() {
  try {
    // ملحوظة: courses.html بيحفظ تاريخ الإضافة في addedAt، مش createdAt — orderBy('createdAt')
    // كان بيستبعد أي مادة اتضافت من هناك بالكامل. بنجيب الكل من غير استبعاد ونرتب يدويًا.
    let snap = await getDocs(collection(db, 'subjects'));

    // لو الـ collection فاضية تمامًا — seed المواد الافتراضية
    if (snap.empty) {
      for (const name of DEFAULT_SUBJECTS) {
        await addDoc(collection(db, 'subjects'), { name, createdAt: serverTimestamp() });
      }
      snap = await getDocs(collection(db, 'subjects'));
    }

    const toMillis = v => v?.toMillis?.() ?? 0;
    const subjects = snap.docs
      .map(d => d.data())
      .sort((a, b) => (toMillis(a.addedAt) || toMillis(a.createdAt)) - (toMillis(b.addedAt) || toMillis(b.createdAt)))
      .map(d => d.name)
      .filter(Boolean);

    // ملء fCourse
    const fCourse = document.getElementById('fCourse');
    if (fCourse) {
      fCourse.innerHTML = '<option value="">اختاري المادة</option>' +
        subjects.map(s => `<option>${s}</option>`).join('');
    }

    // ملء filterCourse
    const filterCourse = document.getElementById('filterCourse');
    if (filterCourse) {
      filterCourse.innerHTML = '<option value="">كل المواد</option>' +
        subjects.map(s => `<option>${s}</option>`).join('');
    }

    // ملء bgSubject
    const bgSubject = document.getElementById('bgSubject');
    if (bgSubject) {
      bgSubject.innerHTML = '<option value="">— اختياري —</option>' +
        subjects.map(s => `<option>${s}</option>`).join('');
    }

    // ملء baSubject
    const baSubject = document.getElementById('baSubject');
    if (baSubject) {
      baSubject.innerHTML = '<option value="">— اختاري —</option><option value="__ALL__">📅 كل مواد اليوم</option>' +
        subjects.map(s => `<option>${s}</option>`).join('');
    }
    _baAllSubjects = subjects;

  } catch(e) {
    console.error('loadSubjectOptions:', e);
  }
}

function loadMats() {
  onSnapshot(query(collection(db, 'materials'), orderBy('addedAt','desc')), snap => {
    allMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMats();
    updateStats();
  });
}

window.renderMats = () => {
  const q  = document.getElementById('searchQ').value.toLowerCase();
  const fc = document.getElementById('filterCourse').value;
  const ft = document.getElementById('filterType').value;
  const list = allMats.filter(m =>
    (!q  || m.title.toLowerCase().includes(q) || (m.course||'').includes(q)) &&
    (!fc || m.course === fc) && (!ft || m.type === ft)
  );
  const c = document.getElementById('matsContainer');
  if (!list.length) { c.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد نتائج</div>'; return; }
  c.innerHTML = `
  <table class="mat-table">
    <thead><tr><th>المادة</th><th>المسار</th><th>النوع</th><th>المصدر</th><th>التاريخ</th><th></th></tr></thead>
    <tbody>${list.map(m=>`
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div class="type-icon ${icClass(m.linkType)}">${icHtml(m.linkType)}</div>
        <div>
          <div style="font-weight:500">${esc(m.title)}</div>
          ${m.notes?`<div style="font-size:11px;color:var(--text-mid)">${esc(m.notes)}</div>`:''}
        </div></div></td>
      <td><span class="badge badge-green">${esc(m.course)}</span></td>
      <td><span class="badge badge-gray">${esc(m.type)}</span></td>
      <td style="font-size:12px;color:var(--text-mid)">${srcName(m.url)}</td>
      <td style="font-size:12px;color:var(--text-mid);white-space:nowrap">${fmtDate(m.addedAt)}</td>
      <td><div style="display:flex;gap:2px">
        <a href="${esc(m.url)}" target="_blank" class="btn-icon btn-open" title="فتح"><i class="ti ti-external-link"></i></a>
        <button class="btn-icon btn-del" title="حذف" onclick="delMat('${m.id}')"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table>`;
};

function updateStats() {
  document.getElementById('sTotal').textContent = allMats.length;
  document.getElementById('sMah').textContent   = allMats.filter(m=>m.type==='محاضرة').length;
  document.getElementById('sVid').textContent   = allMats.filter(m=>m.type==='فيديو'||m.linkType==='youtube').length;
  document.getElementById('sOth').textContent   = allMats.filter(m=>m.type!=='محاضرة'&&m.type!=='فيديو'&&m.linkType!=='youtube').length;
}

window.delMat = async id => {
  if (!confirm('هل تريدين حذف هذه المادة نهائياً؟')) return;
  await deleteDoc(doc(db, 'materials', id));
  showToast('تم الحذف');
};

// ── HELPERS ───────────────────────────────────────────
function detectType(url) {
  if (url.includes('youtube.com')||url.includes('youtu.be')) return 'youtube';
  if (url.includes('drive.google.com'))  return 'drive';
  if (url.includes('dropbox.com'))       return 'dropbox';
  if (url.match(/\.pdf$/i))              return 'pdf';
  if (url.match(/\.(mp4|mov)$/i))        return 'video';
  return 'link';
}
function srcName(url='') {
  if (url.includes('youtube.com')||url.includes('youtu.be')) return 'YouTube';
  if (url.includes('drive.google.com'))  return 'Google Drive';
  if (url.includes('dropbox.com'))       return 'Dropbox';
  if (url.includes('onedrive'))          return 'OneDrive';
  try { return new URL(url).hostname.replace('www.',''); } catch { return 'رابط'; }
}
function icClass(t){ return {youtube:'ic-yt',drive:'ic-drive',pdf:'ic-pdf',video:'ic-video'}[t]||'ic-link'; }
function icHtml(t){ return {youtube:'<i class="ti ti-brand-youtube"></i>',drive:'<i class="ti ti-brand-google-drive"></i>',pdf:'<i class="ti ti-file-type-pdf"></i>',video:'<i class="ti ti-video"></i>'}[t]||'<i class="ti ti-link"></i>'; }
function fmtDate(ts){ if(!ts)return'—'; return new Date(ts).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); }
function esc(s){ return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// ══════════════════════════════════════
//  الحسابات المعلقة (admin only)
// ══════════════════════════════════════

const ROLE_LABELS = {
  student:    '🤝 أصدقاء متين',
  mateen:     '📖 بنات متين',
  teacher:    '🧕‍🏫 معلمة',
  supervisor: '🛡️ مشرفة',
  admin:      '👑 إدارة',
};

function loadPendingAccounts() {
  // Admin يشوف كل الحسابات المعلقة (معWhenت + not/don'tرفات + طالبات متين)
  onSnapshot(
    query(collection(db, 'users'), orderBy('createdAt', 'desc')),
    snap => {
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.status === 'pending');
      renderPending(pending);
    }
  );
}

function renderPending(list) {
  const badge = document.getElementById('pendingBadge');
  const cont  = document.getElementById('pendingContainer');

  if (!list.length) {
    badge.style.display = 'none';
    cont.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد حسابات معلقة</div>';
    return;
  }

  badge.style.display = 'inline';
  badge.textContent   = list.length;

  // فصل: طالبات متين (موافقة not/don'tرفة)  and the باقي (موافقة أدمن)
  const mateen = list.filter(u => u.role === 'mateen');
  const others = list.filter(u => u.role !== 'mateen');

  const tableHTML = (rows) => `<div style="overflow-x:auto">
    <table class="pending-table">
      <thead><tr>
        <th>الاسم</th><th>الصفة</th><th>العمر</th><th>السنة</th>
        <th>الجوال</th><th>البريد الإلكتروني</th><th>تاريخ التسجيل</th><th></th>
      </tr></thead>
      <tbody>${rows.map(u => `
        <tr>
          <td style="font-weight:600">${esc(u.name||'—')}</td>
          <td><span style="font-size:12px;background:var(--beige2);padding:2px 8px;border-radius:4px">${ROLE_LABELS[u.role]||u.role}</span></td>
          <td>${u.age||'—'}</td>
          <td>${esc(u.year||'—')}</td>
          <td dir="ltr">${esc(u.phone||'—')}</td>
          <td dir="ltr" style="font-size:12px">${esc(u.email||'—')}</td>
          <td style="font-size:12px;color:var(--text-mid)">${u.createdAt ? new Date(u.createdAt.seconds*1000).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}) : '—'}</td>
          <td><div style="display:flex;gap:6px">
            <button class="btn-approve" onclick="approveUser('${u.id}')"><i class="ti ti-check"></i> قبول</button>
            <button class="btn-reject"  onclick="rejectUser('${u.id}')"><i class="ti ti-x"></i> رفض</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  let html = '';
  if (mateen.length) {
    html += `<div style="padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--text-mid);border-bottom:1px solid var(--border)">
      📖 طالبات متين — تحتاج موافقة المشرفة (${mateen.length})
    </div>${tableHTML(mateen)}`;
  }
  if (others.length) {
    html += `<div style="padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--text-mid);border-top:${mateen.length?'2px':'0'} solid var(--border)">
      🛡️ معلمات ومشرفات — تحتاج موافقة الأدمن (${others.length})
    </div>${tableHTML(others)}`;
  }
  cont.innerHTML = html;
}

// ── Modal الربط ───────────────────────────────────────────
let _pendingApproveId   = null;   // uid Userة المنتظرة للموافقة
window._selectedLinkId  = null;   // id Student (f) المختارة in the Schedule/Table

window.approveUser = async id => {
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return;
  const userData = snap.data();
  const role = userData.role || '';
  const name = userData.name || 'مستخدم';

  // غير بنات متين → قبول مباشر بدون Modal
  if (role !== 'mateen') {
    if (!confirm(`قبول حساب "${name}"؟`)) return;
    await updateDoc(doc(db, 'users', id), { status: 'active' });
    showToast('✓ تم قبول الحساب');
    return;
  }

  // بنات متين → افتح Modal الربط
  _pendingApproveId      = id;
  window._selectedLinkId = null;

  document.getElementById('linkModalSubtitle').textContent =
    'اختاري طالبة لربطها بحساب: ' + name;

  document.getElementById('linkSearch').value = '';
  renderLinkList(allStudents.filter(s => !s.archived));

  const modal = document.getElementById('linkModal');
  modal.classList.add('show');
};

window.closeLinkModal = () => {
  document.getElementById('linkModal').classList.remove('show');
  _pendingApproveId = null;
  window._selectedLinkId = null;
};

window.filterLinkList = () => {
  const q = document.getElementById('linkSearch').value.trim().toLowerCase();
  const base = allStudents.filter(s => !s.archived);
  renderLinkList(q ? base.filter(s => (s.name||'').toLowerCase().includes(q)) : base);
};

function renderLinkList(list) {
  const el = document.getElementById('linkStudentList');
  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;color:#aaa;padding:28px;font-family:Noto Naskh Arabic,serif">لا توجد نتائج</div>';
    return;
  }
  el.innerHTML = list.map(s => {
    const linked    = s.uid ? `<span style="font-size:11px;background:#d8f3dc;color:#1a4a2e;padding:2px 8px;border-radius:10px;margin-right:6px">مرتبطة ✓</span>` : '';
    const dayTime   = [s.day, s.hour ? s.hour + ' ' + (s.ampm||'') : ''].filter(Boolean).join(' — ');
    return `<div id="linkItem_${s.id}"
      onclick="selectLinkStudent('${s.id}')"
      style="display:flex;align-items:center;gap:12px;padding:11px 18px;cursor:pointer;border-bottom:1px solid #f5f0e8;transition:background .15s">
      <div style="width:38px;height:38px;border-radius:50%;background:#e9f5db;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#1a4a2e;font-family:'Noto Naskh Arabic',serif;flex-shrink:0">
        ${(s.name||'؟')[0]}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-family:'Noto Naskh Arabic',serif;font-weight:600;font-size:14px;color:#1a4a2e">${s.name||'—'}${linked}</div>
        <div style="font-size:12px;color:#999;font-family:'Noto Naskh Arabic',serif">${dayTime||'لم يحدد موعد'}</div>
      </div>
      <div id="linkCheck_${s.id}" style="width:22px;height:22px;border-radius:50%;border:2px solid #d4c9a8;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s"></div>
    </div>`;
  }).join('');
}

window.selectLinkStudent = id => {
  // أزل تحthisد القthisم
  if (window._selectedLinkId) {
    const prev = document.getElementById('linkItem_' + window._selectedLinkId);
    const prevCheck = document.getElementById('linkCheck_' + window._selectedLinkId);
    if (prev)      prev.style.background = '';
    if (prevCheck) { prevCheck.style.background = ''; prevCheck.style.borderColor = '#d4c9a8'; prevCheck.innerHTML = ''; }
  }
  window._selectedLinkId = id;
  const item  = document.getElementById('linkItem_' + id);
  const check = document.getElementById('linkCheck_' + id);
  if (item)  item.style.background  = '#f0faf3';
  if (check) { check.style.background = '#1a4a2e'; check.style.borderColor = '#1a4a2e'; check.innerHTML = '<i class="ti ti-check" style="font-size:12px;color:#fff"></i>'; }

  const btn = document.getElementById('linkConfirmBtn');
  btn.disabled = false;
  btn.style.opacity = '1';
};

// كل Academic subjects — تتسجل فيها بنت متين أوتوماتيك بعد القبول (Dynamic من Firestore)

window.confirmLinkModal = async (studentId) => {
  if (!_pendingApproveId) return;
  const uid = _pendingApproveId;

  // أغلق Modal أولاً
  document.getElementById('linkModal').classList.remove('show');
  _pendingApproveId = null;
  window._selectedLinkId = null;

  // فعّل الحساب + التحاق تلقائي بكل Academic subjects
  await updateDoc(doc(db, 'users', uid), {
    status: 'active',
    enrolledSubjects: await loadSubjectsFor('inEnrollment'),
    ...(studentId ? { linkedStudentId: studentId } : {})
  });

  // If في ربط، حفظ uid في سجل Student (f) in the Schedule/Table
  if (studentId) {
    await updateDoc(doc(db, 'students', studentId), { uid });
    showToast('✓ تم قبول الحساب، وربطه بالطالبة، والتحاقها بكل المواد');
  } else {
    showToast('✓ تم قبول الحساب والتحاقها بكل المواد');
  }
};

window.rejectUser = async id => {
  if (!confirm('هل تريدين رفض هذا الحساب وحذفه نهائياً؟')) return;
  await fullDeleteUser(id);
  showToast('تم رفض الحساب وحذفه');
};

// ══════════════════════════════════════
//  قاعدة بيانات Studentات  and the مقابلات
// ══════════════════════════════════════

let allStudents = [];
let stuSortAlpha = false;
const stuDateParts = {};

const MONTHS_HIJRI = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const MONTHS_AR    = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const YEARS_HIJRI  = Array.from({length:11},(_,i)=>1442+i);

function hijriToGregorian(hd,hm,hy) {
  hd=parseInt(hd); hm=parseInt(hm); hy=parseInt(hy);
  if(!hd||!hm||!hy) return null;
  const jdn = Math.floor((11*hy+3)/30)+354*hy+30*hm-Math.floor((hm-1)/2)+hd+1948440-385;
  let l=jdn+68569;
  const n=Math.floor((4*l)/146097);
  l=l-Math.floor((146097*n+3)/4);
  const ii=Math.floor((4000*(l+1))/1461001);
  l=l-Math.floor((1461*ii)/4)+31;
  const j=Math.floor((80*l)/2447);
  const day=l-Math.floor((2447*j)/80);
  l=Math.floor(j/11);
  const month=j+2-12*l;
  const year=100*(n-49)+ii+l;
  return {d:String(day).padStart(2,'0'),m:String(month).padStart(2,'0'),y:String(year)};
}

function parseDateParts(s){if(!s)return{d:'',m:'',y:''};const[d,m,y]=s.split('-');return{d:d||'',m:m||'',y:y||''};}

function makeDatePicker(sid, dateStr) {
  const {d,m,y}=parseDateParts(dateStr||'');
  const days=Array.from({length:30},(_,i)=>i+1);
  const dayOpts=days.map(n=>{const v=String(n).padStart(2,'0');return`<option value="${v}"${d===v?' selected':''}>${n}</option>`;}).join('');
  const monthOpts=MONTHS_HIJRI.map((mn,i)=>{const v=String(i+1).padStart(2,'0');return`<option value="${v}"${m===v?' selected':''}>${mn}</option>`;}).join('');
  const yearOpts=YEARS_HIJRI.map(yr=>`<option value="${yr}"${y===String(yr)?' selected':''}>${yr}</option>`).join('');
  return `<div class="arabic-date">
    <select class="date-day-sel" onchange="stuUpdateDatePart('${sid}','hd',this.value)"><option value="">يوم</option>${dayOpts}</select>
    <select class="date-month-sel" onchange="stuUpdateDatePart('${sid}','hm',this.value)"><option value="">شهر</option>${monthOpts}</select>
    <select class="date-year-sel" onchange="stuUpdateDatePart('${sid}','hy',this.value)"><option value="">سنة</option>${yearOpts}</select>
  </div>`;
}

const stuQuery = query(collection(db,'students'), orderBy('order'));
onSnapshot(stuQuery, snap => {
  allStudents = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderStudents(allStudents);
  updateStuStats(allStudents);
});

function updateStuStats(list) {
  document.getElementById('stuTotal').textContent    = list.length;
  document.getElementById('stuDone').textContent     = list.filter(s=>s.interview==='done').length;
  document.getElementById('stuPending').textContent  = list.filter(s=>s.interview==='pending').length;
  document.getElementById('stuAccepted').textContent = list.filter(s=>s.accepted==='accepted').length;
  document.getElementById('stuRejected').textContent = list.filter(s=>s.accepted==='rejected').length;
}

window.applyStudentFilters = () => {
  const q  = (document.getElementById('stuSearch').value||'').toLowerCase();
  const fi = document.getElementById('stuFilterInterview').value;
  const fr = document.getElementById('stuFilterResult').value;
  const fs = document.getElementById('stuFilterStatus').value;
  let filtered = allStudents.filter(s=>
    (!q  || (s.name||'').toLowerCase().includes(q)) &&
    (fi==='all' || s.interview===fi) &&
    (fr==='all' || s.accepted===fr) &&
    (fs==='all' || s.status===fs)
  );
  if (stuSortAlpha) {
    filtered = [...filtered].sort((a,b) => (a.name||'').localeCompare(b.name||'', 'ar'));
  }
  renderStudents(filtered);
};

window.toggleAlphaSort = () => {
  stuSortAlpha = !stuSortAlpha;
  const btn = document.getElementById('sortAlphaBtn');
  if (btn) btn.classList.toggle('active', stuSortAlpha);
  window.applyStudentFilters();
};

window.openExportModal = () => {
  const m = document.getElementById('exportModal');
  if (m) { m.classList.add('show'); }
  renderExportStudentList();
};

function renderExportStudentList() {
  const list = document.getElementById('exportStudentList');
  if (!list) return;

  const q  = (document.getElementById('stuSearch')?.value||'').toLowerCase();
  const fi = document.getElementById('stuFilterInterview')?.value || 'all';
  const fr = document.getElementById('stuFilterResult')?.value || 'all';
  const fs = document.getElementById('stuFilterStatus')?.value || 'all';

  const students = allStudents.filter(s =>
    !s.archived && s.name && s.name !== 'طالبة جديدة' &&
    (!q  || (s.name||'').toLowerCase().includes(q)) &&
    (fi==='all' || s.interview===fi) &&
    (fr==='all' || s.accepted===fr) &&
    (fs==='all' || s.status===fs)
  );

  if (!students.length) {
    list.innerHTML = '<div class="stu-empty" style="padding:14px;text-align:center;color:var(--text-mid);font-size:13px">لا توجد طالبات مطابقة</div>';
    return;
  }

  list.innerHTML = students.map(s => `
    <label class="att-stu-label">
      <input type="checkbox" class="export-check" data-id="${s.id}" checked/>
      <span>${esc(s.name||'—')}</span>
    </label>
  `).join('');
}

window.exportSelectAll = (checked) => {
  document.querySelectorAll('.export-check').forEach(cb => cb.checked = checked);
};

window.closeExportModal = () => {
  const m = document.getElementById('exportModal');
  if (m) { m.classList.remove('show'); }
};

// ── Modal تصدير الحضور والغياب ──────────────────────────────
window.openAttModal = () => {
  const m = document.getElementById('attModal');
  if (m) { m.classList.add('show'); }
  renderAttStudentList();
};

function renderAttStudentList() {
  const list = document.getElementById('attStudentList');
  if (!list) return;
  const students = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived);
  if (!students.length) {
    list.innerHTML = '<div class="stu-empty" style="padding:14px;text-align:center;color:var(--text-mid);font-size:13px">لا توجد طالبات</div>';
    return;
  }
  list.innerHTML = students.map(s => `
    <label class="att-stu-label">
      <input type="checkbox" class="att-check" data-id="${s.id}" data-name="${esc(s.name||'')}" checked/>
      <span>${esc(s.name||'—')}</span>
    </label>
  `).join('');
}

window.closeAttModal = () => {
  const m = document.getElementById('attModal');
  if (m) { m.classList.remove('show'); }
};

window.attSelectAll = (checked) => {
  document.querySelectorAll('#attStudentList input[type="checkbox"]').forEach(cb => cb.checked = checked);
};

window.doAttExport = async (type) => {
  const mode = document.getElementById('attMode')?.value || 'perStudent';
  const checked = [...document.querySelectorAll('.att-check:checked')];

  if (!checked.length) { showToast('اختاري طالبة واحدة على الأقل'); return; }

  // مهم لآيفون/سفاري: لازم نفتح النافذة فورًا جوه حدث الضغطة (قبل أي await)
  // عشان المتصفح يعتبرها فتحت بأمر المستخدم مباشرة، مش نافذة منبثقة (popup) اتحجب.
  let preOpenedWin = null;
  if (type === 'pdf') {
    preOpenedWin = window.open('', '_blank');
    if (preOpenedWin) {
      preOpenedWin.document.write('<meta charset="UTF-8"><body style="font-family:sans-serif;padding:40px;text-align:center;color:#8a6a52">جارٍ تجهيز الملف...</body>');
    }
  }

  showToast('جارٍ تجهيز التصدير...');

  try {
    const studentsData = await Promise.all(checked.map(async cb => {
      const sid  = cb.dataset.id;
      const name = cb.dataset.name;
      const sessSnap = await getDocs(collection(db, 'students', sid, 'sessions'));
      const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { name, sessions };
    }));

    if (type === 'word') {
      await exportAttendanceWord(studentsData, mode);
    } else {
      if (!preOpenedWin) { showToast('المتصفح منع فتح نافذة الطباعة — فعّلي السماح بالنوافذ المنبثقة وحاولي تاني'); return; }
      await exportAttendancePdf(studentsData, mode, preOpenedWin);
    }

    window.closeAttModal();
  } catch (e) {
    console.error('doAttExport error:', e);
    if (preOpenedWin) preOpenedWin.close();
    showToast('حدث خطأ أثناء التصدير: ' + e.message);
  }
};

window.doExport = async (type) => {
  const checked = [...document.querySelectorAll('.export-check:checked')].map(cb => cb.dataset.id);
  if (!checked.length) { showToast('اختاري طالبة واحدة على الأقل'); return; }

  let data = allStudents.filter(s => checked.includes(s.id));
  if (stuSortAlpha) data = [...data].sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar'));
  if (type === 'word') await exportWord(data);
  else await exportPdf(data);
  window.closeExportModal();
};

function renderStudents(list) {
  // استثناء المؤرشفين من العرض الافتراضي
  list = list.filter(s => !s.archived);
  const tb   = document.getElementById('stuTableBody');
  const isMob = window.innerWidth <= 640;

  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="9" class="empty-state"><i class="ti ti-inbox"></i>لا توجد طالبات</td></tr>`;
    return;
  }

  if (isMob) {
    // ── MOBILE: Card لكل طالبة ──────────────────────────────
    // نخرج من tbody ونdark brown cards في wrapper منفصل
    const wrap = document.getElementById('stu-cards-wrap');
    if (wrap) {
      wrap.innerHTML = list.map((s, i) => {
        const intClass = s.interview === 'done' ? 'btn-done' : 'btn-pending';
        const intLabel = s.interview === 'done' ? '✅ تمت' : '⏳ لم تتم';
        let accClass = 'btn-na', accLabel = '— لم يحدد';
        if (s.accepted === 'accepted') { accClass = 'btn-accepted'; accLabel = '✔️ مقبولة'; }
        if (s.accepted === 'rejected') { accClass = 'btn-rejected'; accLabel = '✖️ مرفوضة'; }

        const statusLabel = s.status === 'mateen' ? '📖 بنات متين' : s.status === 'new' ? '✨ مستجدة' : '';
        const dayTime = [s.day, s.hour ? `${s.hour} ${s.ampm || ''}` : ''].filter(Boolean).join(' — ');
        const dateDisplay = s.dateH ? s.dateH.replace(/-/g, '/') : '';

        return `<div class="stu-mob-card">
          <div class="stu-mob-top">
            <div class="stu-mob-name">
              <a class="btn-stu-link" href="student.html?id=${s.id}">👤</a>
              <input type="text" value="${esc(s.name || '')}"
                oninput="stuAutoName('${s.id}', this.value)"
                class="stu-mob-name-input"/>
            </div>
            <button class="btn-del-stu" onclick="stuDelete('${s.id}')" title="حذف">
              <i class="ti ti-trash"></i>
            </button>
          </div>

          <div class="stu-mob-row">
            <select class="stu-mob-sel" onchange="stuField('${s.id}','status',this.value)">
              <option value=""${!s.status ? ' selected' : ''}>🏷️ التصنيف</option>
              <option value="mateen"${s.status === 'mateen' ? ' selected' : ''}>📖 بنات متين</option>
              <option value="new"${s.status === 'new' ? ' selected' : ''}>✨ مستجدات</option>
            </select>
            ${s.status ? `<span class="stu-mob-badge">${statusLabel}</span>` : ''}
          </div>

          <div class="stu-mob-row">
            <span class="stu-mob-label">📅 اليوم</span>
            <select class="stu-mob-sel" onchange="stuField('${s.id}','day',this.value)">
              <option value="">— اليوم —</option>
              ${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(d => `<option${s.day === d ? ' selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>

          <div class="stu-mob-row">
            <span class="stu-mob-label">📅 التاريخ</span>
            ${makeDatePicker(s.id, s.dateH)}
          </div>

          <div class="stu-mob-row">
            <span class="stu-mob-label">🕐 الوقت</span>
            <select class="stu-mob-sel" onchange="stuField('${s.id}','hour',this.value)" style="width:60px">
              <option value="">—</option>
              ${[1,2,3,4,5,6,7,8,9,10,11,12].map(h => `<option${s.hour == h ? ' selected' : ''}>${h}</option>`).join('')}
            </select>
            <select class="stu-mob-sel" onchange="stuField('${s.id}','ampm',this.value)" style="width:80px">
              <option value="ص"${s.ampm === 'ص' ? ' selected' : ''}>صباحاً</option>
              <option value="م"${s.ampm === 'م' ? ' selected' : ''}>مساءً</option>
            </select>
          </div>

          ${s.status === 'new' ? `<div class="stu-mob-row">
            <span class="stu-mob-label">📊 الدرجة</span>
            <input type="number" min="0" max="100" value="${s.placementScore ?? ''}"
              placeholder="0" class="stu-mob-score"
              onchange="stuField('${s.id}','placementScore',this.value===''?null:Number(this.value))">
            <span style="font-size:12px;color:#999">/ 100</span>
          </div>` : ''}

          <div class="stu-mob-actions">
            <button class="btn-interview ${intClass}" onclick="stuToggleInterview('${s.id}','${s.interview}')">${intLabel}</button>
            <button class="btn-accept ${accClass}" onclick="stuToggleAccept('${s.id}','${s.accepted}','${s.interview}')">${accLabel}</button>
          </div>
        </div>`;
      }).join('');
    }
    tb.innerHTML = '';  // Schedule/Table فاضي on Mobile
    return;
  }

  // ── DESKTOP: Schedule/Table العاthis ────────────────────────────────
  tb.innerHTML = list.map((s, i) => {
    const intClass = s.interview==='done'?'btn-done':'btn-pending';
    const intLabel = s.interview==='done'?'✅ تمت':'⏳ لم تتم';
    let accClass='btn-na', accLabel='— لم يحدد';
    if(s.accepted==='accepted'){accClass='btn-accepted';accLabel='✔️ مقبولة';}
    if(s.accepted==='rejected'){accClass='btn-rejected';accLabel='✖️ مرفوضة';}
    const statusSel = `<select class="status-sel" onchange="stuField('${s.id}','status',this.value)">
      <option value=""${!s.status?' selected':''}>🏷️ التصنيف</option>
      <option value="mateen"${s.status==='mateen'?' selected':''}>📖 بنات متين</option>
      <option value="new"${s.status==='new'?' selected':''}>✨ المستجدات</option>
    </select>`;
    const daySel=`<select class="day-sel" onchange="stuField('${s.id}','day',this.value)">
      <option value="">-اليوم-</option>
      ${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(d=>`<option${s.day===d?' selected':''}>${d}</option>`).join('')}
    </select>`;
    const timeSel=`<div class="time-cell">
      <select class="time-hour" onchange="stuField('${s.id}','hour',this.value)">
        <option value="">-</option>${[1,2,3,4,5,6,7,8,9,10,11,12].map(h=>`<option${s.hour==h?' selected':''}>${h}</option>`).join('')}
      </select>:
      <select class="time-ampm" onchange="stuField('${s.id}','ampm',this.value)">
        <option value="ص"${s.ampm==='ص'?' selected':''}>صباحاً</option>
        <option value="م"${s.ampm==='م'?' selected':''}>مساءً</option>
      </select>
    </div>`;
    const placementCell = s.status === 'new'
      ? `<div class="placement-wrap">
           <input type="number" class="placement-input" min="0" max="100"
             value="${s.placementScore ?? ''}" placeholder="الدرجة"
             onchange="stuField('${s.id}','placementScore',this.value===''?null:Number(this.value))">
           <span class="placement-unit">/ 100</span>
         </div>`
      : `<span style="color:var(--text-mid);font-size:12px">—</span>`;
    return `<tr>
      <td><input type="checkbox" class="row-check" data-id="${s.id}" onchange="onRowCheck()"></td>
      <td style="color:var(--text-mid);font-size:12px">${i+1}</td>
      <td><div class="stu-name-cell">
        <a class="btn-stu-link" href="student.html?id=${s.id}" title="صفحة الطالبة">👤</a>
        <input type="text" value="${esc(s.name||'')}" oninput="stuAutoName('${s.id}',this.value)" style="min-width:100px">
        ${statusSel}
      </div></td>
      <td><div style="display:flex;flex-direction:column;gap:4px">${daySel}${makeDatePicker(s.id,s.dateH)}</div></td>
      <td>${timeSel}</td>
      <td><button class="btn-interview ${intClass}" onclick="stuToggleInterview('${s.id}','${s.interview}')">${intLabel}</button></td>
      <td><button class="btn-accept ${accClass}" onclick="stuToggleAccept('${s.id}','${s.accepted}','${s.interview}')">${accLabel}</button></td>
      <td>${placementCell}</td>
      <td><button class="btn-del-stu" onclick="stuDelete('${s.id}')" title="حذف"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('');
}

const stuDefault = () => ({order:Date.now(), name:'طالبة جديدة', status:'', day:'', dateH:'', dateG:'', hour:'', minute:'00', ampm:'ص', interview:'pending', accepted:'na'});

window.addStudentRow = async () => { await addDoc(collection(db,'students'), stuDefault()); };

window.addBulkNames = async () => {
  const txt = document.getElementById('bulkNames').value;
  if(!txt.trim()) return;
  const names = txt.split('\n').filter(n=>n.trim());
  for(let i=0;i<names.length;i++) await addDoc(collection(db,'students'),{...stuDefault(),order:Date.now()+i,name:names[i].trim()});
  document.getElementById('bulkNames').value='';
  showToast('✓ تمت إضافة الأسماء');
};

window.stuAutoName = async (id,v) => updateDoc(doc(db,'students',id),{name:v});
window.stuField    = async (id,f,v) => updateDoc(doc(db,'students',id),{[f]:v});

window.stuUpdateDatePart = async (id,key,value) => {
  const s = allStudents.find(s=>s.id===id)||{};
  if(!stuDateParts[id]) stuDateParts[id]=parseDateParts(s.dateH||'');
  const pk={hd:'d',hm:'m',hy:'y'}[key];
  if(pk) stuDateParts[id][pk]=value;
  const {d,m,y}=stuDateParts[id];
  const up={dateH:`${d}-${m}-${y}`};
  if(d&&m&&y){const gr=hijriToGregorian(d,m,y);if(gr)up.dateG=`${gr.d}-${gr.m}-${gr.y}`;}
  await updateDoc(doc(db,'students',id),up);
};

window.stuToggleInterview = async (id,cur) => updateDoc(doc(db,'students',id),{interview:cur==='done'?'pending':'done'});

window.stuToggleAccept = async (id,cur,interview) => {
  if(interview!=='done'){showToast('يجب إجراء المقابلة أولاً','err');return;}
  const order=['na','accepted','rejected'];
  await updateDoc(doc(db,'students',id),{accepted:order[(order.indexOf(cur)+1)%3]});
};

window.stuDelete = async id => {
  // أرشفة بدل الحذف النهائي — لحماية البيانات من الحذف الخطأ
  if(!confirm('هل تريدين أرشفة هذه الطالبة؟\nيمكن استعادتها لاحقاً من قسم الأرشيف.')) return;
  await updateDoc(doc(db, 'students', id), { archived: true, archivedAt: serverTimestamp() });
  showToast('✅ تمت الأرشفة — يمكن الاستعادة من الأرشيف');
};

// حذف نهائي (للإدارة العليا فقط — من الأرشيف)
window.stuDeletePermanent = async id => {
  if(!confirm('⚠️ حذف نهائي لا يمكن التراجع عنه!\nهل أنتِ متأكدة؟')) return;
  if(!confirm('تأكيد أخير: سيتم حذف كل بيانات الطالبة نهائياً.')) return;
  await fullDeleteUser(id);
  showToast('تم الحذف النهائي');
};

window.toggleSelectAll = checked => {
  document.querySelectorAll('.row-check').forEach(cb=>{
    cb.checked=checked;
    cb.closest('tr').classList.toggle('selected-row',checked);
  });
  document.getElementById('selectedCount').textContent=(checked?document.querySelectorAll('.row-check').length:0)+' محددة';
};

window.onRowCheck = () => {
  const checked=document.querySelectorAll('.row-check:checked');
  document.getElementById('selectedCount').textContent=checked.length+' محددة';
  document.querySelectorAll('.row-check').forEach(cb=>cb.closest('tr').classList.toggle('selected-row',cb.checked));
};

window.applyBulkDateTime = async () => {
  const checked=document.querySelectorAll('.row-check:checked');
  if(!checked.length){showToast('اختاري طالبات أولاً','err');return;}
  const day=document.getElementById('bulkDay').value;
  const dd=String(document.getElementById('bulkDD').value||'').padStart(2,'0');
  const mm=document.getElementById('bulkMM').value;
  const yy=document.getElementById('bulkYY').value;
  const hour=document.getElementById('bulkHour').value;
  const ampm=document.getElementById('bulkAmpm').value;
  const up={};
  if(day) up.day=day;
  if(dd&&mm&&yy){up.dateH=`${dd}-${mm}-${yy}`;const gr=hijriToGregorian(dd,mm,yy);if(gr)up.dateG=`${gr.d}-${gr.m}-${gr.y}`;}
  if(hour) up.hour=hour;
  if(ampm) up.ampm=ampm;
  if(!Object.keys(up).length){showToast('حددي بيانات للتطبيق','err');return;}
  for(const cb of checked) await updateDoc(doc(db,'students',cb.dataset.id),up);
  showToast(`✓ تم التطبيق على ${checked.length} طالبة`);
  toggleSelectAll(false);
};

// patch showToast to accept error flag
const _origToast = window.showToast ? null : null;

function hideErr(){ document.getElementById('errMsg').classList.remove('show'); }
function showToast(msg,err=false){ const t=document.getElementById('toast'); t.textContent=msg; t.className='toast'+(err?' error':''); t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
function showErr(msg){ showToast(msg, true); }

// ══════════════════════════════════════
//  جميع الحسابات المسجلة (admin only)
// ══════════════════════════════════════

let allUsersData = [];

const STATUS_LABELS = {
  active:    '✅ مفعّل',
  pending:   '⏳ معلق',
  suspended: '🚫 موقوف',
};
const STATUS_COLORS = {
  active:    '#2d6a4f',
  pending:   '#c9a227',
  suspended: '#c0392b',
};
const STATUS_BG = {
  active:    '#d8f3dc',
  pending:   '#fff3cd',
  suspended: '#fde8e8',
};

function loadAllUsers() {
  onSnapshot(
    query(collection(db, 'users'), orderBy('createdAt', 'desc')),
    snap => {
      allUsersData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAllUsers();
      updateUsersStats();

      const badge = document.getElementById('allUsersBadge');
      if (badge) {
        badge.textContent = allUsersData.length;
        badge.style.display = 'inline';
      }
    }
  );
}

function updateUsersStats() {
  const el = id => document.getElementById(id);
  if (!el('uTotal')) return;
  el('uTotal').textContent     = allUsersData.length;
  el('uActive').textContent    = allUsersData.filter(u => u.status === 'active').length;
  el('uPending').textContent   = allUsersData.filter(u => u.status === 'pending').length;
  el('uSuspended').textContent = allUsersData.filter(u => u.status === 'suspended').length;
}

window.renderAllUsers = () => {
  const q   = (document.getElementById('usersSearch')?.value || '').toLowerCase().trim();
  const fr  = document.getElementById('usersFilterRole')?.value   || 'all';
  const fs  = document.getElementById('usersFilterStatus')?.value || 'all';

  const list = allUsersData.filter(u =>
    (fr === 'all' || u.role === fr) &&
    (fs === 'all' || u.status === fs) &&
    (!q  || (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q))
  );

  const tbody = document.getElementById('allUsersBody');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state"><i class="ti ti-user-off"></i> لا توجد نتائج</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((u, i) => {
    const statusLabel = STATUS_LABELS[u.status] || u.status || '—';
    const statusColor = STATUS_COLORS[u.status] || '#888';
    const statusBg    = STATUS_BG[u.status]     || '#f5f5f5';
    const roleLabel   = ROLE_LABELS[u.role]     || u.role || '—';
    const createdAt   = u.createdAt
      ? new Date(u.createdAt.seconds * 1000).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' })
      : '—';

    const toggleBtn = u.status === 'active'
      ? `<button class="btn-reject" style="font-size:11px;padding:4px 10px"
           onclick="suspendUser('${u.id}')">
           <i class="ti ti-ban"></i> إيقاف
         </button>`
      : u.status === 'suspended'
      ? `<button class="btn-approve" style="font-size:11px;padding:4px 10px"
           onclick="reactivateUser('${u.id}')">
           <i class="ti ti-player-play"></i> إعادة تفعيل
         </button>`
      : `<span style="color:var(--text-mid);font-size:12px">—</span>`;

     const actionBtns = `<div style="display:flex;gap:6px;align-items:center;white-space:nowrap">
       ${toggleBtn}
       <button title="حذف"
         onclick="deleteUserAccount('${u.id}','${u.name ? u.name.replace(/'/g,"\\'") : ""}')" 
         style="padding:4px 12px;font-size:12px;background:#fff0f0;color:#c0392b;border:1px solid #f5c6c6;border-radius:6px;cursor:pointer;flex-shrink:0">
         <i class="ti ti-trash"></i> حذف
       </button>
     </div>`;

    // السنة
    const yearCell = u.year
      ? `<span style="font-size:12px;background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:8px">${esc(u.year)}</span>`
      : `<span style="color:var(--text-mid);font-size:12px">—</span>`;

    // الربط
    const linkMap = {};
    allStudents.forEach(s => { if (s.uid) linkMap[s.uid] = { studentId: s.id, name: s.name || '—' }; });
    const linked = linkMap[u.id];
    const linkCell = linked
      ? `<div style="display:flex;align-items:center;gap:5px;white-space:nowrap">
           <span style="font-size:11px;background:#d8f3dc;color:#1a4a2e;padding:2px 8px;border-radius:10px">✅ ${esc(linked.name)}</span>
           <button onclick="adminUnlinkStudent('${u.id}','${linked.studentId}')"
             style="padding:2px 7px;font-size:11px;background:#fff0f0;color:#c0392b;border:1px solid #f5c6c6;border-radius:6px;cursor:pointer">
             <i class="ti ti-unlink"></i>
           </button>
         </div>`
      : u.role === 'mateen'
        ? `<button onclick="adminOpenLinkModal('${u.id}','${(u.name||'').replace(/'/g,"\'")}') "
             style="padding:3px 10px;font-size:11px;background:transparent;color:var(--gold);border:1px solid var(--gold);border-radius:6px;cursor:pointer">
             <i class="ti ti-link"></i> ربط
           </button>`
        : `<span style="color:var(--text-mid);font-size:12px">—</span>`;

    return `<tr>
      <td style="color:var(--text-mid);font-size:12px">${i + 1}</td>

      <!-- الاسم — قابل للتعديل للأدمن فقط -->
      <td><input type="text" value="${esc(u.name || '')}" placeholder="الاسم"
        style="border:none;border-bottom:1px solid var(--border);background:transparent;font-family:inherit;font-size:13px;width:100%;min-width:100px;padding:2px 4px;"
        ${currentUserRole !== 'admin' ? 'readonly disabled style="cursor:not-allowed;opacity:0.7"' : ''}
        onchange="userFieldUpdate('${u.id}','name',this.value)"/></td>

      <!-- الدور -->
      <td><select style="border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px;padding:2px 6px;background:var(--beige);"
          onchange="userFieldUpdate('${u.id}','role',this.value)">
        <option value="mateen"  ${u.role==='mateen'  ?'selected':''}>بنت متين</option>
        <option value="student" ${u.role==='student' ?'selected':''}>طالبة عادية</option>
        <option value="teacher" ${u.role==='teacher' ?'selected':''}>معلمة</option>
        <option value="supervisor" ${u.role==='supervisor'?'selected':''}>مشرفة</option>
        <option value="admin"   ${u.role==='admin'   ?'selected':''}>إدارة</option>
      </select></td>

      <!-- البريد -->
      <td><input type="email" value="${esc(u.email || '')}" dir="ltr" placeholder="البريد"
        style="border:none;border-bottom:1px solid var(--border);background:transparent;font-family:inherit;font-size:12px;width:100%;min-width:130px;padding:2px 4px;color:var(--text-mid);"
        onchange="userFieldUpdate('${u.id}','email',this.value)"/></td>

      <!-- الجوال -->
      <td><input type="text" value="${esc(u.phone || '')}" dir="ltr" placeholder="الجوال"
        style="border:none;border-bottom:1px solid var(--border);background:transparent;font-family:inherit;font-size:12px;width:100%;min-width:90px;padding:2px 4px;"
        onchange="userFieldUpdate('${u.id}','phone',this.value)"/></td>

      <!-- السنة -->
      <td><input type="text" value="${esc(u.year || '')}" placeholder="السنة"
        style="border:none;border-bottom:1px solid var(--border);background:transparent;font-family:inherit;font-size:12px;width:60px;padding:2px 4px;text-align:center;"
        onchange="userFieldUpdate('${u.id}','year',this.value)"/></td>

      <!-- تاريخ التسجيل — للعرض فقط -->
      <td style="font-size:12px;color:var(--text-mid);white-space:nowrap">${createdAt}</td>

      <!-- الحالة -->
      <td><select style="border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:12px;padding:2px 6px;background:${statusBg};color:${statusColor};"
          onchange="userFieldUpdate('${u.id}','status',this.value)">
        <option value="active"    ${u.status==='active'    ?'selected':''}>✅ مفعّلة</option>
        <option value="pending"   ${u.status==='pending'   ?'selected':''}>⏳ معلقة</option>
        <option value="suspended" ${u.status==='suspended' ?'selected':''}>🚫 موقوفة</option>
      </select></td>

      <td>${linkCell}</td>
      <td style="white-space:nowrap;min-width:160px">${actionBtns}</td>
    </tr>`;
  }).join('');
};

window.adminOpenLinkModal = async (userId, userName) => {
  _pendingApproveId = userId;
  window._selectedLinkId = null;
  document.getElementById('linkModalSubtitle').textContent = 'اختاري طالبة لربطها بحساب: ' + userName;
  document.getElementById('linkSearch').value = '';
  renderLinkList(allStudents.filter(s => !s.archived));
  document.getElementById('linkModal').classList.add('show');
};

window.adminUnlinkStudent = async (userId, studentId) => {
  if (!confirm('فك الربط بين هذا الحساب وملف الطالبة؟')) return;
  await updateDoc(doc(db, 'students', studentId), { uid: '' });
  showToast('تم فك الربط');
};

window.suspendUser = async id => {
  if (!confirm('هل تريدين إيقاف هذا الحساب مؤقتاً؟')) return;
  await updateDoc(doc(db, 'users', id), { status: 'suspended' });
  showToast('تم إيقاف الحساب');
};

window.reactivateUser = async id => {
  await updateDoc(doc(db, 'users', id), { status: 'active' });
  showToast('✓ تم إعادة تفعيل الحساب');
};

window.deleteUserAccount = async (id, name) => {
  const label = name || 'هذا المستخدم';
  if (!confirm(`هل أنتِ متأكدة من حذف حساب "${label}" نهائياً؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
  if (!confirm(`تأكيد أخير: سيُحذف حساب "${label}" بشكل دائم.`)) return;

  try {
    showToast('جاري الحذف...');

    // مسح students + subcollections
    const studentRef  = doc(db, 'students', id);
    const studentSnap = await getDoc(studentRef);
    if (studentSnap.exists()) {
      for (const sub of ['sessions', 'grades']) {
        const snap = await getDocs(collection(db, 'students', id, sub));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      }
      await deleteDoc(studentRef);
    }

    // مسح conversations + messages
    const convSnap = await getDocs(
      query(collection(db, 'conversations'), where('participants', 'array-contains', id))
    );
    await Promise.all(convSnap.docs.map(async convDoc => {
      const msgs = await getDocs(collection(db, 'conversations', convDoc.id, 'messages'));
      await Promise.all(msgs.docs.map(m => deleteDoc(m.ref)));
      await deleteDoc(convDoc.ref);
    }));

    // مسح users/{id} — الـ Cloud Function هتمسح Auth تلقائياً
    await deleteDoc(doc(db, 'users', id));

    showToast(`✅ تم حذف حساب "${label}" نهائياً`);
  } catch(e) {
    console.error('خطأ في حذف الحساب:', e);
    showToast('❌ حدث خطأ: ' + (e.message || e), true);
  }
};




// ══════════════════════════════════════════════════════
//  إدارة الأخبار والمواعيد — Admin Panel
// ══════════════════════════════════════════════════════
let _editingNewsId  = null;
let _editingEventId = null;
let _currentNewsTab = 'news';

// ── تحميل الأخبار ──────────────────────────────────────
onSnapshot(query(collection(db,'news'), orderBy('createdAt','desc')), snap => {
  const el = document.getElementById('newsAdminList');
  if (!el) return;
  if (snap.empty) {
    el.innerHTML = '<div style="text-align:center;color:var(--text-mid);padding:24px;font-size:13px">لا توجد أخبار</div>';
    return;
  }
  el.innerHTML = snap.docs.map(d => {
    const n = d.data();
    const date = n.createdAt?.toDate?.()?.toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}) || '';
    const vis = n.visibility === 'public'
      ? '<span style="background:#dcfce7;color:#15803d;font-size:11px;padding:2px 8px;border-radius:8px">🌐 للجميع</span>'
      : '<span style="background:#f1f5f9;color:#64748b;font-size:11px;padding:2px 8px;border-radius:8px">🔒 للمسجلات</span>';
    const pinBadge = n.pinned ? '<span style="background:#fef9c3;color:#854d0e;font-size:11px;padding:2px 8px;border-radius:8px">📌 مثبت</span>' : '';
    return `<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
        <div style="flex:1">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
            <span style="font-size:12px;background:var(--beige2);padding:2px 8px;border-radius:6px">${n.tag||'خبر'}</span>
            ${vis} ${pinBadge}
            <span style="font-size:11px;color:var(--text-mid);margin-right:auto">${date}</span>
          </div>
          <div style="font-weight:600;font-size:14px;color:var(--text-dark)">${n.title||''}</div>
          <div style="font-size:12.5px;color:var(--text-mid);margin-top:4px;line-height:1.6">${n.body||''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="openEditNewsModal('${d.id}')"
            style="padding:5px 10px;font-size:12px;background:transparent;border:1px solid var(--gold);color:var(--gold);border-radius:6px;cursor:pointer">
            <i class="ti ti-pencil"></i>
          </button>
          <button onclick="deleteAdminNews('${d.id}')"
            style="padding:5px 10px;font-size:12px;background:#fff0f0;color:#c0392b;border:1px solid #f5c6c6;border-radius:6px;cursor:pointer">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
});

// ── تحميل المواعيد ────────────────────────────────────
onSnapshot(query(collection(db,'events'), orderBy('order','asc')), snap => {
  const el = document.getElementById('eventsAdminList');
  if (!el) return;
  if (snap.empty) {
    el.innerHTML = '<div style="text-align:center;color:var(--text-mid);padding:24px;font-size:13px">لا توجد مواعيد</div>';
    return;
  }
  el.innerHTML = snap.docs.map((d,i) => {
    const e = d.data();
    const dotColor = e.highlight ? '#c9a227' : '#2d6e45';
    return `<div style="display:flex;align-items:center;gap:10px;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:10px 14px">
      <div style="width:12px;height:12px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13.5px">${e.label||e.title||''}</div>
        <div style="font-size:12px;color:var(--text-mid)">${e.date||''}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="openEditEventModal('${d.id}')"
          style="padding:4px 9px;font-size:12px;background:transparent;border:1px solid var(--gold);color:var(--gold);border-radius:6px;cursor:pointer">
          <i class="ti ti-pencil"></i>
        </button>
        <button onclick="deleteAdminEvent('${d.id}')"
          style="padding:4px 9px;font-size:12px;background:#fff0f0;color:#c0392b;border:1px solid #f5c6c6;border-radius:6px;cursor:pointer">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
});

// ── تبديل التابز ──────────────────────────────────────
window.switchNewsTab = tab => {
  _currentNewsTab = tab;
  document.getElementById('newsTabContent').style.display   = tab === 'news'   ? '' : 'none';
  document.getElementById('eventsTabContent').style.display = tab === 'events' ? '' : 'none';
  const nb = document.getElementById('newsTabBtn');
  const eb = document.getElementById('eventsTabBtn');
  nb.style.color       = tab==='news'   ? 'var(--green-dark)' : 'var(--text-mid)';
  nb.style.borderBottom= tab==='news'   ? '2px solid var(--green-dark)' : '2px solid transparent';
  eb.style.color       = tab==='events' ? 'var(--green-dark)' : 'var(--text-mid)';
  eb.style.borderBottom= tab==='events' ? '2px solid var(--green-dark)' : '2px solid transparent';
};

// ── Modals فتح ────────────────────────────────────────
window.openAddNewsModal = () => {
  _editingNewsId = null;
  document.getElementById('adminNewsModalTitle').textContent = 'خبر جديد';
  document.getElementById('anTitle').value = '';
  document.getElementById('anBody').value  = '';
  document.getElementById('anTag').value   = '📢 إعلان';
  document.getElementById('anVisibility').value = 'public';
  document.getElementById('anPinned').checked   = false;
  document.getElementById('adminNewsModal').classList.add('show');
};

window.openEditNewsModal = async id => {
  const snap = await getDoc(doc(db,'news',id));
  if (!snap.exists()) return;
  const n = snap.data();
  _editingNewsId = id;
  document.getElementById('adminNewsModalTitle').textContent = 'تعديل الخبر';
  document.getElementById('anTitle').value       = n.title      || '';
  document.getElementById('anBody').value        = n.body       || '';
  document.getElementById('anTag').value         = n.tag        || '📢 إعلان';
  document.getElementById('anVisibility').value  = n.visibility || 'public';
  document.getElementById('anPinned').checked    = n.pinned     || false;
  document.getElementById('adminNewsModal').classList.add('show');
};

window.submitAdminNews = async () => {
  const title      = document.getElementById('anTitle').value.trim();
  const body       = document.getElementById('anBody').value.trim();
  const tag        = document.getElementById('anTag').value;
  const visibility = document.getElementById('anVisibility').value;
  const pinned     = document.getElementById('anPinned').checked;
  if (!title) { showToast('أدخلي عنوان الخبر','err'); return; }
  if (_editingNewsId) {
    await updateDoc(doc(db,'news',_editingNewsId), {title,body,tag,visibility,pinned});
    showToast('✅ تم تحديث الخبر');
  } else {
    await addDoc(collection(db,'news'), {title,body,tag,visibility,pinned, createdAt: serverTimestamp()});
    showToast('✅ تم نشر الخبر');
  }
  document.getElementById('adminNewsModal').classList.remove('show');
};

window.deleteAdminNews = async id => {
  if (!confirm('حذف هذا الخبر نهائياً؟')) return;
  await deleteDoc(doc(db,'news',id));
  showToast('تم الحذف');
};

// ── Events CRUD ───────────────────────────────────────
window.openAddEventModal = () => {
  _editingEventId = null;
  document.getElementById('adminEventModalTitle').textContent = 'موعد مهم جديد';
  document.getElementById('aeName').value      = '';
  document.getElementById('aeDate').value      = '';
  document.getElementById('aeHighlight').checked = false;
  document.getElementById('adminEventModal').classList.add('show');
};

window.openEditEventModal = async id => {
  const snap = await getDoc(doc(db,'events',id));
  if (!snap.exists()) return;
  const e = snap.data();
  _editingEventId = id;
  document.getElementById('adminEventModalTitle').textContent = 'تعديل الموعد';
  document.getElementById('aeName').value        = e.label     || '';
  document.getElementById('aeDate').value        = e.date      || '';
  document.getElementById('aeHighlight').checked = e.highlight || false;
  document.getElementById('adminEventModal').classList.add('show');
};

window.submitAdminEvent = async () => {
  const label     = document.getElementById('aeName').value.trim();
  const date      = document.getElementById('aeDate').value.trim();
  const highlight = document.getElementById('aeHighlight').checked;
  if (!label) { showToast('أدخلي اسم الموعد','err'); return; }
  if (_editingEventId) {
    await updateDoc(doc(db,'events',_editingEventId), {label,date,highlight});
    showToast('✅ تم تحديث الموعد');
  } else {
    const snap = await getDocs(collection(db,'events'));
    await addDoc(collection(db,'events'), {label,date,highlight, order: snap.size});
    showToast('✅ تمت إضافة الموعد');
  }
  document.getElementById('adminEventModal').classList.remove('show');
};

window.deleteAdminEvent = async id => {
  if (!confirm('حذف هذا الموعد؟')) return;
  await deleteDoc(doc(db,'events',id));
  showToast('تم الحذف');
};

// ── تفعيل قسم الأخبار عند الفتح ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const newsHead = document.querySelector('#newsSection .section-head');
  if (newsHead) newsHead.style.cursor = 'pointer';
});

// إعادة render عند تغيير حجم الScreen (Mobile ↔ Desktop)
window.addEventListener("resize", () => {
  if (allStudents.length) renderStudents(allStudents);
});






// ══════════════════════════════════════════════════════════════
//  Add اختبار جماعي
// ══════════════════════════════════════════════════════════════
window.openBulkGradeModal = () => {
  const modal = document.getElementById('bulkGradeModal');
  modal.style.display = 'flex';
  renderBGStudents();
};

window.closeBulkGradeModal = () => {
  document.getElementById('bulkGradeModal').style.display = 'none';
};

function renderBGStudents() {
  const list = document.getElementById('bgStudentsList');
  const students = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived);
  list.innerHTML = students.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="bg-check" data-id="${s.id}" data-name="${esc(s.name||'')}" checked style="width:16px;height:16px;cursor:pointer"/>
      <span style="flex:1;font-size:13px;font-weight:600">${esc(s.name||'—')}</span>
      <input type="number" class="bg-score" data-id="${s.id}" min="0" placeholder="الدرجة"
        style="width:80px;border:1px solid var(--border);border-radius:7px;padding:5px 8px;font-family:inherit;font-size:13px;text-align:center"/>
    </div>
  `).join('');
}

window.bgSelectAll = () => document.querySelectorAll('.bg-check').forEach(cb => cb.checked = true);
window.bgClearAll  = () => document.querySelectorAll('.bg-check').forEach(cb => cb.checked = false);

// ── استيراد الدرجات من ملف Excel ────────────────────────────
let bgImportRows = [];
let bgActiveStudents = [];

function normalizeName(name) {
  return (name || '')
    .replace(/[أإآا]/g, 'ا')       // توحيد الألف
    .replace(/[ةه]/g, 'ه')          // توحيد التاء المربوطة
    .replace(/ى/g, 'ي')              // توحيد الألف المقصورة
    .replace(/[\u064B-\u065F]/g, '') // إزالة التشكيل
    .replace(/\s+/g, '')             // إزالة المسافات
    .trim();
}

function firstNameNormalized(name) {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  return normalizeName(first);
}

window.importExcelGrades = async () => {
  const fileInput = document.getElementById('bgExcelFile');
  const file = fileInput.files[0];
  if (!file) { showToast('اختاري ملف أولاً'); return; }
  if (typeof XLSX === 'undefined') { showToast('مكتبة قراءة Excel لم تُحمّل، حدّثي الصفحة'); return; }

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) { showToast('الملف فارغ'); return; }

    const keys = Object.keys(rows[0]);
    const nameKey  = keys.find(k => /اسم\s*الطالبة|الاسم/i.test(k)) || keys[0];
    const scoreKey = keys.find(k => /score/i.test(k)) || keys.find(k => /الدرجة/i.test(k)) || keys[1];

    if (!nameKey || !scoreKey) { showToast('لم يتم التعرف على أعمدة الاسم أو الدرجة في الملف'); return; }

    bgActiveStudents = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived);

    // خرائط المطابقة: بالاسم الكامل، وبأول اسم
    const fullNameMap = new Map();
    const firstNameMap = new Map();
    bgActiveStudents.forEach(s => {
      fullNameMap.set(normalizeName(s.name), s);
      const fn = firstNameNormalized(s.name);
      if (!firstNameMap.has(fn)) firstNameMap.set(fn, []);
      firstNameMap.get(fn).push(s);
    });

    bgImportRows = rows.map(row => {
      const rawName = String(row[nameKey] || '').trim();
      if (!rawName) return null;
      const score = Number(row[scoreKey]) || 0;

      const exact = fullNameMap.get(normalizeName(rawName));
      if (exact) {
        return { rawName, score, studentId: exact.id, matchType: 'exact', include: true };
      }

      const candidates = firstNameMap.get(firstNameNormalized(rawName)) || [];
      if (candidates.length === 1) {
        // اسم أول متطابق مع طالبة واحدة بس — مطابقة محتملة تحتاج تأكيدك
        return { rawName, score, studentId: candidates[0].id, matchType: 'suggested', include: true };
      }
      if (candidates.length > 1) {
        // أكتر من طالبة بنفس أول اسم — لازم تختاري إنتِ
        return { rawName, score, studentId: null, matchType: 'ambiguous', include: false };
      }
      // مفيش أي تطابق
      return { rawName, score, studentId: null, matchType: 'none', include: false };
    }).filter(Boolean);

    renderBGPreview();
    document.getElementById('bgPreviewSection').style.display = 'block';

    const exact = bgImportRows.filter(r => r.matchType === 'exact').length;
    const needsReview = bgImportRows.filter(r => r.matchType !== 'exact').length;
    showToast(`تم استيراد ${bgImportRows.length} صف — ${exact} تطابقت تلقائيًا${needsReview ? `، و${needsReview} محتاجة مراجعتك` : ''}`);
  } catch (e) {
    console.error('importExcelGrades error:', e);
    showToast('حدث خطأ أثناء قراءة الملف: ' + e.message);
  }
};

function buildStudentOptions(selectedId) {
  const sorted = [...bgActiveStudents].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  return `<option value="">— اختاري الطالبة —</option>` +
    sorted.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

function renderBGPreview() {
  const tbody = document.getElementById('bgPreviewBody');
  tbody.innerHTML = bgImportRows.map((r, i) => {
    const needsReview = r.matchType !== 'exact';
    const rowBg = r.matchType === 'exact' ? '' : r.matchType === 'none' ? ';background:rgba(192,57,43,0.06)' : ';background:rgba(201,162,39,0.08)';

    const statusLabel = {
      exact:     '<span style="color:#2e8b57">✅ تطابق تام</span>',
      suggested: '<span style="color:#c9852b">🔶 راجعي التطابق</span>',
      ambiguous: '<span style="color:#c9852b">🔶 أكتر من احتمال</span>',
      none:      '<span style="color:#c0392b">❌ اختاري يدويًا</span>',
    }[r.matchType];

    const nameCell = needsReview
      ? `<div style="font-weight:600;margin-bottom:4px">${esc(r.rawName)}</div>
         <select onchange="bgSelectStudent(${i}, this.value)" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:11px">
           ${buildStudentOptions(r.studentId)}
         </select>`
      : `${esc(r.rawName)}`;

    return `
    <tr style="border-bottom:1px solid var(--border)${rowBg}">
      <td style="padding:6px 8px">
        <input type="checkbox" ${r.include ? 'checked' : ''} onchange="bgToggleRow(${i}, this.checked)" style="margin-left:6px;vertical-align:top" ${r.studentId ? '' : 'disabled'}/>
        ${nameCell}
      </td>
      <td style="padding:6px 8px;text-align:center;vertical-align:top">
        <input type="number" value="${r.score}" min="0" onchange="bgUpdateRowScore(${i}, this.value)"
          style="width:60px;border:1px solid var(--border);border-radius:6px;padding:3px 6px;text-align:center;font-family:inherit;font-size:12px"/>
      </td>
      <td style="padding:6px 8px;text-align:center;vertical-align:top">${statusLabel}</td>
    </tr>
  `;
  }).join('');

  const exact = bgImportRows.filter(r => r.matchType === 'exact').length;
  const resolved = bgImportRows.filter(r => r.studentId).length;
  document.getElementById('bgMatchCount').textContent =
    `✅ ${exact} تطابق تلقائي | 🔶 ${resolved - exact} اتأكدت يدويًا | ❌ ${bgImportRows.length - resolved} لسه محتاجة اختيار`;
}

window.bgToggleRow = (i, checked) => { if (bgImportRows[i]) bgImportRows[i].include = checked; };
window.bgUpdateRowScore = (i, val) => { if (bgImportRows[i]) bgImportRows[i].score = Number(val) || 0; };

window.bgSelectStudent = (i, studentId) => {
  if (!bgImportRows[i]) return;
  bgImportRows[i].studentId = studentId || null;
  bgImportRows[i].include = !!studentId;
  renderBGPreview();
};

window.clearExcelImport = () => {
  bgImportRows = [];
  document.getElementById('bgPreviewSection').style.display = 'none';
  document.getElementById('bgExcelFile').value = '';
};

// تطبيق الدرجات المستوردة (بعد المراجعة) على قايمة الطالبات تحت
window.applyExcelImport = () => {
  const toApply = bgImportRows.filter(r => r.studentId && r.include);
  const pending = bgImportRows.filter(r => !r.studentId);
  if (!toApply.length) { showToast('لا يوجد صفوف جاهزة للتطبيق — راجعي الاختيارات أولاً'); return; }

  // نلغي تحديد كل الطالبات أولاً، بعدين نحدد بس اللي جايين من الملف
  document.querySelectorAll('.bg-check').forEach(cb => cb.checked = false);

  toApply.forEach(r => {
    const cb = document.querySelector(`.bg-check[data-id="${r.studentId}"]`);
    const scoreInput = document.querySelector(`.bg-score[data-id="${r.studentId}"]`);
    if (cb) cb.checked = true;
    if (scoreInput) scoreInput.value = r.score;
  });

  showToast(`✅ تم تطبيق درجات ${toApply.length} طالبة على القائمة${pending.length ? ` — لسه ${pending.length} محتاجة اختيار يدوي` : ''} — راجعيها ثم اضغطي "حفظ الدرجات"`);
};

window.saveBulkGrades = async () => {
  const label   = document.getElementById('bgLabel').value.trim();
  const subject = document.getElementById('bgSubject').value;
  const total   = Number(document.getElementById('bgTotal').value);

  if (!label || !total) { showToast('أدخلي اسم الاختبار والدرجة الكلية'); return; }

  const checked = [...document.querySelectorAll('.bg-check:checked')];
  if (!checked.length) { showToast('اختاري طالبة واحدة على الأقل'); return; }

  const btn = document.querySelector('#bulkGradeModal .m-btn') ||
    document.querySelector('[onclick="saveBulkGrades()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ...'; }

  try {
    await Promise.all(checked.map(cb => {
      const sid   = cb.dataset.id;
      const score = Number(document.querySelector(`.bg-score[data-id="${sid}"]`)?.value || 0);
      return addDoc(collection(db, 'students', sid, 'grades'), {
        label, subject, score, total,
        createdAt: serverTimestamp(),
      });
    }));
    showToast(`✅ تم حفظ الدرجات لـ ${checked.length} طالبة`);
    closeBulkGradeModal();
  } catch(e) {
    showToast('خطأ: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ الدرجات'; }
  }
};

// ── تعديل حقل في حساب مستخدم مباشرة من الجدول ────────────
window.userFieldUpdate = async (uid, field, value) => {
  // الأدمن فقط يقدر يعدل
  if (currentUserRole !== 'admin') {
    console.warn('ليس لديك صلاحية التعديل');
    return;
  }
  try {
    await updateDoc(doc(db, 'users', uid), { [field]: value });
    if (field === 'role' || field === 'status') {
      filterUsersTable();
    }
  } catch(e) {
    console.error('userFieldUpdate error:', e);
    alert('حدث خطأ أثناء الحفظ');
  }
};

// ── طلبات حذف الحسابات ────────────────────────────────────
async function loadDeletionRequests() {
  const container = document.getElementById('deletionRequestsContainer');
  const badge     = document.getElementById('deletionBadge');
  try {
    const snap = await getDocs(query(
      collection(db, 'deletionRequests'),
      where('status', '==', 'pending')
    ));

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i> لا توجد طلبات حذف حالياً</div>';
      badge.style.display = 'none';
      return;
    }

    badge.textContent = snap.size;
    badge.style.display = 'inline-block';

    const roleLabels = { mateen:'بنت متين', student:'طالبة عادية', teacher:'معلمة', supervisor:'مشرفة', admin:'إدارة' };

    container.innerHTML = snap.docs.map(d => {
      const r = { id: d.id, ...d.data() };
      const date = r.requestedAt ? new Date(r.requestedAt.seconds*1000).toLocaleDateString('ar-EG') : '—';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--white)">
          <div>
            <div style="font-weight:700;color:var(--green-dark)">${esc(r.name||'—')}</div>
            <div style="font-size:12px;color:var(--text-mid)">${esc(r.email||'')} · ${roleLabels[r.role]||r.role||''} · طلبت بتاريخ ${date}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="approveDeletion('${r.id}','${r.uid}')"
              style="background:#c0392b;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-family:inherit;cursor:pointer;font-size:13px">
              <i class="ti ti-trash"></i> موافقة وحذف
            </button>
            <button onclick="rejectDeletion('${r.id}')"
              style="background:var(--beige2);color:var(--text-dark);border:1px solid var(--border);border-radius:8px;padding:7px 16px;font-family:inherit;cursor:pointer;font-size:13px">
              رفض
            </button>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    console.error('loadDeletionRequests:', e);
    container.innerHTML = '<div class="empty-state"><i class="ti ti-alert-triangle"></i> حدث خطأ أثناء التحميل</div>';
  }
}

window.approveDeletion = async (reqId, uid) => {
  if (!confirm('سيتم حذف الحساب وكل بياناته نهائياً. متأكدة؟')) return;
  try {
    await fullDeleteUser(uid);
    await deleteDoc(doc(db, 'deletionRequests', reqId));
    showToast('✅ تم حذف الحساب بناءً على الطلب');
    loadDeletionRequests();
  } catch(e) {
    console.error('approveDeletion:', e);
    alert('حدث خطأ أثناء الحذف');
  }
};

window.rejectDeletion = async (reqId) => {
  if (!confirm('رفض طلب الحذف؟')) return;
  await updateDoc(doc(db, 'deletionRequests', reqId), { status: 'rejected' });
  showToast('تم رفض الطلب');
  loadDeletionRequests();
};

// ════════════════════════════════════════════════════════════════
// حذف اختبار جماعي من عند كل الطالبات
window.openDeleteExamModal = async () => {
  const modal = document.getElementById('deleteExamModal');
  const list  = document.getElementById('examListToDelete');
  if (!modal) { alert('المودال مش موجود'); return; }
  
  modal.style.display = 'flex';
  list.innerHTML = '<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:20px">جارٍ التحميل...</div>';

  try {
    // جيب كل الطالبات وكل الاختبارات بتاعتهم
    const activeStuds = allStudents.filter(s => !s.archived);
    const examMap = {}; // { label_subject: [ {studentId, gradeId} ] }

    await Promise.all(activeStuds.map(async s => {
      const gradesSnap = await getDocs(collection(db, 'students', s.id, 'grades'));
      gradesSnap.docs.forEach(g => {
        const data = g.data();
        const key = `${data.label || 'اختبار'}|||${data.subject || ''}`;
        if (!examMap[key]) examMap[key] = [];
        examMap[key].push({ studentId: s.id, gradeId: g.id });
      });
    }));

    if (Object.keys(examMap).length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:20px">لا توجد اختبارات</div>';
      return;
    }

    list.innerHTML = Object.entries(examMap).map(([key, entries]) => {
      const [label, subject] = key.split('|||');
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(92,61,46,0.05);border-radius:10px;border:1px solid var(--border);margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:700">${esc(label)}</div>
          ${subject ? `<div style="font-size:11px;color:var(--text-mid)">${esc(subject)}</div>` : ''}
          <div style="font-size:11px;color:var(--text-mid)">📊 ${entries.length} طالبة</div>
        </div>
        <button onclick="deleteBulkExam('${encodeURIComponent(key)}')" style="background:none;border:1px solid #e74c3c;color:#e74c3c;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap">
          <i class="ti ti-trash"></i> حذف
        </button>
      </div>`;
    }).join('');

    // حفظ examMap للاستخدام لاحقاً
    window._examMapCache = examMap;
  } catch(e) {
    list.innerHTML = `<div style="color:#e74c3c;font-size:13px;padding:20px">❌ خطأ: ${e.message}</div>`;
    console.error('openDeleteExamModal:', e);
  }
};

window.deleteBulkExam = async (encodedKey) => {
  const key = decodeURIComponent(encodedKey);
  const [label] = key.split('|||');
  if (!confirm(`متأكدة من حذف "${label}" من عند كل الطالبات؟`)) return;

  const entries = window._examMapCache?.[key] || [];
  if (!entries.length) { alert('مفيش بيانات'); return; }

  try {
    await Promise.all(entries.map(({ studentId, gradeId }) =>
      deleteDoc(doc(db, 'students', studentId, 'grades', gradeId))
    ));
    showToast?.(`✅ تم حذف "${label}" من ${entries.length} طالبة`);
    openDeleteExamModal(); // إعادة تحميل القايمة
  } catch(e) {
    showToast?.('❌ خطأ: ' + e.message);
    console.error('deleteBulkExam:', e);
  }
};

// ══════════════════════════════════════════════════════════════
//  إضافة حضور جماعي
// ══════════════════════════════════════════════════════════════
// جدول أسماء الأيام حسب getDay() (0=الأحد ... 6=السبت) — نفس الترتيب المستخدم في ميزة لصق الرسالة
const BA_WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// بيحسب اسم اليوم من التاريخ المختار ويحدّث dropdown "اليوم" تلقائيًا
function baSyncDayFromDate() {
  const dateVal = document.getElementById('baDate')?.value;
  const daySelect = document.getElementById('baDay');
  if (!dateVal || !daySelect) return;
  const d = new Date(dateVal + 'T00:00:00');
  daySelect.value = BA_WEEKDAY_NAMES[d.getDay()];
}

window.openBulkAttModal = () => {
  const modal = document.getElementById('bulkAttModal');
  modal.style.display = 'flex';
  const dateInput = document.getElementById('baDate');
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  baSyncDayFromDate();
  renderBAStudents();
};

// لو غيّرت التاريخ، يتحدّث اسم اليوم تلقائيًا وتتحدث معه مواد "كل مواد اليوم"
document.getElementById('baDate')?.addEventListener('change', () => {
  baSyncDayFromDate();
  renderBAStudents();
});

// إعادة عرض المواد لما تتغيّر اليوم يدويًا — يهم فقط في وضع "كل مواد اليوم"
document.getElementById('baDay')?.addEventListener('change', renderBAStudents);

window.closeBulkAttModal = () => {
  document.getElementById('bulkAttModal').style.display = 'none';
};

function baBtnHtml(sid, status) {
  const presentActive = status === 'present';
  const absentActive  = status === 'absent';
  return `
    <button type="button" onclick="baSetStatus('${sid}','present')"
      style="font-size:12px;padding:5px 10px;border-radius:6px;cursor:pointer;font-family:inherit;border:1px solid ${presentActive ? '#1e8449' : 'var(--border)'};background:${presentActive ? 'rgba(39,174,96,0.15)' : 'var(--beige2)'};color:${presentActive ? '#1e8449' : 'var(--text-mid)'}">✔ حاضرة</button>
    <button type="button" onclick="baSetStatus('${sid}','absent')"
      style="font-size:12px;padding:5px 10px;border-radius:6px;cursor:pointer;font-family:inherit;border:1px solid ${absentActive ? '#c0392b' : 'var(--border)'};background:${absentActive ? 'rgba(192,57,43,0.12)' : 'var(--beige2)'};color:${absentActive ? '#c0392b' : 'var(--text-mid)'}">✖ غائبة</button>`;
}

function baSubjBtnsHtml(status) {
  const presentActive = status === 'present';
  const absentActive  = status === 'absent';
  return `
    <button type="button" onclick="baToggleSubjStatus(this,'present')"
      style="font-size:11px;padding:3px 8px;border-radius:5px;cursor:pointer;font-family:inherit;border:1px solid ${presentActive ? '#1e8449' : 'var(--border)'};background:${presentActive ? 'rgba(39,174,96,0.15)' : 'var(--beige2)'};color:${presentActive ? '#1e8449' : 'var(--text-mid)'}">✔</button>
    <button type="button" onclick="baToggleSubjStatus(this,'absent')"
      style="font-size:11px;padding:3px 8px;border-radius:5px;cursor:pointer;font-family:inherit;border:1px solid ${absentActive ? '#c0392b' : 'var(--border)'};background:${absentActive ? 'rgba(192,57,43,0.12)' : 'var(--beige2)'};color:${absentActive ? '#c0392b' : 'var(--text-mid)'}">✖</button>`;
}

function baSubjRowHtml(sid, subj, status = 'present') {
  return `<div class="ba-subj-wrap" data-id="${sid}" data-subject="${esc(subj)}" data-status="${status}" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
    <span style="font-size:11px;color:var(--text-mid);min-width:78px;flex-shrink:0">${esc(subj)}</span>
    <div class="ba-subj-btns" style="display:flex;gap:4px">${baSubjBtnsHtml(status)}</div>
  </div>`;
}

window.baToggleSubjStatus = (btnEl, status) => {
  const wrap = btnEl.closest('.ba-subj-wrap');
  if (!wrap) return;
  wrap.dataset.status = status;
  wrap.querySelector('.ba-subj-btns').innerHTML = baSubjBtnsHtml(status);
};

window.renderBAStudents = renderBAStudents;
function renderBAStudents() {
  const list = document.getElementById('baStudentsList');
  const students = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived);
  const subjectVal = document.getElementById('baSubject')?.value || '';
  const allMode = subjectVal === '__ALL__';

  list.innerHTML = students.map(s => `
    <div style="display:flex;align-items:${allMode ? 'flex-start' : 'center'};gap:10px;padding:9px 12px;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="ba-check" data-id="${s.id}" data-name="${esc(s.name||'')}" checked style="width:16px;height:16px;cursor:pointer;margin-top:${allMode ? '2px' : '0'}"/>
      <span style="flex:1;font-size:13px;font-weight:600">${esc(s.name||'—')}</span>
      ${allMode
        ? `<div style="display:flex;flex-direction:column;gap:2px">${baSubjectsForCurrentDay().map(subj => baSubjRowHtml(s.id, subj, 'present')).join('')}</div>`
        : `<div class="ba-status-wrap" data-id="${s.id}" data-status="present" style="display:flex;gap:6px">${baBtnHtml(s.id, 'present')}</div>`
      }
    </div>
  `).join('');
}

window.baSelectAll = () => document.querySelectorAll('.ba-check').forEach(cb => cb.checked = true);
window.baClearAll  = () => document.querySelectorAll('.ba-check').forEach(cb => cb.checked = false);

window.baSetStatus = (sid, status) => {
  const wrap = document.querySelector(`.ba-status-wrap[data-id="${sid}"]`);
  if (!wrap) return;
  wrap.dataset.status = status;
  wrap.innerHTML = baBtnHtml(sid, status);
};

window.baMarkAllPresent = () => {
  document.querySelectorAll('.ba-status-wrap').forEach(el => baSetStatus(el.dataset.id, 'present'));
  document.querySelectorAll('.ba-subj-wrap').forEach(el => {
    el.dataset.status = 'present';
    el.querySelector('.ba-subj-btns').innerHTML = baSubjBtnsHtml('present');
  });
};
window.baMarkAllAbsent = () => {
  document.querySelectorAll('.ba-status-wrap').forEach(el => baSetStatus(el.dataset.id, 'absent'));
  document.querySelectorAll('.ba-subj-wrap').forEach(el => {
    el.dataset.status = 'absent';
    el.querySelector('.ba-subj-btns').innerHTML = baSubjBtnsHtml('absent');
  });
};

window.saveBulkAttendance = async () => {
  const day     = document.getElementById('baDay').value;
  const date    = document.getElementById('baDate').value;
  const subject = document.getElementById('baSubject').value;

  if (!day || !date) { showToast('اختاري اليوم والتاريخ'); return; }
  if (!subject) { showToast('اختاري المادة'); return; }

  const checked = [...document.querySelectorAll('.ba-check:checked')];
  if (!checked.length) { showToast('اختاري طالبة واحدة على الأقل'); return; }

  const allMode = subject === '__ALL__';
  if (allMode && !baSubjectsForCurrentDay().length) { showToast('لا توجد مواد لهذا اليوم'); return; }

  const btn = document.querySelector('[onclick="saveBulkAttendance()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ...'; }

  try {
    await Promise.all(checked.map(cb => {
      const sid = cb.dataset.id;
      let subjectsMap;
      if (allMode) {
        subjectsMap = {};
        document.querySelectorAll(`.ba-subj-wrap[data-id="${sid}"]`).forEach(w => {
          subjectsMap[w.dataset.subject] = w.dataset.status;
        });
      } else {
        const status = document.querySelector(`.ba-status-wrap[data-id="${sid}"]`)?.dataset.status || 'present';
        subjectsMap = { [subject]: status };
      }
      return addDoc(collection(db, 'students', sid, 'sessions'), {
        day, date,
        subjects: subjectsMap,
        createdAt: Date.now(),
      });
    }));
    showToast(`✅ تم تسجيل الحضور لـ ${checked.length} طالبة`);
    closeBulkAttModal();
  } catch(e) {
    showToast('خطأ: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ الحضور'; }
  }
};

// ══════════════════════════════════════════════════════════════
//  حذف حضور جماعي من عند كل الطالبات
// ══════════════════════════════════════════════════════════════
window.openDeleteAttModal = async () => {
  const modal = document.getElementById('deleteAttModal');
  const list  = document.getElementById('attListToDelete');
  if (!modal) { alert('المودال مش موجود'); return; }

  modal.style.display = 'flex';
  list.innerHTML = '<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:20px">جارٍ التحميل...</div>';

  try {
    const activeStuds = allStudents.filter(s => !s.archived);
    const attMap = {}; // { date|||day: [ {studentId, sessionId} ] }

    await Promise.all(activeStuds.map(async s => {
      const sessSnap = await getDocs(collection(db, 'students', s.id, 'sessions'));
      sessSnap.docs.forEach(se => {
        const data = se.data();
        const key = `${data.date || ''}|||${data.day || ''}`;
        if (!attMap[key]) attMap[key] = [];
        attMap[key].push({ studentId: s.id, sessionId: se.id });
      });
    }));

    if (Object.keys(attMap).length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:20px">لا توجد جلسات حضور</div>';
      return;
    }

    const sortedKeys = Object.keys(attMap).sort((a, b) => b.localeCompare(a));

    list.innerHTML = sortedKeys.map(key => {
      const [date, day] = key.split('|||');
      const entries = attMap[key];
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(92,61,46,0.05);border-radius:10px;border:1px solid var(--border);margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:700">${esc(date || '—')}${day ? ` — ${esc(day)}` : ''}</div>
          <div style="font-size:11px;color:var(--text-mid)">📊 ${entries.length} سجل حضور</div>
        </div>
        <button onclick="deleteBulkAttendance('${encodeURIComponent(key)}')" style="background:none;border:1px solid #e74c3c;color:#e74c3c;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap">
          <i class="ti ti-trash"></i> حذف
        </button>
      </div>`;
    }).join('');

    window._attMapCache = attMap;
  } catch(e) {
    list.innerHTML = `<div style="color:#e74c3c;font-size:13px;padding:20px">❌ خطأ: ${e.message}</div>`;
    console.error('openDeleteAttModal:', e);
  }
};

window.deleteBulkAttendance = async (encodedKey) => {
  const key = decodeURIComponent(encodedKey);
  const [date, day] = key.split('|||');
  if (!confirm(`متأكدة من حذف حضور يوم "${date || day}" من عند كل الطالبات؟`)) return;

  const entries = window._attMapCache?.[key] || [];
  if (!entries.length) { alert('مفيش بيانات'); return; }

  try {
    await Promise.all(entries.map(({ studentId, sessionId }) =>
      deleteDoc(doc(db, 'students', studentId, 'sessions', sessionId))
    ));
    showToast?.(`✅ تم حذف الحضور من ${entries.length} طالبة`);
    openDeleteAttModal(); // إعادة تحميل القايمة
  } catch(e) {
    showToast?.('❌ خطأ: ' + e.message);
    console.error('deleteBulkAttendance:', e);
  }
};

// ══════════════════════════════════════════════════════════════
//  استيراد حضور من رسالة نصية (زي رسائل واتساب)
// ══════════════════════════════════════════════════════════════
const ATT_MSG_EMOJI_RE = /(✅️|❌️|⭕️|✅|❌|⭕)/g;
const ATT_MSG_DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

window.openPasteAttModal = () => {
  document.getElementById('pasteAttModal').style.display = 'flex';
  document.getElementById('paDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('paMessage').value = '';
  document.getElementById('paPreviewSection').style.display = 'none';
  const subjList = document.getElementById('paSubjectsList');
  subjList.innerHTML = '';
  paAddSubjectRow(); paAddSubjectRow(); paAddSubjectRow(); // 3 صفوف افتراضية
  window._paParsed = null;
};

window.paAddSubjectRow = () => {
  const container = document.getElementById('paSubjectsList');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  div.innerHTML = `
    <select class="pa-subject-select" style="flex:1;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:12px">
      <option value="">— اختاري مادة —</option>
      ${_baAllSubjects.map(s => `<option>${s}</option>`).join('')}
    </select>
    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:15px;padding:2px 8px">✕</button>
  `;
  container.appendChild(div);
};

function paGetSubjectLabels() {
  return [...document.querySelectorAll('.pa-subject-select')].map(s => s.value).filter(Boolean);
}

function paPeriodLabel(subjNames, i) {
  return subjNames[i] || ['الحصة الأولى', 'الحصة الثانية', 'الحصة الثالثة', 'الحصة الرابعة', 'الحصة الخامسة'][i] || `الحصة ${i + 1}`;
}

window.closePasteAttModal = () => {
  document.getElementById('pasteAttModal').style.display = 'none';
};

// كلمات حشو شائعة في الاسم الرسمي (بنت/بن..) مش بتتكتب عادة في رسايل الواتساب
const AR_FILLER_WORDS = new Set(['بنت', 'بن', 'ابن', 'ابنة']);

// نفس فكرة normalizeName المستخدمة في استيراد الإكسل بالاختبار الجماعي — توحيد اختلافات الحروف
function normalizeArName(s) {
  return (s || '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .trim();
}

function stripFillerWords(name) {
  return (name || '').trim().split(/\s+/).filter(w => w && !AR_FILLER_WORDS.has(w));
}

// بنى regex من مجموعة كلمات (بدل الاسم الكامل) بيقبل اختلافات الألف/التاء المربوطة/الياء، ومسافات مرنة
function buildAttNameRegexFromWords(words) {
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = words.map(w => {
    let pattern = '';
    for (const ch of w) {
      if ('أإآا'.includes(ch)) pattern += '[أإآا]';
      else if (ch === 'ة' || ch === 'ه') pattern += '[ةه]';
      else if (ch === 'ي' || ch === 'ى') pattern += '[يى]';
      else pattern += escRe(ch);
    }
    return pattern;
  });
  return new RegExp(parts.join('\\s*'), 'g');
}

// بروفايلات مطابقة لكل طالبة: الاسم الكامل (بدون بنت/بن) كأولوية، وبعدين أول كلمتين بس (الاسم + اسم الأب)
// نفس فكرة "تطابق تام" و"مطابقة مقترحة بالاسم الأول" في استيراد الإكسل
function studentNameProfiles(name) {
  const words = stripFillerWords(name);
  const profiles = [];
  if (words.length) profiles.push({ words, level: 'full' });
  if (words.length > 2) profiles.push({ words: words.slice(0, 2), level: 'short' });
  return profiles;
}

// نجهّز فهرس: أي جزء اسم (full/short) مشترك بين أكتر من طالبة يبقى "مشكوك فيه" لازم تأكيد يدوي
function buildProfileIndex(students) {
  const index = new Map();
  const studentProfiles = new Map();
  students.forEach(s => {
    if (!s.name) return;
    const profiles = studentNameProfiles(s.name);
    studentProfiles.set(s.id, profiles);
    profiles.forEach(p => {
      const key = p.level + '|' + p.words.map(normalizeArName).join(' ');
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(s.id);
    });
  });
  return { index, studentProfiles };
}

// بيدور على كل أسماء الطالبات جوه النص، ويقسّم النص لقطع (اسم + رموز + ملاحظة) لكل طالبة
// بتقسّم النص لسطور (كل طالبة عادة سطر لوحدها في رسايل الواتساب)، وتدور على اسم في بداية كل سطر
// المهم: أي سطر مش متعرف عليه بيفضل لوحده منفصل، وميتلخبطش/يتضاف غلط لرموز الطالبة اللي قبله
function parseAttendanceMessage(text, students) {
  const { index, studentProfiles } = buildProfileIndex(students);
  const rawLines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  const segments = [];

  rawLines.forEach(line => {
    let best = null; // { studentId, name, matchLevel, ambiguous, end }

    for (const s of students) {
      if (!s.name) continue;
      const profiles = studentProfiles.get(s.id) || [];
      for (const p of profiles) {
        const key = p.level + '|' + p.words.map(normalizeArName).join(' ');
        const ambiguous = (index.get(key) || []).length > 1;
        const re = buildAttNameRegexFromWords(p.words);
        const m = re.exec(line);
        if (m && m.index === 0) {
          const cand = { studentId: s.id, name: s.name, matchLevel: p.level, ambiguous, end: m[0].length };
          // فضّلي أطول تطابق (أدق)، ولو متساويين فضّلي الاسم الكامل على المختصر
          if (!best || cand.end > best.end || (cand.end === best.end && cand.matchLevel === 'full' && best.matchLevel !== 'full')) {
            best = cand;
          }
          break; // full بيجي قبل short في نفس مصفوفة البروفايلات، يبقى كفاية
        }
      }
    }

    if (!best) {
      // سطر متعرفناش على طالبة فيه — يفضل منفصل عشان مايتلخبطش مع طالبة تانية
      const marks = line.match(ATT_MSG_EMOJI_RE) || [];
      const noteText = line.replace(ATT_MSG_EMOJI_RE, '').trim();
      const periods = marks.map(mk => mk.includes('✅') ? 'present' : mk.includes('❌') ? 'absent' : 'excused');
      segments.push({
        studentId: null,
        name: noteText || line,
        rawLine: line,
        periods,
        note: '',
        include: false,
        matchLevel: 'none',
        ambiguous: false,
        unmatched: true,
        suspicious: true,
      });
      return;
    }

    const chunk = line.slice(best.end);
    const marks = chunk.match(ATT_MSG_EMOJI_RE) || [];
    const noteText = chunk.replace(ATT_MSG_EMOJI_RE, '').trim();
    const periods = marks.map(mk => mk.includes('✅') ? 'present' : mk.includes('❌') ? 'absent' : 'excused');
    segments.push({
      studentId: best.studentId,
      name: best.name,
      periods,
      note: noteText,
      include: true,
      matchLevel: best.matchLevel,
      ambiguous: best.ambiguous,
      // مشكوك فيها لو: عدد رموز غريب، أو تطابق جزئي بس (اسم+اسم أب)، أو الاسم المختصر مشترك بين أكتر من طالبة
      suspicious: periods.length === 0 || periods.length > 4 || best.matchLevel !== 'full' || best.ambiguous,
    });
  });

  const matchedIds = new Set(segments.filter(s => s.studentId).map(s => s.studentId));
  const notMentioned = students.filter(s => !matchedIds.has(s.id));

  return { segments, notMentioned };
}

// قايمة اختيار طالبة يدويًا — نفس فكرة buildStudentOptions في استيراد الإكسل
function paStudentOptions(selectedId) {
  const students = allStudents
    .filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  return `<option value="">— اختاري الطالبة —</option>` +
    students.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

function paReasonTag(s) {
  if (s.unmatched) return ' — سطر متعرفناش على اسم طالبة فيه، اختاري صاحبته يدويًا';
  if (s.ambiguous) return ' — تشابه أسماء، تأكدي من الطالبة الصحيحة';
  if (s.matchLevel === 'short') return ' — تطابق بالاسم واسم الأب فقط';
  if (s.periods.length === 0) return ' — لم يُقرأ أي رمز حضور/غياب بعد الاسم';
  if (s.periods.length > 4) return ' — عدد رموز أكبر من عدد المواد المتوقع';
  return '';
}

function paRowHtml(s, i) {
  const subjNames = paGetSubjectLabels();
  const periodsHtml = s.periods.map((p, pi) => {
    const icon = p === 'present' ? '✔' : p === 'absent' ? '✖' : '⭕';
    return `${esc(paPeriodLabel(subjNames, pi))}: ${icon}`;
  }).join('  |  ');
  const titleText = s.unmatched ? (s.rawLine || s.name) : s.name;
  return `
    <div class="pa-row" data-idx="${i}" style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);${s.suspicious ? 'background:rgba(201,162,39,0.08)' : ''}">
      <input type="checkbox" ${s.include ? 'checked' : ''} onchange="paToggleInclude(${i}, this.checked)" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-top:3px"/>
      <div style="flex:1;min-width:0;overflow-wrap:break-word;word-break:break-word">
        <div style="font-size:13px;font-weight:600">${esc(titleText)}${s.suspicious ? ' ⚠️' : ''}</div>
        <div style="font-size:11px;color:var(--text-mid);margin-bottom:${s.suspicious ? '6px' : '0'};white-space:normal">${periodsHtml || '—'}${(!s.unmatched && s.note) ? ' — 📝 ' + esc(s.note) : ''}</div>
        ${s.suspicious ? `
          <div style="font-size:11px;color:#a04000;margin-bottom:4px">${esc(paReasonTag(s))}</div>
          <select onchange="paChangeStudent(${i}, this.value)" style="width:100%;max-width:280px;border:1px solid var(--border);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:11px">
            ${paStudentOptions(s.studentId)}
          </select>` : ''}
      </div>
    </div>`;
}

window.paChangeStudent = (idx, studentId) => {
  const row = window._paParsed?.[idx];
  if (!row) return;
  const s = allStudents.find(x => x.id === studentId);
  row.studentId = studentId || null;
  row.name = s ? s.name : row.name;
  row.include = !!studentId;
  row.suspicious = false; // اتأكدت منها يدويًا
  if (row.unmatched && studentId) row.unmatched = false; // بقت طالبة معروفة دلوقتي
  const el = document.querySelector(`.pa-row[data-idx="${idx}"]`);
  if (el) el.outerHTML = paRowHtml(row, idx);
};

window.parseAttendanceMessageUI = () => {
  const text = document.getElementById('paMessage').value.trim();
  const date = document.getElementById('paDate').value;
  if (!date) { showToast('حددي التاريخ'); return; }
  if (!text) { showToast('الصقي نص الرسالة'); return; }

  const students = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived);
  const { segments, notMentioned } = parseAttendanceMessage(text, students);
  window._paParsed = segments;

  if (!segments.length) {
    document.getElementById('paSummary').innerHTML = '❌ مفيش أي اسم طالبة اتعرف عليه في الرسالة. تأكدي إن الأسماء مطابقة لأسماء الطالبات المسجّلة.';
    document.getElementById('paNotMentioned').style.display = 'none';
    document.getElementById('paRowsList').innerHTML = '';
    document.getElementById('paPreviewSection').style.display = 'block';
    return;
  }

  const recognized = segments.filter(s => !s.unmatched);
  const unmatchedLines = segments.filter(s => s.unmatched);
  const suspiciousCount = recognized.filter(s => s.suspicious).length;
  document.getElementById('paSummary').innerHTML =
    `✅ اتعرف على <strong>${recognized.length}</strong> طالبة من الرسالة` +
    (suspiciousCount ? ` — ⚠️ <strong>${suspiciousCount}</strong> منهم محتاجين مراجعة (تطابق جزئي أو تشابه أسماء أو عدد رموز غريب)` : '') +
    (unmatchedLines.length ? ` — 🔎 <strong>${unmatchedLines.length}</strong> سطر متعرفناش على طالبة فيه خالص` : '') +
    (suspiciousCount || unmatchedLines.length ? ' — استخدمي القايمة تحت السطر لتصحيحه' : '');

  const nmDiv = document.getElementById('paNotMentioned');
  if (notMentioned.length) {
    nmDiv.style.display = 'block';
    nmDiv.innerHTML = `⚠️ <strong>${notMentioned.length}</strong> طالبة من القائمة متذكروش في الرسالة خالص (ممكن يبقوا غايبين ونسيتي تكتبيهم، أو الاسم مكتوب مختلف شوية):<br>` +
      notMentioned.map(s => esc(s.name)).join('، ');
  } else {
    nmDiv.style.display = 'none';
  }

  document.getElementById('paRowsList').innerHTML = segments.map((s, i) => paRowHtml(s, i)).join('');

  document.getElementById('paPreviewSection').style.display = 'block';
};

window.paToggleInclude = (idx, checked) => {
  if (window._paParsed?.[idx]) window._paParsed[idx].include = checked;
};

window.confirmPasteAttendance = async () => {
  const date   = document.getElementById('paDate').value;
  const period = document.getElementById('paPeriod').value;
  const segments = (window._paParsed || []).filter(s => s.include);
  if (!segments.length) { showToast('مفيش صفوف متحددة للحفظ'); return; }

  const d = new Date(date + 'T00:00:00');
  const day = ATT_MSG_DAY_NAMES[d.getDay()];

  if (!confirm(`هيتم إنشاء ${segments.length} سجل حضور ليوم ${day} (${date}). متأكدة؟`)) return;

  const btn = document.querySelector('[onclick="confirmPasteAttendance()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ...'; }

  try {
    const subjNames = paGetSubjectLabels();
    await Promise.all(segments.map(s => {
      const subjects = {};
      s.periods.forEach((status, i) => {
        subjects[paPeriodLabel(subjNames, i)] = status;
      });
      return addDoc(collection(db, 'students', s.studentId, 'sessions'), {
        day: period ? `${day} (${period})` : day,
        date, subjects, createdAt: Date.now(),
      });
    }));

    const withNotes = segments.filter(s => s.note);
    await Promise.all(withNotes.map(async s => {
      const sSnap = await getDoc(doc(db, 'students', s.studentId));
      const existing = sSnap.exists() ? (sSnap.data().notes || '') : '';
      const combined = (existing ? existing + '\n' : '') + `[${date}] ${s.note}`;
      await updateDoc(doc(db, 'students', s.studentId), { notes: combined });
    }));

    showToast(`✅ تم تسجيل حضور ${segments.length} طالبة${withNotes.length ? ` و${withNotes.length} ملاحظة` : ''}`);
    closePasteAttModal();
  } catch(e) {
    showToast('❌ خطأ: ' + e.message);
    console.error('confirmPasteAttendance:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> تأكيد وحفظ الحضور'; }
  }
};

// ══════════════════════════════════════════════════════════════
//  استيراد حضور من ملف Excel (شكل أسبوعي: أعمدة = أيام)
// ══════════════════════════════════════════════════════════════
const EA_DAY_OFFSETS = { 'الأحد': 0, 'الاثنين': 1, 'الإثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6 };

function eaAddDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

window.openExcelAttModal = () => {
  document.getElementById('excelAttModal').style.display = 'flex';
  document.getElementById('eaDate').value = '';
  document.getElementById('eaFile').value = '';
  document.getElementById('eaStatus').style.display = 'none';
  document.getElementById('eaPreviewSection').style.display = 'none';
  const subjList = document.getElementById('eaSubjectsList');
  subjList.innerHTML = '';
  eaAddSubjectRow(); eaAddSubjectRow(); eaAddSubjectRow();
  window._eaParsed = null;
};

window.closeExcelAttModal = () => {
  document.getElementById('excelAttModal').style.display = 'none';
};

window.eaAddSubjectRow = () => {
  const container = document.getElementById('eaSubjectsList');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  div.innerHTML = `
    <select class="ea-subject-select" style="flex:1;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:12px">
      <option value="">— اختاري مادة —</option>
      ${_baAllSubjects.map(s => `<option>${s}</option>`).join('')}
    </select>
    <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:15px;padding:2px 8px">✕</button>
  `;
  container.appendChild(div);
};

function eaGetSubjectLabels() {
  return [...document.querySelectorAll('.ea-subject-select')].map(s => s.value).filter(Boolean);
}

function eaPeriodLabel(subjNames, i) {
  return subjNames[i] || ['الحصة الأولى', 'الحصة الثانية', 'الحصة الثالثة', 'الحصة الرابعة', 'الحصة الخامسة'][i] || `الحصة ${i + 1}`;
}

window.parseAttendanceExcelUI = async () => {
  const fileInput   = document.getElementById('eaFile');
  const file        = fileInput.files[0];
  const weekStart   = document.getElementById('eaDate').value; // تاريخ يوم الأحد
  const sheetFilter = document.getElementById('eaPeriod').value;

  if (!file) { showToast('اختاري ملف أولاً'); return; }
  if (!weekStart) { showToast('حددي تاريخ يوم الأحد لهذا الأسبوع'); return; }

  const status = document.getElementById('eaStatus');
  status.style.display = 'block';
  status.textContent = '⏳ جارٍ قراءة الملف...';

  try {
    const XLSXmod = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
    const buffer = await file.arrayBuffer();
    const wb = XLSXmod.read(buffer, { type: 'array' });

    let sheetNames = wb.SheetNames;
    if (sheetFilter) {
      const keyword = sheetFilter.includes('صباح') ? 'صباح' : 'مساء';
      const filtered = wb.SheetNames.filter(n => n.includes(keyword));
      if (filtered.length) sheetNames = filtered;
    }

    const students = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived);
    const fullNameMap = new Map();
    const firstNameMap = new Map();
    students.forEach(s => {
      fullNameMap.set(normalizeName(s.name), s);
      const fn = firstNameNormalized(s.name);
      if (!firstNameMap.has(fn)) firstNameMap.set(fn, []);
      firstNameMap.get(fn).push(s);
    });

    const parsedRows = [];

    sheetNames.forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      const rows = XLSXmod.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) return;
      const header = rows[0];
      const dayCols = [];
      for (let c = 1; c < header.length; c++) {
        const label = String(header[c] || '').trim();
        if (EA_DAY_OFFSETS[label] !== undefined) dayCols.push({ col: c, day: label });
      }
      if (!dayCols.length) return; // شيت مفيهوش أعمدة أيام معروفة — تجاهليه

      for (let r = 1; r < rows.length; r++) {
        const rawName = String(rows[r][0] || '').trim();
        if (!rawName) continue;

        const exact = fullNameMap.get(normalizeName(rawName));
        let studentId = null, matchType = 'none';
        if (exact) { studentId = exact.id; matchType = 'exact'; }
        else {
          const candidates = firstNameMap.get(firstNameNormalized(rawName)) || [];
          if (candidates.length === 1) { studentId = candidates[0].id; matchType = 'suggested'; }
          else if (candidates.length > 1) matchType = 'ambiguous';
        }

        dayCols.forEach(({ col, day }) => {
          const raw = String(rows[r][col] || '').trim();
          if (!raw) return;
          const marks = raw.match(ATT_MSG_EMOJI_RE) || [];
          const noteText = raw.replace(ATT_MSG_EMOJI_RE, '').trim();
          const periods = marks.map(m => m.includes('✅') ? 'present' : m.includes('❌') ? 'absent' : 'excused');
          const date = eaAddDays(weekStart, EA_DAY_OFFSETS[day]);
          parsedRows.push({
            sheet: sheetName, rawName, studentId, matchType,
            day, date, periods, note: noteText,
            suspicious: periods.length === 0 || periods.length > 5,
          });
        });
      }
    });

    window._eaParsed = parsedRows;
    renderEAPreview(parsedRows);
    document.getElementById('eaPreviewSection').style.display = 'block';
    status.textContent = `✅ تم تحليل ${parsedRows.length} خلية عبر ${sheetNames.length} شيت`;
  } catch(e) {
    console.error('parseAttendanceExcelUI:', e);
    status.textContent = '❌ خطأ: ' + e.message;
  }
};

function renderEAPreview(rows) {
  const exactCount = rows.filter(r => r.matchType === 'exact').length;
  const reviewRows = rows.filter(r => r.matchType !== 'exact');
  document.getElementById('eaSummary').innerHTML =
    `✅ <strong>${exactCount}</strong> خلية تطابقت تلقائيًا` +
    (reviewRows.length ? ` — 🔶 <strong>${reviewRows.length}</strong> محتاجة مراجعة` : '');

  const nmDiv = document.getElementById('eaNotMentioned');
  const uniqueNames = [...new Set(reviewRows.map(r => r.rawName))];
  if (uniqueNames.length) {
    nmDiv.style.display = 'block';
    nmDiv.innerHTML = `🔶 أسماء محتاجة اختيار الطالبة يدويًا:<br>` + uniqueNames.map(n => esc(n)).join('، ');
  } else {
    nmDiv.style.display = 'none';
  }

  // اجمعي الصفوف حسب (الاسم + الشيت) عشان العرض يبقى مختصر بدل صف لكل يوم
  const grouped = {};
  rows.forEach(r => {
    const key = `${r.rawName}|||${r.sheet}`;
    if (!grouped[key]) grouped[key] = { rawName: r.rawName, sheet: r.sheet, studentId: r.studentId, matchType: r.matchType, entries: [] };
    grouped[key].entries.push(r);
  });

  const subjNames = eaGetSubjectLabels();
  document.getElementById('eaRowsList').innerHTML = Object.values(grouped).map(g => {
    const needsSelect = g.matchType !== 'exact';
    const daysHtml = g.entries.map(e => {
      const marksHtml = e.periods.map((p, pi) => `${esc(eaPeriodLabel(subjNames, pi))}:${p === 'present' ? '✔' : p === 'absent' ? '✖' : '⭕'}`).join(' ');
      return `<span style="display:inline-block;margin:2px 10px 2px 0;${e.suspicious ? 'color:#c9852b;font-weight:700' : ''}">${esc(e.day)}${e.suspicious ? ' ⚠️' : ''}: ${marksHtml || '—'}${e.note ? ' 📝' + esc(e.note) : ''}</span>`;
    }).join('');
    return `<div style="padding:7px 10px;border-bottom:1px solid var(--border);font-size:11.5px;${needsSelect ? 'background:rgba(201,162,39,0.08)' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
        <span style="font-size:13px;font-weight:700">${esc(g.rawName)}</span>
        <span style="font-size:10px;color:var(--text-mid)">(${esc(g.sheet)})</span>
      </div>
      ${needsSelect ? `<select onchange="eaSelectStudent('${esc(g.rawName).replace(/'/g, "\\'")}','${esc(g.sheet).replace(/'/g, "\\'")}', this.value)" style="width:100%;margin-bottom:4px;border:1px solid var(--border);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:11px">${buildStudentOptions(g.studentId)}</select>` : ''}
      <div style="color:var(--text-mid)">${daysHtml}</div>
    </div>`;
  }).join('');
}

window.eaSelectStudent = (rawName, sheet, studentId) => {
  (window._eaParsed || []).forEach(r => {
    if (r.rawName === rawName && r.sheet === sheet) {
      r.studentId = studentId || null;
      r.matchType = studentId ? 'manual' : 'none';
    }
  });
};

window.confirmExcelAttendance = async () => {
  const rows = (window._eaParsed || []).filter(r => r.studentId);
  if (!rows.length) { showToast('مفيش صفوف صالحة للحفظ (راجعي الأسماء المحتاجة اختيار يدوي)'); return; }

  if (!confirm(`هيتم إنشاء ${rows.length} سجل حضور. متأكدة؟`)) return;

  const btn = document.querySelector('[onclick="confirmExcelAttendance()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ...'; }

  try {
    const subjNames = eaGetSubjectLabels();
    await Promise.all(rows.map(r => {
      const subjects = {};
      r.periods.forEach((status, i) => { subjects[eaPeriodLabel(subjNames, i)] = status; });
      return addDoc(collection(db, 'students', r.studentId, 'sessions'), {
        day: `${r.day} (${r.sheet})`,
        date: r.date, subjects, createdAt: Date.now(),
      });
    }));

    const notesByStudent = {};
    rows.filter(r => r.note).forEach(r => {
      if (!notesByStudent[r.studentId]) notesByStudent[r.studentId] = [];
      notesByStudent[r.studentId].push(`[${r.date} ${r.day}] ${r.note}`);
    });
    await Promise.all(Object.entries(notesByStudent).map(async ([sid, lines]) => {
      const sSnap = await getDoc(doc(db, 'students', sid));
      const existing = sSnap.exists() ? (sSnap.data().notes || '') : '';
      const combined = (existing ? existing + '\n' : '') + lines.join('\n');
      await updateDoc(doc(db, 'students', sid), { notes: combined });
    }));

    showToast(`✅ تم تسجيل ${rows.length} سجل حضور${Object.keys(notesByStudent).length ? ` و${Object.keys(notesByStudent).length} ملاحظة` : ''}`);
    closeExcelAttModal();
  } catch(e) {
    showToast('❌ خطأ: ' + e.message);
    console.error('confirmExcelAttendance:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> تأكيد وحفظ الحضور'; }
  }
};


// ══════════════════════════════════════════════════════════════
//  ملاحظات جماعية
// ══════════════════════════════════════════════════════════════
window.openBulkNotesModal = () => {
  document.getElementById('bulkNotesModal').style.display = 'flex';
  document.getElementById('bnSharedNote').value = '';
  renderBNStudents();
};

window.closeBulkNotesModal = () => {
  document.getElementById('bulkNotesModal').style.display = 'none';
};

function renderBNStudents() {
  const list = document.getElementById('bnStudentsList');
  const students = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة' && !s.archived)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  list.innerHTML = students.map(s => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="bn-check" data-id="${s.id}" checked style="width:16px;height:16px;cursor:pointer;margin-top:6px;flex-shrink:0"/>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(s.name || '—')}</div>
        <textarea class="bn-note" data-id="${s.id}" data-original="${esc(s.notes || '')}" rows="2" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:12px;resize:vertical">${esc(s.notes || '')}</textarea>
      </div>
    </div>
  `).join('');
}

window.bnSelectAll = () => document.querySelectorAll('.bn-check').forEach(cb => cb.checked = true);
window.bnClearAll  = () => document.querySelectorAll('.bn-check').forEach(cb => cb.checked = false);

window.bnApplySharedNote = () => {
  const shared = document.getElementById('bnSharedNote').value.trim();
  if (!shared) { showToast('اكتبي الملاحظة المشتركة أولاً'); return; }
  const checkedIds = new Set([...document.querySelectorAll('.bn-check:checked')].map(cb => cb.dataset.id));
  document.querySelectorAll('.bn-note').forEach(ta => {
    if (!checkedIds.has(ta.dataset.id)) return;
    ta.value = (ta.value ? ta.value + '\n' : '') + shared;
  });
  showToast(`✅ اتضافت الملاحظة لـ ${checkedIds.size} طالبة (متنسيش تدوسي "حفظ التعديلات")`);
};

window.saveBulkNotes = async () => {
  const textareas = [...document.querySelectorAll('.bn-note')];
  const changed = textareas.filter(ta => ta.value !== ta.dataset.original);
  if (!changed.length) { showToast('مفيش أي تعديل جديد'); return; }

  const btn = document.querySelector('[onclick="saveBulkNotes()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ...'; }

  try {
    await Promise.all(changed.map(ta =>
      updateDoc(doc(db, 'students', ta.dataset.id), { notes: ta.value })
    ));
    showToast(`✅ تم حفظ ملاحظات ${changed.length} طالبة`);
    closeBulkNotesModal();
  } catch(e) {
    showToast('❌ خطأ: ' + e.message);
    console.error('saveBulkNotes:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ التعديلات'; }
  }
};


// ── استيراد الدرجات من Excel مع Preview ────────────────────────
window.importGradesFromExcel = async (input) => {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('excelImportStatus');
  status.style.display = 'block';
  status.style.color = 'var(--text-mid)';
  status.textContent = '⏳ جارٍ قراءة الملف...';
  const previewDiv = document.getElementById('excelImportPreview');
  if (previewDiv) previewDiv.innerHTML = '';

  try {
    const { read, utils } = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
    const buffer = await file.arrayBuffer();
    const wb = read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(ws, { defval: '' });

    if (rows.length === 0) { status.textContent = '❌ الملف فاضي'; status.style.color = '#e74c3c'; return; }

    const keys = Object.keys(rows[0]);
    const nameKey = keys.find(k => normalizeName(k).includes('اسم') || k.toLowerCase().includes('name'));
    const scoreKey = keys.find(k => k.toLowerCase() === 'score' || normalizeName(k).includes('درجه'));

    if (!nameKey || !scoreKey) {
      status.textContent = `❌ مش لاقية عمود الاسم أو الدرجة. الأعمدة: ${keys.slice(0,5).join(', ')}`;
      status.style.color = '#e74c3c'; return;
    }

    const checkboxes = document.querySelectorAll('#bgStudentsList .bg-check');
    const previewData = [];

    rows.forEach(row => {
      const excelName = normalizeName(String(row[nameKey] || ''));
      const score = parseFloat(row[scoreKey]) || 0;
      if (!excelName) return;
      let foundName = null, foundId = null;
      checkboxes.forEach(cb => {
        if (normalizeName(cb.dataset.name || '') === excelName) {
          foundName = cb.dataset.name; foundId = cb.dataset.id;
        }
      });
      previewData.push({ excelName: String(row[nameKey]), score, foundName, foundId });
    });

    const matchedRows = previewData.filter(r => r.foundId);
    const unmatchedRows = previewData.filter(r => !r.foundId);

    const pd = document.getElementById('excelImportPreview');
    pd.innerHTML = `
      <div style="margin-top:10px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="background:rgba(39,174,96,0.08);padding:8px 12px;font-size:12px;font-weight:700;color:#27ae60">
          ✅ ${matchedRows.length} طالبة — راجعي الدرجات قبل التأكيد
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:rgba(0,0,0,0.04)">
            <th style="padding:6px 10px;font-size:12px;text-align:right">الاسم في الملف</th>
            <th style="padding:6px 10px;font-size:12px;text-align:right">الاسم في النظام</th>
            <th style="padding:6px 10px;font-size:12px;text-align:center">الدرجة</th>
          </tr></thead>
          <tbody>${matchedRows.map(r => `<tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 10px;font-size:12px">${r.excelName}</td>
            <td style="padding:6px 10px;font-size:12px;color:var(--green-dark)">${r.foundName}</td>
            <td style="padding:6px 10px;text-align:center">
              <input type="number" value="${r.score}" min="0" data-preview-id="${r.foundId}"
                style="width:60px;border:1px solid var(--border);border-radius:6px;padding:3px 6px;text-align:center;font-family:inherit;font-size:13px"/>
            </td>
          </tr>`).join('')}</tbody>
        </table>
        ${unmatchedRows.length > 0 ? `<div style="background:rgba(231,76,60,0.06);padding:8px 12px;font-size:12px;color:#e74c3c;border-top:1px solid var(--border)">
          ❌ مش موجودات: ${unmatchedRows.map(r=>r.excelName).slice(0,5).join('، ')}${unmatchedRows.length>5?'...':''}
        </div>` : ''}
        <div style="padding:10px 12px;border-top:1px solid var(--border);text-align:left">
          <button onclick="applyExcelGrades()" style="background:var(--green-dark);color:white;border:none;border-radius:8px;padding:7px 20px;font-family:inherit;font-size:13px;cursor:pointer;font-weight:600">
            ✅ تأكيد وتطبيق الدرجات
          </button>
        </div>
      </div>`;
    status.style.display = 'none';

  } catch(e) {
    status.textContent = '❌ خطأ: ' + e.message;
    status.style.color = '#e74c3c';
  }
  input.value = '';
};

window.applyExcelGrades = () => {
  document.querySelectorAll('[data-preview-id]').forEach(input => {
    const sid = input.dataset.previewId;
    const score = parseFloat(input.value) || 0;
    const cb = document.querySelector(`.bg-check[data-id="${sid}"]`);
    const gradeInput = document.querySelector(`.bg-score[data-id="${sid}"]`);
    if (cb) cb.checked = true;
    if (gradeInput) gradeInput.value = score;
  });
  document.getElementById('excelImportPreview').innerHTML =
    '<div style="padding:8px 12px;font-size:12px;color:#27ae60;font-weight:600">✅ تم تطبيق الدرجات — اضغطي "حفظ الدرجات"</div>';
};

// ── حذف اختبار جماعي من عند كل الطالبات ─────────────────────

// ── مسح كل الدرجات والغياب ─────────────────────────────────────

window.openResetDataModal = async (defaultType) => {
  const modal = document.getElementById('resetDataModal');
  const list  = document.getElementById('resetStudentsList');
  modal.style.display = 'flex';
  list.innerHTML = '<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:20px">جارٍ التحميل...</div>';

  if (defaultType) {
    const radio = document.querySelector(`input[name="resetType"][value="${defaultType}"]`);
    if (radio) radio.checked = true;
  }

  try {
    const snap = await getDocs(collection(db, 'students'));
    const studentsWithData = [];

    await Promise.all(snap.docs.map(async sDoc => {
      const data = sDoc.data();
      const gradesSnap   = await getDocs(collection(db, 'students', sDoc.id, 'grades'));
      const sessionsSnap = await getDocs(collection(db, 'students', sDoc.id, 'sessions'));
      if (gradesSnap.size > 0 || sessionsSnap.size > 0) {
        studentsWithData.push({
          id: sDoc.id,
          name: data.name || 'طالبة',
          archived: !!data.archived,
          grades: gradesSnap.size,
          sessions: sessionsSnap.size,
        });
      }
    }));

    if (studentsWithData.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:20px">لا توجد بيانات للمسح</div>';
      return;
    }

    window._resetStudentsCache = studentsWithData;
    list.innerHTML = studentsWithData.map(s => `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(92,61,46,0.04);border-radius:8px;cursor:pointer">
        <input type="checkbox" class="reset-student-cb" data-id="${s.id}" checked style="width:16px;height:16px"/>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${s.name} ${s.archived ? '<span style="font-size:10px;color:#e67e22">(مؤرشفة)</span>' : ''}</div>
          <div style="font-size:11px;color:var(--text-mid)">
            ${s.grades > 0 ? `📊 ${s.grades} درجة` : ''}
            ${s.sessions > 0 ? `📋 ${s.sessions} سجل حضور` : ''}
          </div>
        </div>
      </label>`).join('');

  } catch(e) {
    list.innerHTML = `<div style="color:#e74c3c;font-size:13px;padding:10px">خطأ: ${e.message}</div>`;
  }
};

window.selectAllResetStudents = (val) => {
  document.querySelectorAll('.reset-student-cb').forEach(cb => cb.checked = val);
};

window.confirmResetSelected = async () => {
  const type = document.querySelector('input[name="resetType"]:checked')?.value || 'all';
  const selected = [...document.querySelectorAll('.reset-student-cb:checked')].map(cb => cb.dataset.id);

  if (!selected.length) { alert('اختاري طالبة واحدة على الأقل'); return; }

  const typeName = type === 'grades' ? 'الدرجات' : type === 'sessions' ? 'الحضور والغياب' : 'الدرجات والحضور';
  if (!confirm(`متأكدة من مسح ${typeName} من عند ${selected.length} طالبة؟`)) return;

  const types = type === 'all' ? ['grades', 'sessions'] : [type];
  let totalGrades = 0, totalSessions = 0;

  try {
    await Promise.all(selected.map(async sid => {
      await Promise.all(types.map(async sub => {
        const subSnap = await getDocs(collection(db, 'students', sid, sub));
        if (sub === 'grades') totalGrades += subSnap.size;
        if (sub === 'sessions') totalSessions += subSnap.size;
        await Promise.all(subSnap.docs.map(d => deleteDoc(doc(db, 'students', sid, sub, d.id))));
      }));
    }));

    let summary = `✅ تم المسح:
`;
    if (totalGrades > 0) summary += `• ${totalGrades} درجة
`;
    if (totalSessions > 0) summary += `• ${totalSessions} سجل حضور
`;
    summary += `• من عند ${selected.length} طالبة`;
    alert(summary);

    document.getElementById('resetDataModal').style.display = 'none';
    showToast('✅ تم المسح بنجاح');
  } catch(e) {
    showToast('خطأ: ' + e.message);
  }
};
