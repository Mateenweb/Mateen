
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
  window._userRole = role;
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
    // كل Studentات بغض النظر عن الحالة
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

  // Search
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

        </div>`).join('')}
    </div>`;
}

window.filterSup = () => {
  const val = document.getElementById('supSearch')?.value?.toLowerCase() || '';
  const list = window._allStudents || [];
  const filtered = val ? list.filter(u => (u.name||'').toLowerCase().includes(val)) : list;
  renderAll(filtered);
  // حافظ على قيمة الSearch
  const inp = document.getElementById('supSearch');
  if (inp) { inp.value = val; inp.focus(); }
};

const ALL_SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];
// ── ربط الطالبة عند القبول ──────────────────────────────────────
let _pendingApproveId = null;

window.approveUser = async id => {
  _pendingApproveId = id;
  // جيب الطلاب الغير مرتبطين
  const snap = await getDocs(collection(db,'students'));
  const sel = document.getElementById('linkStudentSelect');
  sel.innerHTML = '<option value="">— بدون ربط —</option>';
  snap.forEach(d => {
    const s = d.data();
    if (!s.userId) { // فقط الغير مرتبطين
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = s.name || s.fullName || d.id;
      sel.appendChild(opt);
    }
  });
  // preview عند الاختيار
  sel.onchange = () => {
    const prev = document.getElementById('linkStudentPreview');
    if (!sel.value) { prev.style.display='none'; return; }
    const chosen = snap.docs.find(d=>d.id===sel.value)?.data();
    if (chosen) {
      prev.style.display='block';
      prev.innerHTML = `<b>${chosen.name||chosen.fullName||''}</b><br>
        ${chosen.group ? '👥 ' + chosen.group + '<br>' : ''}
        ${chosen.phone ? '📞 ' + chosen.phone : ''}`;
    }
  };
  document.getElementById('linkStudentModal').classList.add('show');
};

