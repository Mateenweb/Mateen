
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc,
         onSnapshot, query, orderBy, where, getDoc, updateDoc, getDocs, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";
import { exportWord, exportPdf } from "./export.js";
import { fullDeleteUser } from "./delete-account.js";
import { loadSubjectsFor } from "./subjects.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);
let allMats = [];
let currentUserRole = null;

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
  document.getElementById('mainContent').style.display = 'flex';

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
  loadTeachers();
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
          ${page ? `<a href="${page}" style="color:var(--green-dark);font-size:20px;flex-shrink:0;" title="صفحة المعلمة"><i class="ti ti-external-link"></i></a>` : ''}
        </div>`;
    }).join('');
  }).catch(e => console.error('loadTeachers:', e));
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
  renderLinkList(allStudents);

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
  renderLinkList(q ? allStudents.filter(s => (s.name||'').toLowerCase().includes(q)) : allStudents);
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
};

window.closeExportModal = () => {
  const m = document.getElementById('exportModal');
  if (m) { m.classList.remove('show'); }
};

// ── Modal تصthisر Attendance  and the غياب ──────────────────────────────
window.openAttModal = () => {
  const m = document.getElementById('attModal');
  if (m) { m.classList.add('show'); }
};

window.closeAttModal = () => {
  const m = document.getElementById('attModal');
  if (m) { m.classList.remove('show'); }
};

window.attSelectAll = (checked) => {
  document.querySelectorAll('#attStudentList input[type="checkbox"]').forEach(cb => cb.checked = checked);
};

window.doAttExport = async (type) => {
  showToast('ميزة تصدير الحضور والغياب قيد التطوير قريباً');
  window.closeAttModal();
};

window.doExport = async (type) => {
  const q  = (document.getElementById('stuSearch').value||'').toLowerCase();
  const fi = document.getElementById('stuFilterInterview').value;
  const fr = document.getElementById('stuFilterResult').value;
  const fs = document.getElementById('stuFilterStatus').value;
  let data = allStudents.filter(s=>
    (!q  || (s.name||'').toLowerCase().includes(q)) &&
    (fi==='all' || s.interview===fi) &&
    (fr==='all' || s.accepted===fr) &&
    (fs==='all' || s.status===fs)
  );
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
  renderLinkList(allStudents);
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
onSnapshot(query(collection(db,'events'), orderBy('createdAt','desc')), snap => {
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
  const students = allStudents.filter(s => s.name && s.name !== 'طالبة جديدة');
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
