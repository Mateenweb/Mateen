
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, updateDoc, deleteDoc, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { exportWord, exportPdf } from "./export.js";
import { FIREBASE_CONFIG } from "./config.js";
import { fullDeleteUser } from "./delete-account.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : '';
  if (role !== 'supervisor' && role !== 'admin') { window.location.href = '../html/login.html'; return; }
  document.getElementById('navUserName').textContent   = snap.data().name || user.email.split('@')[0];
  document.getElementById('authGate').style.display    = 'none';
  document.getElementById('mainContent').style.display = 'flex';
  loadData();
  initSupervisorFeatures();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

function loadData() {
  const mateenQuery = query(collection(db,'users'), where('role','==','mateen'), orderBy('createdAt','desc'));
  onSnapshot(mateenQuery, snap => {
    const all     = snap.docs.map(d=>({id:d.id,...d.data()}));
    const pending = all.filter(u=>u.status==='pending');
    const active  = all.filter(u=>u.status==='active');
    // كل الطالبات بغض النظر عن الحالة
    document.getElementById('sPending').textContent = pending.length;
    document.getElementById('sActive').textContent  = active.length;
    document.getElementById('sTotal').textContent   = all.length;
    window._allStudents = all;
    renderPending(pending);
    renderAll(all);
  });
}