window.confirmApprove = async (doLink) => {
  const id = _pendingApproveId;
  if (!id) return;
  const modal = document.getElementById('linkStudentModal');
  modal.classList.remove('show');

  // فعّل الحساب
  await updateDoc(doc(db,'users',id), {status:'active', enrolledSubjects: ALL_SUBJECTS});

  // ربط اختياري
  if (doLink) {
    const studentId = document.getElementById('linkStudentSelect').value;
    if (studentId) {
      await updateDoc(doc(db,'students',studentId), { userId: id });
      showToast('✓ تم القبول وربط الملف بنجاح');
    } else {
      showToast('✓ تم القبول (لم يتم اختيار ملف للربط)');
    }
  } else {
    showToast('✓ تم قبول الحساب بدون ربط');
  }
  _pendingApproveId = null;
};
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
//  الغياب — بناءً on the Schedule/Table
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

  // جيبي كل Studentات
  const studentsSnap = await getDocs(query(collection(db,'students'), orderBy('order')));
  const todayStudents = studentsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.name && s.name.trim() && s.name !== 'طالبة جديدة');

  if (todayStudents.length > 0) {
    // جيبي Subjects اللي عنthisا Schedule/Table في هذا اليوم من teachers collection
    await Promise.all(SUBJECTS_MAP.map(async subj => {
      const snap = await getDocs(collection(db, 'teachers', subj.id, 'schedule'));
      const hasDay = snap.docs.some(d => d.data().day === dayAr);
      if (hasDay) {
        attSessions.push({ subjectId: subj.id, subjectAr: subj.ar, students: todayStudents });
        attData[subj.id] = {};
      }
    }));

    // If مفيش Schedule/Table لأي مادة، اWidth/Display كل Subjects
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
    // اDeleteي السجلات القthisمة لهذا التاريخ
    const oldQ = query(collection(db,'attendance'), where('date','==',dateVal));
    const oldSnap = await getDocs(oldQ);
    await Promise.all(oldSnap.docs.map(d => deleteDoc(doc(db,'attendance',d.id))));

    // احفظي الجthisدة
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
//  قاعدة بيانات الطالبات — نسخة كاملة (تعديل + إضافة + حذف)
// ══════════════════════════════════════════════════════════════
let allStudents = [];
let stuSortAlpha = false;
let stuDateParts = {};

const MONTHS_HIJRI = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
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

const stuQuery2 = query(collection(db,'students'), orderBy('order'));
onSnapshot(stuQuery2, snap => {
  allStudents = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderStudents(allStudents);
  updateStuStats(allStudents);
  // تحديث قائمة الغير مرتبطين لـ modal الربط
  window._allStudentsUnlinked = snap.docs
    .filter(d => !d.data().userId)
    .map(d => ({ id: d.id, name: d.data().name||d.data().fullName||d.id }));
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
  const tb   = document.getElementById('stuTableBody');
  if (!tb) return;
  const isMob = window.innerWidth <= 640;

  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="9" class="empty-state"><i class="ti ti-inbox"></i>لا توجد طالبات</td></tr>`;
    return;
  }

  if (isMob) {
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
              <a class="btn-stu-link" href="student.html?id=${s.id}" target="_blank">👤</a>
              ${window._userRole==='admin'
                ? `<input type="text" value="${esc(s.name||'')}" oninput="stuAutoName('${s.id}',this.value)" class="stu-mob-name-input"/>`
                : `<span class="stu-mob-name-input" style="padding:4px 0">${esc(s.name||'—')}</span>`}
            </div>

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
            ${window._userRole==='admin'
              ? `<select class="stu-mob-sel" onchange="stuField('${s.id}','day',this.value)">
                  <option value="">— اليوم —</option>
                  ${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(d=>`<option${s.day===d?' selected':''}>${d}</option>`).join('')}
                </select>`
              : `<span>${s.day||'—'}</span>`}
          </div>
          <div class="stu-mob-row">
            <span class="stu-mob-label">📅 التاريخ</span>
            ${makeDatePicker(s.id, s.dateH)}
          </div>
          <div class="stu-mob-row">
            <span class="stu-mob-label">🕐 الوقت</span>
            ${window._userRole==='admin'
              ? `<select class="stu-mob-sel" onchange="stuField('${s.id}','hour',this.value)" style="width:60px">
                  <option value="">—</option>
                  ${[1,2,3,4,5,6,7,8,9,10,11,12].map(h=>`<option${s.hour==h?' selected':''}>${h}</option>`).join('')}
                </select>
                <select class="stu-mob-sel" onchange="stuField('${s.id}','ampm',this.value)" style="width:80px">
                  <option value="ص"${s.ampm==='ص'?' selected':''}>صباحاً</option>
                  <option value="م"${s.ampm==='م'?' selected':''}>مساءً</option>
                </select>`
              : `<span>${s.hour||'—'} ${s.ampm||''}</span>`}
          </div>
          ${s.status === 'new' ? `<div class="stu-mob-row">
            <span class="stu-mob-label">📊 الدرجة</span>
            ${window._userRole==='admin'
              ? `<input type="number" min="0" max="100" value="${s.placementScore??''}" placeholder="0" class="stu-mob-score" onchange="stuField('${s.id}','placementScore',this.value===''?null:Number(this.value))">`
              : `<span>${s.placementScore!=null?s.placementScore+'/100':'—'}</span>`}
            <span style="font-size:12px;color:#999">/ 100</span>
          </div>` : ''}
          <div class="stu-mob-actions">
            <button class="btn-interview ${intClass}" onclick="stuToggleInterview('${s.id}','${s.interview}')">${intLabel}</button>
            <button class="btn-accept ${accClass}" onclick="stuToggleAccept('${s.id}','${s.accepted}','${s.interview}')">${accLabel}</button>
          </div>
        </div>`;
      }).join('');
    }
    tb.innerHTML = '';
    return;
  }

  tb.innerHTML = list.map((s, i) => {
    const intClass = s.interview==='done'?'btn-done':'btn-pending';
    const intLabel = s.interview==='done'?'✅ تمت':'⏳ لم تتم';
    let accClass='btn-na', accLabel='— لم يحدد';
    if(s.accepted==='accepted'){accClass='btn-accepted';accLabel='✔️ مقبولة';}
    if(s.accepted==='rejected'){accClass='btn-rejected';accLabel='✖️ مرفوضة';}
    const statusLabel2 = s.status==='mateen'?'📖 بنات متين':s.status==='new'?'✨ مستجدة':'—';
    const statusSel = window._userRole==='admin'
      ? `<select class="status-sel" onchange="stuField('${s.id}','status',this.value)">
          <option value=""${!s.status?' selected':''}>🏷️ التصنيف</option>
          <option value="mateen"${s.status==='mateen'?' selected':''}>📖 بنات متين</option>
          <option value="new"${s.status==='new'?' selected':''}>✨ المستجدات</option>
        </select>`
      : `<span class="status-badge">${statusLabel2}</span>`;
    const daySel = window._userRole==='admin'
      ? `<select class="day-sel" onchange="stuField('${s.id}','day',this.value)">
          <option value="">-اليوم-</option>
          ${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(d=>`<option${s.day===d?' selected':''}>${d}</option>`).join('')}
        </select>`
      : `<span>${s.day||'—'}</span>`;
    const timeSel = window._userRole==='admin'
      ? `<div class="time-cell">
          <select class="time-hour" onchange="stuField('${s.id}','hour',this.value)">
            <option value="">-</option>${[1,2,3,4,5,6,7,8,9,10,11,12].map(h=>`<option${s.hour==h?' selected':''}>${h}</option>`).join('')}
          </select>:
          <select class="time-ampm" onchange="stuField('${s.id}','ampm',this.value)">
            <option value="ص"${s.ampm==='ص'?' selected':''}>صباحاً</option>
            <option value="م"${s.ampm==='م'?' selected':''}>مساءً</option>
          </select>
        </div>`
      : `<span>${s.hour||'—'} ${s.ampm||''}</span>`;
    const placementCell = s.status !== 'new'
      ? `<span style="color:var(--text-mid);font-size:12px">—</span>`
      : window._userRole==='admin'
        ? `<div class="placement-wrap">
             <input type="number" class="placement-input" min="0" max="100"
               value="${s.placementScore ?? ''}" placeholder="الدرجة"
               onchange="stuField('${s.id}','placementScore',this.value===''?null:Number(this.value))">
             <span class="placement-unit">/ 100</span>
           </div>`
        : `<span>${s.placementScore != null ? s.placementScore+'/100' : '—'}</span>`;
    return `<tr>
      <td><input type="checkbox" class="row-check" data-id="${s.id}" onchange="onRowCheck()"></td>
      <td style="color:var(--text-mid);font-size:12px">${i+1}</td>
      <td><div class="stu-name-cell">
        <a class="btn-stu-link" href="student.html?id=${s.id}" target="_blank" title="صفحة الطالبة">👤</a>
        ${window._userRole==='admin'
          ? `<input type="text" value="${esc(s.name||'')}" oninput="stuAutoName('${s.id}',this.value)" style="min-width:100px">`
          : `<span class="stu-name-text">${esc(s.name||'—')}</span>`}
      </div></td>
      <td><div style="display:flex;flex-direction:column;gap:4px">${daySel}${makeDatePicker(s.id,s.dateH)}</div></td>
      <td>${timeSel}</td>
      <td><button class="btn-interview ${intClass}" onclick="stuToggleInterview('${s.id}','${s.interview}')">${intLabel}</button></td>
      <td><button class="btn-accept ${accClass}" onclick="stuToggleAccept('${s.id}','${s.accepted}','${s.interview}')">${accLabel}</button></td>
      <td>${placementCell}</td>

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

// ── Student CRUD ──────────────────────────────────────────────
const stuDefault = () => ({order:Date.now(), name:'طالبة جديدة', status:'', day:'', dateH:'', dateG:'', hour:'', minute:'00', ampm:'ص', interview:'pending', accepted:'na'});

window.addStudentRow = async () => { if (window._userRole !== 'admin') return; await addDoc(collection(db,'students'), stuDefault()); };

window.addBulkNames = async () => {
  const txt = document.getElementById('bulkNames').value;
  if(!txt.trim()) return;
  const names = txt.split('\n').filter(n=>n.trim());
  for(let i=0;i<names.length;i++) await addDoc(collection(db,'students'),{...stuDefault(),order:Date.now()+i,name:names[i].trim()});
  document.getElementById('bulkNames').value='';
  showToast('✓ تمت إضافة الأسماء');
};

window.stuAutoName = async (id,v) => { if (window._userRole !== 'admin') return; await updateDoc(doc(db,'students',id),{name:v}); };
window.stuField    = async (id,f,v) => { if (window._userRole !== 'admin') return; await updateDoc(doc(db,'students',id),{[f]:v}); };

window.stuUpdateDatePart = async (id,key,value) => {
  if (window._userRole !== 'admin') return;
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
  if(!confirm('حذف الطالبة وكل بياناتها نهائياً؟')) return;
  await deleteDoc(doc(db,'students',id));
  showToast('تم الحذف');
};

window.toggleSelectAll = checked => {
  document.querySelectorAll('.row-check').forEach(cb=>{
    cb.checked=checked;
    cb.closest('tr').classList.toggle('selected-row',checked);
  });
  const cnt = document.getElementById('selectedCount');
  if(cnt) cnt.textContent=(checked?document.querySelectorAll('.row-check').length:0)+' محددة';
};

window.onRowCheck = () => {
  const checked=document.querySelectorAll('.row-check:checked');
  const cnt = document.getElementById('selectedCount');
  if(cnt) cnt.textContent=checked.length+' محددة';
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

// زر إضافة طالبة في الهيدر
document.getElementById('btnAddStudent')?.addEventListener('click', () => window.addStudentRow());

// ── Bulk Grade Modal ──────────────────────────────────────────
window.openBulkGradeModal = () => {
  const modal = document.getElementById('bulkGradeModal');
  if(modal) modal.style.display='flex';
};
