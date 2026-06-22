
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, updateDoc, deleteDoc, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
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
  loadMateenUsers();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

function loadData() {
  const mateenQuery = query(collection(db,'users'), where('role','==','mateen'), orderBy('createdAt','desc'));
  onSnapshot(mateenQuery, snap => {
    const all     = snap.docs.map(d=>({id:d.id,...d.data()}));
    const pending = all.filter(u=>u.status==='pending');
    const active  = all.filter(u=>u.status==='active');
    document.getElementById('sPending').textContent = pending.length;
    document.getElementById('sActive').textContent  = active.length;
    document.getElementById('sTotal').textContent   = all.length;
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
  c.innerHTML = `<div style="overflow-x:auto"><table class="pending-table">
    <thead><tr><th>الاسم</th><th>العمر</th><th>الجوال</th><th>البريد</th><th>الحالة</th><th></th></tr></thead>
    <tbody>${list.map(u=>`<tr>
      <td style="font-weight:600">${esc(u.name||'—')}</td>
      <td>${u.age||'—'}</td>
      <td dir="ltr">${esc(u.phone||'—')}</td>
      <td dir="ltr" style="font-size:12px">${esc(u.email||'—')}</td>
      <td>${u.status==='active'?'<span style="color:var(--green-dark);font-size:12px">✅ نشطة</span>':u.status==='pending'?'<span class="badge-pending">⏳ معلقة</span>':'<span style="color:#c0392b;font-size:12px">❌ مرفوضة</span>'}</td>
      <td><button class="btn-reject" onclick="suspendUser('${u.id}','${u.status}')"><i class="ti ti-ban"></i> ${u.status==='suspended'?'رفع الإيقاف':'إيقاف'}</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

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
//  الغياب — Attendance
// ══════════════════════════════════════════════════════════════
 from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

let allMateenUsers = [];   // كل الطالبات النشطات
let attStatus = {};        // { uid: 'present'|'absent'|'excused' }
let currentAttSubject = '';
let currentAttDate    = '';

// تحميل قائمة الطالبات النشطات عند فتح الصفحة
async function loadMateenUsers() {
  const q = query(collection(db,'users'), where('role','==','mateen'), where('status','==','active'), orderBy('name'));
  const snap = await getDocs(q);
  allMateenUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderNotesStudents();
}

window.loadAttendance = async () => {
  const subject = document.getElementById('attSubject').value;
  const date    = document.getElementById('attDate').value;
  if (!subject || !date) { showToast('اختاري المادة والتاريخ'); return; }
  currentAttSubject = subject;
  currentAttDate    = date;
  attStatus = {};

  // جيبي الغياب المسجل مسبقاً لهذا اليوم والمادة
  const q = query(
    collection(db, 'attendance'),
    where('subject', '==', subject),
    where('date', '==', date)
  );
  const snap = await getDocs(q);
  snap.forEach(d => { attStatus[d.data().studentId] = d.data().status; });

  renderAttendance();
  document.getElementById('attSaveBar').style.display = 'block';
};

function renderAttendance() {
  const c = document.getElementById('attendanceContainer');
  if (!allMateenUsers.length) {
    c.innerHTML = '<div class="empty-state"><i class="ti ti-users"></i>لا توجد طالبات نشطات</div>';
    return;
  }
  c.innerHTML = `<table class="pending-table att-table">
    <thead><tr><th>الطالبة</th><th>الحضور</th></tr></thead>
    <tbody>${allMateenUsers.map(u => {
      const st = attStatus[u.id] || 'present';
      return `<tr>
        <td style="font-weight:600">${esc(u.name||'—')}</td>
        <td>
          <div class="att-btns">
            <button class="att-btn att-present ${st==='present'?'active':''}" onclick="setAtt('${u.id}','present',this)"><i class="ti ti-check"></i> حاضرة</button>
            <button class="att-btn att-absent ${st==='absent'?'active':''}" onclick="setAtt('${u.id}','absent',this)"><i class="ti ti-x"></i> غائبة</button>
            <button class="att-btn att-excused ${st==='excused'?'active':''}" onclick="setAtt('${u.id}','excused',this)"><i class="ti ti-clock-pause"></i> معتذرة</button>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

window.setAtt = (uid, status, btn) => {
  attStatus[uid] = status;
  // تحديث أزرار الصف نفسه
  const row = btn.closest('tr');
  row.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.saveAttendance = async () => {
  if (!currentAttSubject || !currentAttDate) return;
  const btn = document.querySelector('.btn-save-att');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader spin"></i> جارٍ الحفظ...';
  try {
    // احذفي القديم لهذا اليوم والمادة ثم أضيفي الجديد
    const q = query(collection(db,'attendance'), where('subject','==',currentAttSubject), where('date','==',currentAttDate));
    const old = await getDocs(q);
    await Promise.all(old.docs.map(d => deleteDoc(doc(db,'attendance',d.id))));

    // أضيفي السجلات الجديدة
    await Promise.all(allMateenUsers.map(u =>
      addDoc(collection(db,'attendance'), {
        studentId: u.id,
        studentName: u.name || '',
        subject: currentAttSubject,
        date: currentAttDate,
        status: attStatus[u.id] || 'present',
        recordedAt: Timestamp.now(),
      })
    ));
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
      <div class="nsc-avatar">👩</div>
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