function renderPending(list) {
  const c = document.getElementById('pendingContainer');
  if (!list.length) { c.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد حسابات معلقة</div>'; return; }
  c.innerHTML = `<div style="overflow-x:auto"><table class="pending-table">
    <thead><tr><th>الاسم</th><th>العمر</th><th>السنة</th><th>الجوال</th><th>البريد</th><th>تاريخ التسجيل</th><th></th></tr></thead>
    <tbody>${list.map(u=>`<tr>
      <td style="font-weight:600">${esc(u.name||'—')}</td>
      <td>${u.age||'—'}</td>
      <td>${esc(u.year||'—')}</td>
      <td dir="ltr">${esc(u.phone||'—')}</td>
      <td dir="ltr" style="font-size:12px">${esc(u.email||'—')}</td>
      <td style="font-size:12px;color:var(--text-mid)">${fmtDate(u.createdAt)}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn-approve" onclick="approveUser('${u.id}')"><i class="ti ti-check"></i> قبول</button>
        <button class="btn-reject"  onclick="rejectUser('${u.id}')"><i class="ti ti-x"></i> رفض</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderAll(list) {
  const c = document.getElementById('allContainer');
  if (!list.length) { c.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد طالبات</div>'; return; }

  // بحث
  const searchVal = (document.getElementById('supSearch')?.value || '').toLowerCase();
  const filtered  = searchVal ? list.filter(u => (u.name||'').toLowerCase().includes(searchVal)) : list;

  c.innerHTML = `
    <input id="supSearch" type="text" placeholder="🔍 ابحثي باسم الطالبة..."
      oninput="filterSup()"
      style="width:100%;padding:9px 14px;border:1px solid var(--border);border-radius:10px;
             font-family:inherit;font-size:13px;margin-bottom:14px;box-sizing:border-box;">
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
      ${filtered.map(u => `
        <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05);transition:box-shadow 0.2s;"
             onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'"
             onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
          <!-- هيدر الكارت -->
          <div style="background:var(--green-dark);padding:14px 16px;display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.15);
                        display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🧕</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;color:#fff;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${esc(u.name||'—')}
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">${esc(u.email||'')}</div>
            </div>
            <span style="font-size:11px;padding:3px 8px;border-radius:10px;flex-shrink:0;
              ${u.status==='active'    ? 'background:#e8f5e9;color:#2e7d32;'
              : u.status==='pending'   ? 'background:#fff8e1;color:#f57f17;'
              : 'background:#fdecea;color:#c0392b;'}">
              ${u.status==='active' ? '✅ نشطة' : u.status==='pending' ? '⏳ معلقة' : '❌ موقوفة'}
            </span>
          </div>
          <!-- بيانات -->
          <div style="padding:12px 16px;font-size:12px;color:var(--text-mid);display:flex;flex-direction:column;gap:4px;">
            ${u.phone ? `<div><i class="ti ti-phone" style="margin-left:4px;"></i>${esc(u.phone)}</div>` : ''}
            ${u.year  ? `<div><i class="ti ti-calendar" style="margin-left:4px;"></i>${esc(u.year)}</div>` : ''}
          </div>
          <!-- أزرار -->
          <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px;">
            <a href="student.html?id=${u.id}"
               style="flex:1;padding:8px;background:var(--green-dark);color:white;border:none;border-radius:8px;
                      font-family:inherit;font-size:12px;cursor:pointer;text-align:center;text-decoration:none;
                      display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="ti ti-user"></i> الملف والغياب
            </a>
            <button onclick="suspendUser('${u.id}','${u.status}')"
               style="padding:8px 12px;border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;
                      border:1px solid ${u.status==='suspended'?'var(--green-dark)':'#c0392b'};
                      background:transparent;
                      color:${u.status==='suspended'?'var(--green-dark)':'#c0392b'};">
              <i class="ti ti-${u.status==='suspended'?'check':'ban'}"></i>
              ${u.status==='suspended'?'تفعيل':'إيقاف'}
            </button>
          </div>
        </div>`).join('')}
    </div>`;
}

window.filterSup = () => {
  const val = document.getElementById('supSearch')?.value?.toLowerCase() || '';
  const list = window._allStudents || [];
  const filtered = val ? list.filter(u => (u.name||'').toLowerCase().includes(val)) : list;
  renderAll(filtered);
  // حافظ على قيمة البحث
  const inp = document.getElementById('supSearch');
  if (inp) { inp.value = val; inp.focus(); }
};

const ALL_SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];
window.approveUser = async id => { await updateDoc(doc(db,'users',id),{status:'active', enrolledSubjects: ALL_SUBJECTS}); showToast('✓ تم قبول الحساب والتحاقها بكل المواد'); };
window.rejectUser  = async id => { if(!confirm('رفض الحساب وحذفه؟')) return; await fullDeleteUser(id); showToast('تم الرفض'); };
window.suspendUser = async (id,cur) => {
  const ns = cur==='suspended' ? 'active' : 'suspended';
  await updateDoc(doc(db,'users',id),{status:ns});
  showToast(ns==='suspended'?'تم إيقاف الحساب':'تم رفع الإيقاف');
};

function fmtDate(ts) { if(!ts) return '—'; return new Date(ts.seconds*1000).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showToast(msg) { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }


// ══════════════════════════════════════════════════════════════
//  الخريطة: subjectId → اسم عربي
// ══════════════════════════════════════════════════════════════
const SUBJECTS_MAP = [
  { id: 'tafseer',  ar: 'التفسير' },
  { id: 'fiqh',     ar: 'الفقه' },
  { id: 'aqeedah',  ar: 'العقيدة' },
  { id: 'hadeeth',  ar: 'الحديث الشريف' },
  { id: 'quran1',   ar: 'مقرأة متين' },
];

const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

let allMateenUsers  = [];
let attSessions     = [];   // [{subjectId, subjectAr, slots:[{time}]}]
let attData         = {};   // { subjectId: { uid: 'present'|'absent'|'excused' } }

// ── init بعد auth ──────────────────────────────────────────
async function initSupervisorFeatures() {
  await loadMateenUsers();
}

async function loadMateenUsers() {
  const q = query(collection(db,'students'), orderBy('order'));
  const snap = await getDocs(q);
  allMateenUsers = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.name && s.name.trim() && s.name !== 'طالبة جديدة');
  renderNotesStudents();
}

// ══════════════════════════════════════════════════════════════
//  الغياب — بناءً على الجدول
// ══════════════════════════════════════════════════════════════
window.loadAttendance = async () => {
  const dateVal = document.getElementById('attDate').value;
  if (!dateVal) { showToast('اختاري التاريخ أولاً'); return; }

  const dateObj = new Date(dateVal + 'T00:00:00');
  const dayAr   = DAYS_AR[dateObj.getDay()];
  document.getElementById('attDayName').textContent = dayAr;

  const btn = document.getElementById('btnLoadAtt');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader spin"></i> جارٍ التحميل...';

  attSessions = [];
  attData     = {};

  // جيبي كل الطالبات
  const studentsSnap = await getDocs(query(collection(db,'students'), orderBy('order')));
  const todayStudents = studentsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.name && s.name.trim() && s.name !== 'طالبة جديدة');

  if (todayStudents.length > 0) {
    // جيبي المواد اللي عندها جدول في هذا اليوم من teachers collection
    await Promise.all(SUBJECTS_MAP.map(async subj => {
      const snap = await getDocs(collection(db, 'teachers', subj.id, 'schedule'));
      const hasDay = snap.docs.some(d => d.data().day === dayAr);
      if (hasDay) {
        attSessions.push({ subjectId: subj.id, subjectAr: subj.ar, students: todayStudents });
        attData[subj.id] = {};
      }
    }));

    // لو مفيش جدول لأي مادة، اعرض كل المواد
    if (attSessions.length === 0) {
      SUBJECTS_MAP.forEach(subj => {
        attSessions.push({ subjectId: subj.id, subjectAr: subj.ar, students: todayStudents });
        attData[subj.id] = {};
      });
    }

    // جيبي الغياب المسجل مسبقاً
    const oldSnap = await getDocs(query(collection(db,'attendance'), where('date','==',dateVal)));
    oldSnap.forEach(d => {
      const { studentId, subjectId, status } = d.data();
      if (attData[subjectId] !== undefined) attData[subjectId][studentId] = status;
    });
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-refresh"></i> تحديث';

  renderAttendance(dateVal, dayAr);
  document.getElementById('attSaveBar').style.display = attSessions.length ? 'flex' : 'none';
};

function renderAttendance(dateVal, dayAr) {
  const c = document.getElementById('attendanceContainer');

  if (!attSessions.length) {
    c.innerHTML = '<div class="empty-state"><i class="ti ti-calendar-off"></i>لا توجد مواد مجدولة يوم ' + dayAr + '</div>';
    return;
  }

  if (!allMateenUsers.length) {
    c.innerHTML = '<div class="empty-state"><i class="ti ti-users"></i>لا توجد طالبات نشطات</div>';
    return;
  }

  let html = '';
  attSessions.forEach(sess => {
    const timesStr = sess.slots.map(s => s.time||'').filter(Boolean).join('، ');
    html += `<div class="att-subject-block">
      <div class="att-subject-head">
        <span class="att-subject-name">${sess.subjectAr}</span>
        ${timesStr ? '<span class="att-subject-time"><i class="ti ti-clock"></i> ' + timesStr + '</span>' : ''}
      </div>
      <table class="pending-table att-table">
        <thead><tr><th>الطالبة</th><th>الحضور</th></tr></thead>
        <tbody>
          ${sess.students.map(u => {
            const st = (attData[sess.subjectId]||{})[u.id] || 'present';
            return `<tr>
              <td class="att-student-name">${esc(u.name||'—')}</td>
              <td>
                <div class="att-btns">
                  <button class="att-btn att-present ${st==='present'?'active':''}" onclick="setAtt('${sess.subjectId}','${u.id}','present',this)">
                    <i class="ti ti-check"></i> حاضرة
                  </button>
                  <button class="att-btn att-absent ${st==='absent'?'active':''}" onclick="setAtt('${sess.subjectId}','${u.id}','absent',this)">
                    <i class="ti ti-x"></i> غائبة
                  </button>
                  <button class="att-btn att-excused ${st==='excused'?'active':''}" onclick="setAtt('${sess.subjectId}','${u.id}','excused',this)">
                    <i class="ti ti-clock-pause"></i> معتذرة
                  </button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  });
  c.innerHTML = html;
}

window.setAtt = (subjectId, uid, status, btn) => {
  if (!attData[subjectId]) attData[subjectId] = {};
  attData[subjectId][uid] = status;
  const row = btn.closest('tr');
  row.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.saveAttendance = async () => {
  const dateVal = document.getElementById('attDate').value;
  if (!dateVal || !attSessions.length) return;

  const btn = document.querySelector('.btn-save-att');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader spin"></i> جارٍ الحفظ...';

  try {
    // احذفي السجلات القديمة لهذا التاريخ
    const oldQ = query(collection(db,'attendance'), where('date','==',dateVal));
    const oldSnap = await getDocs(oldQ);
    await Promise.all(oldSnap.docs.map(d => deleteDoc(doc(db,'attendance',d.id))));

    // احفظي الجديدة
    const writes = [];
    attSessions.forEach(sess => {
      sess.students.forEach(u => {
        const status = (attData[sess.subjectId]||{})[u.id] || 'present';
        writes.push(addDoc(collection(db,'attendance'), {
          studentId:   u.id,
          studentName: u.name || '',
          subjectId:   sess.subjectId,
          subjectAr:   sess.subjectAr,
          date:        dateVal,
          status,
          recordedAt:  Timestamp.now(),
        }));
      });
    });
    await Promise.all(writes);
    showToast('✅ تم حفظ الغياب بنجاح');
  } catch(e) {
    showToast('خطأ: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> حفظ الغياب';
  }
};


// ══════════════════════════════════════════════════════════════
//  النوتس — Notes
// ══════════════════════════════════════════════════════════════
let currentNotesStudent = null;

function renderNotesStudents() {
  const c = document.getElementById('notesContainer');
  if (!allMateenUsers.length) {
    c.innerHTML = '<div class="empty-state"><i class="ti ti-users"></i>لا توجد طالبات</div>';
    return;
  }
  c.innerHTML = `<div class="notes-students-grid">${allMateenUsers.map(u => `
    <div class="notes-student-card" onclick="openNotesModal('${u.id}','${esc(u.name||'—')}')">
      <div class="nsc-avatar">🧕</div>
      <div class="nsc-name">${esc(u.name||'—')}</div>
      <div class="nsc-action"><i class="ti ti-notes"></i> ملاحظات</div>
    </div>
  `).join('')}</div>`;
}

window.openNotesModal = async (uid, name) => {
  currentNotesStudent = uid;
  document.getElementById('notesModalTitle').textContent = 'ملاحظات — ' + name;
  document.getElementById('newNoteText').value = '';
  document.getElementById('notesModal').style.display = 'flex';
  await loadStudentNotes(uid);
};

async function loadStudentNotes(uid) {
  const container = document.getElementById('existingNotes');
  container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-mid)"><i class="ti ti-loader spin"></i></div>';
  const q = query(collection(db,'notes'), where('studentId','==',uid), orderBy('createdAt','desc'));
  const snap = await getDocs(q);
  if (snap.empty) {
    container.innerHTML = '<p class="no-notes-msg">لا توجد ملاحظات بعد</p>';
    return;
  }
  container.innerHTML = snap.docs.map(d => {
    const data = d.data();
    const date = data.createdAt ? new Date(data.createdAt.seconds*1000).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}) : '—';
    return `<div class="note-item">
      <div class="note-meta"><i class="ti ti-calendar-event"></i> ${date}</div>
      <div class="note-text">${esc(data.text||'')}</div>
      <button class="btn-delete-note" onclick="deleteNote('${d.id}','${uid}','${esc(data.text||'')}')"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('');
}

window.saveNote = async () => {
  const text = document.getElementById('newNoteText').value.trim();
  if (!text) { showToast('اكتبي الملاحظة أولاً'); return; }
  if (!currentNotesStudent) return;
  const btn = document.querySelector('.btn-add-note');
  btn.disabled = true;
  try {
    const student = allMateenUsers.find(u => u.id === currentNotesStudent);
    await addDoc(collection(db,'notes'), {
      studentId: currentNotesStudent,
      studentName: student?.name || '',
      text,
      createdAt: Timestamp.now(),
    });
    document.getElementById('newNoteText').value = '';
    await loadStudentNotes(currentNotesStudent);
    showToast('✅ تمت إضافة الملاحظة');
  } catch(e) {
    showToast('خطأ: ' + e.message);
  } finally {
    btn.disabled = false;
  }
};

window.deleteNote = async (noteId, uid, text) => {
  if (!confirm('حذف الملاحظة؟')) return;
  await deleteDoc(doc(db,'notes',noteId));
  await loadStudentNotes(uid);
  showToast('تم حذف الملاحظة');
};

window.closeNotesModal = (e) => {
  if (e.target.id === 'notesModal') document.getElementById('notesModal').style.display = 'none';
};






// ══════════════════════════════════════════════════════════════
//  قاعدة بيانات الطالبات — نفس الأدمن (قراءة فقط للمشرفة)
// ══════════════════════════════════════════════════════════════
let allStudents = [];
let stuSortAlpha = false;

const MONTHS_HIJRI = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const YEARS_HIJRI  = Array.from({length:11},(_,i)=>1442+i);

function makeDatePicker(sid, dateStr) {
  if (!dateStr) return '—';
  return dateStr.replace(/-/g, '/');
}

const stuQuery2 = query(collection(db,'students'), orderBy('order'));
onSnapshot(stuQuery2, snap => {
  allStudents = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderStudents(allStudents);
  updateStuStats(allStudents);
});

function updateStuStats(list) {
  const el = id => document.getElementById(id);
  if(el('stuTotal'))    el('stuTotal').textContent    = list.length;
  if(el('stuDone'))     el('stuDone').textContent     = list.filter(s=>s.interview==='done').length;
  if(el('stuPending'))  el('stuPending').textContent  = list.filter(s=>s.interview==='pending').length;
  if(el('stuAccepted')) el('stuAccepted').textContent = list.filter(s=>s.accepted==='accepted').length;
  if(el('stuRejected')) el('stuRejected').textContent = list.filter(s=>s.accepted==='rejected').length;
}

window.applyStudentFilters = () => {
  const q  = (document.getElementById('stuSearch')?.value||'').toLowerCase();
  const fi = document.getElementById('stuFilterInterview')?.value || 'all';
  const fr = document.getElementById('stuFilterResult')?.value || 'all';
  const fs = document.getElementById('stuFilterStatus')?.value || 'all';
  let filtered = allStudents.filter(s=>
    (!q  || (s.name||'').toLowerCase().includes(q)) &&
    (fi==='all' || s.interview===fi) &&
    (fr==='all' || s.accepted===fr) &&
    (fs==='all' || s.status===fs)
  );
  if (stuSortAlpha) filtered = [...filtered].sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar'));
  renderStudents(filtered);
};

window.toggleAlphaSort = () => {
  stuSortAlpha = !stuSortAlpha;
  document.getElementById('sortAlphaBtn')?.classList.toggle('active', stuSortAlpha);
  window.applyStudentFilters();
};

window.selectAllRows = (checked) => {
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = checked);
};

function renderStudents(list) {
  const tb = document.getElementById('stuTableBody');
  if (!tb) return;
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="9" class="empty-state"><i class="ti ti-inbox"></i>لا توجد طالبات</td></tr>`;
    return;
  }
  const isMob = window.innerWidth <= 640;
  if (isMob) {
    const wrap = document.getElementById('stu-cards-wrap');
    if (wrap) {
      wrap.innerHTML = list.map(s => {
        const intLabel = s.interview==='done'?'✅ تمت':'⏳ لم تتم';
        let accLabel = '— لم يحدد';
        if(s.accepted==='accepted') accLabel='✔️ مقبولة';
        if(s.accepted==='rejected') accLabel='✖️ مرفوضة';
        const statusLabel = s.status==='mateen'?'📖 بنات متين':s.status==='new'?'✨ مستجدة':'';
        return `<div class="stu-mob-card">
          <div class="stu-mob-top">
            <div class="stu-mob-name">
              <a class="btn-stu-link" href="student.html?id=${s.id}" target="_blank">👤</a>
              <span style="font-weight:600">${esc(s.name||'—')}</span>
            </div>
            ${statusLabel ? `<span class="stu-mob-badge">${statusLabel}</span>` : ''}
          </div>
          <div class="stu-mob-row"><span class="stu-mob-label">📅 اليوم</span><span>${s.day||'—'}</span></div>
          <div class="stu-mob-row"><span class="stu-mob-label">🕐 الوقت</span><span>${s.hour?s.hour+' '+s.ampm:'—'}</span></div>
          <div class="stu-mob-row"><span class="stu-mob-label">📋 المقابلة</span><span>${intLabel}</span></div>
          <div class="stu-mob-row"><span class="stu-mob-label">📊 القبول</span><span>${accLabel}</span></div>
        </div>`;
      }).join('');
    }
    tb.innerHTML = '';
    return;
  }
  tb.innerHTML = list.map((s,i) => {
    const intClass = s.interview==='done'?'btn-done':'btn-pending';
    const intLabel = s.interview==='done'?'✅ تمت':'⏳ لم تتم';
    let accClass='btn-na', accLabel='— لم يحدد';
    if(s.accepted==='accepted'){accClass='btn-accepted';accLabel='✔️ مقبولة';}
    if(s.accepted==='rejected'){accClass='btn-rejected';accLabel='✖️ مرفوضة';}
    const statusLabel = s.status==='mateen'?'📖 بنات متين':s.status==='new'?'✨ مستجدات':'';
    return `<tr>
      <td><input type="checkbox" class="row-check" data-id="${s.id}"></td>
      <td style="color:var(--text-mid);font-size:12px">${i+1}</td>
      <td><div class="stu-name-cell">
        <a class="btn-stu-link" href="student.html?id=${s.id}" target="_blank">👤</a>
        <span>${esc(s.name||'—')}</span>
        ${statusLabel?`<span class="status-badge">${statusLabel}</span>`:''}
      </div></td>
      <td>${s.day||'—'}<br><small style="color:var(--text-mid)">${s.dateH?s.dateH.replace(/-/g,'/'):'—'}</small></td>
      <td>${s.hour?s.hour+' '+s.ampm:'—'}</td>
      <td><span class="btn-interview ${intClass}">${intLabel}</span></td>
      <td><span class="btn-accept ${accClass}">${accLabel}</span></td>
      <td>${s.placementScore!=null?s.placementScore+'/100':'—'}</td>
      <td><a class="btn-stu-link" href="student.html?id=${s.id}" target="_blank"><i class="ti ti-eye"></i></a></td>
    </tr>`;
  }).join('');
}

// ── Export ──────────────────────────────────────────────────
window.openExportModal = () => document.getElementById('exportModal')?.classList.add('show');
window.closeExportModal = () => document.getElementById('exportModal')?.classList.remove('show');
window.openAttModal = () => document.getElementById('attModal')?.classList.add('show');
window.closeAttModal = () => document.getElementById('attModal')?.classList.remove('show');

window.doExport = async (type) => {
  const q  = (document.getElementById('stuSearch')?.value||'').toLowerCase();
  const fi = document.getElementById('stuFilterInterview')?.value||'all';
  const fr = document.getElementById('stuFilterResult')?.value||'all';
  const fs = document.getElementById('stuFilterStatus')?.value||'all';
  let data = allStudents.filter(s=>
    (!q||(s.name||'').toLowerCase().includes(q))&&
    (fi==='all'||s.interview===fi)&&
    (fr==='all'||s.accepted===fr)&&
    (fs==='all'||s.status===fs)
  );
  if (stuSortAlpha) data=[...data].sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar'));
  if (type==='word') await exportWord(data);
  else await exportPdf(data);
  window.closeExportModal();
};

window.doAttExport = async () => {
  showToast('ميزة تصدير الحضور والغياب قيد التطوير قريباً');
  window.closeAttModal();
};
